# Bepari — API Contract (`/api/v1`)

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/api/v1/health` | Public | Process liveness check |
| GET | `/api/v1/ready` | Public/Ops | PostgreSQL connectivity & migration readiness (`200 READY` or `503 BLOCKED_DATABASE`) |
| POST | `/api/v1/auth/register` | Public | Register user account with `scrypt` password hashing |
| POST | `/api/v1/auth/login` | Public | Authenticate user and issue opaque bearer session token |
| POST | `/api/v1/auth/logout` | Authenticated | Revoke current bearer session token |
| GET | `/api/v1/me` | Authenticated | Active user, memberships, active org/branch, role, and permissions |
| POST | `/api/v1/organizations` | Authenticated | Atomic one-time organization, owner, branch, fiscal period & COA bootstrap |
| POST | `/api/v1/context/switch` | Authenticated | Switch active organization and branch (verifies membership server-side) |
| POST | `/api/v1/branches` | `branch.manage` | Create branch in active organization |
| POST | `/api/v1/members` | `member.manage` | Add member with role to active organization |
| GET | `/api/v1/dashboard/summary` | Authenticated Member | Honest workspace record counts and active period (zero synthetic KPIs) |
| GET/POST | `/api/v1/parties` | `party.read` / `party.create` | List or create tenant-scoped customer/supplier party |
| GET | `/api/v1/parties/:id` | `party.read` | Fetch single party (404 if cross-tenant) |
| GET/POST | `/api/v1/items` | `catalog.read` / `catalog.write` | List or create catalog item/service |
| GET | `/api/v1/accounts` | `accounting.read` | List Chart of Accounts |
| GET | `/api/v1/periods` | `accounting.read` | List fiscal periods |
| POST | `/api/v1/periods/:id/close` | `accounting.close` | Close fiscal period (403 + audit event if unauthorized) |
| GET/POST | `/api/v1/journal-entries` | `accounting.read` / `accounting.post` | List or post balanced, idempotent journal entry |
| GET | `/api/v1/audit-events` | `audit.read` | List append-only organization audit events |
