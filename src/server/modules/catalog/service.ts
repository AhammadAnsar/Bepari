import { asc, eq } from 'drizzle-orm';
import { withTenantTransaction } from '../../../db/index.ts';
import { items, units } from '../../../db/schema.ts';
import { toMoneyString } from '../../shared/decimal.ts';
import { recordAuditInTx } from '../audit/service.ts';

export async function listCatalogItems(organizationId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    const itemRows = await tx
      .select()
      .from(items)
      .where(eq(items.organizationId, organizationId))
      .orderBy(asc(items.nameBn));

    const unitRows = await tx
      .select()
      .from(units)
      .where(eq(units.organizationId, organizationId))
      .orderBy(asc(units.code));

    return {
      items: itemRows,
      units: unitRows,
    };
  });
}

export async function createCatalogItem(params: {
  organizationId: string;
  actorUserId: string;
  sku?: string;
  itemType: 'product' | 'service';
  nameBn: string;
  nameEn?: string;
  baseUnitId?: string | null;
  defaultPrice: string;
  taxCategoryCode?: string;
}) {
  return await withTenantTransaction(params.organizationId, async (tx) => {
    const [created] = await tx
      .insert(items)
      .values({
        organizationId: params.organizationId,
        sku: params.sku?.trim() || null,
        itemType: params.itemType,
        nameBn: params.nameBn.trim(),
        nameEn: params.nameEn?.trim() || null,
        baseUnitId: params.baseUnitId || null,
        defaultPrice: toMoneyString(params.defaultPrice),
        taxCategoryCode: params.taxCategoryCode?.trim() || null,
        isActive: true,
      })
      .returning();

    await recordAuditInTx(tx, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'item.created',
      entityType: 'item',
      entityId: created.id,
      afterJson: {
        nameBn: created.nameBn,
        itemType: created.itemType,
        defaultPrice: created.defaultPrice,
      },
    });

    return created;
  });
}
