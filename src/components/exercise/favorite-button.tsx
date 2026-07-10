"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentUserId,
  isFavoriteExercise,
  recordExerciseView,
  setFavoriteExercise,
} from "@/lib/supabase/exercise-interactions";
import { cn } from "@/lib/utils";

/** Boton de favorito + registro de "visto recientemente" para una ficha de
 *  ejercicio. Sin usuario autenticado no hace nada (no deberia montarse ahi,
 *  pero se protege igualmente). */
export function FavoriteButton({ exerciseId }: { exerciseId: string }) {
  const [supabase] = useState(() => createClient());
  const [userId, setUserId] = useState<string | null>(null);
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const uid = await getCurrentUserId(supabase);
      if (!uid || !active) return;
      setUserId(uid);
      recordExerciseView(supabase, uid, exerciseId).catch(() => {});
      const fav = await isFavoriteExercise(supabase, uid, exerciseId);
      if (active) setFavorite(fav);
    })();
    return () => {
      active = false;
    };
  }, [supabase, exerciseId]);

  function toggle() {
    if (!userId) return;
    const next = !favorite;
    setFavorite(next);
    setFavoriteExercise(supabase, userId, exerciseId, next).catch(() => {
      setFavorite(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={favorite ? "Quitar de favoritos" : "Anadir a favoritos"}
      aria-pressed={favorite}
      className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
    >
      <Heart
        className={cn(
          "size-5 transition-colors",
          favorite ? "fill-rank-maestro text-rank-maestro" : "text-muted-foreground",
        )}
      />
    </button>
  );
}
