import { desc, eq } from 'drizzle-orm';
import { BepariDb, withTenantTransaction } from '../../../db/index.ts';
import { auditEvents, outboxEvents } from '../../../db/schema.ts';

export interface RecordAuditParams {
  organizationId: string;
  actorUserId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeJson?: Record<string, unknown> | null;
  afterJson?: Record<string, unknown> | null;
  correlationId?: string;
}

export async function recordAuditInTx(tx: BepariDb, params: RecordAuditParams): Promise<void> {
  await tx.insert(auditEvents).values({
    organizationId: params.organizationId,
    actorUserId: params.actorUserId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    beforeJson: params.beforeJson ?? null,
    afterJson: params.afterJson ?? null,
    correlationId: params.correlationId ?? null,
  });
}

export async function recordOutboxEventInTx(
  tx: BepariDb,
  params: {
    organizationId: string;
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await tx.insert(outboxEvents).values({
    organizationId: params.organizationId,
    eventType: params.eventType,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    payload: params.payload,
  });
}

export async function listAuditEvents(organizationId: string, limit = 50) {
  return await withTenantTransaction(organizationId, async (tx) => {
    return await tx
      .select({
        id: auditEvents.id,
        organizationId: auditEvents.organizationId,
        actorUserId: auditEvents.actorUserId,
        action: auditEvents.action,
        entityType: auditEvents.entityType,
        entityId: auditEvents.entityId,
        correlationId: auditEvents.correlationId,
        createdAt: auditEvents.createdAt,
      })
      .from(auditEvents)
      .where(eq(auditEvents.organizationId, organizationId))
      .orderBy(desc(auditEvents.createdAt))
      .limit(Math.min(limit, 100));
  });
}
