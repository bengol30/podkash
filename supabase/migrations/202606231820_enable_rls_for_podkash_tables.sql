-- Lock down Podkash tables exposed through the public PostgREST schema.
-- Server-side code uses the service-role key / direct DB connection, so no anon/authenticated
-- policies are needed for these application tables.

alter table if exists public.podkash_store enable row level security;
alter table if exists public.podkash_google_tokens enable row level security;

revoke all on table public.podkash_store from anon, authenticated;
revoke all on table public.podkash_google_tokens from anon, authenticated;

grant all on table public.podkash_store to service_role;
grant all on table public.podkash_google_tokens to service_role;
