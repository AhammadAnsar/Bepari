import { and, count, eq } from 'drizzle-orm';
import { withTenantTransaction } from '../../../db/index.ts';
import {
  accounts,
  branches,
  fiscalPeriods,
  items,
  journalEntries,
  parties,
  taxProfiles,
  warehouses,
} from '../../../db/schema.ts';

/**
 * Honest Phase 0 workspace state derived strictly from the live PostgreSQL database.
 * Zero invented financial KPIs, zero fabricated sales charts, zero synthetic balances.
 */
export async function getHonestWorkspaceSummary(organizationId: string) {
  return await withTenantTransaction(organizationId, async (tx) => {
    const [partyCountRow] = await tx
      .select({ value: count() })
      .from(parties)
      .where(eq(parties.organizationId, organizationId));

    const [itemCountRow] = await tx
      .select({ value: count() })
      .from(items)
      .where(eq(items.organizationId, organizationId));

    const [accountCountRow] = await tx
      .select({ value: count() })
      .from(accounts)
      .where(eq(accounts.organizationId, organizationId));

    const [postedJournalCountRow] = await tx
      .select({ value: count() })
      .from(journalEntries)
      .where(
        and(
          eq(journalEntries.organizationId, organizationId),
          eq(journalEntries.status, 'posted')
        )
      );

    const [branchCountRow] = await tx
      .select({ value: count() })
      .from(branches)
      .where(eq(branches.organizationId, organizationId));

    const [warehouseCountRow] = await tx
      .select({ value: count() })
      .from(warehouses)
      .where(eq(warehouses.organizationId, organizationId));

    const openPeriods = await tx
      .select()
      .from(fiscalPeriods)
      .where(
        and(
          eq(fiscalPeriods.organizationId, organizationId),
          eq(fiscalPeriods.status, 'open')
        )
      );

    const orgTaxProfiles = await tx
      .select()
      .from(taxProfiles)
      .where(eq(taxProfiles.organizationId, organizationId));

    return {
      organizationId,
      hasPostedFinancialActivity: (postedJournalCountRow?.value ?? 0) > 0,
      counts: {
        parties: partyCountRow?.value ?? 0,
        items: itemCountRow?.value ?? 0,
        accounts: accountCountRow?.value ?? 0,
        postedJournals: postedJournalCountRow?.value ?? 0,
        branches: branchCountRow?.value ?? 0,
        warehouses: warehouseCountRow?.value ?? 0,
      },
      activeFiscalPeriod: openPeriods[0] ?? null,
      taxCompliance: {
        status: orgTaxProfiles[0]?.complianceStatus ?? 'needs_review',
        registrationClass: orgTaxProfiles[0]?.registrationClass ?? 'pending_review',
        legalIssuanceEnabled: false,
        noticeBn:
          'ভ্যাট নিয়মাবলি ও মূসক ফর্ম আইনগত পর্যালোচনার অপেক্ষায় রয়েছে (Phase 6)। অনুমোদিত নিয়ম ছাড়া ভ্যাট চালান ইস্যু স্বয়ংক্রিয়ভাবে বন্ধ।',
        noticeEn:
          'VAT rules and Mushak forms require specialist legal review (Phase 6). Automated tax invoice issuance remains disabled until approved.',
      },
    };
  });
}
