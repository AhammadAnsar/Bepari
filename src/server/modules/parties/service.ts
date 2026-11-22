import { and, asc, eq } from 'drizzle-orm';
import { withTenantTransaction } from '../../../db/index.ts';
import { parties, partyAddresses, partyRoles } from '../../../db/schema.ts';
import { toMoneyString } from '../../shared/decimal.ts';
import { AppError } from '../../shared/errors.ts';
import { recordAuditInTx, recordOutboxEventInTx } from '../audit/service.ts';

export async function listParties(organizationId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    const rows = await tx
      .select()
      .from(parties)
      .where(eq(parties.organizationId, organizationId))
      .orderBy(asc(parties.displayName));

    const roles = await tx
      .select()
      .from(partyRoles)
      .where(eq(partyRoles.organizationId, organizationId));

    return rows.map((p) => ({
      ...p,
      roles: roles.filter((r) => r.partyId === p.id).map((r) => r.role),
    }));
  });
}

export async function getPartyById(organizationId: string, partyId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    const [party] = await tx
      .select()
      .from(parties)
      .where(
        and(
          eq(parties.organizationId, organizationId),
          eq(parties.id, partyId)
        )
      )
      .limit(1);

    if (!party) {
      throw new AppError(
        'PARTY_NOT_FOUND',
        'গ্রাহক বা সরবরাহকারীর তথ্য পাওয়া যায়নি।',
        404
      );
    }

    const roles = await tx
      .select()
      .from(partyRoles)
      .where(
        and(
          eq(partyRoles.organizationId, organizationId),
          eq(partyRoles.partyId, party.id)
        )
      );

    const addresses = await tx
      .select()
      .from(partyAddresses)
      .where(
        and(
          eq(partyAddresses.organizationId, organizationId),
          eq(partyAddresses.partyId, party.id)
        )
      );

    return {
      ...party,
      roles: roles.map((r) => r.role),
      addresses,
    };
  });
}

export async function createParty(params: {
  organizationId: string;
  actorUserId: string;
  displayName: string;
  legalName?: string;
  mobile?: string;
  email?: string;
  taxBin?: string;
  taxTin?: string;
  creditLimit?: string | null;
  paymentTermDays?: number;
  roles: Array<'customer' | 'supplier'>;
}) {
  return await withTenantTransaction(params.organizationId, async (tx) => {
    const [created] = await tx
      .insert(parties)
      .values({
        organizationId: params.organizationId,
        displayName: params.displayName.trim(),
        legalName: params.legalName?.trim() || null,
        mobile: params.mobile?.trim() || null,
        email: params.email?.trim() || null,
        taxBin: params.taxBin?.trim() || null,
        taxTin: params.taxTin?.trim() || null,
        creditLimit: params.creditLimit ? toMoneyString(params.creditLimit) : null,
        paymentTermDays: params.paymentTermDays ?? 0,
        isActive: true,
      })
      .returning();

    const uniqueRoles = Array.from(new Set(params.roles));
    for (const role of uniqueRoles) {
      await tx.insert(partyRoles).values({
        organizationId: params.organizationId,
        partyId: created.id,
        role,
      });
    }

    await recordAuditInTx(tx, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'party.created',
      entityType: 'party',
      entityId: created.id,
      afterJson: {
        displayName: created.displayName,
        roles: uniqueRoles,
      },
    });

    await recordOutboxEventInTx(tx, {
      organizationId: params.organizationId,
      eventType: 'PartyCreated',
      aggregateType: 'party',
      aggregateId: created.id,
      payload: {
        partyId: created.id,
        roles: uniqueRoles,
      },
    });

    return {
      ...created,
      roles: uniqueRoles,
    };
  });
}
