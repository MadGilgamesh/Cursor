import type { ButtonHTMLAttributes, ReactNode } from 'react';

const variants = {
  primary:
    'bg-gradient-to-b from-verdigris-500 to-verdigris-700 text-bone-50 shadow-glow border border-verdigris-300/40',
  ghost: 'border border-brass-500/40 text-brass-300 bg-abyss-800/60',
  danger: 'border border-ichor-400/40 text-ichor-400 bg-abyss-900/80',
} as const;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof variants }) {
  return (
    <button
      type="button"
      className={`min-h-11 rounded-xl px-4 font-display text-sm font-bold tracking-[0.14em] uppercase transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}

export const controlClass =
  'min-h-11 w-full rounded-xl border border-abyss-600 bg-abyss-900/80 px-3 text-bone-50 placeholder:text-bone-600 focus:border-verdigris-500 focus:outline-none';

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs tracking-[0.16em] text-bone-400 uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-bone-600">{hint}</span> : null}
    </label>
  );
}

export function Notice({ children, tone = 'ok' }: { children: ReactNode; tone?: 'ok' | 'bad' }) {
  const color = tone === 'ok' ? 'text-verdigris-300' : 'text-ichor-400';
  return <p className={`text-sm ${color}`}>{children}</p>;
}
