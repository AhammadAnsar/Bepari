import crypto from 'crypto';
import type Database from 'better-sqlite3';
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../engine/types.ts';

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

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const keyBuf = Buffer.from(keyHex, 'hex');
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  if (keyBuf.length !== derivedBuf.length) return false;
  return crypto.timingSafeEqual(keyBuf, derivedBuf);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface AuthSessionUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  branchId: number | null;
}

export interface AuthenticatedRequest extends Request {
  authUser?: AuthSessionUser;
  sessionToken?: string;
}

export function isWorkspacePasswordLocked(db: Database.Database): boolean {
  if (process.env.BEPARI_ADMIN_PASSCODE && process.env.BEPARI_ADMIN_PASSCODE.trim().length > 0) {
    return true;
  }
  const org = db
    .prepare('SELECT admin_password_hash FROM organizations WHERE id = 1')
    .get() as { admin_password_hash: string | null } | undefined;
  return Boolean(org?.admin_password_hash);
}

export function verifyWorkspaceAdminPasscode(db: Database.Database, candidate: string): boolean {
  const envPass = process.env.BEPARI_ADMIN_PASSCODE?.trim();
  if (envPass && envPass.length > 0) {
    const a = Buffer.from(candidate);
    const b = Buffer.from(envPass);
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }
  const org = db
    .prepare('SELECT admin_password_hash FROM organizations WHERE id = 1')
    .get() as { admin_password_hash: string | null } | undefined;
  if (!org?.admin_password_hash) return false;
  return verifyPassword(candidate, org.admin_password_hash);
}

export function createSession(db: Database.Database, userId: number): string {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    expiresAt
  );
  return token;
}

export function createAuthMiddleware(db: Database.Database) {
  return function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const token = header.slice('Bearer '.length).trim();
    if (!token) {
      return res.status(401).json({ error: 'Invalid session token.' });
    }

    const row = db
      .prepare(
        `SELECT s.token, s.expires_at, u.id, u.name, u.email, u.role, u.branch_id, u.is_active
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token = ?`
      )
      .get(token) as
      | {
          token: string;
          expires_at: string;
          id: number;
          name: string;
          email: string;
          role: UserRole;
          branch_id: number | null;
          is_active: number;
        }
      | undefined;

    if (!row || !row.is_active || row.expires_at < new Date().toISOString()) {
      return res.status(401).json({ error: 'Session expired or invalid.' });
    }

    req.sessionToken = row.token;
    req.authUser = {
      id: row.id,
      name: row.name,
      email: row.email,
      role: row.role,
      branchId: row.branch_id,
    };
    next();
  };
}

export function requirePermission(permission: Permission) {
  return function checkPerm(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!hasPermission(req.authUser.role, permission)) {
      return res.status(403).json({
        error: `Access denied: role "${req.authUser.role}" lacks "${permission}" permission.`,
      });
    }
    next();
  };
}
