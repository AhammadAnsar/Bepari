import { useEffect, useState } from 'react';

interface Props {
  logoUrl?: string;
  orgName: string;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_MAP = {
  sm: { box: 'w-8 h-8 rounded-lg', text: 'text-xs' },
  md: { box: 'w-11 h-11 rounded-xl', text: 'text-sm' },
  lg: { box: 'w-14 h-14 rounded-xl', text: 'text-base' },
};

/**
 * Organization Logo component used strictly for business/company surfaces
 * (Organization Profile settings, Tax Invoices, Statements, Cash Memos, and Reports).
 * Completely independent from the Bepari application icon.
 */
export function OrganizationLogo({ logoUrl, orgName, size = 'md' }: Props) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [logoUrl]);

  const dims = SIZE_MAP[size];
  const hasLogo = Boolean(logoUrl && logoUrl.trim().length > 0 && !failed);
  const initials =
    (orgName || 'ORG')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join('') || 'OR';

  if (hasLogo) {
    return (
      <div
        data-testid="organization-logo"
        className={`${dims.box} shrink-0 overflow-hidden bg-white border border-slate-200 flex items-center justify-center p-1`}
      >
        <img
          src={logoUrl}
          alt={orgName}
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      data-testid="organization-logo"
      aria-label={orgName}
      className={`${dims.box} shrink-0 bg-slate-900 text-white font-semibold tracking-wide flex items-center justify-center border border-slate-800 ${dims.text}`}
    >
      {initials}
    </div>
  );
}
