import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'ghost';

const variants: Record<Variant, string> = {
  primary:
    'bg-gradient-to-b from-verdigris-500 to-verdigris-700 text-bone-50 shadow-glow border border-verdigris-300/40 active:brightness-90',
  ghost: 'border border-brass-500/40 text-brass-300 bg-abyss-800/60 active:bg-abyss-700',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={`min-h-12 w-full rounded-xl px-4 font-display text-base font-bold tracking-[0.18em] uppercase transition disabled:opacity-50 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
