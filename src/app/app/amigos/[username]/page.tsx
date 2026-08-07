"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Dumbbell, Flame, Lock, Route } from "lucide-react";
import {
  useFriends,
  type FriendProfileResult,
} from "@/lib/store/friends-store";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "Este usuario no existe.",
  not_friends: "Solo puedes ver el perfil de tus amigos.",
  not_authenticated: "Inicia sesión para ver este perfil.",
  error: "No se pudo cargar el perfil.",
};

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function StatTile({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex flex-1 flex-col items-center gap-1 rounded-3xl border border-border bg-surface px-2 py-3.5 text-center">
      <span className="text-muted-foreground">{icon}</span>
      <p className="text-lg font-semibold leading-none">{value}</p>
      <p className="text-[11px] leading-none text-muted-foreground">{label}</p>
    </div>
  );
}

export default function FriendProfilePage() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username ?? "");
  const { getFriendProfile } = useFriends();

  // Se guarda junto al username que lo produjo: si cambia la ruta, el estado
  // anterior cuenta como "cargando" sin tener que resetearlo desde el efecto.
  const [loaded, setLoaded] = useState<{
    username: string;
    data: FriendProfileResult;
  } | null>(null);

  useEffect(() => {
    let active = true;
    getFriendProfile(username).then((data) => {
      if (active) setLoaded({ username, data });
    });
    return () => {
      active = false;
    };
  }, [username, getFriendProfile]);

  const result = loaded?.username === username ? loaded.data : null;
  const profile = result?.ok ? result : null;

  const header = (
    <div className="flex items-center justify-between">
      <Link
        href="/app/amigos"
        aria-label="Volver a amigos"
        className="flex size-10 items-center justify-center rounded-full bg-surface hover:bg-muted"
      >
        <ArrowLeft className="size-5" />
      </Link>
    </div>
  );

  if (!result) {
    return (
      <div className="flex flex-col gap-5 pt-2 pb-4">
        {header}
        <p className="py-10 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="flex flex-col gap-5 pt-2 pb-4">
        {header}
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-8 text-center">
          <Lock className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {ERROR_MESSAGES[result.code] ?? ERROR_MESSAGES.error}
          </p>
        </div>
      </div>
    );
  }

  const stats = profile.stats ?? {};
  const since = profile.friends_since
    ? new Date(profile.friends_since).toLocaleDateString("es-ES", {
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex flex-col gap-5 pt-2 pb-4">
      {header}

      {/* ── Cabecera del perfil ─────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="flex size-20 items-center justify-center rounded-full bg-muted font-mono text-lg font-semibold text-muted-foreground">
          {initials(profile.display_name)}
        </span>
        <div>
          <p className="text-lg font-semibold">{profile.display_name}</p>
          <p className="font-mono text-xs text-muted-foreground">
            @{profile.username}
          </p>
        </div>
        {since && (
          <p className="text-[11px] text-muted-foreground">
            Amigos desde {since}
          </p>
        )}
      </div>

      {/* ── Contadores ──────────────────────────────────────────────── */}
      {profile.share_stats ? (
        <div className="flex gap-2.5">
          <StatTile
            icon={<Dumbbell className="size-4" />}
            value={String(stats.workouts ?? 0)}
            label="Entrenos"
          />
          <StatTile
            icon={<Flame className="size-4" />}
            value={String(stats.week_streak ?? 0)}
            label={stats.week_streak === 1 ? "Semana" : "Semanas"}
          />
          <StatTile
            icon={<Route className="size-4" />}
            value={`${stats.cardio_km ?? 0}`}
            label="km cardio"
          />
        </div>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-8 text-center">
          <Lock className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {profile.display_name} no comparte sus estadísticas.
          </p>
        </div>
      )}
    </div>
  );
}
