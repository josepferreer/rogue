-- CHECKs de integridad numerica. NOT VALID: se aplican a filas nuevas/editadas
-- sin fallar por datos antiguos que pudieran incumplirlos. Ejecutar
-- `alter table X validate constraint Y` mas tarde si se quiere validar lo viejo.

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
