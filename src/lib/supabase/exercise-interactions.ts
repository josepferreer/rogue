import { createClient } from "./client";

type SupabaseClient = ReturnType<typeof createClient>;

export async function getCurrentUserId(
  supabase: SupabaseClient,
): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function isFavoriteExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from("exercise_favorites")
    .select("exercise_id")
    .eq("user_id", userId)
    .eq("exercise_id", exerciseId)
    .maybeSingle();
  return !!data;
}

export async function setFavoriteExercise(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
  favorite: boolean,
): Promise<void> {
  if (favorite) {
    await supabase
      .from("exercise_favorites")
      .upsert({ user_id: userId, exercise_id: exerciseId });
  } else {
    await supabase
      .from("exercise_favorites")
      .delete()
      .eq("user_id", userId)
      .eq("exercise_id", exerciseId);
  }
}

/** Registra que el usuario abrio la ficha de un ejercicio (para "recientes"). */
export async function recordExerciseView(
  supabase: SupabaseClient,
  userId: string,
  exerciseId: string,
): Promise<void> {
  await supabase
    .from("exercise_recent_views")
    .upsert(
      { user_id: userId, exercise_id: exerciseId, viewed_at: new Date().toISOString() },
      { onConflict: "user_id,exercise_id" },
    );
}

export async function listFavoriteIds(
  supabase: SupabaseClient,
  userId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("exercise_favorites")
    .select("exercise_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => r.exercise_id);
}

export async function listRecentIds(
  supabase: SupabaseClient,
  userId: string,
  limit = 10,
): Promise<string[]> {
  const { data } = await supabase
    .from("exercise_recent_views")
    .select("exercise_id")
    .eq("user_id", userId)
    .order("viewed_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((r) => r.exercise_id);
}
