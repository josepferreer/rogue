-- updated_at automatico: hasta ahora solo se ponia al crear la fila (default),
-- la app dependia de mandarlo a mano en cada UPDATE. Este trigger lo garantiza.

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at before update on profiles
  for each row execute procedure set_updated_at();

drop trigger if exists routines_set_updated_at on routines;
create trigger routines_set_updated_at before update on routines
  for each row execute procedure set_updated_at();

drop trigger if exists nutrition_goals_set_updated_at on nutrition_goals;
create trigger nutrition_goals_set_updated_at before update on nutrition_goals
  for each row execute procedure set_updated_at();
