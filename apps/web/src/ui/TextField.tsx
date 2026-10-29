import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, className = '', ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-xs tracking-widest text-bone-400 uppercase">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="min-h-12 w-full rounded-xl border border-abyss-600 bg-abyss-900/80 px-4 text-base text-bone-50 placeholder:text-bone-600 focus:border-verdigris-500 focus:outline-none aria-invalid:border-ichor-400"
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 text-sm text-ichor-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
