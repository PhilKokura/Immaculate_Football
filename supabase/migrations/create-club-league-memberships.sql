create table if not exists public.club_league_memberships (
  id bigint generated always as identity primary key,
  club_id uuid not null references public.clubs(id) on delete cascade,
  league_id uuid not null references public.leagues(id) on delete restrict,
  season integer not null check (season between 1800 and 2200),
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  constraint club_league_memberships_club_league_season_key
    unique (club_id, league_id, season)
);

create index if not exists club_league_memberships_club_id_idx
  on public.club_league_memberships (club_id);
create index if not exists club_league_memberships_league_id_idx
  on public.club_league_memberships (league_id);
create index if not exists club_league_memberships_season_idx
  on public.club_league_memberships (season);
-- A club has one current league in the supported league catalog.
create unique index if not exists club_league_memberships_one_current_league_per_club_idx
  on public.club_league_memberships (club_id) where is_current;

alter table public.club_league_memberships enable row level security;
-- No public policies: the server-side service role performs import and runtime reads.
