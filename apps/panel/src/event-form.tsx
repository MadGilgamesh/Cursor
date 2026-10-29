import {
  eventPhaseLabel,
  eventSchema,
  previewEvent,
  type GameEvent,
  type Reward,
} from '@game/content';

import { Button, controlClass, Field } from './ui.js';

function isoToUtcInput(iso: string): string {
  return iso.slice(0, 16);
}

function utcInputToIso(value: string): string {
  if (!value) return '';
  return new Date(`${value}:00.000Z`).toISOString();
}

function rewardLabel(reward: Reward): string {
  if (reward.kind === 'currency') {
    const name = reward.currency === 'silver' ? 'srebra' : 'w Kasie';
    return `${reward.amount} ${name}`;
  }
  return `${reward.quantity} × ${reward.itemId}`;
}

export function EventForm({
  value,
  onChange,
  onSubmit,
  pending = false,
  message,
}: {
  value: GameEvent;
  onChange: (event: GameEvent) => void;
  onSubmit: () => void;
  pending?: boolean;
  message?: string | undefined;
}) {
  const parsed = eventSchema.safeParse(value);
  const preview = parsed.success ? previewEvent(parsed.data, new Date()) : null;
  const set = (patch: Partial<GameEvent>) => {
    onChange({ ...value, ...patch });
  };

  return (
    <div
      className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]"
      data-testid="event-editor"
    >
      <form
        className="panel space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Field label="Identyfikator">
          <input
            className={controlClass}
            value={value.id}
            onChange={(event) => {
              set({ id: event.target.value });
            }}
          />
        </Field>
        <Field label="Nazwa">
          <input
            className={controlClass}
            value={value.name}
            onChange={(event) => {
              set({ name: event.target.value });
            }}
          />
        </Field>
        <Field label="Opis">
          <textarea
            className={`${controlClass} min-h-28 py-3`}
            value={value.description}
            onChange={(event) => {
              set({ description: event.target.value });
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Początek" hint="Strefa UTC">
            <input
              type="datetime-local"
              className={controlClass}
              value={isoToUtcInput(value.startsAt)}
              onChange={(event) => {
                set({ startsAt: utcInputToIso(event.target.value) });
              }}
            />
          </Field>
          <Field label="Koniec" hint="Strefa UTC">
            <input
              type="datetime-local"
              className={controlClass}
              value={isoToUtcInput(value.endsAt)}
              onChange={(event) => {
                set({ endsAt: utcInputToIso(event.target.value) });
              }}
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={value.enabled}
            onChange={(event) => {
              set({ enabled: event.target.checked });
            }}
          />
          Event włączony
        </label>
        <fieldset className="space-y-3">
          <legend className="text-xs tracking-[0.16em] text-bone-400 uppercase">Nagrody</legend>
          {value.rewards.map((reward, index) => (
            <div key={index} className="grid grid-cols-[8rem_1fr_auto] gap-2">
              {reward.kind === 'currency' ? (
                <>
                  <select
                    className={controlClass}
                    value={reward.currency}
                    aria-label="Waluta nagrody"
                    onChange={(event) => {
                      const currency = event.target.value === 'bank' ? 'bank' : 'silver';
                      const rewards = value.rewards.slice();
                      rewards[index] = { ...reward, currency };
                      set({ rewards });
                    }}
                  >
                    <option value="silver">Srebro</option>
                    <option value="bank">Kasa</option>
                  </select>
                  <input
                    className={controlClass}
                    type="number"
                    min={1}
                    aria-label="Kwota nagrody"
                    value={reward.amount}
                    onChange={(event) => {
                      const rewards = value.rewards.slice();
                      rewards[index] = { ...reward, amount: Number(event.target.value) };
                      set({ rewards });
                    }}
                  />
                </>
              ) : (
                <span className="col-span-2 text-sm">{rewardLabel(reward)}</span>
              )}
              <Button
                variant="ghost"
                onClick={() => {
                  set({ rewards: value.rewards.filter((_, item) => item !== index) });
                }}
              >
                Usuń
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              set({
                rewards: [...value.rewards, { kind: 'currency', currency: 'silver', amount: 1 }],
              });
            }}
          >
            Dodaj nagrodę
          </Button>
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="text-xs tracking-[0.16em] text-bone-400 uppercase">
            Modyfikatory
          </legend>
          {value.modifiers.map((modifier, index) => (
            <div key={modifier.id} className="grid gap-2 sm:grid-cols-4">
              <input
                className={controlClass}
                aria-label="Cel modyfikatora"
                value={modifier.target}
                onChange={(event) => {
                  const modifiers = value.modifiers.slice();
                  modifiers[index] = { ...modifier, target: event.target.value };
                  set({ modifiers });
                }}
              />
              <select
                className={controlClass}
                aria-label="Działanie modyfikatora"
                value={modifier.operation}
                onChange={(event) => {
                  const operation = event.target.value === 'multiply' ? 'multiply' : 'add';
                  const modifiers = value.modifiers.slice();
                  modifiers[index] = { ...modifier, operation };
                  set({ modifiers });
                }}
              >
                <option value="add">Dodaj</option>
                <option value="multiply">Pomnóż</option>
              </select>
              <input
                className={controlClass}
                type="number"
                aria-label="Wartość modyfikatora"
                value={modifier.value}
                onChange={(event) => {
                  const modifiers = value.modifiers.slice();
                  modifiers[index] = { ...modifier, value: Number(event.target.value) };
                  set({ modifiers });
                }}
              />
              <Button
                variant="ghost"
                onClick={() => {
                  set({ modifiers: value.modifiers.filter((_, item) => item !== index) });
                }}
              >
                Usuń
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            onClick={() => {
              const id = `mod.${value.modifiers.length + 1}`;
              set({
                modifiers: [
                  ...value.modifiers,
                  { id, target: 'Groza', operation: 'add', value: 1 },
                ],
              });
            }}
          >
            Dodaj modyfikator
          </Button>
        </fieldset>
        <div className="flex flex-wrap items-center gap-4">
          <Button type="submit" disabled={pending || !parsed.success}>
            {pending ? 'Zapisuję…' : 'Zapisz w szkicu'}
          </Button>
          {message ? <p className="text-sm text-verdigris-300">{message}</p> : null}
          {!parsed.success ? (
            <p className="text-sm text-ichor-400">{parsed.error.issues[0]?.message}</p>
          ) : null}
        </div>
        <p className="text-xs text-bone-600">
          Zapis trafia do szkicu. Publikacja jest osobnym krokiem i nie zmienia akcji, które już
          trwają.
        </p>
      </form>
      <aside className="panel space-y-3 p-6" data-testid="event-preview">
        <h2 className="font-display text-2xl text-brass-300">Podgląd przed publikacją</h2>
        {preview ? (
          <>
            <p className="text-lg text-bone-50">{eventPhaseLabel(preview.phase)}</p>
            <p className="text-sm text-bone-400">Strefa: {preview.timezone}</p>
            <p className="text-sm">
              {preview.startsAt} — {preview.endsAt}
            </p>
            <p>{preview.description}</p>
            <div>
              <p className="text-xs tracking-[0.16em] text-bone-400 uppercase">Nagrody</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.rewards.map((reward, index) => (
                  <li key={index}>{rewardLabel(reward)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs tracking-[0.16em] text-bone-400 uppercase">Modyfikatory</p>
              <ul className="mt-1 list-disc pl-5">
                {preview.modifiers.map((modifier) => (
                  <li key={modifier.id}>
                    {modifier.target} {modifier.operation === 'add' ? '+' : '×'}
                    {modifier.value}
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : (
          <p className="text-bone-400">
            Uzupełnij pola, żeby zobaczyć podgląd. Nic jeszcze nie jest publikowane.
          </p>
        )}
      </aside>
    </div>
  );
}
