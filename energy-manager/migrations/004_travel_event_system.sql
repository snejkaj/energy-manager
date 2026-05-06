-- Requirements: DB-006, DB-011, DB-012, PRE-001, PRE-012, PRE-013, PRE-014, PRE-015, PRE-016, PRE-017

alter table travel_events
  add column if not exists needs_car boolean not null default false,
  add column if not exists trip_size text,
  add column if not exists detection_source text,
  add column if not exists explicit_override boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travel_events_trip_size_check'
  ) then
    alter table travel_events
      add constraint travel_events_trip_size_check
      check (trip_size is null or trip_size in ('short', 'medium', 'long'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travel_events_detection_source_check'
  ) then
    alter table travel_events
      add constraint travel_events_detection_source_check
      check (
        detection_source is null
        or detection_source in ('emoji', 'keyword', 'manual_toggle', 'user_tag')
      );
  end if;
end $$;

alter table travel_predictions
  add column if not exists trip_size text,
  add column if not exists overridden_by_explicit_event boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travel_predictions_trip_size_check'
  ) then
    alter table travel_predictions
      add constraint travel_predictions_trip_size_check
      check (trip_size is null or trip_size in ('short', 'medium', 'long'));
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'travel_predictions_confidence_required_check'
  ) then
    alter table travel_predictions
      add constraint travel_predictions_confidence_required_check
      check (confidence is not null);
  end if;
end $$;
