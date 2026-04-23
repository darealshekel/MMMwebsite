create table if not exists public.auth_link_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  browser_token_hash text not null unique,
  redirect_to text not null default '/dashboard',
  status text not null default 'pending',
  minecraft_uuid_hash text,
  minecraft_username text,
  linked_user_id uuid references public.users(id) on delete cascade,
  claimed_client_id text,
  claimed_at timestamptz,
  expires_at timestamptz not null,
  completed_session_issued_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint auth_link_codes_status_check check (status in ('pending', 'completed', 'expired'))
);

create index if not exists auth_link_codes_status_expires_idx
  on public.auth_link_codes (status, expires_at desc);

create index if not exists auth_link_codes_linked_user_id_idx
  on public.auth_link_codes (linked_user_id);

alter table public.auth_link_codes enable row level security;
