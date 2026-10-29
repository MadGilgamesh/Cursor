import {
  EVENT_ACTIVITY_KINDS,
  EVENT_ACTIVITY_LABELS,
  eventPhaseLabel,
  eventSchema,
  previewEvent,
  type EventActivityKind,
  type EventBattle,
  type EventLore,
  type EventMission,
  type EventTask,
  type GameEvent,
  type Reward,
} from '@game/content';

import type { ReactNode } from 'react';

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
            <div
              key={index}
              className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_auto]"
            >
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
        <EventPieces value={value} set={set} />
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
            <PreviewList title="Misje" items={preview.missions.map((mission) => mission.name)} />
            <PreviewList title="Walki" items={preview.battles.map((battle) => battle.name)} />
            <PreviewList title="Historie" items={preview.lore.map((story) => story.title)} />
            <PreviewList
              title="Zadania"
              items={preview.tasks.map(
                (task) =>
                  `${task.name}: ${EVENT_ACTIVITY_LABELS[task.activity]} × ${task.count} → ${task.rewards.map(rewardLabel).join(', ')}`,
              )}
            />
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

function PreviewList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs tracking-[0.16em] text-bone-400 uppercase">{title}</p>
      <ul className="mt-1 list-disc pl-5">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function nextPieceId(prefix: string, existing: readonly { id: string }[]): string {
  const ids = new Set(existing.map((item) => item.id));
  let n = existing.length + 1;
  while (ids.has(`${prefix}.${n}`)) n += 1;
  return `${prefix}.${n}`;
}

function EventPieces({
  value,
  set,
}: {
  value: GameEvent;
  set: (patch: Partial<GameEvent>) => void;
}) {
  return (
    <>
      <PieceList
        title="Misje"
        addLabel="Dodaj misję"
        count={value.missions.length}
        empty="Brak misji tego eventu."
        onAdd={() => {
          const mission: EventMission = {
            id: nextPieceId('event.misja', value.missions),
            name: 'Nowa misja',
            description: 'Co gracz ma zrobić w czasie święta.',
            successTexts: ['Udało się.'],
            failureTexts: ['Wracasz pokaleczony.'],
            rewards: [],
          };
          set({ missions: [...value.missions, mission] });
        }}
      >
        {value.missions.map((mission, index) => (
          <article key={mission.id} className="space-y-2 rounded-xl border border-brass-500/20 p-3">
            <Field label="Nazwa misji">
              <input
                className={controlClass}
                aria-label={`Nazwa misji ${index + 1}`}
                value={mission.name}
                onChange={(event) => {
                  replaceAt(
                    value.missions,
                    index,
                    { ...mission, name: event.target.value },
                    (missions) => {
                      set({ missions });
                    },
                  );
                }}
              />
            </Field>
            <Field label="Opis misji">
              <textarea
                className={`${controlClass} min-h-20 py-3`}
                value={mission.description}
                onChange={(event) => {
                  replaceAt(
                    value.missions,
                    index,
                    { ...mission, description: event.target.value },
                    (missions) => {
                      set({ missions });
                    },
                  );
                }}
              />
            </Field>
            <Remove
              label="Usuń misję"
              onClick={() => {
                set({ missions: value.missions.filter((_, item) => item !== index) });
              }}
            />
          </article>
        ))}
      </PieceList>
      <PieceList
        title="Walki"
        addLabel="Dodaj walkę"
        count={value.battles.length}
        empty="Brak walk tego eventu."
        onAdd={() => {
          const battle: EventBattle = {
            id: nextPieceId('event.walka', value.battles),
            name: 'Nowa walka',
            description: 'Kto staje naprzeciw.',
            foe: 'Topielec',
            rewards: [],
          };
          set({ battles: [...value.battles, battle] });
        }}
      >
        {value.battles.map((battle, index) => (
          <article key={battle.id} className="space-y-2 rounded-xl border border-brass-500/20 p-3">
            <Field label="Nazwa walki">
              <input
                className={controlClass}
                aria-label={`Nazwa walki ${index + 1}`}
                value={battle.name}
                onChange={(event) => {
                  replaceAt(
                    value.battles,
                    index,
                    { ...battle, name: event.target.value },
                    (battles) => {
                      set({ battles });
                    },
                  );
                }}
              />
            </Field>
            <Field label="Przeciwnik">
              <input
                className={controlClass}
                aria-label={`Przeciwnik ${index + 1}`}
                value={battle.foe}
                onChange={(event) => {
                  replaceAt(
                    value.battles,
                    index,
                    { ...battle, foe: event.target.value },
                    (battles) => {
                      set({ battles });
                    },
                  );
                }}
              />
            </Field>
            <Remove
              label="Usuń walkę"
              onClick={() => {
                set({ battles: value.battles.filter((_, item) => item !== index) });
              }}
            />
          </article>
        ))}
      </PieceList>
      <PieceList
        title="Historie"
        addLabel="Dodaj historię"
        count={value.lore.length}
        empty="Brak historii lore."
        onAdd={() => {
          const story: EventLore = {
            id: nextPieceId('event.lore', value.lore),
            title: 'Nowa historia',
            body: 'Co miasto pamięta o tym święcie.',
          };
          set({ lore: [...value.lore, story] });
        }}
      >
        {value.lore.map((story, index) => (
          <article key={story.id} className="space-y-2 rounded-xl border border-brass-500/20 p-3">
            <Field label="Tytuł historii">
              <input
                className={controlClass}
                aria-label={`Tytuł historii ${index + 1}`}
                value={story.title}
                onChange={(event) => {
                  replaceAt(value.lore, index, { ...story, title: event.target.value }, (lore) => {
                    set({ lore });
                  });
                }}
              />
            </Field>
            <Field label="Treść historii">
              <textarea
                className={`${controlClass} min-h-24 py-3`}
                value={story.body}
                onChange={(event) => {
                  replaceAt(value.lore, index, { ...story, body: event.target.value }, (lore) => {
                    set({ lore });
                  });
                }}
              />
            </Field>
            <Remove
              label="Usuń historię"
              onClick={() => {
                set({ lore: value.lore.filter((_, item) => item !== index) });
              }}
            />
          </article>
        ))}
      </PieceList>
      <PieceList
        title="Zadania"
        addLabel="Dodaj zadanie"
        count={value.tasks.length}
        empty="Brak zadań z nagrodą."
        onAdd={() => {
          const task: EventTask = {
            id: nextPieceId('event.zadanie', value.tasks),
            name: 'Nowe zadanie',
            description: 'Czynność, za którą event płaci.',
            activity: 'huntWin',
            count: 1,
            rewards: [{ kind: 'currency', currency: 'silver', amount: 5 }],
          };
          set({ tasks: [...value.tasks, task] });
        }}
      >
        {value.tasks.map((task, index) => (
          <TaskCard
            key={task.id}
            task={task}
            index={index}
            event={value}
            onChange={(next) => {
              replaceAt(value.tasks, index, next, (tasks) => {
                set({ tasks });
              });
            }}
            onRemove={() => {
              set({ tasks: value.tasks.filter((_, item) => item !== index) });
            }}
          />
        ))}
      </PieceList>
    </>
  );
}

function TaskCard({
  task,
  index,
  event,
  onChange,
  onRemove,
}: {
  task: EventTask;
  index: number;
  event: GameEvent;
  onChange: (task: EventTask) => void;
  onRemove: () => void;
}) {
  const subjects =
    task.activity === 'eventMission'
      ? event.missions.map((mission) => ({ id: mission.id, label: mission.name }))
      : task.activity === 'eventBattle'
        ? event.battles.map((battle) => ({ id: battle.id, label: battle.name }))
        : task.activity === 'eventLore'
          ? event.lore.map((story) => ({ id: story.id, label: story.title }))
          : [];
  const needsSubject = subjects.length > 0 || task.activity.startsWith('event');
  return (
    <article className="space-y-2 rounded-xl border border-brass-500/20 p-3">
      <Field label="Nazwa zadania">
        <input
          className={controlClass}
          aria-label={`Nazwa zadania ${index + 1}`}
          value={task.name}
          onChange={(input) => {
            onChange({ ...task, name: input.target.value });
          }}
        />
      </Field>
      <Field label="Czynność">
        <select
          className={controlClass}
          aria-label={`Czynność zadania ${index + 1}`}
          value={task.activity}
          onChange={(input) => {
            const activity = input.target.value as EventActivityKind;
            if (!activity.startsWith('event')) {
              onChange({
                id: task.id,
                name: task.name,
                description: task.description,
                activity,
                count: task.count,
                rewards: task.rewards,
              });
              return;
            }
            onChange({ ...task, activity });
          }}
        >
          {EVENT_ACTIVITY_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {EVENT_ACTIVITY_LABELS[kind]}
            </option>
          ))}
        </select>
      </Field>
      {needsSubject ? (
        <Field label="Element eventu" hint="Misja, walka albo historia, której dotyczy zadanie.">
          <select
            className={controlClass}
            aria-label={`Element zadania ${index + 1}`}
            value={task.subjectId ?? ''}
            onChange={(input) => {
              onChange({ ...task, subjectId: input.target.value });
            }}
          >
            <option value="">Wybierz</option>
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Ile razy">
        <input
          className={controlClass}
          type="number"
          min={1}
          aria-label={`Liczba powtórzeń zadania ${index + 1}`}
          value={task.count}
          onChange={(input) => {
            onChange({ ...task, count: Number(input.target.value) });
          }}
        />
      </Field>
      <Field label="Nagroda za zadanie">
        <input
          className={controlClass}
          type="number"
          min={1}
          aria-label={`Srebro za zadanie ${index + 1}`}
          value={task.rewards[0]?.kind === 'currency' ? task.rewards[0].amount : 1}
          onChange={(input) => {
            onChange({
              ...task,
              rewards: [
                { kind: 'currency', currency: 'silver', amount: Number(input.target.value) },
              ],
            });
          }}
        />
      </Field>
      <Remove label="Usuń zadanie" onClick={onRemove} />
    </article>
  );
}

function PieceList({
  title,
  addLabel,
  count,
  empty,
  onAdd,
  children,
}: {
  title: string;
  addLabel: string;
  count: number;
  empty: string;
  onAdd: () => void;
  children: ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-xs tracking-[0.16em] text-bone-400 uppercase">{title}</legend>
      {children}
      {count === 0 ? <p className="text-xs text-bone-600">{empty}</p> : null}
      <Button variant="ghost" className="w-full sm:w-auto" onClick={onAdd}>
        {addLabel}
      </Button>
    </fieldset>
  );
}

function Remove({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" className="w-full sm:w-auto" onClick={onClick}>
      {label}
    </Button>
  );
}

function replaceAt<T>(list: readonly T[], index: number, next: T, commit: (list: T[]) => void) {
  const copy = list.slice();
  copy[index] = next;
  commit(copy);
}
