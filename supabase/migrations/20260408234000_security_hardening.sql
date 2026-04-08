create table if not exists public.sync_request_limits (
  bucket_key text primary key,
  request_count integer not null default 0,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create index if not exists sync_request_limits_expires_at_idx
  on public.sync_request_limits (expires_at);

create or replace function public.run_privacy_retention()
returns void
language sql
security definer
as $$
  delete from public.sync_request_limits
  where expires_at < now();

  delete from public.notifications
  where created_at < now() - interval '30 days';
$$;

