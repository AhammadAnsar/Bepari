import { and, eq, sql } from 'drizzle-orm';
import { getDb, withTenantTransaction } from '../../../db/index.ts';
import {
  accounts,
  appUsers,
  branches,
  fiscalPeriods,
  organizationMembers,
  organizations,
  rolePermissions,
  taxProfiles,
  units,
  userSessions,
  warehouses,
} from '../../../db/schema.ts';
import { AppError } from '../../shared/errors.ts';
import {
  DEFAULT_ROLE_PERMISSIONS,
  ROLE_CODES,
  RoleCode,
} from '../../shared/permissions.ts';
import { recordAuditInTx, recordOutboxEventInTx } from '../audit/service.ts';
import { hashPassword } from '../identity/service.ts';

export interface BootstrapOrganizationInput {
  userId: string;
  sessionId?: string;
  legalName: string;
  tradeName?: string;
  baseCurrency?: string;
  timezone?: string;
  reportingLanguage?: 'bn' | 'en';
  branchCode: string;
  branchName: string;
  fiscalPeriodCode: string;
  fiscalStartsOn: string;
  fiscalEndsOn: string;
  taxRegistrationClass: 'registered' | 'turnover_enlisted' | 'unregistered' | 'special' | 'pending_review';
  bin?: string;
  tin?: string;
}

export async function bootstrapOrganization(input: BootstrapOrganizationInput) {
  const db = getDb();

  if (input.fiscalStartsOn > input.fiscalEndsOn) {
    throw new AppError(
      'INVALID_FISCAL_PERIOD',
      'অর্থবছরের শুরুর তারিখ শেষের তারিখের পরে হতে পারবে না।',
      422,
      { fiscalStartsOn: 'Start date must be on or before end date' }
    );
  }

  return await db.transaction(async (tx) => {
    const [org] = await tx
      .insert(organizations)
      .values({
        legalName: input.legalName.trim(),
        tradeName: input.tradeName?.trim() || null,
        legalCountry: 'BD',
        baseCurrency: (input.baseCurrency || 'BDT').toUpperCase(),
        timezone: input.timezone || 'Asia/Dhaka',
        reportingLanguage: input.reportingLanguage || 'bn',
        status: 'active',
      })
      .returning();

    // Activate RLS tenant context for this newly created organization
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${org.id}, true)`
    );

    // Create owner membership
    const [membership] = await tx
      .insert(organizationMembers)
      .values({
        organizationId: org.id,
        userId: input.userId,
        roleCode: 'owner',
        status: 'active',
      })
      .returning();

    // Populate default role_permissions matrix for all roles in this organization
    const permissionRows: Array<{
      organizationId: string;
      roleCode: string;
      permissionKey: string;
      allowed: boolean;
    }> = [];

    for (const role of ROLE_CODES) {
      const allowedKeys = DEFAULT_ROLE_PERMISSIONS[role];
      for (const permKey of allowedKeys) {
        permissionRows.push({
          organizationId: org.id,
          roleCode: role,
          permissionKey: permKey,
          allowed: true,
        });
      }
    }

    if (permissionRows.length > 0) {
      await tx.insert(rolePermissions).values(permissionRows);
    }

    // Create initial Head Office branch
    const [branch] = await tx
      .insert(branches)
      .values({
        organizationId: org.id,
        code: input.branchCode.trim().toUpperCase(),
        name: input.branchName.trim(),
        addressJson: { country: 'BD' },
        isActive: true,
      })
      .returning();

    // Create default primary warehouse linked to this branch
    const [warehouse] = await tx
      .insert(warehouses)
      .values({
        organizationId: org.id,
        branchId: branch.id,
        code: `${branch.code}-WH1`,
        name: `${branch.name} - মূল গুদাম`,
        isActive: true,
      })
      .returning();

    // Create initial open fiscal period
    const [fiscalPeriod] = await tx
      .insert(fiscalPeriods)
      .values({
        organizationId: org.id,
        periodCode: input.fiscalPeriodCode.trim(),
        startsOn: input.fiscalStartsOn,
        endsOn: input.fiscalEndsOn,
        status: 'open',
      })
      .returning();

    // Create initial tax profile (strictly 'needs_review' by default — no fake NBR approval)
    const [taxProfile] = await tx
      .insert(taxProfiles)
      .values({
        organizationId: org.id,
        branchId: branch.id,
        registrationClass: input.taxRegistrationClass,
        bin: input.bin?.trim() || null,
        tin: input.tin?.trim() || null,
        effectiveFrom: input.fiscalStartsOn,
        complianceStatus: 'needs_review',
      })
      .returning();

    // Create standard structural Units of Measure & Chart of Accounts skeleton (zero balances)
    const standardUnits = [
      { code: 'PCS', nameBn: 'পিস', nameEn: 'Pieces' },
      { code: 'KG', nameBn: 'কেজি', nameEn: 'Kilogram' },
      { code: 'LTR', nameBn: 'লিটার', nameEn: 'Litre' },
      { code: 'BOX', nameBn: 'বক্স', nameEn: 'Box' },
    ];
    for (const u of standardUnits) {
      await tx.insert(units).values({
        organizationId: org.id,
        code: u.code,
        nameBn: u.nameBn,
        nameEn: u.nameEn,
      });
    }

    const coreAccounts = [
      { code: '1100', name: 'নগদ তহবিল (Cash on Hand)', type: 'asset', isControl: false },
      { code: '1110', name: 'ব্যাংক হিসাব (Bank Accounts)', type: 'asset', isControl: false },
      { code: '1200', name: 'প্রাপ্য হিসাব নিয়ন্ত্রণ (Accounts Receivable Control)', type: 'asset', isControl: true },
      { code: '1300', name: 'মজুদ পণ্য (Inventory Asset)', type: 'asset', isControl: true },
      { code: '1400', name: 'উপকরণ ভ্যাট ক্রেডিট (Input VAT Receivable)', type: 'asset', isControl: true },
      { code: '2100', name: 'প্রদেয় হিসাব নিয়ন্ত্রণ (Accounts Payable Control)', type: 'liability', isControl: true },
      { code: '2200', name: 'গ্রাহক অগ্রিম দায় (Customer Advance Liability)', type: 'liability', isControl: true },
      { code: '2300', name: 'প্রদেয় ভ্যাট নিয়ন্ত্রণ (Output VAT Payable Control)', type: 'liability', isControl: true },
      { code: '3100', name: 'মালিকানা মূলধন (Owner Equity)', type: 'equity', isControl: false },
      { code: '4100', name: 'বিক্রয় আয় (Sales Revenue)', type: 'revenue', isControl: false },
      { code: '5100', name: 'বিক্রীত পণ্যের ব্যয় (Cost of Goods Sold)', type: 'expense', isControl: false },
      { code: '5200', name: 'পরিচালন ব্যয় (Operating Expenses)', type: 'expense', isControl: false },
    ] as const;

    for (const acc of coreAccounts) {
      await tx.insert(accounts).values({
        organizationId: org.id,
        accountCode: acc.code,
        accountName: acc.name,
        accountType: acc.type,
        isControl: acc.isControl,
        isActive: true,
      });
    }

    if (input.sessionId) {
      await tx
        .update(userSessions)
        .set({
          activeOrganizationId: org.id,
          activeBranchId: branch.id,
        })
        .where(eq(userSessions.id, input.sessionId));
    }

    await recordAuditInTx(tx as never, {
      organizationId: org.id,
      actorUserId: input.userId,
      action: 'organization.bootstrapped',
      entityType: 'organization',
      entityId: org.id,
      afterJson: {
        legalName: org.legalName,
        branchCode: branch.code,
        fiscalPeriodCode: fiscalPeriod.periodCode,
        taxComplianceStatus: taxProfile.complianceStatus,
      },
    });

    await recordOutboxEventInTx(tx as never, {
      organizationId: org.id,
      eventType: 'OrganizationBootstrapped',
      aggregateType: 'organization',
      aggregateId: org.id,
      payload: {
        organizationId: org.id,
        branchId: branch.id,
        fiscalPeriodId: fiscalPeriod.id,
      },
    });

    return {
      organization: org,
      membership,
      branch,
      warehouse,
      fiscalPeriod,
      taxProfile,
    };
  });
}

export async function createBranch(params: {
  organizationId: string;
  actorUserId: string;
  code: string;
  name: string;
  addressJson?: Record<string, unknown>;
}) {
  return await withTenantTransaction(params.organizationId, async (tx) => {
    const normalizedCode = params.code.trim().toUpperCase();
    const existing = await tx
      .select()
      .from(branches)
      .where(
        and(
          eq(branches.organizationId, params.organizationId),
          eq(branches.code, normalizedCode)
        )
      )
      .limit(1);

    if (existing.length > 0) {
      throw new AppError(
        'BRANCH_CODE_EXISTS',
        'এই শাখা কোডটি ইতিমধ্যে ব্যবহৃত হয়েছে।',
        409,
        { code: 'Branch code already exists in this organization' }
      );
    }

    const [created] = await tx
      .insert(branches)
      .values({
        organizationId: params.organizationId,
        code: normalizedCode,
        name: params.name.trim(),
        addressJson: params.addressJson ?? {},
        isActive: true,
      })
      .returning();

    await recordAuditInTx(tx, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'branch.created',
      entityType: 'branch',
      entityId: created.id,
      afterJson: { code: created.code, name: created.name },
    });

    return created;
  });
}

export async function addOrganizationMember(params: {
  organizationId: string;
  actorUserId: string;
  email: string;
  displayName: string;
  password?: string;
  roleCode: RoleCode;
}) {
  const db = getDb();
  const normalizedEmail = params.email.trim().toLowerCase();

  return await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.current_organization_id', ${params.organizationId}, true)`
    );

    let [targetUser] = await tx
      .select()
      .from(appUsers)
      .where(eq(appUsers.email, normalizedEmail))
      .limit(1);

    if (!targetUser) {
      if (!params.password) {
        throw new AppError(
          'PASSWORD_REQUIRED_FOR_NEW_USER',
          'নতুন ব্যবহারকারীর জন্য একটি প্রাথমিক পাসওয়ার্ড প্রদান করা আবশ্যক।',
          422,
          { password: 'Initial password required for new user' }
        );
      }
      [targetUser] = await tx
        .insert(appUsers)
        .values({
          authSubject: `bepari:${normalizedEmail}`,
          displayName: params.displayName.trim(),
          email: normalizedEmail,
          passwordHash: hashPassword(params.password),
          isActive: true,
        })
        .returning();
    }

    const [existingMember] = await tx
      .select()
      .from(organizationMembers)
      .where(
        and(
          eq(organizationMembers.organizationId, params.organizationId),
          eq(organizationMembers.userId, targetUser.id)
        )
      )
      .limit(1);

    if (existingMember) {
      throw new AppError(
        'MEMBER_ALREADY_EXISTS',
        'এই ব্যবহারকারী ইতিমধ্যে প্রতিষ্ঠানের সদস্য।',
        409
      );
    }

    const [member] = await tx
      .insert(organizationMembers)
      .values({
        organizationId: params.organizationId,
        userId: targetUser.id,
        roleCode: params.roleCode,
        status: 'active',
      })
      .returning();

    await recordAuditInTx(tx as never, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'member.added',
      entityType: 'organization_member',
      entityId: member.id,
      afterJson: {
        userId: targetUser.id,
        email: targetUser.email,
        roleCode: member.roleCode,
      },
    });

    return {
      member,
      user: {
        id: targetUser.id,
        email: targetUser.email,
        displayName: targetUser.displayName,
      },
    };
  });
}
