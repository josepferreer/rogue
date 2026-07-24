"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

// --- Tipos ---

export type FriendshipStatus = "pending" | "accepted";
export type FriendshipDirection = "incoming" | "outgoing";

/** Fila devuelta por la RPC my_friendships(): la amistad ya resuelta desde mi
 *  punto de vista (quien es "el otro" y si la solicitud la envie o la recibi). */
export type Friendship = {
  id: string;
  otherId: string;
  otherUsername: string;
  otherDisplayName: string;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  createdAt: string;
};

export type UserSearchResult = {
  userId: string;
  username: string;
  displayName: string;
};

/** Codigos que devuelve send_friend_request, ya traducidos a mensaje. */
const SEND_MESSAGES: Record<string, string> = {
  sent: "Solicitud enviada.",
  auto_accepted: "¡Ya sois amigos! Esa persona te había invitado.",
  already_friends: "Ya sois amigos.",
  already_sent: "Ya le enviaste una solicitud.",
  not_found: "No existe ningún usuario con ese nombre.",
  self: "No puedes enviarte una solicitud a ti mismo.",
  blocked: "No se pudo enviar la solicitud.",
  not_authenticated: "Inicia sesión para enviar solicitudes.",
};

export type SendResult = { ok: boolean; message: string };

export type FriendsContextValue = {
  hydrated: boolean;
  /** Amistades aceptadas. */
  friends: Friendship[];
  /** Solicitudes que me han enviado y estan pendientes de respuesta. */
  incoming: Friendship[];
  /** Solicitudes que he enviado yo y siguen pendientes. */
  outgoing: Friendship[];
  /** Atajo para el badge de "tienes solicitudes". */
  pendingCount: number;
  sendRequest: (username: string) => Promise<SendResult>;
  acceptRequest: (id: string) => Promise<void>;
  /** Rechaza una solicitud recibida, cancela una enviada o elimina un amigo:
   *  las tres cosas borran la fila. */
  removeFriendship: (id: string) => Promise<void>;
  searchUsers: (query: string) => Promise<UserSearchResult[]>;
};

const FriendsContext = createContext<FriendsContextValue | null>(null);

type RpcRow = {
  id: string;
  other_id: string;
  other_username: string;
  other_display_name: string;
  status: FriendshipStatus;
  direction: FriendshipDirection;
  created_at: string;
};

function toFriendship(r: RpcRow): Friendship {
  return {
    id: r.id,
    otherId: r.other_id,
    otherUsername: r.other_username,
    otherDisplayName: r.other_display_name,
    status: r.status,
    direction: r.direction,
    createdAt: r.created_at,
  };
}

export function FriendsProvider({ children }: { children: React.ReactNode }) {
  const [supabase] = useState(() => createClient());
  const pathname = usePathname();

  const [items, setItems] = useState<Friendship[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const userIdRef = useRef<string | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("my_friendships");
    if (error) {
      console.error("No se pudieron cargar las amistades:", error);
      return;
    }
    setItems(((data ?? []) as RpcRow[]).map(toFriendship));
  }, [supabase]);

  // Carga inicial + suscripcion Realtime. Se re-comprueba en cada navegacion
  // porque el login va por Server Actions y este cliente no se entera solo,
  // pero la suscripcion solo se crea UNA vez por usuario (userIdRef).
  useEffect(() => {
    let active = true;

    async function setup() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!active) return;

      if (!user) {
        userIdRef.current = null;
        if (channelRef.current) {
          supabase.removeChannel(channelRef.current);
          channelRef.current = null;
        }
        setItems([]);
        setHydrated(true);
        return;
      }

      // Mismo usuario ya suscrito: nada que rehacer.
      if (user.id === userIdRef.current) {
        setHydrated(true);
        return;
      }

      userIdRef.current = user.id;
      await refresh();
      if (!active) return;
      setHydrated(true);

      if (channelRef.current) supabase.removeChannel(channelRef.current);

      // Dos filtros porque puedo ser el solicitante O el destinatario. Ante
      // cualquier cambio se REFRESCA con la RPC en vez de aplicar el payload:
      // el evento crudo no trae el username del otro, y asi no hay estados
      // parciales ni divergencias.
      channelRef.current = supabase
        .channel(`friendships:${user.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friendships",
            filter: `requester_id=eq.${user.id}`,
          },
          () => refresh(),
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "friendships",
            filter: `addressee_id=eq.${user.id}`,
          },
          () => refresh(),
        )
        .subscribe();
    }

    setup();
    return () => {
      active = false;
    };
  }, [pathname, supabase, refresh]);

  // Cierra el canal al desmontar del todo (no en cada navegacion).
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [supabase]);

  const sendRequest = useCallback(
    async (username: string): Promise<SendResult> => {
      const clean = username.trim();
      if (!clean) return { ok: false, message: "Escribe un nombre de usuario." };

      const { data, error } = await supabase.rpc("send_friend_request", {
        p_username: clean,
      });
      if (error) {
        console.error("Error al enviar solicitud:", error);
        return { ok: false, message: "No se pudo enviar la solicitud." };
      }
      const res = data as { ok: boolean; code: string };
      // Refresco inmediato: el Realtime tambien llegara, pero asi la UI no
      // espera al round-trip del socket.
      if (res.ok) await refresh();
      return {
        ok: res.ok,
        message: SEND_MESSAGES[res.code] ?? "No se pudo enviar la solicitud.",
      };
    },
    [supabase, refresh],
  );

  const acceptRequest = useCallback(
    async (id: string) => {
      // Optimista: la solicitud pasa a amistad al instante.
      setItems((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "accepted" } : f)),
      );
      const { error } = await supabase.rpc("respond_friend_request", {
        p_id: id,
        p_accept: true,
      });
      if (error) console.error("Error al aceptar la solicitud:", error);
      await refresh();
    },
    [supabase, refresh],
  );

  const removeFriendship = useCallback(
    async (id: string) => {
      setItems((prev) => prev.filter((f) => f.id !== id));
      const { error } = await supabase.rpc("respond_friend_request", {
        p_id: id,
        p_accept: false,
      });
      if (error) console.error("Error al eliminar la amistad:", error);
      await refresh();
    },
    [supabase, refresh],
  );

  const searchUsers = useCallback(
    async (query: string): Promise<UserSearchResult[]> => {
      const clean = query.trim();
      if (clean.length < 2) return [];
      const { data, error } = await supabase.rpc("search_users", {
        p_query: clean,
      });
      if (error) {
        console.error("Error al buscar usuarios:", error);
        return [];
      }
      return (
        (data ?? []) as { user_id: string; username: string; display_name: string }[]
      ).map((u) => ({
        userId: u.user_id,
        username: u.username,
        displayName: u.display_name,
      }));
    },
    [supabase],
  );

  const { friends, incoming, outgoing } = useMemo(() => {
    const friends: Friendship[] = [];
    const incoming: Friendship[] = [];
    const outgoing: Friendship[] = [];
    for (const f of items) {
      if (f.status === "accepted") friends.push(f);
      else if (f.direction === "incoming") incoming.push(f);
      else outgoing.push(f);
    }
    return { friends, incoming, outgoing };
  }, [items]);

  const value = useMemo<FriendsContextValue>(
    () => ({
      hydrated,
      friends,
      incoming,
      outgoing,
      pendingCount: incoming.length,
      sendRequest,
      acceptRequest,
      removeFriendship,
      searchUsers,
    }),
    [
      hydrated,
      friends,
      incoming,
      outgoing,
      sendRequest,
      acceptRequest,
      removeFriendship,
      searchUsers,
    ],
  );

  return (
    <FriendsContext.Provider value={value}>{children}</FriendsContext.Provider>
  );
}

export function useFriends(): FriendsContextValue {
  const ctx = useContext(FriendsContext);
  if (!ctx) throw new Error("useFriends debe usarse dentro de FriendsProvider");
  return ctx;
}
