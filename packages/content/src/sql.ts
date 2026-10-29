/**
 * Tabele panelu. Osobne od migracji Drizzle gry, żeby nie wchodzić w numerację
 * etapów 1+. Same `IF NOT EXISTS` — powtórne uruchomienie nic nie psuje.
 */
export const PANEL_SCHEMA_SQL = `
create table if not exists staff_accounts (
  id uuid primary key default uuidv7(),
  email text not null,
  password_hash text not null,
  role text not null,
  created_at timestamptz not null default now(),
  constraint staff_accounts_email_unique unique (email),
  constraint staff_accounts_role_check check (role in ('administrator', 'moderator', 'content_designer'))
);

create table if not exists staff_sessions (
  id uuid primary key default uuidv7(),
  staff_id uuid not null references staff_accounts (id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint staff_sessions_token_unique unique (token_hash)
);

create index if not exists staff_sessions_staff_idx on staff_sessions (staff_id);

create table if not exists account_bans (
  account_id uuid primary key references accounts (id) on delete cascade,
  reason text not null,
  staff_id uuid references staff_accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists announcements (
  id uuid primary key default uuidv7(),
  title text not null,
  body text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists content_publications (
  revision integer primary key,
  document jsonb not null,
  published_at timestamptz not null default now(),
  staff_id uuid references staff_accounts (id) on delete set null,
  constraint content_publications_revision_positive check (revision > 0)
);

create table if not exists content_state (
  singleton boolean primary key default true,
  current_revision integer references content_publications (revision),
  draft jsonb,
  constraint content_state_singleton_check check (singleton)
);

create table if not exists content_actions (
  id uuid primary key default uuidv7(),
  kind text not null,
  def_id text not null,
  content_revision integer not null references content_publications (revision),
  character_id uuid,
  created_at timestamptz not null default now(),
  constraint content_actions_kind_check check (kind in ('mission', 'event'))
);

create index if not exists content_actions_revision_idx on content_actions (content_revision);
`;

export function panelSchemaStatements(): string[] {
  return PANEL_SCHEMA_SQL.split(/;\s*\n/)
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0)
    .map((statement) => (statement.endsWith(';') ? statement : `${statement};`));
}
