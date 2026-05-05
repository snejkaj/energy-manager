-- Requirements: DB-006, DB-009, DB-010, DB-018, PRE-003, PRE-004, PRE-006

alter table weather_forecasts
  add column if not exists shortwave_radiation_w_m2 numeric(12, 6),
  add column if not exists global_tilted_irradiance_w_m2 numeric(12, 6);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weather_forecasts_shortwave_check'
  ) then
    alter table weather_forecasts
      add constraint weather_forecasts_shortwave_check
      check (shortwave_radiation_w_m2 is null or shortwave_radiation_w_m2 >= 0);
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'weather_forecasts_gti_check'
  ) then
    alter table weather_forecasts
      add constraint weather_forecasts_gti_check
      check (global_tilted_irradiance_w_m2 is null or global_tilted_irradiance_w_m2 >= 0);
  end if;
end $$;
