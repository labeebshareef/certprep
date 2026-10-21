# Supabase

Project ref `uzmadqbamyryefhayyzy` (ap-southeast-2). The files here are the source of truth for the schema.

Applied on 2026-10-20 through the Supabase MCP server. Its `apply_migration` call waits for an interactive
confirmation on statements it deems destructive (`drop ... if exists`) and times out, so `0001_init.sql` was
applied in pieces without the drops. The remote history therefore reads: `probe` (a no-op `select 1`),
`init_profiles`, `init_signup_fn`, `init_signup_trigger`, `init_state_tables`, `init_helpers`,
`harden_and_sync_indexes`. The resulting schema is identical to `0001_init.sql` + `0002_harden_and_sync_indexes.sql`.

Security advisors: clean. Performance advisors: only "unused index" notices on an empty database.
