alter table public.users
  add column if not exists discord_id text unique,
  add column if not exists discord_username text,
  add column if not exists discord_avatar text,
  add column if not exists role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'users_role_check'
  ) then
    alter table public.users
      add constraint users_role_check
      check (role in ('user', 'player', 'admin', 'owner'));
  end if;
end $$;

create table if not exists public.minecraft_profile_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  minecraft_uuid text not null,
  minecraft_uuid_hash text not null,
  minecraft_name text not null,
  submitted_value text not null,
  status text not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'minecraft_profile_claims_status_check'
  ) then
    alter table public.minecraft_profile_claims
      add constraint minecraft_profile_claims_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

create index if not exists minecraft_profile_claims_user_id_idx
  on public.minecraft_profile_claims (user_id);

create index if not exists minecraft_profile_claims_status_idx
  on public.minecraft_profile_claims (status);

create index if not exists minecraft_profile_claims_uuid_hash_idx
  on public.minecraft_profile_claims (minecraft_uuid_hash);

create unique index if not exists minecraft_profile_claims_active_uuid_unique_idx
  on public.minecraft_profile_claims (minecraft_uuid_hash)
  where status in ('pending', 'approved');

create unique index if not exists minecraft_profile_claims_one_approved_user_idx
  on public.minecraft_profile_claims (user_id)
  where status = 'approved';

alter table public.minecraft_profile_claims enable row level security;
