# Bepari — Security Threat Model (Phase 0)

1. **Credential & Session Protection**: Passwords hashed via Node `crypto.scryptSync` with 16-byte random salt and verified via `crypto.timingSafeEqual`. Session tokens are 32-byte random values hashed with SHA-256 in `user_sessions` and stored strictly in client JS memory (never `localStorage`).
2. **Tenant Isolation (`TEN-01`, `TEN-02`)**:
   - Server middleware rejects any `x-organization-id` header or body `organizationId` that does not match the user's server-verified session context.
   - Composite PostgreSQL foreign keys `(organization_id, id)` prevent cross-tenant entity linking.
   - PostgreSQL Row-Level Security (`tenant_isolation_policy`) enforces `organization_id = current_app_organization_id()` inside `withTenantTransaction`.
3. **Privilege Escalation Prevention (`AUTH-03`)**: Role permissions are looked up per request from `role_permissions`; unauthorized attempts return `403 FORBIDDEN_PERMISSION` and record an append-only `permission.denied` row in `audit_events`.
4. **Fail-Closed Persistence (`OPS-02`)**: Missing PostgreSQL configuration returns HTTP 503 `BLOCKED_DATABASE` rather than falling back to unverified client storage.
