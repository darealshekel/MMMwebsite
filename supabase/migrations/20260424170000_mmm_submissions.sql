create table if not exists public.mmm_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  minecraft_uuid_hash text not null,
  minecraft_username text not null,
  submission_type text not null,
  target_source_id text,
  target_source_slug text,
  source_name text not null,
  source_type text not null,
  old_blocks_mined bigint,
  submitted_blocks_mined bigint not null,
  proof_file_name text not null,
  proof_mime_type text not null,
  proof_size integer not null,
  proof_image_ref text not null,
  logo_url text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  reviewed_by_user_id uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'mmm_submissions_submission_type_check'
  ) then
    alter table public.mmm_submissions
      add constraint mmm_submissions_submission_type_check
      check (submission_type in ('edit-existing-source', 'add-new-source'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mmm_submissions_status_check'
  ) then
    alter table public.mmm_submissions
      add constraint mmm_submissions_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mmm_submissions_blocks_check'
  ) then
    alter table public.mmm_submissions
      add constraint mmm_submissions_blocks_check
      check (
        submitted_blocks_mined >= 0
        and (old_blocks_mined is null or old_blocks_mined >= 0)
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'mmm_submissions_proof_mime_type_check'
  ) then
    alter table public.mmm_submissions
      add constraint mmm_submissions_proof_mime_type_check
      check (proof_mime_type in ('image/png', 'image/jpeg', 'image/webp'));
  end if;
end $$;

create index if not exists mmm_submissions_user_id_created_at_idx
  on public.mmm_submissions (user_id, created_at desc);

create index if not exists mmm_submissions_status_created_at_idx
  on public.mmm_submissions (status, created_at desc);

create index if not exists mmm_submissions_target_source_id_idx
  on public.mmm_submissions (target_source_id);
