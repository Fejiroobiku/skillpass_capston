import { BadgeCheckIcon } from 'lucide-react';

/** `inverted` is kept for older call sites; on the dark theme both variants look the same. */
export function Logo({ compact = false }: {compact?: boolean;inverted?: boolean;}) {
  return (
    <div className="flex items-center gap-2.5">
      <span className={`flex items-center justify-center rounded-sm border-2 border-brand-500 text-brand-500 ${compact ? 'h-8 w-8' : 'h-9 w-9'}`}>
        <BadgeCheckIcon className="h-5 w-5" strokeWidth={2.4} aria-hidden="true" />
      </span>
      <span className={`font-display font-bold tracking-tight text-ink ${compact ? 'text-lg' : 'text-xl'}`}>
        Skill<span className="text-brand-500">Pass</span>
      </span>
    </div>);

}
