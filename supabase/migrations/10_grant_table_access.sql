-- New Supabase projects no longer give the API roles access to tables in the
-- public schema automatically, so grant it here. Row Level Security still
-- decides which rows each signed-in user can see and change.

-- Signed-in users (the app in the browser).
grant select on public.profiles to authenticated;
grant select on public.usage_tracking to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant select, insert, update, delete on public.task_steps to authenticated;

-- Edge Functions that use the secret key (create-stripe-session, stripe-webhook).
grant select, insert, update, delete on all tables in schema public to service_role;
