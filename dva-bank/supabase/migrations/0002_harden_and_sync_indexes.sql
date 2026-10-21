-- The signup trigger function must not be callable through /rest/v1/rpc (Supabase advisor 0028/0029).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Incremental sync pulls: attempts by server created_at, review_states by updated_at.
create index if not exists attempts_user_created_idx on public.attempts (user_id, created_at);
create index if not exists review_states_user_updated_idx on public.review_states (user_id, updated_at);
