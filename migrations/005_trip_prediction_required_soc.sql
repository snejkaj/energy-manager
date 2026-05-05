-- Requirements: DB-006, DB-012, DB-018, PRE-018, PRE-019, PRE-020, PRE-021, PRE-022, PRE-023

alter table travel_predictions
  add column if not exists required_soc_percent numeric(5, 2);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travel_predictions_required_soc_check'
  ) then
    alter table travel_predictions
      add constraint travel_predictions_required_soc_check
      check (required_soc_percent is null or required_soc_percent between 0 and 100);
  end if;
end $$;
