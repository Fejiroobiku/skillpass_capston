import { PrinterIcon } from 'lucide-react';
import { PublicHeader } from '../../components/PublicHeader';
import { TERMS_EFFECTIVE, TERMS_VERSION, termsText } from '../../data/terms';
import { useT } from '../../i18n';

/** The full Terms of Service, readable without signing in. */
export function Terms() {
  const { lang } = useT();
  const tx = termsText[lang] ?? termsText.en;
  return (
    <div className="min-h-screen bg-night">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-6">
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-brand-700">SkillPass · version {TERMS_VERSION} · {TERMS_EFFECTIVE}</p>
        <div className="mt-2 flex items-start justify-between gap-4">
          <h1 className="text-3xl font-semibold tracking-tight text-ink md:text-4xl">{tx.title}</h1>
          <button type="button" onClick={() => window.print()} className="no-print inline-flex shrink-0 items-center gap-2 rounded-sm border border-line px-3 py-2 text-sm font-medium text-ink hover:bg-canvas">
            <PrinterIcon className="h-4 w-4" /> Print
          </button>
        </div>
        <p className="mt-4 text-ink-muted">{tx.intro}</p>

        <section aria-labelledby="terms-short" className="mt-8 rounded-sm border border-brand-500/60 bg-surface p-5 md:p-6">
          <h2 id="terms-short" className="text-lg font-semibold text-ink">{tx.shortTitle}</h2>
          <ol className="mt-4 space-y-3">
            {tx.short.map((s, i) =>
            <li key={i} className="flex gap-3 text-sm text-ink">
                <span className="font-mono text-brand-500">{String(i + 1).padStart(2, '0')}</span>
                <span>{s}</span>
              </li>
            )}
          </ol>
        </section>

        <nav aria-label="Sections" className="no-print mt-8 flex flex-wrap gap-2 text-xs">
          {tx.sections.map((s) => <a key={s.id} href={`#${s.id}`} className="rounded-sm border border-line px-2.5 py-1.5 text-ink-muted hover:border-brand-500 hover:text-ink">{s.title}</a>)}
        </nav>

        <div className="mt-8 space-y-8">
          {tx.sections.map((s) =>
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-20">
              <h2 id={`${s.id}-h`} className="text-xl font-semibold text-ink">{s.title}</h2>
              <ul className="mt-3 space-y-2.5">
                {s.points.map((p, i) => <li key={i} className="border-l-2 border-line pl-3 text-sm leading-relaxed text-ink-muted">{p}</li>)}
              </ul>
            </section>
          )}
        </div>
        <p className="mt-10 border-t border-line pt-6 text-sm text-ink-muted">{tx.contact}</p>
      </main>
    </div>);

}
