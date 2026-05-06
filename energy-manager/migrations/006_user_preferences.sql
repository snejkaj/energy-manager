-- Requirements: DB-006, DB-022, MOD-001, MOD-002, SAF-001, SAF-002

create table if not exists user_preferences (
  id uuid primary key default gen_random_uuid(),
  singleton_key text not null unique default 'default',
  user_mode text not null default 'safe',
  soc_buffer_percent numeric(5, 2) not null default 15,
  start_early_minutes integer not null default 90,
  allow_undercharge_risk boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_preferences_singleton_check check (singleton_key = 'default'),
  constraint user_preferences_user_mode_check check (user_mode in ('safe', 'balanced', 'savings')),
  constraint user_preferences_soc_buffer_check check (soc_buffer_percent between 0 and 100),
  constraint user_preferences_start_early_check check (start_early_minutes >= 0)
);

insert into user_preferences (
  singleton_key,
  user_mode,
  soc_buffer_percent,
  start_early_minutes,
  allow_undercharge_risk
) values (
  'default',
  'safe',
  15,
  90,
  false
)
on conflict (singleton_key) do nothing;
