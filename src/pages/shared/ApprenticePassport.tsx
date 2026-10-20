import React from 'react';
import { useParams } from 'react-router-dom';
import { PrinterIcon } from 'lucide-react';
import { PageHeader } from '../../components/PageHeader';
import { PassportView } from '../../components/PassportView';
import { useT } from '../../i18n';

/**
 * A passport opened by account rather than by its shared link: for the apprentice's own trainer and administrators.
 * The server decides who may see it, and it never hands out the apprentice's private share link.
 */
export function ApprenticePassport() {
  const { apprenticeId = '' } = useParams();
  const { t } = useT();
  return (
    <>
      <PageHeader title={t('passport.title')} />
      <PassportView
        source={{ apprenticeId }}
        actions={
        <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold text-ink ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-white/10">
            <PrinterIcon className="h-4 w-4" /> {t('pp.print')}
          </button>
        } />
    </>);

}
