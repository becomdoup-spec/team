-- Supabase schema for Two Team League Manager
-- Run this in Supabase SQL editor after creating your project.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  contact text not null unique,
  role text not null check (role in ('batsman', 'batting_allrounder', 'bowling_allrounder', 'bowler')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.league_state (
  id uuid primary key default gen_random_uuid(),
  teams_locked boolean not null default false,
  teams_locked_at timestamptz,
  teams jsonb not null default '{"teamA": [], "teamB": [], "joker": null, "seed": null, "generatedAt": null}'::jsonb,
  schedule jsonb not null default '{"mode": "overs", "overs": 10, "duration": 60, "bestOf": 3, "generatedAt": null, "matches": []}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists players_role_idx on public.players (role);
create index if not exists players_created_at_idx on public.players (created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_players_set_updated_at on public.players;
create trigger trg_players_set_updated_at
before update on public.players
for each row
execute function public.set_updated_at();

drop trigger if exists trg_league_state_set_updated_at on public.league_state;
create trigger trg_league_state_set_updated_at
before update on public.league_state
for each row
execute function public.set_updated_at();

alter table public.players enable row level security;
alter table public.league_state enable row level security;

-- Replace with your auth logic as needed.
-- For quick setup this opens access for anon and authenticated clients.
drop policy if exists "public players access" on public.players;
create policy "public players access"
  on public.players
  for all
  using (true)
  with check (true);

drop policy if exists "public league state access" on public.league_state;
create policy "public league state access"
  on public.league_state
  for all
  using (true)
  with check (true);
