-- Requirements: DB-006, DB-017, CHG-013, CHG-014, CHG-015, CHG-016, CHG-017

alter table charging_plans
  add column if not exists estimated_completion_time_min timestamptz,
  add column if not exists estimated_completion_time_max timestamptz;

alter table decision_outcomes
  add column if not exists estimated_completion_time_min timestamptz,
  add column if not exists estimated_completion_time_max timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'charging_plans_completion_range_check'
  ) then
    alter table charging_plans
      add constraint charging_plans_completion_range_check
      check (
        estimated_completion_time_min is null
        or estimated_completion_time_max is null
        or estimated_completion_time_min <= estimated_completion_time_max
      );
  end if;
end $$;
