-- BEPARI — Phase 0 Rollback Migration (0000_phase0_foundation.down.sql)
-- WARNING: Never execute on a production database containing posted financial history without a verified backup.

DROP TABLE IF EXISTS outbox_events CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS journal_lines CASCADE;
DROP TABLE IF EXISTS journal_entries CASCADE;
DROP TABLE IF EXISTS accounts CASCADE;
DROP TABLE IF EXISTS idempotency_records CASCADE;
DROP TABLE IF EXISTS document_sequences CASCADE;
DROP TABLE IF EXISTS business_documents CASCADE;
DROP TABLE IF EXISTS warehouses CASCADE;
DROP TABLE IF EXISTS items CASCADE;
DROP TABLE IF EXISTS units CASCADE;
DROP TABLE IF EXISTS party_addresses CASCADE;
DROP TABLE IF EXISTS party_roles CASCADE;
DROP TABLE IF EXISTS parties CASCADE;
DROP TABLE IF EXISTS tax_profiles CASCADE;
DROP TABLE IF EXISTS fiscal_periods CASCADE;
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS organization_members CASCADE;
DROP TABLE IF EXISTS user_sessions CASCADE;
DROP TABLE IF EXISTS branches CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;
DROP TABLE IF EXISTS app_users CASCADE;

DROP FUNCTION IF EXISTS current_app_organization_id();
DROP FUNCTION IF EXISTS reject_insert_into_posted_journal();
DROP FUNCTION IF EXISTS protect_posted_journal();
DROP FUNCTION IF EXISTS reject_posted_line_mutation();
DROP FUNCTION IF EXISTS check_posted_journal_balance();
