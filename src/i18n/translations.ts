import type { Language } from '../engine/types';

export interface Dictionary {
  appName: string;
  nav: {
    overview: string;
    sales: string;
    customers: string;
    pos: string;
    products: string;
    purchases: string;
    vat: string;
    reports: string;
    documents: string;
    settings: string;
    more: string;
  };
  actions: {
    newInvoice: string;
    receivePayment: string;
    newCustomer: string;
    newExpense: string;
    newPurchase: string;
    newProduct: string;
    newRecurring: string;
    print: string;
    save: string;
    cancel: string;
    close: string;
    search: string;
    runNow: string;
    reverse: string;
    viewChallan: string;
    viewInvoice: string;
    viewStatement: string;
    checkout: string;
    allBranches: string;
    loadSample: string;
    startClean: string;
    edit: string;
    delete: string;
    signOut: string;
  };
  status: {
    draft: string;
    sent: string;
    partial: string;
    paid: string;
    overdue: string;
    void: string;
    posted: string;
    reversed: string;
    active: string;
    paused: string;
  };
  tabs: {
    invoices: string;
    customers: string;
    payments: string;
    recurring: string;
    expenses: string;
    purchases: string;
    inventory: string;
    vendors: string;
    mushak63: string;
    mushak91: string;
    taxRules: string;
    pnl: string;
    balanceSheet: string;
    cashFlow: string;
    trialBalance: string;
    ledger: string;
    vault: string;
    organization: string;
    design: string;
    branches: string;
    users: string;
    audit: string;
  };
  metrics: {
    totalReceivable: string;
    salesRevenue: string;
    netVatPayable: string;
    cashAndBank: string;
    netProfit: string;
    totalExpenses: string;
    inventoryValue: string;
    overdueInvoices: string;
  };
  empty: {
    noInvoicesTitle: string;
    noInvoicesDesc: string;
    noCustomersTitle: string;
    noCustomersDesc: string;
    noExpensesTitle: string;
    noExpensesDesc: string;
    noAlertsTitle: string;
    noAlertsDesc: string;
  };
  labels: {
    customer: string;
    vendor: string;
    branch: string;
    date: string;
    dueDate: string;
    amount: string;
    subtotal: string;
    vat: string;
    total: string;
    paid: string;
    balanceDue: string;
    method: string;
    reference: string;
    notes: string;
    quantity: string;
    rate: string;
    item: string;
    status: string;
    debit: string;
    credit: string;
    balanced: string;
    unbalanced: string;
    openingBalance: string;
    closingBalance: string;
    outputVat: string;
    inputVat: string;
    taxableSales: string;
    taxablePurchases: string;
  };
  quickActions: {
    title: string;
    addExpense: string;
    addExpenseDesc: string;
    viewStock: string;
    viewStockDesc: string;
    checkReports: string;
    checkReportsDesc: string;
    receivePayment: string;
    receivePaymentDesc: string;
    posCounter: string;
    posCounterDesc: string;
    vatReturn: string;
    vatReturnDesc: string;
  };
}

export const DICT: Record<Language, Dictionary> = {
  bn: {
    appName: 'বেপারি',
    nav: {
      overview: 'সারসংক্ষেপ',
      sales: 'বিক্রয় ও ইনভয়েস',
      customers: 'কাস্টমার',
      pos: 'ক্যাশ কাউন্টার',
      products: 'প্রোডাক্টস',
      purchases: 'ক্রয় ও খরচ',
      vat: 'মূসক ও চালান',
      reports: 'রিপোর্ট ও ভল্ট',
      documents: 'ডকুমেন্ট ভল্ট',
      settings: 'সেটিংস ও নিরাপত্তা',
      more: 'আরও',
    },
    actions: {
      newInvoice: 'নতুন ইনভয়েস',
      receivePayment: 'পেমেন্ট গ্রহণ',
      newCustomer: 'নতুন কাস্টমার',
      newExpense: 'নতুন খরচ',
      newPurchase: 'নতুন ক্রয় বিল',
      newProduct: 'নতুন পণ্য',
      newRecurring: 'নিয়মিত বিল',
      print: 'PDF ডাউনলোড',
      save: 'সংরক্ষণ করুন',
      cancel: 'বাতিল',
      close: 'বন্ধ করুন',
      search: 'খুঁজুন...',
      runNow: 'এখনই তৈরি করুন',
      reverse: 'রিভার্সাল এন্ট্রি',
      viewChallan: 'মূসক ৬.৩',
      viewInvoice: 'ইনভয়েস',
      viewStatement: 'স্টেটমেন্ট',
      checkout: 'বিক্রয় সম্পন্ন করুন',
      allBranches: 'সকল শাখা',
      loadSample: 'নমুনা ডাটা লোড করুন',
      startClean: 'পরিষ্কার ওয়ার্কস্পেস শুরু করুন',
      edit: 'সম্পাদনা',
      delete: 'মুছুন',
      signOut: 'সাইন আউট',
    },
    status: {
      draft: 'খসড়া',
      sent: 'প্রেরিত',
      partial: 'আংশিক পরিশোধ',
      paid: 'পরিশোধিত',
      overdue: 'বকেয়া মেয়াদোত্তীর্ণ',
      void: 'বাতিল',
      posted: 'পোস্টেড',
      reversed: 'রিভার্সড',
      active: 'সক্রিয়',
      paused: 'স্থগিত',
    },
    tabs: {
      invoices: 'ইনভয়েস',
      customers: 'কাস্টমার',
      payments: 'পেমেন্ট ও গেটওয়ে',
      recurring: 'নিয়মিত বিলিং',
      expenses: 'খরচ',
      purchases: 'ক্রয় (মূসক ৬.১)',
      inventory: 'স্টক ও গুদাম',
      vendors: 'সরবরাহকারী',
      mushak63: 'মূসক ৬.৩ চালান',
      mushak91: 'মূসক ৯.১ রিটার্ন',
      taxRules: 'মূসক নীতিমালা',
      pnl: 'লাভ-ক্ষতি',
      balanceSheet: 'ব্যালেন্স শিট',
      cashFlow: 'ক্যাশ ফ্লো',
      trialBalance: 'রেওয়ামিল',
      ledger: 'জার্নাল লেজার',
      vault: 'ডকুমেন্ট ভল্ট',
      organization: 'প্রতিষ্ঠানের তথ্য',
      design: 'ডিজাইন ও কাস্টমাইজেশন',
      branches: 'শাখা ও গুদাম',
      users: 'ইউজার ও পারমিশন',
      audit: 'অডিট ট্রেইল',
    },
    metrics: {
      totalReceivable: 'মোট পাওনা',
      salesRevenue: 'বিক্রয় আয়',
      netVatPayable: 'নিট প্রদেয় মূসক',
      cashAndBank: 'নগদ ও ব্যাংক',
      netProfit: 'নিট মুনাফা',
      totalExpenses: 'মোট খরচ',
      inventoryValue: 'মজুদ পণ্যের মূল্য',
      overdueInvoices: 'মেয়াদোত্তীর্ণ বকেয়া',
    },
    empty: {
      noInvoicesTitle: 'এখনো কোনো ইনভয়েস তৈরি হয়নি',
      noInvoicesDesc: 'প্রথম ইনভয়েস তৈরি করলে মূসক ৬.৩ চালান, কাস্টমারের পাওনা, স্টক ও ডাবল-এন্ট্রি জার্নাল স্বয়ংক্রিয়ভাবে সমন্বয় হবে।',
      noCustomersTitle: 'কোনো কাস্টমার যুক্ত নেই',
      noCustomersDesc: 'ইনভয়েস ও পাওনা হিসাব শুরু করতে একজন কাস্টমার যুক্ত করুন।',
      noExpensesTitle: 'কোনো খরচ লিপিবদ্ধ নেই',
      noExpensesDesc: 'অফিস ভাড়া, বিল বা পরিবহন খরচ যুক্ত করলে তা সরাসরি লাভ-ক্ষতির হিসাবে প্রতিফলিত হবে।',
      noAlertsTitle: 'কোনো জরুরি সতর্কতা নেই',
      noAlertsDesc: 'সব ইনভয়েস, স্টক ও নিয়মিত বিলিং স্বাভাবিক অবস্থায় রয়েছে।',
    },
    labels: {
      customer: 'কাস্টমার',
      vendor: 'সরবরাহকারী',
      branch: 'শাখা',
      date: 'তারিখ',
      dueDate: 'পরিশোধের তারিখ',
      amount: 'পরিমাণ',
      subtotal: 'উপ-মোট',
      vat: 'মূসক (VAT)',
      total: 'সর্বমোট',
      paid: 'পরিশোধিত',
      balanceDue: 'বকেয়া',
      method: 'মাধ্যম',
      reference: 'রেফারেন্স',
      notes: 'নোট',
      quantity: 'পরিমাণ',
      rate: 'দর',
      item: 'পণ্য / সেবা',
      status: 'অবস্থা',
      debit: 'ডেবিট',
      credit: 'ক্রেডিট',
      balanced: 'সমন্বিত (ডেবিট = ক্রেডিট)',
      unbalanced: 'অসমন্বিত',
      openingBalance: 'প্রারম্ভিক জের',
      closingBalance: 'সমাপনী জের',
      outputVat: 'আউটপুট মূসক (বিক্রয়)',
      inputVat: 'ইনপুট মূসক রেয়াত (ক্রয়)',
      taxableSales: 'করযোগ্য বিক্রয়',
      taxablePurchases: 'করযোগ্য ক্রয়',
    },
    quickActions: {
      title: 'দ্রুত অ্যাকশন',
      addExpense: 'খরচ যোগ করুন',
      addExpenseDesc: 'ভাড়া, বিল বা দৈনিক ব্যয়',
      viewStock: 'স্টক দেখুন',
      viewStockDesc: 'শাখাভিত্তিক মজুদ ও সতর্কতা',
      checkReports: 'রিপোর্ট দেখুন',
      checkReportsDesc: 'লাভ-ক্ষতি, ব্যালেন্স শিট PDF',
      receivePayment: 'পেমেন্ট গ্রহণ',
      receivePaymentDesc: 'বকেয়া ইনভয়েস সমন্বয়',
      posCounter: 'ক্যাশ কাউন্টার',
      posCounterDesc: 'দ্রুত বিক্রয় ও রসিদ',
      vatReturn: 'মূসক ও চালান',
      vatReturnDesc: 'মূসক ৯.১ রিটার্ন ও ৬.৩',
    },
  },
  en: {
    appName: 'Bepari',
    nav: {
      overview: 'Overview',
      sales: 'Sales & Invoices',
      customers: 'Customers',
      pos: 'POS Counter',
      products: 'Products',
      purchases: 'Purchases & Expenses',
      vat: 'VAT & Mushak',
      reports: 'Reports & Vault',
      documents: 'Document Vault',
      settings: 'Settings & Security',
      more: 'More',
    },
    actions: {
      newInvoice: 'New Invoice',
      receivePayment: 'Receive Payment',
      newCustomer: 'Add Customer',
      newExpense: 'Log Expense',
      newPurchase: 'Record Purchase',
      newProduct: 'Add Product',
      newRecurring: 'New Schedule',
      print: 'Download PDF',
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      search: 'Search...',
      runNow: 'Generate Now',
      reverse: 'Reverse Entry',
      viewChallan: 'Mushak 6.3',
      viewInvoice: 'Invoice',
      viewStatement: 'Statement',
      checkout: 'Complete Sale',
      allBranches: 'All Branches',
      loadSample: 'Load Sample Data',
      startClean: 'Start Clean Workspace',
      edit: 'Edit',
      delete: 'Delete',
      signOut: 'Sign Out',
    },
    status: {
      draft: 'Draft',
      sent: 'Sent',
      partial: 'Partial',
      paid: 'Paid',
      overdue: 'Overdue',
      void: 'Void',
      posted: 'Posted',
      reversed: 'Reversed',
      active: 'Active',
      paused: 'Paused',
    },
    tabs: {
      invoices: 'Invoices',
      customers: 'Customers',
      payments: 'Payments & Gateway',
      recurring: 'Recurring Billing',
      expenses: 'Expenses',
      purchases: 'Purchases (Mushak 6.1)',
      inventory: 'Inventory & Branches',
      vendors: 'Vendors',
      mushak63: 'Mushak 6.3 Challans',
      mushak91: 'Mushak 9.1 Return',
      taxRules: 'Versioned Tax Rules',
      pnl: 'Profit & Loss',
      balanceSheet: 'Balance Sheet',
      cashFlow: 'Cash Flow',
      trialBalance: 'Trial Balance',
      ledger: 'Journal Ledger',
      vault: 'Document Vault',
      organization: 'Organization',
      design: 'Design & Customization',
      branches: 'Branches',
      users: 'Users & Roles',
      audit: 'Audit Trail',
    },
    metrics: {
      totalReceivable: 'Total Receivable',
      salesRevenue: 'Sales Revenue',
      netVatPayable: 'Net VAT Payable',
      cashAndBank: 'Cash & Bank',
      netProfit: 'Net Profit',
      totalExpenses: 'Operating Expenses',
      inventoryValue: 'Inventory Value',
      overdueInvoices: 'Overdue Amount',
    },
    empty: {
      noInvoicesTitle: 'No invoices recorded yet',
      noInvoicesDesc: 'Create your first invoice to automatically generate Mushak 6.3 challan, update customer receivable, adjust stock, and post balanced double-entry journals.',
      noCustomersTitle: 'No customers added yet',
      noCustomersDesc: 'Add your first customer to start issuing invoices and tracking statements.',
      noExpensesTitle: 'No expenses logged yet',
      noExpensesDesc: 'Log business expenses such as rent, utilities, or delivery to reflect accurately in Profit & Loss.',
      noAlertsTitle: 'All clear — no urgent alerts',
      noAlertsDesc: 'Invoices, branch inventory levels, and recurring billing schedules are all on track.',
    },
    labels: {
      customer: 'Customer',
      vendor: 'Vendor',
      branch: 'Branch',
      date: 'Date',
      dueDate: 'Due Date',
      amount: 'Amount',
      subtotal: 'Subtotal',
      vat: 'VAT',
      total: 'Total',
      paid: 'Paid',
      balanceDue: 'Balance Due',
      method: 'Method',
      reference: 'Reference',
      notes: 'Notes',
      quantity: 'Qty',
      rate: 'Rate',
      item: 'Item / Service',
      status: 'Status',
      debit: 'Debit',
      credit: 'Credit',
      balanced: 'Balanced (Debit = Credit)',
      unbalanced: 'Unbalanced',
      openingBalance: 'Opening Balance',
      closingBalance: 'Closing Balance',
      outputVat: 'Output VAT (Sales)',
      inputVat: 'Input VAT Credit (Purchases)',
      taxableSales: 'Taxable Sales',
      taxablePurchases: 'Taxable Purchases',
    },
    quickActions: {
      title: 'Quick Actions',
      addExpense: 'Add Expense',
      addExpenseDesc: 'Log rent, bills & costs',
      viewStock: 'View Stock',
      viewStockDesc: 'Branch inventory levels',
      checkReports: 'Check Reports',
      checkReportsDesc: 'P&L, Balance Sheet PDF',
      receivePayment: 'Receive Payment',
      receivePaymentDesc: 'Settle due invoices',
      posCounter: 'POS Counter',
      posCounterDesc: 'Fast cash sale & receipt',
      vatReturn: 'VAT & Mushak',
      vatReturnDesc: 'Mushak 9.1 & 6.3 challans',
    },
  },
};
