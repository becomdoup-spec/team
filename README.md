# Supabase Hookup Notes

The current UI works with browser local storage. When you are ready, wire Supabase in these steps:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `supabase/config.example.js` to `supabase/config.js` and add URL + anon key.
4. Add `@supabase/supabase-js` and replace local `loadState/persist` calls in `app.js` with Supabase reads/writes.

## Suggested mapping

- `players` table stores all player registrations and role updates.
- `league_state` stores lock state, generated teams, and schedule JSON.

## Suggested client flow

- On page load: read `players` + latest `league_state`.
- On add/update player: write to `players`, then recompute teams and update `league_state` if not locked.
- On lock or mixup: update `league_state.teams` and `teams_locked`.
- On schedule generate: update `league_state.schedule`.
