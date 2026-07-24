"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Dumbbell, Flame, Lock, Route } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { RankBadge } from "@/components/ui/rank-badge";
import { BodyRankSummary } from "@/components/profile/ranks-panel";
import {
  useFriends,
  type FriendProfile,
  type FriendProfileResult,
} from "@/lib/store/friends-store";
import { getExerciseInfo, muscleLookup } from "@/lib/store/rogue-store";
import {
  aggregateToGroups,
  averageRank,
  computeMuscleRanks,
  MIN_SESSIONS_TO_RANK,
  type ComputedRank,
} from "@/lib/rank-engine";
import {
  getDivisionLabel,
  getRankTier,
  RANK_STYLES,
} from "@/lib/ranks";
import type { WorkoutSession } from "@/lib/workout/types";

const ERROR_MESSAGES: Record<string, string> = {
  not_found: "Este usuario no existe.",
  not_friends: "Solo puedes ver el perfil de tus amigos.",
  not_authenticated: "Inicia sesión para ver este perfil.",
  error: "No se pudo cargar el perfil.",
};

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Reconstruye sesiones a partir de las series normalizadas que devuelve la
 * RPC. Los pesos vienen ya divididos entre el peso corporal del amigo, asi que
 * el motor de rangos se llama con bodyweightKg = 1 (estimate1RM es lineal en
 * el peso: el ratio 1RM/peso corporal sale identico).
 */
function toSessions(profile: FriendProfile): WorkoutSession[] {
  const map = new Map<string, WorkoutSession>();
  for (const s of profile.sets) {
    let session = map.get(s.s);
    if (!session) {
      session = { id: s.s, dateISO: s.d, dayLabel: "", sets: [] };
      map.set(s.s, session);
    }
    session.sets.push({
      exerciseId: s.e,
      grupo: getExerciseInfo(s.e).grupo,
      weightKg: s.w,
      reps: s.r,
    });
  }
  return [...map.values()];
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

/** Fila compacta de rango por grupo (la version con tarjetas grandes se queda
 *  para el perfil propio; aqui interesa la vista de un vistazo). */
function GroupRankRow({ rank }: { rank: ComputedRank }) {
  if (!rank.ranked) {
    return (
      <div className="flex items-center justify-between py-2.5">
        <span className="text-sm">{rank.muscle}</span>
        <span className="font-mono text-[11px] text-muted-foreground">
          Sin rango
        </span>
      </div>
    );
  }

  const tier = getRankTier(rank.tier);
  const color = `var(--rank-${rank.tier})`;

  return (
    <div className="flex items-center gap-3 py-2.5">
      <span className="flex-1 truncate text-sm">{rank.muscle}</span>
      <div className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full"
          style={{ width: `${rank.progress}%`, background: color }}
        />
      </div>
      <span className="shrink-0 whitespace-nowrap font-mono text-xs font-medium">
        <span style={{ color }}>●</span> {tier.label}{" "}
        {getDivisionLabel(tier, rank.division)}
      </span>
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

  const { muscleRanks, ranks, overall } = useMemo(() => {
    if (!profile || !profile.share_ranks) {
      return { muscleRanks: [], ranks: [], overall: null };
    }
    const muscleRanks = computeMuscleRanks(
      toSessions(profile),
      1,
      profile.sex,
      muscleLookup,
    );
    const ranks = aggregateToGroups(muscleRanks);
    const overall = averageRank(
      ranks.filter(
        (r): r is Extract<ComputedRank, { ranked: true }> => r.ranked,
      ),
    );
    return { muscleRanks, ranks, overall };
  }, [profile]);

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

      {/* ── Rango global ────────────────────────────────────────────── */}
      {profile.share_ranks && overall && (
        <PastelCard
          variant="neutral"
          className="flex flex-col items-center gap-2 py-5"
        >
          <RankBadge tier={overall.tier} division={overall.division} size="md" />
          <p
            className={`font-mono text-xs ${RANK_STYLES[overall.tier].text}`}
          >
            {getRankTier(overall.tier).label.toUpperCase()} ·{" "}
            {getDivisionLabel(getRankTier(overall.tier), overall.division)}
          </p>
          <p className="text-[11px] text-muted-foreground">Rango medio</p>
        </PastelCard>
      )}

      {/* ── Contadores ──────────────────────────────────────────────── */}
      {profile.share_stats && (
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
      )}

      {/* ── Rangos ──────────────────────────────────────────────────── */}
      {!profile.share_ranks ? (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-8 text-center">
          <Lock className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {profile.display_name} no comparte sus rangos.
          </p>
        </div>
      ) : overall ? (
        <>
          <BodyRankSummary
            ranks={ranks}
            muscleRanks={muscleRanks}
            title="SU CUERPO POR RANGO"
          />

          <section className="rounded-3xl border border-border bg-surface px-4 py-1">
            {ranks.map((r) => (
              <GroupRankRow key={r.muscle} rank={r} />
            ))}
          </section>
        </>
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-8 text-center">
          <Lock className="size-6 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Todavía no tiene rangos: necesita al menos {MIN_SESSIONS_TO_RANK}{" "}
            sesiones registradas.
          </p>
        </div>
      )}
    </div>
  );
}
