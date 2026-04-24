create table if not exists public.mmm_manual_overrides (
  id text primary key,
  kind text not null check (kind in ('source', 'source-row', 'single-player')),
  data jsonb not null default '{}'::jsonb,
  reason text,
  updated_by_user_id uuid references public.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create index if not exists mmm_manual_overrides_kind_idx
  on public.mmm_manual_overrides(kind);
