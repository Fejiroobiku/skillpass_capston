// Signal Ledger theme: near-black with a faint grid, lime-green signal colour, square edges.
// Colours are CSS variables (defined in src/index.css) so the same class names render the dark theme
// on screen and fall back to the original light palette when a passport is printed.
const rgb = (name) => `rgb(var(--${name}) / <alpha-value>)`;
// Translucent tokens carry their own alpha, so panels let the background grid show faintly.
const glass = (name) => `rgb(var(--${name}) / var(--${name}-a))`;

export default {
  content: [
  './index.html',
  './src/**/*.{js,ts,jsx,tsx}'
],
  theme: {
    // Square, engineered edges. "full" stays round for the camera's shutter and record buttons.
    borderRadius: {
      none: '0', sm: '1px', DEFAULT: '2px', md: '2px', lg: '2px', xl: '3px', '2xl': '3px', '3xl': '4px', full: '9999px',
    },
    extend: {
      fontFamily: {
        sans: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        brand: {
          50: rgb('brand-50'),
          100: rgb('brand-100'),
          200: rgb('brand-200'),
          300: rgb('brand-300'),
          500: rgb('brand-500'),
          600: rgb('brand-600'),
          700: rgb('brand-700'),
          800: rgb('brand-800'),
          900: rgb('brand-900'),
        },
        violet: { 300: rgb('violet-300'), 500: rgb('violet-500') },
        ink: {
          DEFAULT: rgb('ink'),
          muted: rgb('ink-muted'),
          subtle: rgb('ink-subtle'),
        },
        // Deep background colour, and the dark text that sits on bright lime buttons.
        night: rgb('night'),
        line: glass('line'),
        canvas: glass('canvas'),
        // Glass card surface (replaces bg-white) and a solid one for menus and dialogs.
        surface: glass('surface'),
        raised: rgb('raised'),
        ok: { 50: rgb('ok-50'), 200: rgb('ok-200'), 600: rgb('ok-600'), 700: rgb('ok-700') },
        warn: { 50: rgb('warn-50'), 200: rgb('warn-200'), 600: rgb('warn-600'), 700: rgb('warn-700') },
        bad: { 50: rgb('bad-50'), 100: rgb('bad-100'), 200: rgb('bad-200'), 600: rgb('bad-600'), 700: rgb('bad-700') },
      },
      // No soft glows in this theme: a thin signal-coloured outline instead.
      boxShadow: {
        glow: '0 0 0 1px rgb(var(--brand-500) / 0.55)',
        'glow-violet': '0 0 0 1px rgb(var(--violet-500) / 0.55)',
      },
    },
  },
}
