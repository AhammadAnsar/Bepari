/**
 * Bepari — Centralized Environment & Startup Configuration Validator
 *
 * Enforces strict separation between:
 * 1. Mandatory Core Infrastructure (PostgreSQL connection + SESSION_SECRET + APP_BASE_URL for auth/redirects)
 * 2. Safe Operational Defaults (NODE_ENV, LOG_LEVEL, TRUSTED_PROXY_HOPS)
 * 3. Optional Phase-Gated Integrations (Object Storage, Email Provider)
 *
 * Security invariant: Never populates missing credentials with fabricated or hardcoded secrets,
 * and never exposes secret values in logs or API responses.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ConfigRequirementStatus {
  key: string;
  category: 'database' | 'auth' | 'url' | 'runtime' | 'storage' | 'email';
  requirementLevel: 'mandatory_now' | 'safe_default' | 'optional_later';
  configured: boolean;
  actionableMessageBn: string;
  actionableMessageEn: string;
}

export interface IntegrationOperationalStatus {
  id: 'postgresql' | 'session_auth' | 'app_base_url' | 'object_storage' | 'email_provider';
  nameBn: string;
  nameEn: string;
  requiredForPhase0: boolean;
  status: 'operational' | 'blocked_missing_config' | 'disabled_optional';
  detailsBn: string;
  detailsEn: string;
  missingVars: string[];
}

export interface EnvironmentValidationReport {
  nodeEnv: string;
  logLevel: LogLevel;
  trustedProxyHops: number;
  coreReady: boolean;
  databaseConfigured: boolean;
  authSecretConfigured: boolean;
  appBaseUrlConfigured: boolean;
  optionalServices: {
    objectStorageEnabled: boolean;
    emailNotificationsEnabled: boolean;
  };
  mandatoryMissing: string[];
  actionableErrors: Array<{
    code: string;
    variable: string;
    messageBn: string;
    messageEn: string;
  }>;
  variables: ConfigRequirementStatus[];
  integrations: IntegrationOperationalStatus[];
}

const VALID_LOG_LEVELS: ReadonlyArray<LogLevel> = ['debug', 'info', 'warn', 'error'];
const MIN_SESSION_SECRET_LENGTH = 32;

function isNonEmpty(val: string | undefined): boolean {
  if (!val) return false;
  const trimmed = val.trim();
  if (trimmed.length === 0) return false;
  // Reject obvious template placeholders from .env.example
  if (trimmed === 'MY_APP_URL' || trimmed === 'MY_GEMINI_API_KEY') return false;
  return true;
}

export function resolveLogLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || 'info').trim().toLowerCase() as LogLevel;
  return VALID_LOG_LEVELS.includes(raw) ? raw : 'info';
}

/**
 * TRUSTED_PROXY_HOPS must follow the actual trusted deployment topology.
 * Defaults to 0 (do not blindly trust X-Forwarded-* headers unless explicitly configured).
 */
export function resolveTrustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!isNonEmpty(raw)) return 0;
  const parsed = Number.parseInt(raw!.trim(), 10);
  if (Number.isNaN(parsed) || parsed < 0 || parsed > 10) {
    return 0;
  }
  return parsed;
}

export function resolveAppBaseUrl(): string | null {
  const candidate = process.env.APP_BASE_URL || process.env.APP_URL;
  if (!isNonEmpty(candidate)) return null;
  try {
    const parsed = new URL(candidate!.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function isSessionSecretValid(): {
  valid: boolean;
  reasonEn?: string;
  reasonBn?: string;
} {
  const raw = process.env.SESSION_SECRET;
  if (!isNonEmpty(raw)) {
    return {
      valid: false,
      reasonBn:
        'SESSION_SECRET সেট করা নেই। প্রমাণীকরণ ও সেশন টোকেন HMAC সুরক্ষার জন্য কমপক্ষে ৩২ অক্ষরের SESSION_SECRET আবশ্যক।',
      reasonEn:
        'SESSION_SECRET is not set. A high-entropy SESSION_SECRET (minimum 32 characters) is mandatory for authentication and session HMAC signing.',
    };
  }
  if (raw!.trim().length < MIN_SESSION_SECRET_LENGTH) {
    return {
      valid: false,
      reasonBn: `SESSION_SECRET অত্যন্ত ছোট (কমপক্ষে ${MIN_SESSION_SECRET_LENGTH} অক্ষর প্রয়োজন)।`,
      reasonEn: `SESSION_SECRET is too short (minimum ${MIN_SESSION_SECRET_LENGTH} characters required).`,
    };
  }
  return { valid: true };
}

export function getSessionSecretOrThrow(): string {
  const check = isSessionSecretValid();
  if (!check.valid) {
    throw new Error(check.reasonEn || 'SESSION_SECRET is invalid or missing.');
  }
  return process.env.SESSION_SECRET!.trim();
}

export function evaluateEnvironmentConfig(options?: {
  hasDisposableTestDb?: boolean;
}): EnvironmentValidationReport {
  const nodeEnv = (process.env.NODE_ENV || 'development').trim();
  const logLevel = resolveLogLevel();
  const trustedProxyHops = resolveTrustedProxyHops();

  // 1. PostgreSQL configuration check (Cloud SQL SQL_* or external PG* or DATABASE_URL)
  const hasCloudSqlVars =
    isNonEmpty(process.env.SQL_HOST) &&
    isNonEmpty(process.env.SQL_DB_NAME) &&
    isNonEmpty(process.env.SQL_USER) &&
    isNonEmpty(process.env.SQL_PASSWORD);

  const hasExternalPgVars =
    isNonEmpty(process.env.PGHOST) &&
    isNonEmpty(process.env.PGDATABASE) &&
    isNonEmpty(process.env.PGUSER) &&
    isNonEmpty(process.env.PGPASSWORD);

  const hasDatabaseUrl = isNonEmpty(process.env.DATABASE_URL);

  const databaseConfigured = Boolean(
    options?.hasDisposableTestDb ||
      hasCloudSqlVars ||
      hasExternalPgVars ||
      hasDatabaseUrl
  );

  // 2. SESSION_SECRET check
  const sessionSecretCheck = isSessionSecretValid();
  const authSecretConfigured = sessionSecretCheck.valid;

  // 3. APP_BASE_URL check
  const resolvedBaseUrl = resolveAppBaseUrl();
  const appBaseUrlConfigured = Boolean(resolvedBaseUrl);

  // 4. Optional Object Storage check
  const hasStorageBucket = isNonEmpty(process.env.STORAGE_BUCKET);
  const hasStorageEndpoint = isNonEmpty(process.env.STORAGE_ENDPOINT);
  const hasStorageKey = isNonEmpty(process.env.STORAGE_ACCESS_KEY_ID);
  const hasStorageSecret = isNonEmpty(process.env.STORAGE_SECRET_ACCESS_KEY);
  const objectStorageEnabled =
    hasStorageBucket && hasStorageEndpoint && hasStorageKey && hasStorageSecret;

  // 5. Optional Email Provider check
  const emailNotificationsEnabled = isNonEmpty(process.env.EMAIL_PROVIDER_API_KEY);

  const actionableErrors: EnvironmentValidationReport['actionableErrors'] = [];
  const mandatoryMissing: string[] = [];

  if (!databaseConfigured) {
    mandatoryMissing.push('PostgreSQL (SQL_HOST/SQL_DB_NAME/SQL_USER/SQL_PASSWORD or PGHOST/PGDATABASE/PGUSER/PGPASSWORD)');
    actionableErrors.push({
      code: 'MISSING_POSTGRESQL_CONFIG',
      variable: 'SQL_HOST / PGHOST',
      messageBn:
        'PostgreSQL ডাটাবেস সংযোগ কনফিগার করা নেই। Cloud SQL (SQL_HOST, SQL_DB_NAME, SQL_USER, SQL_PASSWORD) অথবা এক্সটার্নাল PostgreSQL (PGHOST, PGDATABASE, PGUSER, PGPASSWORD) সেট করুন।',
      messageEn:
        'PostgreSQL database connection is not configured. Set Cloud SQL variables (SQL_HOST, SQL_DB_NAME, SQL_USER, SQL_PASSWORD) or external PostgreSQL variables (PGHOST, PGDATABASE, PGUSER, PGPASSWORD).',
    });
  }

  if (!authSecretConfigured) {
    mandatoryMissing.push('SESSION_SECRET');
    actionableErrors.push({
      code: 'MISSING_OR_WEAK_SESSION_SECRET',
      variable: 'SESSION_SECRET',
      messageBn:
        sessionSecretCheck.reasonBn ||
        'SESSION_SECRET সেট করা নেই (কমপক্ষে ৩২ অক্ষরের র‍্যান্ডম সিক্রেট আবশ্যক)।',
      messageEn:
        sessionSecretCheck.reasonEn ||
        'SESSION_SECRET is missing or shorter than 32 characters.',
    });
  }

  if (!appBaseUrlConfigured) {
    actionableErrors.push({
      code: 'MISSING_APP_BASE_URL',
      variable: 'APP_BASE_URL',
      messageBn:
        'APP_BASE_URL কনফিগার করা নেই। এক্সটার্নাল রিডাইরেক্ট ও অথেনটিকেশন কলব্যাকের জন্য APP_BASE_URL (যেমন https://your-domain.com) নির্ধারণ করুন।',
      messageEn:
        'APP_BASE_URL is not configured. Set APP_BASE_URL (e.g., https://your-domain.com) before enabling external auth redirects or callback links.',
    });
  }

  const variables: ConfigRequirementStatus[] = [
    {
      key: 'SQL_HOST / PGHOST (+ DB, USER, PASSWORD)',
      category: 'database',
      requirementLevel: 'mandatory_now',
      configured: databaseConfigured,
      actionableMessageBn: databaseConfigured
        ? 'PostgreSQL সংযোগ প্যারামিটার উপস্থিত।'
        : 'আবশ্যক: আর্থিক লেজার ও সকল ডাটাবেস কার্যক্রমের জন্য PostgreSQL ক্রেডেনশিয়াল সেট করুন।',
      actionableMessageEn: databaseConfigured
        ? 'PostgreSQL connection parameters are present.'
        : 'Required now: Configure PostgreSQL credentials before starting database-dependent functionality.',
    },
    {
      key: 'SESSION_SECRET',
      category: 'auth',
      requirementLevel: 'mandatory_now',
      configured: authSecretConfigured,
      actionableMessageBn: authSecretConfigured
        ? 'সেশন HMAC সিক্রেট সক্রিয় (৩২+ অক্ষর)।'
        : 'আবশ্যক: সাইন-ইন ও সেশন টোকেন স্বাক্ষরের জন্য কমপক্ষে ৩২ অক্ষরের SESSION_SECRET সেট করুন।',
      actionableMessageEn: authSecretConfigured
        ? 'Session HMAC secret is configured (32+ chars).'
        : 'Required now: Set a 32+ character SESSION_SECRET before enabling user registration or sign-in.',
    },
    {
      key: 'APP_BASE_URL',
      category: 'url',
      requirementLevel: 'mandatory_now',
      configured: appBaseUrlConfigured,
      actionableMessageBn: appBaseUrlConfigured
        ? `কনফিগারকৃত বেস URL: ${resolvedBaseUrl}`
        : 'প্রয়োজনীয়: রিডাইরেক্ট ও এক্সটার্নাল লিংকের জন্য APP_BASE_URL সেট করুন।',
      actionableMessageEn: appBaseUrlConfigured
        ? `Configured origin: ${resolvedBaseUrl}`
        : 'Required for external redirects/links: Configure APP_BASE_URL with a valid http/https origin.',
    },
    {
      key: 'LOG_LEVEL',
      category: 'runtime',
      requirementLevel: 'safe_default',
      configured: true,
      actionableMessageBn: `নিরাপদ ডিফল্ট ব্যবহৃত হচ্ছে (${logLevel})।`,
      actionableMessageEn: `Active with safe default (${logLevel}).`,
    },
    {
      key: 'TRUSTED_PROXY_HOPS',
      category: 'runtime',
      requirementLevel: 'safe_default',
      configured: true,
      actionableMessageBn: `ট্রাস্টেড প্রক্সি হপস: ${trustedProxyHops} (অযাচিত প্রক্সি হেডার অন্ধভাবে বিশ্বাস করা হয় না)।`,
      actionableMessageEn: `Trusted proxy hops: ${trustedProxyHops} (incoming proxy headers are only trusted across verified hops).`,
    },
    {
      key: 'STORAGE_BUCKET / STORAGE_ENDPOINT / STORAGE_ACCESS_KEY_ID / STORAGE_SECRET_ACCESS_KEY',
      category: 'storage',
      requirementLevel: 'optional_later',
      configured: objectStorageEnabled,
      actionableMessageBn: objectStorageEnabled
        ? 'অবজেক্ট স্টোরেজ সংযুক্ত।'
        : 'ঐচ্ছিক (পরবর্তী ধাপে): ফাইল অ্যাটাচমেন্ট ও PDF আর্কাইভের আগ পর্যন্ত নিষ্ক্রিয় থাকবে; অন্য মডিউল ব্লক করবে না।',
      actionableMessageEn: objectStorageEnabled
        ? 'Object storage credentials configured.'
        : 'Optional (configure later): Document attachments & object storage remain gracefully disabled without blocking core modules.',
    },
    {
      key: 'EMAIL_PROVIDER_API_KEY',
      category: 'email',
      requirementLevel: 'optional_later',
      configured: emailNotificationsEnabled,
      actionableMessageBn: emailNotificationsEnabled
        ? 'ইমেইল প্রোভাইডার সংযুক্ত।'
        : 'ঐচ্ছিক (পরবর্তী ধাপে): ইমেইল নোটিফিকেশন নিষ্ক্রিয় থাকবে; কোর হিসাবরক্ষণ ব্লক করবে না।',
      actionableMessageEn: emailNotificationsEnabled
        ? 'Email provider configured.'
        : 'Optional (configure later): Outbound email notifications remain gracefully disabled without blocking core accounting.',
    },
  ];

  const integrations: IntegrationOperationalStatus[] = [
    {
      id: 'postgresql',
      nameBn: 'PostgreSQL প্রাইমারি ডাটাবেস (Drizzle ORM)',
      nameEn: 'PostgreSQL Primary Database (Drizzle ORM)',
      requiredForPhase0: true,
      status: databaseConfigured ? 'operational' : 'blocked_missing_config',
      detailsBn: databaseConfigured
        ? 'সংযোগ প্যারামিটার প্রস্তুত।'
        : 'স্থগিত: AI Studio Starter Tier-এ Cloud SQL NO_VALID_PROJECT রিটার্ন করেছে এবং এক্সটার্নাল PGHOST/SQL_HOST সেট করা নেই।',
      detailsEn: databaseConfigured
        ? 'Connection parameters configured.'
        : 'Blocked: Cloud SQL Starter Tier returned NO_VALID_PROJECT and no external PGHOST/SQL_HOST is configured.',
      missingVars: databaseConfigured
        ? []
        : ['SQL_HOST', 'SQL_DB_NAME', 'SQL_USER', 'SQL_PASSWORD', 'PGHOST', 'PGDATABASE', 'PGUSER', 'PGPASSWORD'],
    },
    {
      id: 'session_auth',
      nameBn: 'প্রমাণীকরণ ও সেশন ব্যবস্থাপনা (scrypt + HMAC Session)',
      nameEn: 'Authentication & Session Management (scrypt + HMAC Session)',
      requiredForPhase0: true,
      status:
        databaseConfigured && authSecretConfigured
          ? 'operational'
          : 'blocked_missing_config',
      detailsBn:
        databaseConfigured && authSecretConfigured
          ? 'সার্ভার-সাইড scrypt হ্যাশিং ও SESSION_SECRET সক্রিয়।'
          : !authSecretConfigured
          ? 'স্থগিত: SESSION_SECRET (কমপক্ষে ৩২ অক্ষর) কনফিগার করা আবশ্যক।'
          : 'স্থগিত:SESSION_SECRET উপস্থিত থাকলেও সেশন সংরক্ষণের জন্য PostgreSQL সংযোগ আবশ্যক।',
      detailsEn:
        databaseConfigured && authSecretConfigured
          ? 'Server-side scrypt hashing and SESSION_SECRET HMAC signing active.'
          : !authSecretConfigured
          ? 'Blocked: SESSION_SECRET (min 32 chars) must be configured before authentication can run.'
          : 'Blocked: SESSION_SECRET is set, but PostgreSQL is required to persist user sessions.',
      missingVars: [
        ...(authSecretConfigured ? [] : ['SESSION_SECRET']),
        ...(databaseConfigured ? [] : ['PGHOST / SQL_HOST']),
      ],
    },
    {
      id: 'app_base_url',
      nameBn: 'অ্যাপ্লিকেশন বেস URL ও ট্রাস্টেড প্রক্সি টপোলজি',
      nameEn: 'Application Base URL & Trusted Proxy Topology',
      requiredForPhase0: false,
      status: appBaseUrlConfigured ? 'operational' : 'blocked_missing_config',
      detailsBn: appBaseUrlConfigured
        ? `বেস অরিজিন (${resolvedBaseUrl}) ও TRUSTED_PROXY_HOPS=${trustedProxyHops} সক্রিয়।`
        : 'APP_BASE_URL সেট করা নেই; এক্সটার্নাল কলব্যাক ও রিডাইরেক্ট লিংক নিষ্ক্রিয় রাখা হয়েছে।',
      detailsEn: appBaseUrlConfigured
        ? `Base origin (${resolvedBaseUrl}) and TRUSTED_PROXY_HOPS=${trustedProxyHops} active.`
        : 'APP_BASE_URL is not set; external redirect/callback URL generation is disabled until configured.',
      missingVars: appBaseUrlConfigured ? [] : ['APP_BASE_URL'],
    },
    {
      id: 'object_storage',
      nameBn: 'অবজেক্ট স্টোরেজ (ভাউচার অ্যাটাচমেন্ট ও আর্কাইভ)',
      nameEn: 'Object Storage (Voucher Attachments & Archive)',
      requiredForPhase0: false,
      status: objectStorageEnabled ? 'operational' : 'disabled_optional',
      detailsBn: objectStorageEnabled
        ? 'অবজেক্ট স্টোরেজ সক্রিয়।'
        : 'ঐচ্ছিক ফিচার: স্টোরেজ ক্রেডেনশিয়াল ছাড়া নিরাপদে নিষ্ক্রিয় রয়েছে (অন্য মডিউল সচল)।',
      detailsEn: objectStorageEnabled
        ? 'Object storage active.'
        : 'Optional feature: Gracefully disabled until STORAGE_* variables are configured.',
      missingVars: objectStorageEnabled
        ? []
        : ['STORAGE_BUCKET', 'STORAGE_ENDPOINT', 'STORAGE_ACCESS_KEY_ID', 'STORAGE_SECRET_ACCESS_KEY'],
    },
    {
      id: 'email_provider',
      nameBn: 'ইমেইল নোটিফিকেশন সার্ভিস',
      nameEn: 'Email Notification Service',
      requiredForPhase0: false,
      status: emailNotificationsEnabled ? 'operational' : 'disabled_optional',
      detailsBn: emailNotificationsEnabled
        ? 'ইমেইল প্রোভাইডার সক্রিয়।'
        : 'ঐচ্ছিক ফিচার: EMAIL_PROVIDER_API_KEY ছাড়া নিরাপদে নিষ্ক্রিয় রয়েছে।',
      detailsEn: emailNotificationsEnabled
        ? 'Email provider active.'
        : 'Optional feature: Gracefully disabled until EMAIL_PROVIDER_API_KEY is configured.',
      missingVars: emailNotificationsEnabled ? [] : ['EMAIL_PROVIDER_API_KEY'],
    },
  ];

  return {
    nodeEnv,
    logLevel,
    trustedProxyHops,
    coreReady: databaseConfigured && authSecretConfigured,
    databaseConfigured,
    authSecretConfigured,
    appBaseUrlConfigured,
    optionalServices: {
      objectStorageEnabled,
      emailNotificationsEnabled,
    },
    mandatoryMissing,
    actionableErrors,
    variables,
    integrations,
  };
}

export function logStartupConfigurationSummary(): EnvironmentValidationReport {
  const report = evaluateEnvironmentConfig();
  const prefix = `[Bepari Startup Config][env=${report.nodeEnv}][logLevel=${report.logLevel}][trustedProxyHops=${report.trustedProxyHops}]`;

  if (report.coreReady) {
    console.log(`${prefix} Core mandatory infrastructure (PostgreSQL + SESSION_SECRET) is configured.`);
  } else {
    console.warn(
      `${prefix} Core infrastructure is BLOCKED. Missing mandatory variables: ${report.mandatoryMissing.join(', ')}`
    );
    for (const err of report.actionableErrors) {
      console.warn(`  -> [${err.code}] (${err.variable}): ${err.messageEn}`);
    }
  }

  console.log(
    `${prefix} Optional integrations: objectStorage=${
      report.optionalServices.objectStorageEnabled ? 'ENABLED' : 'DISABLED (unconfigured)'
    }, emailNotifications=${
      report.optionalServices.emailNotificationsEnabled ? 'ENABLED' : 'DISABLED (unconfigured)'
    }`
  );

  return report;
}
