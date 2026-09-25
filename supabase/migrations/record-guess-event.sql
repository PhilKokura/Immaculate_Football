-- Atomic, idempotent persistence for one locally consumed Daily Puzzle guess.
-- Keep the 9-attempt limit synchronized with lib/gameRules.ts (MAX_GAME_GUESSES).
-- Correctness is computed by the server from canonical runtime criteria before this RPC.

create unique index if not exists guess_events_one_correct_cell_per_session_idx
  on public.guess_events (session_id, cell_index) where correct;
create unique index if not exists guess_events_one_correct_player_per_session_idx
  on public.guess_events (session_id, player_id) where correct;

create or replace function public.record_guess_event(
  p_event_id uuid,
  p_session_id uuid,
  p_puzzle_id uuid,
  p_cell_index integer,
  p_player_id uuid,
  p_correct boolean
)
returns table (
  event_id uuid,
  correct boolean,
  guesses_used integer,
  correct_cells integer,
  completed boolean,
  completed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_session public.game_sessions%rowtype;
  v_event public.guess_events%rowtype;
  v_will_complete boolean;
begin
  if p_event_id is null or p_session_id is null or p_puzzle_id is null or
     p_player_id is null or p_cell_index is null or p_cell_index not between 0 and 8 or p_correct is null then
    raise exception 'Invalid guess event' using errcode = 'FG001';
  end if;

  -- The row lock serializes guesses for one run, including concurrent retries.
  select gs.* into v_session
  from public.game_sessions as gs
  where gs.id = p_session_id
  for update;
  if not found then
    raise exception 'Game session not found' using errcode = 'FG002';
  end if;
  if v_session.puzzle_id <> p_puzzle_id then
    raise exception 'Game session belongs to another puzzle' using errcode = 'FG003';
  end if;

  -- A retry of a committed event succeeds even after the run has completed.
  select ge.* into v_event from public.guess_events as ge where ge.id = p_event_id;
  if found then
    if v_event.session_id <> p_session_id or v_event.puzzle_id <> p_puzzle_id or
       v_event.cell_index <> p_cell_index or v_event.player_id <> p_player_id then
      raise exception 'Event ID already belongs to another guess' using errcode = 'FG004';
    end if;
    return query select v_event.id, v_event.correct, v_session.guesses_used,
      v_session.correct_cells, v_session.completed, v_session.completed_at;
    return;
  end if;

  if v_session.completed or v_session.guesses_used >= 9 or v_session.correct_cells >= 9 then
    raise exception 'Game session is completed' using errcode = 'FG005';
  end if;
  if not exists (select 1 from public.daily_puzzles as dp where dp.id = p_puzzle_id) then
    raise exception 'Daily Puzzle not found' using errcode = 'FG006';
  end if;
  if not exists (select 1 from public.players as pl where pl.id = p_player_id and pl.active) then
    raise exception 'Active player not found' using errcode = 'FG007';
  end if;
  if exists (
    select 1 from public.guess_events as ge
    where ge.session_id = p_session_id and ge.correct and ge.cell_index = p_cell_index
  ) then
    raise exception 'Cell is already completed' using errcode = 'FG008';
  end if;
  if exists (
    select 1 from public.guess_events as ge
    where ge.session_id = p_session_id and ge.correct and ge.player_id = p_player_id
  ) then
    raise exception 'Player is already used' using errcode = 'FG009';
  end if;

  insert into public.guess_events (id, puzzle_id, session_id, cell_index, player_id, correct)
  values (p_event_id, p_puzzle_id, p_session_id, p_cell_index, p_player_id, p_correct)
  on conflict (id) do nothing
  returning * into v_event;

  if not found then
    -- Another session may have inserted the same event ID concurrently.
    select ge.* into v_event from public.guess_events as ge where ge.id = p_event_id;
    if v_event.id is null or v_event.session_id <> p_session_id or
       v_event.puzzle_id <> p_puzzle_id or v_event.cell_index <> p_cell_index or
       v_event.player_id <> p_player_id then
      raise exception 'Event ID already belongs to another guess' using errcode = 'FG004';
    end if;
    return query select v_event.id, v_event.correct, v_session.guesses_used,
      v_session.correct_cells, v_session.completed, v_session.completed_at;
    return;
  end if;

  v_will_complete :=
    v_session.correct_cells + case when p_correct then 1 else 0 end >= 9 or
    v_session.guesses_used + 1 >= 9;

  update public.game_sessions as gs
  set guesses_used = gs.guesses_used + 1,
      correct_cells = gs.correct_cells + case when p_correct then 1 else 0 end,
      completed = v_will_complete,
      completed_at = case when v_will_complete then coalesce(gs.completed_at, now()) else gs.completed_at end
  where gs.id = p_session_id
  returning gs.* into v_session;

  return query select v_event.id, v_event.correct, v_session.guesses_used,
    v_session.correct_cells, v_session.completed, v_session.completed_at;
end;
$$;

revoke all on function public.record_guess_event(uuid, uuid, uuid, integer, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.record_guess_event(uuid, uuid, uuid, integer, uuid, boolean)
  to service_role;

