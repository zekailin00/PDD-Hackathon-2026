create extension if not exists "pgcrypto";

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  title text not null default 'Untitled Room',
  state text not null default 'IDLE' check (state in ('IDLE', 'RUNNING', 'AWAITING_INPUT', 'PROPOSED')),
  intent text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.messages (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_name text,
  user_id text,
  role text,
  kind text not null,
  content text not null,
  run_id uuid,
  reply_to bigint references public.messages(id),
  created_at timestamptz not null default now()
);

create table if not exists public.runs (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  status text not null default 'running',
  started_by text,
  selected_model text,
  created_at timestamptz not null default now()
);

create table if not exists public.steers (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.runs(id) on delete cascade,
  author_name text,
  user_id text,
  role text,
  kind text not null default 'nudge',
  content text,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id bigint generated always as identity primary key,
  room_id uuid not null references public.rooms(id) on delete cascade,
  version integer not null,
  kind text not null,
  content text not null,
  run_id uuid,
  created_at timestamptz not null default now()
);

alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.runs enable row level security;
alter table public.steers enable row level security;
alter table public.artifacts enable row level security;

-- No anonymous table policies: application writes stay server-side.
-- Realtime Broadcast/Presence can be enabled with private-channel policies
-- once Supabase Auth replaces the hackathon room token.
