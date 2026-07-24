"use client";

import Link from "next/link";
import { ArrowRight, UserPlus } from "lucide-react";
import { useFriends } from "@/lib/store/friends-store";
import { getRankTier } from "@/lib/ranks";

function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

/**
 * Tira horizontal de amigos para la home. Cada avatar lleva un punto con el
 * color de su rango medio (cacheado en `profiles`, ver la RPC friends_ranks);
 * quien no comparte rangos o aun no tiene sale sin punto.
 */
export function FriendsStrip() {
  const { hydrated, friends, ranks, pendingCount } = useFriends();

  // Antes de hidratar no se pinta nada: un esqueleto aqui solo haria saltar el
  // layout de la home un instante.
  if (!hydrated) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          AMIGOS
        </p>
        <Link
          href="/app/amigos"
          className="flex items-center gap-1 rounded-full py-2 pl-2 pr-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          {pendingCount > 0 ? (
            <>
              <span className="flex size-4 items-center justify-center rounded-full bg-destructive font-mono text-[10px] font-semibold text-destructive-foreground">
                {pendingCount}
              </span>
              Solicitudes
            </>
          ) : (
            "Ver todo"
          )}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>

      <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 py-1">
        <Link
          href="/app/amigos?tab=buscar"
          className="flex min-w-[60px] flex-col items-center gap-1.5"
        >
          <span className="flex size-14 items-center justify-center rounded-full border border-dashed border-border text-muted-foreground">
            <UserPlus className="size-5" />
          </span>
          <p className="max-w-[60px] truncate text-[11px] text-muted-foreground">
            Añadir
          </p>
        </Link>

        {friends.map((f) => {
          const rank = ranks[f.otherId];
          const tier = rank?.tier ? getRankTier(rank.tier) : null;

          return (
            <Link
              key={f.id}
              href={`/app/amigos/${encodeURIComponent(f.otherUsername)}`}
              className="flex min-w-[60px] flex-col items-center gap-1.5"
              title={
                tier ? `${f.otherDisplayName} · ${tier.label}` : f.otherDisplayName
              }
            >
              <span className="relative">
                <span className="flex size-14 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold text-muted-foreground">
                  {initials(f.otherDisplayName)}
                </span>
                {rank?.tier && (
                  <span
                    aria-hidden
                    className="absolute bottom-0 right-0 size-4 rounded-full ring-2 ring-background"
                    style={{ background: `var(--rank-${rank.tier})` }}
                  />
                )}
              </span>
              <p className="max-w-[60px] truncate text-[11px] font-medium">
                {f.otherUsername}
              </p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
