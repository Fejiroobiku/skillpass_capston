import React from 'react';
import { Link } from 'react-router-dom';
import { MapPinIcon } from 'lucide-react';
import { Panel } from './Panel';
import { StatusBadge } from './StatusBadge';
import { StarRating } from './StarRating';
import { TrustBadge } from './TrustBadge';
import { QrCode } from './QrCode';
import { skillLevels } from '../data/skills';
import { formatDate } from '../utils/credentials';
import { usePassport, type PassportSource } from '../api/usePublic';
import { useT } from '../i18n';

const levelKey = { Foundation: 'level.Foundation', Intermediate: 'level.Intermediate', Advanced: 'level.Advanced' } as const;

/** An apprentice's skills passport, loaded from the public API so it works for anyone with the link. */
/** `shareUrl` is the public link to show as a QR code; leave it out when the viewer has no link to share. */
export function PassportView({ source, shareUrl, actions }: {source: PassportSource;shareUrl?: string | null;actions?: React.ReactNode;}) {
  const passport = usePassport(source);
  const { t } = useT();

  if (passport.status === 'idle' || passport.status === 'loading') return <p role="status" className="rounded-2xl bg-surface p-8 text-center text-ink-muted">{t('pv.loading')}</p>;
  if (!passport.data) {
    return <p role="alert" className="rounded-2xl bg-surface p-8 text-center text-ink-muted">{passport.status === 'missing' ? t('pv.notFound') : passport.error}</p>;
  }

  const { apprentice, trainer, skills, credentials, trainers, ratings } = passport.data;
  const verifiedCount = new Set(credentials.filter((c) => c.status === 'valid').map((c) => c.skillId)).size;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-brand-500/20 via-night/40 to-violet-500/25 p-6 text-ink md:p-8">
        <div aria-hidden="true" className="no-print pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-brand-500/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700">SkillPass · {apprentice.tradeName}</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-tight">{apprentice.name}</h2>
            <p className="mt-2 flex items-center gap-1.5 text-sm text-ink-muted">
              <MapPinIcon className="h-4 w-4" /> {apprentice.location}{trainer && ` · ${t('pv.trainedBy', { name: trainer.name, workshop: trainer.workshop })}`}
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-6xl font-bold text-brand-500">{verifiedCount}</span>
              <span className="text-ink-muted">{t('pv.verifiedOf', { total: skills.length })}</span>
            </div>
            {shareUrl && <QrCode value={shareUrl} caption={t('pv.scan')} fileName={`skillpass-passport-${apprentice.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`} size={104} />}
          </div>
        </div>
        {actions && <div className="no-print mt-6 flex flex-wrap items-center gap-2 relative border-t border-white/15 pt-5">{actions}</div>}
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title={t('pv.checklist')} description={t('pv.checklistDesc')}>
          <div className="space-y-6">
            {skillLevels.map((level) =>
            <div key={level}>
                <h3 className="mb-2 text-sm font-semibold text-ink-muted">{t(levelKey[level])}</h3>
                <ul className="divide-y divide-line rounded-xl border border-line">
                  {skills.filter((s) => s.level === level).map((s) => {
                  const cred = credentials.find((c) => c.skillId === s.id);
                  const tr = cred ? trainers[cred.trainerId] : undefined;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium ${cred ? 'text-ink' : 'text-ink-subtle'}`}>{s.name}</p>
                          {cred && tr &&
                        <p className="mt-0.5 text-xs text-ink-muted">
                              <TrustBadge trainerId={cred.trainerId} data={{ name: tr.name, score: tr.trustScore, underReview: tr.underReview }} /> · {formatDate(cred.issuedAt)} ·{' '}
                              <Link to={`/verify/${cred.id}`} className="font-mono text-brand-700 hover:underline">{cred.id}</Link>
                            </p>
                        }
                        </div>
                        {cred ? <StatusBadge status={cred.status} /> : <span className="text-xs text-ink-subtle">{t('pv.notYet')}</span>}
                      </li>);

                })}
                </ul>
              </div>
            )}
          </div>
        </Panel>

        <Panel title={t('pv.feedback')} description={t('pv.feedbackDesc')}>
          {ratings.length === 0 ?
          <p className="text-sm text-ink-muted">{t('pv.noRatings')}</p> :

          <ul className="space-y-4">
              {ratings.map((f) =>
            <li key={f.id} className="border-b border-line pb-4 last:border-0 last:pb-0">
                  <StarRating value={f.rating} />
                  <p className="mt-2 text-sm text-ink">“{f.comment}”</p>
                  <p className="mt-1 text-xs text-ink-muted">{f.company} · {formatDate(f.createdAt)}</p>
                </li>
            )}
            </ul>
          }
        </Panel>
      </div>
    </div>);

}
