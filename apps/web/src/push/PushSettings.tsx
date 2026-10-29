import { errorMessage, t, type MessageKey } from '../i18n';
import { Button } from '../ui/Button';
import { usePushState, useTogglePush } from './client';

const STATE_MESSAGES: Partial<Record<string, MessageKey>> = {
  unsupported: 'push.unsupported',
  'server-disabled': 'push.serverDisabled',
  denied: 'push.denied',
  on: 'push.enabled',
};

export function PushSettings() {
  const push = usePushState();
  const toggle = useTogglePush();
  const state = push.data?.state;
  const message = state ? STATE_MESSAGES[state] : undefined;
  const publicKey = push.data?.publicKey;

  return (
    <section aria-labelledby="push-title" className="panel space-y-2 p-4">
      <h2 id="push-title" className="text-xs tracking-widest text-bone-400 uppercase">
        {t('push.title')}
      </h2>
      <p className="text-sm text-bone-200">{t('push.description')}</p>
      {message ? (
        <p data-testid="push-status" className="text-sm text-bone-400 italic">
          {t(message)}
        </p>
      ) : null}
      {publicKey && (state === 'off' || state === 'on') ? (
        <Button
          variant={state === 'on' ? 'ghost' : 'primary'}
          disabled={toggle.isPending}
          onClick={() => {
            toggle.mutate({ enable: state === 'off', publicKey });
          }}
        >
          {state === 'on' ? t('push.disable') : t('push.enable')}
        </Button>
      ) : null}
      {toggle.error ? (
        <p role="alert" className="text-sm text-ichor-400">
          {errorMessage(toggle.error)}
        </p>
      ) : null}
    </section>
  );
}
