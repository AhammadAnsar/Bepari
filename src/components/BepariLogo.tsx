import type { Language } from '../engine/types';

export const BEPARI_APP_ICON_URL = '/assets/aistudio/_______Business_Growth_Icon_91a353f7.png';

interface Props {
  lang?: Language;
  size?: 'sm' | 'md' | 'lg';
  surface?: 'light' | 'dark';
  showWordmark?: boolean;
  subtitle?: string;
}

const MARK_DIMENSIONS: Record<'sm' | 'md' | 'lg', { box: string; text: string }> = {
  sm: { box: 'w-8 h-8 rounded-lg', text: 'text-[15px]' },
  md: { box: 'w-9 h-9 rounded-xl', text: 'text-base' },
  lg: { box: 'w-11 h-11 rounded-xl', text: 'text-lg' },
};

/**
 * Dedicated Bepari Application Icon & Wordmark.
 * Uses the official attached Bepari Business Growth Icon across desktop sidebar,
 * mobile header, navigation drawer, onboarding wizard, shortcuts, and login screen.
 * Independent from the user's customizable Organization Logo.
 */
export function BepariLogo({
  lang = 'bn',
  size = 'md',
  surface = 'light',
  showWordmark = true,
  subtitle,
}: Props) {
  const isBn = lang === 'bn';
  const dims = MARK_DIMENSIONS[size];

  return (
    <div className="inline-flex items-center gap-2.5 shrink-0 select-none" data-testid="bepari-app-icon">
      <div
        className={`${dims.box} shrink-0 overflow-hidden bg-white border ${
          surface === 'dark' ? 'border-white/20' : 'border-slate-200/90'
        } shadow-[0_1px_2px_rgba(15,23,42,0.08)] flex items-center justify-center`}
      >
        <img
          src={BEPARI_APP_ICON_URL}
          alt={isBn ? 'বেপারী অ্যাপ আইকন' : 'Bepari App Icon'}
          className="w-full h-full object-cover"
        />
      </div>

      {showWordmark && (
        <div className="min-w-0 leading-none">
          <div
            className={`${dims.text} font-bold tracking-tight whitespace-nowrap ${
              surface === 'dark' ? 'text-white' : 'text-slate-900'
            }`}
          >
            {isBn ? 'বেপারী' : 'Bepari'}
          </div>
          {subtitle && (
            <div
              className={`text-[11px] mt-1 whitespace-nowrap ${
                surface === 'dark' ? 'text-slate-400' : 'text-slate-500'
              } ${isBn ? 'tracking-normal' : 'font-mono tracking-wider uppercase'}`}
            >
              {subtitle}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
