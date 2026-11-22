import crypto from 'crypto';
import { and, eq, gt, isNull } from 'drizzle-orm';
import { getDb } from '../../../db/index.ts';
import {
  appUsers,
  branches,
  organizationMembers,
  organizations,
  rolePermissions,
  userSessions,
} from '../../../db/schema.ts';
import { AppError } from '../../shared/errors.ts';
import { PermissionKey, RoleCode } from '../../shared/permissions.ts';

const SCRYPT_KEYLEN = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12; // 12 hours

export function hashPassword(plainPassword: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(plainPassword: string, storedHash: string | null): boolean {
  if (!storedHash || !storedHash.startsWith('scrypt:')) {
    return false;
  }
  const parts = storedHash.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hexHash] = parts;
  const derived = crypto.scryptSync(plainPassword, salt, SCRYPT_KEYLEN);
  const expected = Buffer.from(hexHash, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function hashSessionToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

export interface AuthenticatedContext {
  user: {
    id: string;
    authSubject: string;
    displayName: string;
    email: string | null;
  };
  sessionId: string;
  activeOrganizationId: string | null;
  activeBranchId: string | null;
  activeRole: RoleCode | null;
  permissions: PermissionKey[];
  memberships: Array<{
    membershipId: string;
    organizationId: string;
    legalName: string;
    tradeName: string | null;
    baseCurrency: string;
    timezone: string;
    reportingLanguage: string;
    roleCode: RoleCode;
    status: string;
    branches: Array<{
      id: string;
      code: string;
      name: string;
      isActive: boolean;
    }>;
  }>;
}

export async function registerUserAccount(params: {
  email: string;
  displayName: string;
  password: string;
}) {
  assertSessionSecretReady();
  const db = getDb();
  const normalizedEmail = params.email.trim().toLowerCase();

  try {
    const existing = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, normalizedEmail))
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(
        'EMAIL_ALREADY_EXISTS',
        'এই ইমেইল ঠিকানা দিয়ে ইতিমধ্যে একটি অ্যাকাউন্ট খোলা হয়েছে। অনুগ্রহ করে সাইন ইন করুন।',
        409,
        { email: 'Email already registered' }
      );
    }

    const passwordHash = hashPassword(params.password);
    const [createdUser] = await db
      .insert(appUsers)
      .values({
        authSubject: `bepari:${normalizedEmail}`,
        displayName: params.displayName.trim(),
        email: normalizedEmail,
        passwordHash,
        isActive: true,
      })
      .returning();

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.insert(userSessions).values({
      userId: createdUser.id,
      tokenHash,
      activeOrganizationId: null,
      activeBranchId: null,
      expiresAt,
    });

    const context = await resolveAuthenticatedContext(rawToken);
    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      context,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('User registration database error:', err);
    throw new Error('Failed to register user account.', { cause: err });
  }
}

export async function loginWithEmailPassword(params: { email: string; password: string }) {
  assertSessionSecretReady();
  const db = getDb();
  const normalizedEmail = params.email.trim().toLowerCase();

  try {
    const [user] = await db
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, normalizedEmail))
      .limit(1);

    if (!user || !user.isActive || !verifyPassword(params.password, user.passwordHash)) {
      throw new AppError(
        'INVALID_CREDENTIALS',
        'ইমেইল অথবা পাসওয়ার্ড সঠিক নয়।',
        401
      );
    }

    // Determine initial active organization and branch from user's active memberships
    const activeMemberships = await db
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.userId, user.id),
          eq(organizationMembers.status, 'active')
        )
      );

    let initialOrgId: string | null = null;
    let initialBranchId: string | null = null;

    if (activeMemberships.length > 0) {
      initialOrgId = activeMemberships[0].organizationId;
      const orgBranches = await db
        .select()
        .from(branches)
        .where(
          and(
            eq(branches.organizationId, initialOrgId),
            eq(branches.isActive, true)
          )
        )
        .limit(1);
      if (orgBranches.length > 0) {
        initialBranchId = orgBranches[0].id;
      }
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSessionToken(rawToken);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await db.insert(userSessions).values({
      userId: user.id,
      tokenHash,
      activeOrganizationId: initialOrgId,
      activeBranchId: initialBranchId,
      expiresAt,
    });

    const context = await resolveAuthenticatedContext(rawToken);
    return {
      token: rawToken,
      expiresAt: expiresAt.toISOString(),
      context,
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    console.error('Login database error:', err);
    throw new Error('Failed to authenticate user.', { cause: err });
  }
}

export async function revokeSessionToken(rawToken: string): Promise<void> {
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);
  await db
    .update(userSessions)
    .set({ revokedAt: new Date() })
    .where(eq(userSessions.tokenHash, tokenHash));
}

export async function switchSessionContext(params: {
  sessionId: string;
  userId: string;
  organizationId: string;
  branchId?: string | null;
}): Promise<void> {
  const db = getDb();

  // Verify user actually holds an active membership in the requested organization (TEN-02 guard)
  const [membership] = await db
    .select()
    .from(organizationMembers)
    .where(
      and(
        eq(organizationMembers.organizationId, params.organizationId),
        eq(organizationMembers.userId, params.userId),
        eq(organizationMembers.status, 'active')
      )
    )
    .limit(1);

  if (!membership) {
    throw new AppError(
      'FORBIDDEN_ORGANIZATION_CONTEXT',
      'আপনার এই প্রতিষ্ঠানে প্রবেশের অনুমতি নেই।',
      403
    );
  }

  let resolvedBranchId: string | null = null;
  if (params.branchId) {
    const [branch] = await db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.id, params.branchId),
          eq(branches.organizationId, params.organizationId),
          eq(branches.isActive, true)
        )
      )
      .limit(1);

    if (!branch) {
      throw new AppError(
        'INVALID_BRANCH_CONTEXT',
        'নির্বাচিত শাখাটি এই প্রতিষ্ঠানের অধীনে সক্রিয় নয়।',
        403
      );
    }
    resolvedBranchId = branch.id;
  } else {
    const [defaultBranch] = await db
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.organizationId, params.organizationId),
          eq(branches.isActive, true)
        )
      )
      .limit(1);
    resolvedBranchId = defaultBranch?.id ?? null;
  }

  await db
    .update(userSessions)
    .set({
      activeOrganizationId: params.organizationId,
      activeBranchId: resolvedBranchId,
    })
    .where(eq(userSessions.id, params.sessionId));
}

export async function resolveAuthenticatedContext(rawToken: string): Promise<AuthenticatedContext> {
  const db = getDb();
  const tokenHash = hashSessionToken(rawToken);
  const now = new Date();

  const [sessionRow] = await db
    .select({
      session: userSessions,
      user: appUsers,
    })
    .from(userSessions)
    .innerJoin(appUsers, eq(userSessions.userId, appUsers.id))
    .where(
      and(
        eq(userSessions.tokenHash, tokenHash),
        isNull(userSessions.revokedAt),
        gt(userSessions.expiresAt, now)
      )
    )
    .limit(1);

  if (!sessionRow || !sessionRow.user.isActive) {
    throw new AppError(
      'UNAUTHENTICATED',
      'আপনার সেশনটি মেয়াদোত্তীর্ণ বা অবৈধ। অনুগ্রহ করে পুনরায় সাইন ইন করুন।',
      401
    );
  }

  const membershipRows = await db
    .select({
      member: organizationMembers,
      org: organizations,
    })
    .from(organizationMembers)
    .innerJoin(organizations, eq(organizationMembers.organizationId, organizations.id))
    .where(
      and(
        eq(organizationMembers.userId, sessionRow.user.id),
        eq(organizationMembers.status, 'active'),
        eq(organizations.status, 'active')
      )
    );

  const memberships: AuthenticatedContext['memberships'] = [];
  for (const row of membershipRows) {
    const orgBranches = await db
      .select({
        id: branches.id,
        code: branches.code,
        name: branches.name,
        isActive: branches.isActive,
      })
      .from(branches)
      .where(eq(branches.organizationId, row.org.id));

    memberships.push({
      membershipId: row.member.id,
      organizationId: row.org.id,
      legalName: row.org.legalName,
      tradeName: row.org.tradeName,
      baseCurrency: row.org.baseCurrency,
      timezone: row.org.timezone,
      reportingLanguage: row.org.reportingLanguage,
      roleCode: row.member.roleCode as RoleCode,
      status: row.member.status,
      branches: orgBranches,
    });
  }

  let activeOrgId = sessionRow.session.activeOrganizationId;
  let activeBranchId = sessionRow.session.activeBranchId;

  const activeMembership =
    memberships.find((m) => m.organizationId === activeOrgId) || memberships[0] || null;

  let activeRole: RoleCode | null = null;
  let permissions: PermissionKey[] = [];

  if (activeMembership) {
    activeOrgId = activeMembership.organizationId;
    activeRole = activeMembership.roleCode;

    if (
      !activeBranchId ||
      !activeMembership.branches.some((b) => b.id === activeBranchId && b.isActive)
    ) {
      activeBranchId = activeMembership.branches.find((b) => b.isActive)?.id ?? null;
    }

    const permRows = await db
      .select()
      .from(rolePermissions)
      .where(
        and(
          eq(rolePermissions.organizationId, activeOrgId),
          eq(rolePermissions.roleCode, activeRole),
          eq(rolePermissions.allowed, true)
        )
      );

    permissions = permRows.map((p) => p.permissionKey as PermissionKey);
  } else {
    activeOrgId = null;
    activeBranchId = null;
  }

  return {
    user: {
      id: sessionRow.user.id,
      authSubject: sessionRow.user.authSubject,
      displayName: sessionRow.user.displayName,
      email: sessionRow.user.email,
    },
    sessionId: sessionRow.session.id,
    activeOrganizationId: activeOrgId,
    activeBranchId,
    activeRole,
    permissions,
    memberships,
  };
}
