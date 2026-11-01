import { loginRequestSchema, registerRequestSchema } from '@game/shared';
import { useState, type SubmitEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { z } from 'zod';

import { useLogin, useRegister } from '../api/auth';
import { errorMessage, t } from '../i18n';
import { Button } from '../ui/Button';
import { Fog } from '../ui/Fog';
import { Sigil } from '../ui/Sigil';
import { TextField } from '../ui/TextField';

type Mode = 'login' | 'register';
type Field = 'email' | 'characterName' | 'password';
type FieldErrors = Partial<Record<Field, string | undefined>>;

const copy = {
  login: {
    heading: t('auth.loginHeading'),
    submit: t('auth.loginSubmit'),
    pending: t('auth.loginPending'),
    switchText: t('auth.loginSwitchText'),
    switchLink: t('auth.loginSwitchLink'),
    switchTo: '/rejestracja',
  },
  register: {
    heading: t('auth.registerHeading'),
    submit: t('auth.registerSubmit'),
    pending: t('auth.registerPending'),
    switchText: t('auth.registerSwitchText'),
    switchLink: t('auth.registerSwitchLink'),
    switchTo: '/logowanie',
  },
} as const;

export function AuthScreen({ mode }: { mode: Mode }) {
  const navigate = useNavigate();
  const login = useLogin();
  const register = useRegister();
  const mutation = mode === 'login' ? login : register;
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const text = copy[mode];

  /** Waliduje formularz współdzielonym schematem; zwraca `false`, gdy dane są niepoprawne. */
  async function submit(form: Record<string, unknown>): Promise<boolean> {
    if (mode === 'login') {
      const parsed = loginRequestSchema.safeParse(form);
      if (!parsed.success) return showErrors(parsed.error);
      await login.mutateAsync(parsed.data);
    } else {
      const parsed = registerRequestSchema.safeParse(form);
      if (!parsed.success) return showErrors(parsed.error);
      await register.mutateAsync(parsed.data);
    }
    return true;
  }

  function showErrors(error: z.ZodError): false {
    const { fieldErrors: errors } = z.flattenError(error) as {
      fieldErrors: Partial<Record<Field, string[]>>;
    };
    setFieldErrors({
      email: errors.email?.[0],
      characterName: errors.characterName?.[0],
      password: errors.password?.[0],
    });
    return false;
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});
    try {
      if (await submit(Object.fromEntries(new FormData(event.currentTarget)))) {
        await navigate('/', { replace: true });
      }
    } catch {
      // Błąd serwera pokazujemy z `mutation.error` poniżej.
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-10">
      <Fog />
      <div className="mb-8 text-center">
        <Sigil className="mx-auto mb-5 size-36 animate-pulse-slow" />
        <h1 className="font-display text-4xl font-bold tracking-[0.08em] text-bone-50">
          {t('app.title')}
        </h1>
        <p className="mt-2 text-sm text-bone-400 italic">{t('app.tagline')}</p>
      </div>

      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="panel space-y-4 p-5"
      >
        <h2 className="text-center font-display text-2xl font-semibold text-brass-300">
          {text.heading}
        </h2>
        <TextField
          label={mode === 'login' ? t('auth.loginId') : t('auth.email')}
          name="email"
          type={mode === 'login' ? 'text' : 'email'}
          autoComplete={mode === 'login' ? 'username' : 'email'}
          autoCapitalize="off"
          inputMode={mode === 'login' ? 'text' : 'email'}
          error={fieldErrors.email}
        />
        {mode === 'register' ? (
          <TextField
            label={t('auth.characterName')}
            name="characterName"
            autoComplete="username"
            autoCapitalize="off"
            error={fieldErrors.characterName}
          />
        ) : null}
        <TextField
          label={t('auth.password')}
          name="password"
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          error={fieldErrors.password}
        />
        {mutation.error ? (
          <p
            role="alert"
            className="rounded-lg border border-ichor-600/60 bg-ichor-600/15 px-3 py-2 text-sm text-ichor-400"
          >
            {errorMessage(mutation.error)}
          </p>
        ) : null}
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending ? text.pending : text.submit}
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-bone-400">
        {text.switchText}{' '}
        <Link
          to={text.switchTo}
          className="font-semibold text-brass-300 underline-offset-4 hover:underline"
        >
          {text.switchLink}
        </Link>
      </p>
    </div>
  );
}
