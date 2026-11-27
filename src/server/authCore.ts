import type { UserRole } from '../engine/types.ts';
import type { DbClient } from './dbClient.ts';

export type Permission =
  | 'read'
  | 'invoice:write'
  | 'pos:checkout'
  | 'payment:write'
  | 'purchase:write'
  | 'expense:write'
  | 'inventory:write'
  | 'recurring:write'
  | 'journal:reverse'
  | 'vat:manage'
  | 'settings:manage'
  | 'users:manage';

const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  owner: [
    'read',
    'invoice:write',
    'pos:checkout',
    'payment:write',
    'purchase:write',
    'expense:write',
    'inventory:write',
    'recurring:write',
    'journal:reverse',
    'vat:manage',
    'settings:manage',
    'users:manage',
  ],
  accountant: [
    'read',
    'invoice:write',
    'payment:write',
    'purchase:write',
    'expense:write',
    'recurring:write',
    'journal:reverse',
    'vat:manage',
  ],
  manager: [
    'read',
    'invoice:write',
    'pos:checkout',
    'payment:write',
    'purchase:write',
    'expense:write',
    'inventory:write',
    'recurring:write',
  ],
  cashier: ['read', 'pos:checkout', 'invoice:write', 'payment:write'],
  auditor: ['read'],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] || []).includes(permission);
}

export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] || ['read'];
}

export interface AuthSessionUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  branchId: number | null;
}

export type LegacyPasswordVerifier = (password: string, storedHash: string) => boolean;

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]*$/.test(hex) || hex.length % 2 !== 0) {
    return new Uint8Array(0);
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function constantTimeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

function constantTimeEqualStrings(a: string, b: string): boolean {
  const enc = new TextEncoder();
  return constantTimeEqualBytes(enc.encode(a), enc.encode(b));
}

const PBKDF2_ITERATIONS = 100_000;

export async function hashPasswordAsync(password: string): Promise<string> {
  const salt = new Uint8Array(16);
  globalThis.crypto.getRandomValues(salt);
  const enc = new TextEncoder();
  const baseKey = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    baseKey,
    256
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${bytesToHex(salt)}$${bytesToHex(new Uint8Array(derivedBits))}`;
}

export async function verifyPasswordAsync(
  password: string,
  storedHash: string,
  legacyScryptVerifier?: LegacyPasswordVerifier
): Promise<boolean> {
  if (!storedHash) return false;
  if (storedHash.startsWith('pbkdf2$')) {
    const parts = storedHash.split('$');
    if (parts.length !== 4) return false;
    const iterations = Number(parts[1]);
    const salt = hexToBytes(parts[2]);
    const expected = hexToBytes(parts[3]);
    if (!Number.isFinite(iterations) || iterations < 1000 || salt.length === 0 || expected.length === 0) {
      return false;
    }
    const enc = new TextEncoder();
    const baseKey = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits']
    );
    const derivedBits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: salt as BufferSource,
        iterations,
        hash: 'SHA-256',
      },
      baseKey,
      expected.length * 8
    );
    return constantTimeEqualBytes(expected, new Uint8Array(derivedBits));
  }

  // Fallback for legacy Node scrypt hashes (`saltHex:derivedHex`)
  if (legacyScryptVerifier) {
    return legacyScryptVerifier(password, storedHash);
  }
  return false;
}

export function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function isWorkspacePasswordLockedAsync(
  db: DbClient,
  envAdminPasscode?: string
): Promise<boolean> {
  if (envAdminPasscode && envAdminPasscode.trim().length > 0) {
    return true;
  }
  const org = await db.get<{ admin_password_hash: string | null }>(
    'SELECT admin_password_hash FROM organizations WHERE id = 1'
  );
  return Boolean(org?.admin_password_hash);
}

export async function verifyWorkspaceAdminPasscodeAsync(
  db: DbClient,
  candidate: string,
  envAdminPasscode?: string,
  legacyScryptVerifier?: LegacyPasswordVerifier
): Promise<boolean> {
  const envPass = envAdminPasscode?.trim();
  if (envPass && envPass.length > 0) {
    return constantTimeEqualStrings(candidate, envPass);
  }
  const org = await db.get<{ admin_password_hash: string | null }>(
    'SELECT admin_password_hash FROM organizations WHERE id = 1'
  );
  if (!org?.admin_password_hash) return false;
  return verifyPasswordAsync(candidate, org.admin_password_hash, legacyScryptVerifier);
}

export async function createSessionAsync(db: DbClient, userId: number): Promise<string> {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await db.run('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)', [
    token,
    userId,
    expiresAt,
  ]);
  return token;
}

export function extractSessionCookieToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const [rawName, ...rest] = part.trim().split('=');
    if (rawName === 'bepari_session') {
      const value = rest.join('=').trim();
      if (value && /^[0-9a-fA-F]{32,128}$/.test(value)) {
        return value;
      }
    }
  }
  return null;
}

export async function authenticateBearerTokenAsync(
  db: DbClient,
  authHeader: string | null,
  cookieHeader?: string | null
): Promise<{ user: AuthSessionUser; sessionToken: string } | null> {
  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice('Bearer '.length).trim();
  } else if (cookieHeader) {
    token = extractSessionCookieToken(cookieHeader) || '';
  }
  if (!token) return null;

  const row = await db.get<{
    token: string;
    expires_at: string;
    id: number;
    name: string;
    email: string;
    role: UserRole;
    branch_id: number | null;
    is_active: number;
  }>(
    `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.branch_id, u.is_active
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE s.token = ?`,
    [token]
  );

  if (!row || !row.is_active || row.expires_at < new Date().toISOString()) {
    return null;
  }

  return {
    sessionToken: row.token,
    user: {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      branchId: row.branch_id !== null ? Number(row.branch_id) : null,
    },
  };
}

export async function resolveDeviceOrCookieSessionAsync(
  db: DbClient,
  authHeader: string | null,
  cookieHeader: string | null,
  isOnDeviceRuntime: boolean
): Promise<{ user: AuthSessionUser; sessionToken: string } | null> {
  const direct = await authenticateBearerTokenAsync(db, authHeader, cookieHeader);
  if (direct) return direct;

  if (!isOnDeviceRuntime) return null;

  const nowIso = new Date().toISOString();
  const row = await db.get<{
    token: string;
    expires_at: string;
    id: number;
    name: string;
    email: string;
    role: UserRole;
    branch_id: number | null;
    is_active: number;
  }>(
    `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.branch_id, u.is_active
     FROM sessions s
     INNER JOIN users u ON u.id = s.user_id
     WHERE u.is_active = 1 AND s.expires_at > ?
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [nowIso]
  );

  if (!row) return null;

  return {
    sessionToken: row.token,
    user: {
      id: Number(row.id),
      name: row.name,
      email: row.email,
      role: row.role,
      branchId: row.branch_id !== null ? Number(row.branch_id) : null,
    },
  };
}

