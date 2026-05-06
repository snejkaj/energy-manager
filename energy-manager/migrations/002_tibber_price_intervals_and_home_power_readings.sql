-- Requirements: DB-004, DB-006, DB-007, DB-019, DB-020, DB-021, TIB-001, TIB-003, TIB-005, TIB-009, TEL-001, TEL-002, TEL-003, TEL-004

create table if not exists price_intervals (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  source_home_id text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total numeric(12, 6) not null,
  currency text not null,
  price_level text,
  raw_payload jsonb not null default '{}'::jsonb,
  source_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_intervals_time_range check (ends_at > starts_at),
  constraint price_intervals_unique_interval unique (provider_id, source_home_id, starts_at, ends_at)
);

create index if not exists price_intervals_starts_at_idx on price_intervals (starts_at);
create index if not exists price_intervals_provider_time_idx on price_intervals (provider_id, starts_at, ends_at);

create table if not exists home_power_readings (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  source_home_id text,
  measured_at timestamptz not null,
  consumption_kw numeric(12, 6),
  production_kw numeric(12, 6),
  raw_payload jsonb not null default '{}'::jsonb,
  source_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint home_power_readings_power_check check (
    (consumption_kw is null or consumption_kw >= 0)
    and (production_kw is null or production_kw >= 0)
  ),
  constraint home_power_readings_unique_measurement unique (provider_id, source_home_id, measured_at)
);

create index if not exists home_power_readings_measured_at_idx on home_power_readings (measured_at);
create index if not exists home_power_readings_provider_time_idx on home_power_readings (provider_id, measured_at);
