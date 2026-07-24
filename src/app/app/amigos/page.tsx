"use client";

import { useEffect, useState } from "react";
import {
  Check,
  Search,
  UserPlus,
  UserX,
  Users,
  X,
} from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import {
  useFriends,
  type Friendship,
  type UserSearchResult,
} from "@/lib/store/friends-store";

/** Iniciales para el avatar de marcador de posicion. */
function initials(name: string) {
  return name.trim().slice(0, 2).toUpperCase();
}

function Avatar({ name }: { name: string }) {
  return (
    <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted font-mono text-xs font-semibold text-muted-foreground">
      {initials(name)}
    </span>
  );
}

function PersonRow({
  displayName,
  username,
  children,
}: {
  displayName: string;
  username: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3">
      <Avatar name={displayName} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{displayName}</p>
        <p className="truncate font-mono text-xs text-muted-foreground">
          @{username}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

type Tab = "amigos" | "solicitudes" | "buscar";

export default function AmigosPage() {
  const {
    hydrated,
    friends,
    incoming,
    outgoing,
    pendingCount,
    sendRequest,
    acceptRequest,
    removeFriendship,
    searchUsers,
  } = useFriends();
  const { notify } = useToast();

  const [tab, setTab] = useState<Tab>("amigos");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  // Amistad pendiente de confirmar borrado (null = dialogo cerrado).
  const [pendingRemove, setPendingRemove] = useState<Friendship | null>(null);

  // Busqueda con debounce: evita una consulta por pulsacion. Todo el setState
  // ocurre dentro del timeout (nunca en el cuerpo del efecto) y los resultados
  // visibles se DERIVAN de la query, asi no hace falta "limpiarlos" a mano.
  useEffect(() => {
    const clean = query.trim();
    if (clean.length < 2) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      setSearching(true);
      const found = await searchUsers(clean);
      if (cancelled) return;
      setResults(found);
      setSearching(false);
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [query, searchUsers]);

  const queryReady = query.trim().length >= 2;
  // Resultados/estado derivados: si la query es corta, no se muestra nada
  // aunque queden resultados de una busqueda anterior.
  const visibleResults = queryReady ? results : [];
  const isSearching = queryReady && searching;

  async function onSend(username: string) {
    const res = await sendRequest(username);
    notify(res.message, res.ok ? "success" : "error");
    if (res.ok) setQuery("");
  }

  // Ids ya relacionados, para no ofrecer "añadir" a quien ya es amigo o tiene
  // una solicitud en curso.
  const relatedIds = new Set(
    [...friends, ...incoming, ...outgoing].map((f) => f.otherId),
  );

  const TABS: { id: Tab; label: string; badge?: number }[] = [
    { id: "amigos", label: "Amigos", badge: friends.length || undefined },
    { id: "solicitudes", label: "Solicitudes", badge: pendingCount || undefined },
    { id: "buscar", label: "Buscar" },
  ];

  return (
    <div className="flex flex-col gap-5 pt-2 pb-24">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Amigos</h1>
        <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
          CONEXIONES
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              "flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors " +
              (tab === t.id
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:text-foreground")
            }
          >
            {t.label}
            {t.badge !== undefined && (
              <span
                className={
                  "rounded-full px-1.5 py-0.5 font-mono text-[10px] " +
                  (tab === t.id ? "bg-background/20" : "bg-background/60")
                }
              >
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {!hydrated ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Cargando…
        </p>
      ) : (
        <>
          {/* ── Amigos ────────────────────────────────────────────────── */}
          {tab === "amigos" && (
            <div className="flex flex-col gap-2.5">
              {friends.length === 0 ? (
                <div className="flex flex-col items-center gap-2 rounded-3xl border border-dashed border-border p-8 text-center">
                  <Users className="size-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Aún no tienes amigos.
                  </p>
                  <button
                    type="button"
                    onClick={() => setTab("buscar")}
                    className="mt-1 rounded-full bg-foreground px-4 py-2 text-xs font-semibold text-background"
                  >
                    Buscar personas
                  </button>
                </div>
              ) : (
                friends.map((f) => (
                  <PersonRow
                    key={f.id}
                    displayName={f.otherDisplayName}
                    username={f.otherUsername}
                  >
                    <button
                      type="button"
                      onClick={() => setPendingRemove(f)}
                      aria-label={`Eliminar a ${f.otherDisplayName}`}
                      className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <UserX className="size-4" />
                    </button>
                  </PersonRow>
                ))
              )}
            </div>
          )}

          {/* ── Solicitudes ───────────────────────────────────────────── */}
          {tab === "solicitudes" && (
            <div className="flex flex-col gap-5">
              <section className="flex flex-col gap-2.5">
                <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                  RECIBIDAS
                </p>
                {incoming.length === 0 ? (
                  <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No tienes solicitudes pendientes.
                  </p>
                ) : (
                  incoming.map((f) => (
                    <PersonRow
                      key={f.id}
                      displayName={f.otherDisplayName}
                      username={f.otherUsername}
                    >
                      <button
                        type="button"
                        onClick={async () => {
                          await acceptRequest(f.id);
                          notify(`Ahora eres amigo de ${f.otherDisplayName}.`, "success");
                        }}
                        aria-label={`Aceptar a ${f.otherDisplayName}`}
                        className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform active:scale-95"
                      >
                        <Check className="size-4" />
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeFriendship(f.id);
                          notify("Solicitud rechazada.", "info");
                        }}
                        aria-label={`Rechazar a ${f.otherDisplayName}`}
                        className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </PersonRow>
                  ))
                )}
              </section>

              <section className="flex flex-col gap-2.5">
                <p className="font-mono text-xs tracking-[0.2em] text-muted-foreground">
                  ENVIADAS
                </p>
                {outgoing.length === 0 ? (
                  <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                    No has enviado ninguna solicitud.
                  </p>
                ) : (
                  outgoing.map((f) => (
                    <PersonRow
                      key={f.id}
                      displayName={f.otherDisplayName}
                      username={f.otherUsername}
                    >
                      <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                        PENDIENTE
                      </span>
                      <button
                        type="button"
                        onClick={async () => {
                          await removeFriendship(f.id);
                          notify("Solicitud cancelada.", "info");
                        }}
                        aria-label={`Cancelar solicitud a ${f.otherDisplayName}`}
                        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-4" />
                      </button>
                    </PersonRow>
                  ))
                )}
              </section>
            </div>
          )}

          {/* ── Buscar ────────────────────────────────────────────────── */}
          {tab === "buscar" && (
            <div className="flex flex-col gap-3">
              <label className="flex items-center gap-2 rounded-2xl bg-muted px-4 py-3">
                <Search className="size-4 shrink-0 text-muted-foreground" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Nombre de usuario…"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </label>

              {query.trim().length > 0 && query.trim().length < 2 && (
                <p className="text-center text-xs text-muted-foreground">
                  Escribe al menos 2 caracteres.
                </p>
              )}

              {isSearching && (
                <p className="text-center text-sm text-muted-foreground">
                  Buscando…
                </p>
              )}

              {!isSearching && queryReady && visibleResults.length === 0 && (
                <p className="rounded-3xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Ningún usuario coincide con «{query.trim()}».
                </p>
              )}

              {visibleResults.map((u) => {
                const yaRelacionado = relatedIds.has(u.userId);
                return (
                  <PersonRow
                    key={u.userId}
                    displayName={u.displayName}
                    username={u.username}
                  >
                    {yaRelacionado ? (
                      <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
                        YA AÑADIDO
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSend(u.username)}
                        aria-label={`Enviar solicitud a ${u.displayName}`}
                        className="flex size-9 items-center justify-center rounded-full bg-accent text-accent-foreground transition-transform active:scale-95"
                      >
                        <UserPlus className="size-4" />
                      </button>
                    )}
                  </PersonRow>
                );
              })}
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={pendingRemove !== null}
        title="¿Eliminar amistad?"
        description={
          pendingRemove
            ? `${pendingRemove.otherDisplayName} dejará de ser tu amigo. Podréis volver a añadiros más adelante.`
            : ""
        }
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const f = pendingRemove;
          setPendingRemove(null);
          if (f) {
            await removeFriendship(f.id);
            notify("Amistad eliminada.", "info");
          }
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
}
