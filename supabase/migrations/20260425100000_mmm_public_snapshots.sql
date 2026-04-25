create table if not exists public.mmm_public_snapshots (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

create index if not exists mmm_public_snapshots_updated_at_idx
  on public.mmm_public_snapshots (updated_at desc);

create index if not exists admin_audit_log_public_cache_idx
  on public.admin_audit_log (target_type, target_id, created_at desc)
  where target_type = 'public-cache';

create index if not exists mmm_submissions_status_reviewed_at_idx
  on public.mmm_submissions (status, reviewed_at desc);
