-- ============================================================
-- Rogue — SQL pendiente de aplicar (una sola vez).
-- Pega TODO este fichero en: Supabase Dashboard -> SQL Editor -> Run.
-- Es idempotente en lo que se puede; los ALTER ... ADD CONSTRAINT dan error
-- "already exists" si ya se corrio antes (inofensivo, ignoralo).
-- ============================================================

-- ------------------------------------------------------------
-- BLOQUE 1 — profiles.email sincronizado con auth.users
-- (bug funcional: sin esto el login por username falla tras cambiar el email)
-- ------------------------------------------------------------
create or replace function sync_profile_email()
returns trigger as $$
begin
  if new.email is distinct from old.email then
    update public.profiles
      set email = new.email, updated_at = now()
      where user_id = new.id;
  end if;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_email_changed on auth.users;
create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute procedure sync_profile_email();

update public.profiles p
  set email = u.email, updated_at = now()
  from auth.users u
  where u.id = p.user_id and p.email is distinct from u.email;

-- ------------------------------------------------------------
-- BLOQUE 2 — CHECKs de integridad numerica (NOT VALID: no falla por datos viejos)
-- ------------------------------------------------------------
alter table workout_sets      add constraint workout_sets_weight_nonneg  check (weight_kg >= 0)     not valid;
alter table workout_sets      add constraint workout_sets_reps_pos       check (reps > 0)           not valid;

alter table routine_exercises add constraint rex_sets_pos                check (sets > 0)           not valid;
alter table routine_exercises add constraint rex_reps_pos                check (reps > 0)           not valid;
alter table routine_exercises add constraint rex_rest_nonneg             check (rest_sec >= 0)      not valid;
alter table routine_exercises add constraint rex_kg_nonneg               check (suggested_kg >= 0)  not valid;

alter table profiles          add constraint profiles_bw_pos             check (bodyweight_kg > 0)  not valid;
alter table profiles          add constraint profiles_height_pos         check (height_cm > 0)      not valid;

alter table meal_entries      add constraint meal_qty_pos                check (quantity_g > 0)     not valid;

alter table cardio_sessions   add constraint cardio_dist_nonneg          check (distance_km >= 0)   not valid;
alter table cardio_sessions   add constraint cardio_dur_nonneg           check (duration_sec >= 0)  not valid;

-- ------------------------------------------------------------
-- BLOQUE 3 — updated_at que se actualiza solo en cada UPDATE
-- ------------------------------------------------------------
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
