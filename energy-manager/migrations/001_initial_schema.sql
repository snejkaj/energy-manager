-- Requirements: DB-001, DB-002, DB-005, DB-006, DB-009, DB-010, DB-011, DB-012, DB-013, DB-014, DB-015, DB-016, DB-017, DB-018, UX-101, UX-102, EMG-004, MOD-001, PRE-001, PRE-003

create extension if not exists pgcrypto;

create table if not exists electricity_prices (
  id uuid primary key default gen_random_uuid(),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  total numeric(12, 6) not null,
  currency text not null,
  price_level text,
  source text not null,
  source_fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint electricity_prices_time_range check (ends_at > starts_at),
  constraint electricity_prices_unique_interval unique (source, starts_at, ends_at)
);

create index if not exists electricity_prices_starts_at_idx on electricity_prices (starts_at);

create table if not exists user_modes (
  id uuid primary key default gen_random_uuid(),
  mode text not null unique,
  display_name text not null,
  description text not null,
  safety_priority integer not null,
  savings_priority integer not null,
  undercharge_risk_allowed boolean not null default false,
  requires_explicit_user_choice boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_modes_mode_check check (mode in ('safe', 'balanced', 'savings')),
  constraint user_modes_safety_priority_check check (safety_priority between 0 and 100),
  constraint user_modes_savings_priority_check check (savings_priority between 0 and 100)
);

insert into user_modes (
  mode,
  display_name,
  description,
  safety_priority,
  savings_priority,
  undercharge_risk_allowed,
  requires_explicit_user_choice
) values
  ('safe', 'Safe', 'Prioritize reaching the target charge. Cost savings are secondary.', 100, 50, false, false),
  ('balanced', 'Balanced', 'Balance reaching the target charge with lower charging cost.', 80, 80, false, true),
  ('savings', 'Savings', 'Prioritize low cost. This mode may accept more charging risk if explicitly selected.', 50, 100, true, true)
on conflict (mode) do update set
  display_name = excluded.display_name,
  description = excluded.description,
  safety_priority = excluded.safety_priority,
  savings_priority = excluded.savings_priority,
  undercharge_risk_allowed = excluded.undercharge_risk_allowed,
  requires_explicit_user_choice = excluded.requires_explicit_user_choice,
  updated_at = now();

create table if not exists weather_forecasts (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  forecast_at timestamptz not null,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  temperature_c numeric(8, 3),
  cloud_cover_percent numeric(5, 2),
  precipitation_mm numeric(8, 3),
  wind_speed_mps numeric(8, 3),
  confidence numeric(5, 4),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint weather_forecasts_time_range check (valid_to > valid_from),
  constraint weather_forecasts_cloud_cover_check check (cloud_cover_percent is null or cloud_cover_percent between 0 and 100),
  constraint weather_forecasts_confidence_check check (confidence is null or confidence between 0 and 1)
);

create index if not exists weather_forecasts_valid_from_idx on weather_forecasts (valid_from);
create index if not exists weather_forecasts_provider_time_idx on weather_forecasts (provider_id, valid_from, valid_to);

create table if not exists solar_predictions (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null,
  weather_forecast_id uuid references weather_forecasts (id) on delete set null,
  predicted_at timestamptz not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  predicted_production_kwh numeric(12, 6) not null,
  predicted_peak_power_kw numeric(12, 6),
  confidence numeric(5, 4),
  features jsonb not null default '{}'::jsonb,
  model_name text,
  model_version text,
  created_at timestamptz not null default now(),
  constraint solar_predictions_time_range check (ends_at > starts_at),
  constraint solar_predictions_energy_check check (predicted_production_kwh >= 0),
  constraint solar_predictions_power_check check (predicted_peak_power_kw is null or predicted_peak_power_kw >= 0),
  constraint solar_predictions_confidence_check check (confidence is null or confidence between 0 and 1)
);

create index if not exists solar_predictions_starts_at_idx on solar_predictions (starts_at);
create index if not exists solar_predictions_provider_time_idx on solar_predictions (provider_id, starts_at, ends_at);

create table if not exists travel_events (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text,
  title text not null,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  user_tags text[] not null default '{}'::text[],
  expected_distance_km numeric(12, 3),
  expected_energy_need_kwh numeric(12, 6),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint travel_events_source_check check (source in ('calendar', 'user_tagged')),
  constraint travel_events_time_range check (ends_at is null or ends_at >= starts_at),
  constraint travel_events_distance_check check (expected_distance_km is null or expected_distance_km >= 0),
  constraint travel_events_energy_check check (expected_energy_need_kwh is null or expected_energy_need_kwh >= 0)
);

create index if not exists travel_events_starts_at_idx on travel_events (starts_at);
create index if not exists travel_events_source_external_idx on travel_events (source, external_id);

create table if not exists travel_predictions (
  id uuid primary key default gen_random_uuid(),
  travel_event_id uuid references travel_events (id) on delete set null,
  predicted_at timestamptz not null,
  predicted_departure_at timestamptz not null,
  predicted_return_at timestamptz,
  predicted_distance_km numeric(12, 3),
  predicted_energy_need_kwh numeric(12, 6),
  confidence numeric(5, 4),
  model_name text not null,
  model_version text not null,
  features jsonb not null default '{}'::jsonb,
  reason text[] not null default '{}'::text[],
  created_at timestamptz not null default now(),
  constraint travel_predictions_return_check check (predicted_return_at is null or predicted_return_at >= predicted_departure_at),
  constraint travel_predictions_distance_check check (predicted_distance_km is null or predicted_distance_km >= 0),
  constraint travel_predictions_energy_check check (predicted_energy_need_kwh is null or predicted_energy_need_kwh >= 0),
  constraint travel_predictions_confidence_check check (confidence is null or confidence between 0 and 1)
);

create index if not exists travel_predictions_departure_idx on travel_predictions (predicted_departure_at);
create index if not exists travel_predictions_event_idx on travel_predictions (travel_event_id);

create table if not exists charging_plans (
  id uuid primary key default gen_random_uuid(),
  user_mode_id uuid not null references user_modes (id),
  status text not null,
  target_departure_time timestamptz not null,
  target_min_soc_percent numeric(5, 2) not null,
  target_max_soc_percent numeric(5, 2) not null,
  planned_energy_kwh numeric(12, 6) not null,
  estimated_cost numeric(12, 6) not null,
  currency text,
  estimated_start_time timestamptz,
  estimated_end_time timestamptz,
  estimated_completion_time timestamptz,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  actual_completion_time timestamptz,
  resulting_soc_percent numeric(5, 2),
  deficit_kwh numeric(12, 6) not null default 0,
  deficit_soc_percent numeric(5, 2) not null default 0,
  reason text[] not null default '{}'::text[],
  inputs_snapshot jsonb not null default '{}'::jsonb,
  plan_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charging_plans_status_check check (status in ('planned', 'active', 'completed', 'failed', 'cancelled', 'emergency')),
  constraint charging_plans_soc_check check (
    target_min_soc_percent between 0 and 100
    and target_max_soc_percent between 0 and 100
    and target_min_soc_percent <= target_max_soc_percent
    and (resulting_soc_percent is null or resulting_soc_percent between 0 and 100)
  ),
  constraint charging_plans_energy_check check (planned_energy_kwh >= 0 and deficit_kwh >= 0),
  constraint charging_plans_completion_estimate_check check (
    estimated_completion_time is null
    or estimated_start_time is null
    or estimated_completion_time >= estimated_start_time
  )
);

create index if not exists charging_plans_departure_idx on charging_plans (target_departure_time);
create index if not exists charging_plans_status_idx on charging_plans (status);

create table if not exists decision_logs (
  id uuid primary key default gen_random_uuid(),
  charging_plan_id uuid references charging_plans (id) on delete set null,
  decision_at timestamptz not null default now(),
  decision_type text not null,
  selected_action text not null,
  user_mode text not null,
  reason text[] not null,
  explanation text not null,
  inputs_snapshot jsonb not null default '{}'::jsonb,
  alternatives_snapshot jsonb not null default '[]'::jsonb,
  selected_plan_snapshot jsonb not null default '{}'::jsonb,
  model_metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint decision_logs_reason_not_empty check (array_length(reason, 1) is not null),
  constraint decision_logs_user_mode_check check (user_mode in ('safe', 'balanced', 'savings'))
);

create index if not exists decision_logs_decision_at_idx on decision_logs (decision_at);
create index if not exists decision_logs_plan_idx on decision_logs (charging_plan_id);

create table if not exists decision_outcomes (
  id uuid primary key default gen_random_uuid(),
  decision_log_id uuid not null references decision_logs (id) on delete cascade,
  charging_plan_id uuid references charging_plans (id) on delete set null,
  outcome text not null,
  cause text not null,
  estimated_completion_time timestamptz,
  actual_completion_time timestamptz,
  completion_delta_seconds integer generated always as (
    case
      when estimated_completion_time is null or actual_completion_time is null then null
      else extract(epoch from (actual_completion_time - estimated_completion_time))::integer
    end
  ) stored,
  estimated_soc_percent numeric(5, 2),
  actual_soc_percent numeric(5, 2),
  estimated_cost numeric(12, 6),
  actual_cost numeric(12, 6),
  training_label text,
  features_snapshot jsonb not null default '{}'::jsonb,
  outcome_metadata jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now(),
  constraint decision_outcomes_outcome_check check (outcome in ('success', 'failure')),
  constraint decision_outcomes_soc_check check (
    (estimated_soc_percent is null or estimated_soc_percent between 0 and 100)
    and (actual_soc_percent is null or actual_soc_percent between 0 and 100)
  )
);

create index if not exists decision_outcomes_decision_idx on decision_outcomes (decision_log_id);
create index if not exists decision_outcomes_recorded_at_idx on decision_outcomes (recorded_at);
