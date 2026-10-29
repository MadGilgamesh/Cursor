import type { CollectionName, ContentPack, GameEvent } from '@game/content';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router';

import { can } from '../server/permissions.js';
import { api, parseContentResponse } from './api.js';
import { bySlug, recordLabel, SLUGS } from './collections.js';
import { ContentTable, type ContentRow } from './content-table.js';
import { EventForm } from './event-form.js';
import { RecordForm } from './record-form.js';
import { useSession } from './session.js';
import { Button, controlClass, Field, Notice } from './ui.js';

export function LoginPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | undefined>();
  const login = useMutation({
    mutationFn: () =>
      api('/api/panel/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      void navigate('/');
    },
    onError: (reason: Error) => {
      setError(reason.message);
    },
  });
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6">
      <p className="text-xs tracking-[0.28em] text-brass-500 uppercase">Zapomniany Brzeg</p>
      <h1 className="mt-2 font-display text-5xl text-bone-50">Kancelaria</h1>
      <p className="mt-2 text-bone-400">
        Wejście tylko dla personelu: administratora, moderatora i projektanta treści.
      </p>
      <form
        className="panel mt-8 space-y-4 p-6"
        onSubmit={(event) => {
          event.preventDefault();
          setError(undefined);
          login.mutate();
        }}
      >
        <Field label="E-mail">
          <input
            className={controlClass}
            type="email"
            value={email}
            autoComplete="username"
            onChange={(event) => {
              setEmail(event.target.value);
            }}
          />
        </Field>
        <Field label="Hasło">
          <input
            className={controlClass}
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(event) => {
              setPassword(event.target.value);
            }}
          />
        </Field>
        {error ? <Notice tone="bad">{error}</Notice> : null}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending ? 'Sprawdzam pieczęć…' : 'Wejdź'}
        </Button>
      </form>
    </main>
  );
}

function useContent() {
  return useQuery({
    queryKey: ['content'],
    queryFn: async () => parseContentResponse(await api<unknown>('/api/panel/content')),
  });
}

function detailOf(
  collection: CollectionName,
  record: ContentPack['collections'][CollectionName][number],
): string {
  if (collection === 'bestiary' && 'circle' in record) return `Krąg ${record.circle}`;
  if (collection === 'items' && 'kind' in record) return record.kind;
  if (collection === 'missions' && 'tierId' in record) return record.tierId;
  if (collection === 'locations' && 'district' in record) return record.district;
  if (collection === 'texts') return 'tekst';
  if (collection === 'events' && 'enabled' in record)
    return record.enabled ? 'włączony' : 'wyłączony';
  return '';
}

export function ContentPage() {
  const content = useContent();
  const [slug, setSlug] = useState<(typeof SLUGS)[number]['slug']>('bestiariusz');
  const [query, setQuery] = useState('');
  const section = SLUGS.find((item) => item.slug === slug) ?? SLUGS[0];
  const rows = useMemo(() => {
    if (!content.data) return [];
    const needle = query.trim().toLocaleLowerCase('pl');
    return content.data.draft.collections[section.collection]
      .map((record) => ({
        id: record.id,
        ...('name' in record ? { name: record.name } : {}),
        ...('title' in record ? { title: record.title } : {}),
        detail: detailOf(section.collection, record),
      }))
      .filter((row: ContentRow) => {
        if (!needle) return true;
        return `${recordLabel(row)} ${row.id}`.toLocaleLowerCase('pl').includes(needle);
      });
  }, [content.data, query, section]);
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-bone-50">Treść</h1>
          <p className="text-bone-400">
            Szkic na rewizji {content.data?.currentRevision ?? '—'}. Nowy wpis nie wymaga zmiany
            kodu.
          </p>
        </div>
        <Link to={`/tresc/${section.slug}/nowy`}>
          <Button>Dodaj</Button>
        </Link>
      </header>
      <div className="flex flex-wrap gap-2">
        {SLUGS.map((item) => (
          <button
            key={item.slug}
            type="button"
            className={`rounded-full border px-3 py-1 text-sm ${item.slug === section.slug ? 'border-brass-300 text-brass-300' : 'border-abyss-600 text-bone-400'}`}
            onClick={() => {
              setSlug(item.slug);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      <input
        className={`${controlClass} max-w-md`}
        placeholder="Szukaj po nazwie lub identyfikatorze"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      {content.isLoading ? <p>Otwieram księgi…</p> : null}
      {content.error ? <Notice tone="bad">{content.error.message}</Notice> : null}
      {content.data ? (
        <ContentTable
          rows={rows}
          hrefFor={(id) => `/tresc/${section.slug}/${encodeURIComponent(id)}`}
        />
      ) : null}
    </section>
  );
}

const blankEvent = (): GameEvent => ({
  id: 'event.nowy',
  name: '',
  description: '',
  startsAt: '2027-11-01T18:00:00.000Z',
  endsAt: '2027-11-03T06:00:00.000Z',
  timezone: 'UTC',
  enabled: true,
  rewards: [{ kind: 'currency', currency: 'silver', amount: 10 }],
  modifiers: [],
  missions: [],
  battles: [],
  lore: [],
  tasks: [],
});

export function EventsPage() {
  const content = useContent();
  const rows: ContentRow[] =
    content.data?.draft.collections.events.map((event) => ({
      id: event.id,
      name: event.name,
      detail: event.enabled ? 'włączony' : 'wyłączony',
    })) ?? [];
  return (
    <section className="space-y-5">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-4xl text-bone-50">Eventy</h1>
          <p className="text-bone-400">
            Misje, walki, historie i zadania z nagrodą. Najpierw podgląd, potem publikacja.
          </p>
        </div>
        <Link to="/eventy/nowy">
          <Button>Nowy event</Button>
        </Link>
      </header>
      <ContentTable rows={rows} hrefFor={(id) => `/eventy/${encodeURIComponent(id)}`} />
    </section>
  );
}

export function EventPage() {
  const { id } = useParams();
  const content = useContent();
  const queryClient = useQueryClient();
  const existing =
    id && id !== 'nowy'
      ? content.data?.draft.collections.events.find((event) => event.id === decodeURIComponent(id))
      : undefined;
  const [value, setValue] = useState<GameEvent | null>(null);
  const event = value ?? existing ?? blankEvent();
  const [message, setMessage] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: () =>
      api('/api/panel/content/records', {
        method: 'PUT',
        body: JSON.stringify({ collection: 'events', record: event }),
      }),
    onSuccess: async () => {
      setMessage('Zapisano w szkicu. Publikacja nadal czeka.');
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (reason: Error) => {
      setMessage(reason.message);
    },
  });
  return (
    <section className="space-y-5">
      <h1 className="font-display text-4xl text-bone-50">
        {id === 'nowy' ? 'Nowy event' : event.name || 'Event'}
      </h1>
      <EventForm
        value={event}
        onChange={setValue}
        pending={save.isPending}
        message={message}
        onSubmit={() => {
          setMessage(undefined);
          save.mutate();
        }}
      />
    </section>
  );
}

export function PublicationsPage() {
  const content = useContent();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | undefined>();
  const publish = useMutation({
    mutationFn: () => api<{ revision: number }>('/api/panel/content/publish', { method: 'POST' }),
    onSuccess: async (result) => {
      setMessage(
        `Opublikowano rewizję ${result.revision}. Trwające akcje zostały przy swojej wersji.`,
      );
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (reason: Error) => {
      setMessage(reason.message);
    },
  });
  const rollback = useMutation({
    mutationFn: (revision: number) =>
      api('/api/panel/content/rollback', { method: 'POST', body: JSON.stringify({ revision }) }),
    onSuccess: async () => {
      setMessage(
        'Wycofano wskaźnik publikacji. Akcje rozpoczęte na nowszej wersji dalej ją trzymają.',
      );
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (reason: Error) => {
      setMessage(reason.message);
    },
  });
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl text-bone-50">Publikacje</h1>
          <p className="max-w-2xl text-bone-400">
            Nowa rewizja nie zmienia wyniku akcji, która już trwa — akcja trzyma wersję, na której
            wystartowała. Wycofanie przestawia tylko bieżący wskaźnik.
          </p>
        </div>
        <Button
          disabled={publish.isPending}
          onClick={() => {
            publish.mutate();
          }}
        >
          Publikuj szkic
        </Button>
      </header>
      {message ? <Notice>{message}</Notice> : null}
      <div className="panel divide-y divide-brass-500/15">
        {content.data?.publications.map((publication) => (
          <div
            key={publication.revision}
            className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div>
              <p className="text-bone-50">
                Rewizja {publication.revision}
                {publication.current ? ' · bieżąca' : ''}
              </p>
              <p className="text-sm text-bone-400">{publication.label}</p>
            </div>
            {publication.current ? null : (
              <Button
                variant="ghost"
                onClick={() => {
                  rollback.mutate(publication.revision);
                }}
              >
                Wycofaj do tej wersji
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

interface PlayerRow {
  accountId: string;
  email: string;
  name: string;
  level: number;
  banned: boolean;
}

export function PlayersPage() {
  const [query, setQuery] = useState('');
  const players = useQuery({
    queryKey: ['players', query],
    queryFn: () =>
      api<{ players: PlayerRow[] }>(`/api/panel/players?q=${encodeURIComponent(query)}`),
  });
  return (
    <section className="space-y-5">
      <h1 className="font-display text-4xl text-bone-50">Gracze</h1>
      <input
        className={`${controlClass} max-w-md`}
        placeholder="Imię postaci albo e-mail"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
        }}
      />
      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-[0.16em] text-bone-400 uppercase">
            <tr>
              <th className="px-4 py-3 font-normal">Postać</th>
              <th className="px-4 py-3 font-normal">E-mail</th>
              <th className="px-4 py-3 font-normal">Poziom</th>
              <th className="px-4 py-3 font-normal">Konto</th>
            </tr>
          </thead>
          <tbody>
            {players.data?.players.map((player) => (
              <tr key={player.accountId} className="border-t border-brass-500/15">
                <td className="px-4 py-3">
                  <Link className="text-brass-300" to={`/gracze/${player.accountId}`}>
                    {player.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{player.email}</td>
                <td className="px-4 py-3">{player.level}</td>
                <td className="px-4 py-3">{player.banned ? 'Zablokowane' : 'Czynne'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {players.data?.players.length === 0 ? (
          <p className="px-4 py-6 text-bone-400">Żaden gracz nie pasuje do tego filtra.</p>
        ) : null}
      </div>
    </section>
  );
}

const RESOURCE_LABELS: Record<string, string> = {
  life: 'Życie',
  vigor: 'Wigor',
  toil: 'Znój',
  sanity: 'Poczytalność',
};
const CURRENCY_LABELS: Record<string, string> = { silver: 'Srebro', bank: 'Kasa' };

interface PlayerDetail {
  account: { id: string; email: string; banned: boolean; banReason: string | null };
  character: {
    id: string;
    name: string;
    level: number;
    experience: number;
    status: string | null;
    circle: number | null;
    hall: number | null;
  } | null;
  resources: { kind: string; value: number | null; max: number }[];
  wallet: { currency: string; balance: number }[];
}

export function PlayerPage() {
  const { accountId = '' } = useParams();
  const session = useSession();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['player', accountId],
    queryFn: () => api<PlayerDetail>(`/api/panel/players/${accountId}`),
  });
  const [reason, setReason] = useState('Naruszono regulamin Brzegu');
  const [amount, setAmount] = useState(10);
  const [currency, setCurrency] = useState<'silver' | 'bank'>('silver');
  const [message, setMessage] = useState<string | undefined>();
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['player', accountId] });
  };
  const ban = useMutation({
    mutationFn: () =>
      api(`/api/panel/players/${accountId}/ban`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    onSuccess: () => void refresh(),
  });
  const unban = useMutation({
    mutationFn: () => api(`/api/panel/players/${accountId}/unban`, { method: 'POST' }),
    onSuccess: () => void refresh(),
  });
  const ledger = useMutation({
    mutationFn: (delta: number) =>
      api(`/api/panel/players/${accountId}/ledger`, {
        method: 'POST',
        headers: { 'idempotency-key': crypto.randomUUID() },
        body: JSON.stringify({ currency, delta }),
      }),
    onSuccess: async () => {
      setMessage('Wpis trafił do księgi walut i dziennika audytu.');
      await refresh();
    },
    onError: (error: Error) => {
      setMessage(error.message);
    },
  });
  const player = detail.data;
  const mayBan = session.data ? can(session.data.role, 'playersBan') : false;
  const mayLedger = session.data ? can(session.data.role, 'playersLedger') : false;
  if (!player) return <p>{detail.isLoading ? 'Szukam postaci…' : 'Nie ma takiego gracza.'}</p>;
  return (
    <section className="space-y-6">
      <header>
        <h1 className="font-display text-4xl text-bone-50">
          {player.character?.name ?? player.account.email}
        </h1>
        <p className="text-bone-400">
          Poziom {player.character?.level ?? '—'} · {player.character?.status ?? 'brak stanu'} ·{' '}
          {player.account.banned ? 'konto zablokowane' : 'konto czynne'}
        </p>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        <article className="panel p-5">
          <h2 className="font-display text-2xl text-brass-300">Zasoby</h2>
          <p className="text-xs text-bone-600">
            Bieżąca wartość z leniwej regeneracji. Limit bez premii ekwipunku.
          </p>
          <ul className="mt-3 space-y-1">
            {player.resources.map((resource) => (
              <li key={resource.kind}>
                {RESOURCE_LABELS[resource.kind] ?? resource.kind}: {resource.value ?? '—'} /{' '}
                {resource.max}
              </li>
            ))}
          </ul>
        </article>
        <article className="panel space-y-3 p-5">
          <h2 className="font-display text-2xl text-brass-300">Księga walut</h2>
          <ul>
            {player.wallet.map((entry) => (
              <li key={entry.currency}>
                {CURRENCY_LABELS[entry.currency] ?? entry.currency}: {entry.balance}
              </li>
            ))}
          </ul>
          {mayLedger ? (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Waluta">
                <select
                  className={controlClass}
                  value={currency}
                  onChange={(event) => {
                    setCurrency(event.target.value === 'bank' ? 'bank' : 'silver');
                  }}
                >
                  <option value="silver">Srebro</option>
                  <option value="bank">Kasa</option>
                </select>
              </Field>
              <Field label="Kwota">
                <input
                  className={controlClass}
                  type="number"
                  min={1}
                  value={amount}
                  onChange={(event) => {
                    setAmount(Number(event.target.value));
                  }}
                />
              </Field>
              <Button
                onClick={() => {
                  ledger.mutate(Math.abs(amount));
                }}
              >
                Nadaj
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  ledger.mutate(-Math.abs(amount));
                }}
              >
                Odbierz
              </Button>
            </div>
          ) : (
            <p className="text-sm text-bone-400">
              Nadawanie walut przysługuje administratorowi i zawsze idzie przez księgę.
            </p>
          )}
          {message ? <Notice>{message}</Notice> : null}
        </article>
      </div>
      {mayBan ? (
        <article className="panel space-y-3 p-5">
          <h2 className="font-display text-2xl text-brass-300">Blokada konta</h2>
          {player.account.banned ? (
            <>
              <p>Powód: {player.account.banReason}</p>
              <Button
                variant="ghost"
                onClick={() => {
                  unban.mutate();
                }}
              >
                Odblokuj
              </Button>
            </>
          ) : (
            <>
              <Field label="Powód">
                <input
                  className={controlClass}
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                  }}
                />
              </Field>
              <Button
                variant="danger"
                onClick={() => {
                  ban.mutate();
                }}
              >
                Zablokuj konto
              </Button>
            </>
          )}
        </article>
      ) : null}
    </section>
  );
}

export function AuditPage() {
  const audit = useQuery({
    queryKey: ['audit'],
    queryFn: () =>
      api<{
        entries: {
          id: string;
          email: string | null;
          actor: string;
          action: string;
          createdAt: string;
          after: unknown;
        }[];
      }>('/api/panel/audit'),
  });
  return (
    <section className="space-y-5">
      <h1 className="font-display text-4xl text-bone-50">Dziennik audytu</h1>
      <div className="panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="text-xs tracking-[0.16em] text-bone-400 uppercase">
            <tr>
              <th className="px-4 py-3 font-normal">Czas</th>
              <th className="px-4 py-3 font-normal">Akcja</th>
              <th className="px-4 py-3 font-normal">Konto</th>
              <th className="px-4 py-3 font-normal">Po</th>
            </tr>
          </thead>
          <tbody>
            {audit.data?.entries.map((entry) => (
              <tr key={entry.id} className="border-t border-brass-500/15 align-top">
                <td className="px-4 py-3 whitespace-nowrap">
                  {entry.createdAt.slice(0, 16).replace('T', ' ')}
                </td>
                <td className="px-4 py-3">{entry.action}</td>
                <td className="px-4 py-3">{entry.email ?? '—'}</td>
                <td className="px-4 py-3 font-mono text-xs text-bone-400">
                  {JSON.stringify(entry.after)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function AnnouncementsPage() {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['announcements'],
    queryFn: () =>
      api<{ announcements: { id: string; title: string; body: string; enabled: boolean }[] }>(
        '/api/panel/announcements',
      ),
  });
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api('/api/panel/announcements', {
        method: 'POST',
        body: JSON.stringify({ title, body, enabled: false }),
      }),
    onSuccess: async () => {
      setTitle('');
      setBody('');
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
  const toggle = useMutation({
    mutationFn: (item: { id: string; enabled: boolean }) =>
      api(`/api/panel/announcements/${item.id}/enabled`, {
        method: 'POST',
        body: JSON.stringify({ enabled: item.enabled }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['announcements'] });
    },
  });
  return (
    <section className="space-y-5">
      <h1 className="font-display text-4xl text-bone-50">Ogłoszenia</h1>
      <form
        className="panel space-y-3 p-5"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate();
        }}
      >
        <Field label="Tytuł">
          <input
            className={controlClass}
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </Field>
        <Field label="Treść">
          <textarea
            className={`${controlClass} min-h-24 py-3`}
            value={body}
            onChange={(event) => {
              setBody(event.target.value);
            }}
          />
        </Field>
        <Button type="submit">Dodaj wyłączone</Button>
      </form>
      <ul className="space-y-3">
        {list.data?.announcements.map((item) => (
          <li key={item.id} className="panel flex items-center justify-between gap-4 p-4">
            <div>
              <p className="text-bone-50">{item.title}</p>
              <p className="text-sm text-bone-400">{item.body}</p>
            </div>
            <Button
              variant={item.enabled ? 'danger' : 'primary'}
              onClick={() => {
                toggle.mutate({ id: item.id, enabled: !item.enabled });
              }}
            >
              {item.enabled ? 'Wyłącz' : 'Włącz'}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function RecordPage() {
  const { collection: slug = '', id = '' } = useParams();
  const section = bySlug(slug);
  const content = useContent();
  const queryClient = useQueryClient();
  const decoded = decodeURIComponent(id);
  const found = section
    ? content.data?.draft.collections[section.collection].find((record) => record.id === decoded)
    : undefined;
  const [message, setMessage] = useState<string | undefined>();
  const save = useMutation({
    mutationFn: (record: Record<string, unknown>) => {
      if (!section) throw new Error('Nieznany dział');
      return api('/api/panel/content/records', {
        method: 'PUT',
        body: JSON.stringify({ collection: section.collection, record }),
      });
    },
    onSuccess: async () => {
      setMessage('Zapisano w szkicu.');
      await queryClient.invalidateQueries({ queryKey: ['content'] });
    },
    onError: (error: Error) => {
      setMessage(error.message);
    },
  });
  if (!section) return <Navigate to="/tresc" replace />;
  const fresh = id === 'nowy';
  const starter = starterFor(section.collection);
  const initial = (found ?? starter) as Record<string, unknown>;
  return (
    <section className="space-y-4">
      <h1 className="font-display text-4xl text-bone-50">
        {fresh ? `Nowy wpis — ${section.label}` : recordLabel(found ?? { id: decoded })}
      </h1>
      <p className="max-w-2xl text-sm text-bone-400">
        Zapis sprawdza schemat Zod. Nieznane pola są ignorowane, a brak wymaganych — odrzucony. Nowy
        wpis nie wymaga zmiany kodu gry.
      </p>
      <RecordForm
        key={`${section.collection}:${decoded}:${found ? 'jest' : 'brak'}`}
        collection={section.collection}
        initial={initial}
        idLocked={!fresh}
        pending={save.isPending}
        message={message}
        onSubmit={(record) => {
          setMessage(undefined);
          save.mutate(record);
        }}
      />
    </section>
  );
}

function starterFor(collection: CollectionName): Record<string, unknown> {
  switch (collection) {
    case 'texts':
      return { id: 'text.nowy', title: '', body: '' };
    case 'locations':
      return { id: 'location.sol.nowy', name: '', description: '', district: 'Sól' };
    case 'missions':
      return {
        id: 'order.nowy',
        kind: 'order',
        name: '',
        description: '',
        tierId: 'm5',
        successTexts: ['Sukces.'],
        failureTexts: ['Porażka.'],
      };
    case 'bestiary':
      return {
        id: 'enemy.nowy',
        name: '',
        description: '',
        circle: 9,
        named: false,
        dread: 0,
        gaze: false,
      };
    case 'items':
      return {
        id: 'junk.nowy',
        kind: 'junk',
        name: '',
        description: '',
        value: 1,
        circle: 9,
      };
    case 'events':
      return { id: 'event.nowy', name: '' };
  }
}
