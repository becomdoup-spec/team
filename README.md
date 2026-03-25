# Two Team League Website

A polished, mobile-friendly website to run a 2-team cricket league registration and scheduling flow.

## What is implemented

- Player registration with `name`, `contact`, and role:
  - `batsman`
  - `bowler`
  - `batting_allrounder`
  - `bowling_allrounder`
- Role-priority lineup logic based on cricket conventions:
  - batsman first
  - allrounders in the middle
  - bowlers last
- Team split logic:
  - even player count -> equal split
  - odd player count -> one joker player who can play for both teams
- Hard cap:
  - 8 players max per team
  - optional joker (max total registrations = 17)
- Contact-verified role update
- Team lock action (`Finalize & Lock Teams`) with persistent saved state
- Bottom-right refresh mixup button for reshuffling current player pool
- League schedule planner between 5:00 PM and 8:00 PM with:
  - planning by overs or duration
  - automatic best-of series suggestion

## Run locally

Open `index.html` directly in a browser.

## Supabase-ready artifacts

- `supabase/schema.sql`
- `supabase/config.example.js`
- `supabase/README.md`

These files are ready so we can wire the DB layer next.
