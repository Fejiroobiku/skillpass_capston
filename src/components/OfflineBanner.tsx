import { WifiOffIcon } from 'lucide-react';
import { useOnline } from '../offline/hooks';
import { useT } from '../i18n';

/** A slim bar at the top of every screen while the phone has no connection. */
export function OfflineBanner() {
  const online = useOnline();
  const { t } = useT();
  if (online) return null;
  return (
    <div role="status" className="no-print relative z-[60] flex items-center justify-center gap-2 bg-warn-600 px-4 py-2 text-center text-xs font-semibold text-night">
      <WifiOffIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      {t('offline.banner')}
    </div>);

}
