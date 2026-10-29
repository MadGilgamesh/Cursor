import type { CollectionName } from '@game/content';
import { useState } from 'react';

import { Button, controlClass, Field, Notice } from './ui.js';

type Draft = Record<string, unknown>;

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : 0;
}

function lines(value: unknown): string {
  return Array.isArray(value) ? value.filter((line) => typeof line === 'string').join('\n') : '';
}

function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function RecordForm({
  collection,
  initial,
  idLocked,
  onSubmit,
  pending = false,
  message,
}: {
  collection: CollectionName;
  initial: Draft;
  idLocked: boolean;
  onSubmit: (record: Draft) => void;
  pending?: boolean;
  message?: string | undefined;
}) {
  const [draft, setDraft] = useState<Draft>(initial);
  const set = (patch: Draft) => {
    setDraft({ ...draft, ...patch });
  };
  const bonus =
    draft.baseBonusBp && typeof draft.baseBonusBp === 'object' ? (draft.baseBonusBp as Draft) : {};

  return (
    <form
      className="panel max-w-3xl space-y-4 p-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(normalize(collection, draft));
      }}
    >
      <Field label="Identyfikator">
        <input
          className={controlClass}
          value={text(draft.id)}
          readOnly={idLocked}
          onChange={(event) => {
            set({ id: event.target.value });
          }}
        />
      </Field>
      {collection !== 'texts' ? (
        <Field label="Nazwa">
          <input
            className={controlClass}
            value={text(draft.name)}
            onChange={(event) => {
              set({ name: event.target.value });
            }}
          />
        </Field>
      ) : (
        <Field label="Tytuł">
          <input
            className={controlClass}
            value={text(draft.title)}
            onChange={(event) => {
              set({ title: event.target.value });
            }}
          />
        </Field>
      )}
      {showDescription(collection, draft) ? (
        <Field label="Opis">
          <textarea
            className={`${controlClass} min-h-28 py-3`}
            value={text(draft.description)}
            onChange={(event) => {
              set({ description: event.target.value });
            }}
          />
        </Field>
      ) : null}
      {collection === 'bestiary' ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Krąg">
            <input
              className={controlClass}
              type="number"
              min={0}
              max={9}
              value={num(draft.circle)}
              onChange={(event) => {
                set({ circle: Number(event.target.value) });
              }}
            />
          </Field>
          <Field label="Groza">
            <input
              className={controlClass}
              type="number"
              min={0}
              max={10}
              value={num(draft.dread)}
              onChange={(event) => {
                set({ dread: Number(event.target.value) });
              }}
            />
          </Field>
          <label className="flex items-end gap-3 pb-3 text-sm">
            <input
              type="checkbox"
              checked={draft.named === true}
              onChange={(event) => {
                set({ named: event.target.checked });
              }}
            />
            Nazwany
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.gaze === true}
              onChange={(event) => {
                set({ gaze: event.target.checked });
              }}
            />
            Spojrzenie
          </label>
        </div>
      ) : null}
      {collection === 'missions' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rodzaj">
              <select
                className={controlClass}
                value={text(draft.kind)}
                onChange={(event) => {
                  set({ kind: event.target.value });
                }}
              >
                <option value="order">Zakon</option>
                <option value="gather">Zbierackie</option>
                <option value="city">Miejskie</option>
              </select>
            </Field>
            <Field label="Czas">
              <select
                className={controlClass}
                value={text(draft.tierId)}
                onChange={(event) => {
                  set({ tierId: event.target.value });
                }}
              >
                <option value="m5">5 minut</option>
                <option value="m15">15 minut</option>
                <option value="h1">1 godzina</option>
                <option value="h4">4 godziny</option>
                <option value="h8">8 godzin</option>
              </select>
            </Field>
          </div>
          <Field label="Teksty sukcesu" hint="Jeden wiersz, jeden opis.">
            <textarea
              className={`${controlClass} min-h-24 py-3`}
              value={lines(draft.successTexts)}
              onChange={(event) => {
                set({ successTexts: splitLines(event.target.value) });
              }}
            />
          </Field>
          <Field label="Teksty porażki" hint="Jeden wiersz, jeden opis.">
            <textarea
              className={`${controlClass} min-h-24 py-3`}
              value={lines(draft.failureTexts)}
              onChange={(event) => {
                set({ failureTexts: splitLines(event.target.value) });
              }}
            />
          </Field>
        </>
      ) : null}
      {collection === 'locations' ? (
        <Field label="Dzielnica">
          <input
            className={controlClass}
            value={text(draft.district)}
            onChange={(event) => {
              set({ district: event.target.value });
            }}
          />
        </Field>
      ) : null}
      {collection === 'texts' ? (
        <Field label="Treść">
          <textarea
            className={`${controlClass} min-h-36 py-3`}
            value={text(draft.body)}
            onChange={(event) => {
              set({ body: event.target.value });
            }}
          />
        </Field>
      ) : null}
      {collection === 'items' ? <ItemFields draft={draft} set={set} bonus={bonus} /> : null}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={pending}>
          {pending ? 'Zapisuję…' : 'Zapisz w szkicu'}
        </Button>
        {message ? (
          <Notice tone={message.startsWith('Zapisano') ? 'ok' : 'bad'}>{message}</Notice>
        ) : null}
      </div>
    </form>
  );
}

function showDescription(collection: CollectionName, draft: Draft): boolean {
  if (collection === 'items') return draft.kind !== 'gear';
  return collection !== 'texts';
}

function ItemFields({
  draft,
  set,
  bonus,
}: {
  draft: Draft;
  set: (patch: Draft) => void;
  bonus: Draft;
}) {
  return (
    <>
      <Field label="Rodzaj">
        <select
          className={controlClass}
          value={text(draft.kind)}
          onChange={(event) => {
            const kind = event.target.value;
            if (kind === 'gear') {
              set({
                kind: 'gear',
                slot: 'weapon',
                tier: 1,
                classId: null,
                baseBonusBp: {},
                baseLife: 0,
              });
            } else if (kind === 'consumable') {
              set({ kind: 'consumable', effect: 'heal', value: 1, sold: true });
            } else {
              set({ kind: 'junk', value: 1, circle: 9 });
            }
          }}
        >
          <option value="gear">Ekwipunek</option>
          <option value="consumable">Konsumpcja</option>
          <option value="junk">Łup</option>
        </select>
      </Field>
      {draft.kind === 'gear' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slot">
            <select
              className={controlClass}
              value={text(draft.slot)}
              onChange={(event) => {
                set({ slot: event.target.value });
              }}
            >
              {['weapon', 'head', 'torso', 'legs', 'hands', 'feet', 'accessory', 'talisman'].map(
                (slot) => (
                  <option key={slot} value={slot}>
                    {slot}
                  </option>
                ),
              )}
            </select>
          </Field>
          <Field label="Stopień">
            <input
              className={controlClass}
              type="number"
              min={1}
              value={num(draft.tier)}
              onChange={(event) => {
                set({ tier: Number(event.target.value) });
              }}
            />
          </Field>
          <Field label="Klasa" hint="Puste — przedmiot bez klasy.">
            <select
              className={controlClass}
              value={
                draft.classId === null || draft.classId === undefined ? '' : text(draft.classId)
              }
              onChange={(event) => {
                set({ classId: event.target.value === '' ? null : event.target.value });
              }}
            >
              <option value="">Bez klasy</option>
              <option value="butcher">Rzeźnik</option>
              <option value="occultist">Okultysta</option>
              <option value="marksman">Strzelec</option>
            </select>
          </Field>
          <Field label="Życie">
            <input
              className={controlClass}
              type="number"
              min={0}
              value={num(draft.baseLife)}
              onChange={(event) => {
                set({ baseLife: Number(event.target.value) });
              }}
            />
          </Field>
          {(['strength', 'defense', 'accuracy', 'evasion'] as const).map((stat) => (
            <Field key={stat} label={`Premia: ${stat}`}>
              <input
                className={controlClass}
                type="number"
                min={0}
                value={num(bonus[stat])}
                onChange={(event) => {
                  const next = { ...bonus, [stat]: Number(event.target.value) };
                  set({ baseBonusBp: next });
                }}
              />
            </Field>
          ))}
        </div>
      ) : null}
      {draft.kind === 'consumable' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Efekt">
            <select
              className={controlClass}
              value={text(draft.effect)}
              onChange={(event) => {
                set({ effect: event.target.value });
              }}
            >
              <option value="heal">Leczenie</option>
              <option value="laudanum">Laudanum</option>
              <option value="coffee">Kawa</option>
            </select>
          </Field>
          <Field label="Wartość">
            <input
              className={controlClass}
              type="number"
              min={0}
              value={num(draft.value)}
              onChange={(event) => {
                set({ value: Number(event.target.value) });
              }}
            />
          </Field>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={draft.sold === true}
              onChange={(event) => {
                set({ sold: event.target.checked });
              }}
            />
            W ofercie sklepu
          </label>
        </div>
      ) : null}
      {draft.kind === 'junk' ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Wartość">
            <input
              className={controlClass}
              type="number"
              min={0}
              value={num(draft.value)}
              onChange={(event) => {
                set({ value: Number(event.target.value) });
              }}
            />
          </Field>
          <Field label="Krąg">
            <input
              className={controlClass}
              type="number"
              min={0}
              max={9}
              value={num(draft.circle)}
              onChange={(event) => {
                set({ circle: Number(event.target.value) });
              }}
            />
          </Field>
        </div>
      ) : null}
    </>
  );
}

function normalize(collection: CollectionName, draft: Draft): Draft {
  if (collection !== 'items' || draft.kind !== 'gear') return draft;
  const bonus = draft.baseBonusBp;
  if (!bonus || typeof bonus !== 'object') return { ...draft, baseBonusBp: {} };
  const cleaned: Draft = {};
  for (const [key, value] of Object.entries(bonus)) {
    if (typeof value === 'number' && value > 0) cleaned[key] = value;
  }
  return { ...draft, baseBonusBp: cleaned };
}
