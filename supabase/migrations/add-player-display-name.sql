alter table public.players
add column if not exists display_name text;

comment on column public.players.display_name is
  'Common football display name used by the game UI while players.name remains the canonical provider name.';