import { Link, useLocation } from 'react-router-dom';
import { SmartphoneIcon } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';

/** Reminds signed-in people to confirm their phone, which is needed to confirm skills, co-sign and rate. */
export function PhoneBanner() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { t } = useT();
  if (!user || user.role === 'admin' || user.account.phoneVerified || pathname === '/confirm-contact') return null;
  return (
    <div role="status" className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-warn-200 bg-warn-50 px-4 py-3 text-sm text-warn-700">
      <span className="flex items-center gap-2 font-medium"><SmartphoneIcon className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('banner.phone')}</span>
      <Link to="/confirm-contact" className="rounded-lg bg-warn-600 px-3 py-1.5 font-semibold text-night hover:opacity-90">{t('banner.phoneAction')}</Link>
    </div>);

}
