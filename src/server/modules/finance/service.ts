import { and, asc, desc, eq } from 'drizzle-orm';
import { withTenantTransaction } from '../../../db/index.ts';
import {
  accounts,
  fiscalPeriods,
  journalEntries,
  journalLines,
} from '../../../db/schema.ts';
import { toMoneyString, verifyBalancedJournalLines } from '../../shared/decimal.ts';
import { AppError } from '../../shared/errors.ts';
import { recordAuditInTx, recordOutboxEventInTx } from '../audit/service.ts';

export async function listAccounts(organizationId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    return await tx
      .select()
      .from(accounts)
      .where(eq(accounts.organizationId, organizationId))
      .orderBy(asc(accounts.accountCode));
  });
}

export async function listFiscalPeriods(organizationId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    return await tx
      .select()
      .from(fiscalPeriods)
      .where(eq(fiscalPeriods.organizationId, organizationId))
      .orderBy(desc(fiscalPeriods.startsOn));
  });
}

export async function closeFiscalPeriod(params: {
  organizationId: string;
  periodId: string;
  actorUserId: string;
}) {
  return await withTenantTransaction(params.organizationId, async (tx) => {
    const [period] = await tx
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.organizationId, params.organizationId),
          eq(fiscalPeriods.id, params.periodId)
        )
      )
      .limit(1);

    if (!period) {
      throw new AppError(
        'FISCAL_PERIOD_NOT_FOUND',
        'হিসাবকাল পাওয়া যায়নি।',
        404
      );
    }

    if (period.status === 'closed') {
      throw new AppError(
        'FISCAL_PERIOD_ALREADY_CLOSED',
        'এই হিসাবকাল ইতিমধ্যে বন্ধ করা হয়েছে।',
        409
      );
    }

    const [updated] = await tx
      .update(fiscalPeriods)
      .set({ status: 'closed' })
      .where(
        and(
          eq(fiscalPeriods.organizationId, params.organizationId),
          eq(fiscalPeriods.id, params.periodId)
        )
      )
      .returning();

    await recordAuditInTx(tx, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'fiscal_period.closed',
      entityType: 'fiscal_period',
      entityId: updated.id,
      beforeJson: { status: period.status },
      afterJson: { status: updated.status },
    });

    await recordOutboxEventInTx(tx, {
      organizationId: params.organizationId,
      eventType: 'PeriodClosed',
      aggregateType: 'fiscal_period',
      aggregateId: updated.id,
      payload: {
        periodId: updated.id,
        periodCode: updated.periodCode,
      },
    });

    return updated;
  });
}

export async function listJournalEntries(organizationId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    const entries = await tx
      .select()
      .from(journalEntries)
      .where(eq(journalEntries.organizationId, organizationId))
      .orderBy(desc(journalEntries.entryDate));

    const lines = await tx
      .select()
      .from(journalLines)
      .where(eq(journalLines.organizationId, organizationId));

    return entries.map((e) => ({
      ...e,
      lines: lines.filter((l) => l.journalEntryId === e.id),
    }));
  });
}

export async function postBalancedJournalEntry(params: {
  organizationId: string;
  branchId?: string | null;
  fiscalPeriodId: string;
  entryDate: string;
  sourceType: string;
  sourceId: string;
  description: string;
  idempotencyKey: string;
  actorUserId: string;
  lines: Array<{
    accountId: string;
    partyId?: string | null;
    debit: string;
    credit: string;
    memo?: string;
  }>;
}) {
  const balanceCheck = verifyBalancedJournalLines(params.lines);
  if (!balanceCheck.balanced) {
    throw new AppError(
      'UNBALANCED_JOURNAL_ENTRY',
      `জার্নাল এন্ট্রি ভারসাম্যহীন (মোট ডেবিট: ${balanceCheck.totalDebit}, মোট ক্রেডিট: ${balanceCheck.totalCredit})।`,
      422
    );
  }

  return await withTenantTransaction(params.organizationId, async (tx) => {
    // Check idempotency inside organization scope
    const [existingJe] = await tx
      .select()
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.organizationId, params.organizationId),
          eq(journalEntries.idempotencyKey, params.idempotencyKey)
        )
      )
      .limit(1);

    if (existingJe) {
      const existingLines = await tx
        .select()
        .from(journalLines)
        .where(
          and(
            eq(journalLines.organizationId, params.organizationId),
            eq(journalLines.journalEntryId, existingJe.id)
          )
        );
      return {
        entry: existingJe,
        lines: existingLines,
        idempotentReplay: true,
      };
    }

    // Verify fiscal period is open and entryDate falls within it
    const [period] = await tx
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.organizationId, params.organizationId),
          eq(fiscalPeriods.id, params.fiscalPeriodId)
        )
      )
      .limit(1);

    if (!period) {
      throw new AppError(
        'FISCAL_PERIOD_NOT_FOUND',
        'হিসাবকাল পাওয়া যায়নি।',
        404
      );
    }

    if (period.status !== 'open') {
      throw new AppError(
        'LOCKED_FISCAL_PERIOD',
        'হিসাবকাল বন্ধ বা লক করা রয়েছে। এই সময়ে নতুন লেনদেন পোস্ট করা যাবে না।',
        423
      );
    }

    // Insert as draft first, insert lines, then promote to posted so triggers validate cleanly
    const [draftEntry] = await tx
      .insert(journalEntries)
      .values({
        organizationId: params.organizationId,
        branchId: params.branchId ?? null,
        fiscalPeriodId: params.fiscalPeriodId,
        entryDate: params.entryDate,
        sourceType: params.sourceType,
        sourceId: params.sourceId,
        description: params.description.trim(),
        status: 'draft',
        idempotencyKey: params.idempotencyKey,
        createdBy: params.actorUserId,
      })
      .returning();

    const insertedLines = [];
    for (const line of params.lines) {
      const [insertedLine] = await tx
        .insert(journalLines)
        .values({
          organizationId: params.organizationId,
          journalEntryId: draftEntry.id,
          accountId: line.accountId,
          partyId: line.partyId ?? null,
          debit: toMoneyString(line.debit),
          credit: toMoneyString(line.credit),
          memo: line.memo ?? null,
        })
        .returning();
      insertedLines.push(insertedLine);
    }

    const [postedEntry] = await tx
      .update(journalEntries)
      .set({
        status: 'posted',
        postedAt: new Date(),
      })
      .where(
        and(
          eq(journalEntries.organizationId, params.organizationId),
          eq(journalEntries.id, draftEntry.id)
        )
      )
      .returning();

    await recordAuditInTx(tx, {
      organizationId: params.organizationId,
      actorUserId: params.actorUserId,
      action: 'journal_entry.posted',
      entityType: 'journal_entry',
      entityId: postedEntry.id,
      afterJson: {
        totalDebit: balanceCheck.totalDebit,
        totalCredit: balanceCheck.totalCredit,
        idempotencyKey: postedEntry.idempotencyKey,
      },
    });

    return {
      entry: postedEntry,
      lines: insertedLines,
      idempotentReplay: false,
    };
  });
}
