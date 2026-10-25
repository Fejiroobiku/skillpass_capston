import { useId } from 'react';

interface ScoreRingProps {
  score: number;
  max?: number;
  size?: number;
  label?: string;
}

/** A signal-green ring that fills to the score, with square ends. Used for trainer trust scores. */
export function ScoreRing({ score, max = 100, size = 168, label = 'Trust score' }: ScoreRingProps) {
  const gradientId = `ring${useId().replace(/:/g, '')}`;
  const stroke = Math.round(size / 14);
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(1, score / max)) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg role="img" aria-label={`${label} ${score} out of ${max}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: 'rgb(var(--brand-500))' }} />
            <stop offset="1" style={{ stopColor: 'rgb(var(--violet-500))' }} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" style={{ stroke: 'rgb(var(--line) / var(--line-a))' }} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="butt"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" aria-hidden="true">
        <span className="font-mono text-5xl font-bold tracking-tighter text-brand-500">{score}</span>
        <span className="text-xs text-ink-subtle">of {max}</span>
      </div>
    </div>);

}
