import * as dotenv from 'dotenv';
import { eq } from 'drizzle-orm';
import { getDb, isDatabaseConfigured, withTenantTransaction } from './index.ts';
import { units, accounts } from './schema.ts';

dotenv.config();

/**
 * Idempotent foundation seed strictly restricted to `development` or `test` mode.
 * Never seeds fake customers, fake invoices, or fake financial KPI balances.
 * Only seeds standard Bengali/English units of measure and canonical Chart of Accounts skeleton
 * for a given organization if not already present.
 */
export async function seedOrganizationFoundation(organizationId: string): Promise<{
  unitsInserted: number;
  accountsInserted: number;
}> {
  const env = process.env.NODE_ENV || 'development';
  if (env === 'production') {
    throw new Error('Development seed is strictly forbidden in production mode.');
  }

  return await withTenantTransaction(organizationId, async (tx) => {
    const defaultUnits = [
      { code: 'PCS', nameBn: 'পিস', nameEn: 'Pieces' },
      { code: 'KG', nameBn: 'কেজি', nameEn: 'Kilogram' },
      { code: 'LTR', nameBn: 'লিটার', nameEn: 'Litre' },
      { code: 'BOX', nameBn: 'বক্স', nameEn: 'Box' },
    ];

    let unitsInserted = 0;
    for (const u of defaultUnits) {
      const res = await tx
        .insert(units)
        .values({
          organizationId,
          code: u.code,
          nameBn: u.nameBn,
          nameEn: u.nameEn,
        })
        .onConflictDoNothing()
        .returning();
      unitsInserted += res.length;
    }

    const defaultAccounts = [
      { code: '1100', name: 'নগদ তহবিল (Cash on Hand)', type: 'asset', isControl: false },
      { code: '1110', name: 'ব্যাংক হিসাব (Bank Accounts)', type: 'asset', isControl: false },
      { code: '1200', name: 'প্রাপ্য হিসাব নিয়ন্ত্রণ (Accounts Receivable Control)', type: 'asset', isControl: true },
      { code: '1300', name: 'মজুদ পণ্য (Inventory Asset)', type: 'asset', isControl: true },
      { code: '1400', name: 'উপকরণ ভ্যাট ক্রেডিট (Input VAT Receivable)', type: 'asset', isControl: true },
      { code: '2100', name: 'প্রদেয় হিসাব নিয়ন্ত্রণ (Accounts Payable Control)', type: 'liability', isControl: true },
      { code: '2200', name: 'গ্রাহক অগ্রিম দায় (Customer Advance Liability)', type: 'liability', isControl: true },
      { code: '2300', name: 'প্রদেয় ভ্যাট নিয়ন্ত্রণ (Output VAT Payable Control)', type: 'liability', isControl: true },
      { code: '3100', name: 'মালিকানা মূলধন (Owner Equity)', type: 'equity', isControl: false },
      { code: '4100', name: 'বিক্রয় আয় (Sales Revenue)', type: 'revenue', isControl: false },
      { code: '5100', name: 'বিক্রীত পণ্যের ব্যয় (Cost of Goods Sold)', type: 'expense', isControl: false },
      { code: '5200', name: 'পরিচালন ব্যয় (Operating Expenses)', type: 'expense', isControl: false },
    ] as const;

    let accountsInserted = 0;
    for (const acc of defaultAccounts) {
      const res = await tx
        .insert(accounts)
        .values({
          organizationId,
          accountCode: acc.code,
          accountName: acc.name,
          accountType: acc.type,
          isControl: acc.isControl,
          isActive: true,
        })
        .onConflictDoNothing()
        .returning();
      accountsInserted += res.length;
    }

    return { unitsInserted, accountsInserted };
  });
}

async function main() {
  if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to run dev seed in production environment.');
    process.exit(1);
  }
  if (!isDatabaseConfigured()) {
    console.error('BLOCKED_DATABASE: Configure PostgreSQL environment variables before running seed.');
    process.exit(1);
  }
  const db = getDb();
  const orgs = await db.query.organizations.findMany({
    where: (o, { eq: eqOp }) => eqOp(o.status, 'active'),
  });
  for (const org of orgs) {
    const result = await seedOrganizationFoundation(org.id);
    console.log(`Seeded organization ${org.legalName} (${org.id}):`, result);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  });
}
