"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { Check, Send, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { dispatchNoaAction } from "@/lib/noa/client/dispatch";
import { Markdown } from "@/lib/noa/client/markdown";
import type {
  NoaClientAction,
  NoaProposedAction,
  NoaResponse,
  NoaTurn,
} from "@/lib/noa/types";

/**
 * NOA — superficie de chat global (lanzador + hoja). Se monta una vez en el
 * layout de /app. Habla con `/api/noa`, pinta la respuesta, ejecuta las
 * acciones seguras y ofrece confirmar las que lo requieren.
 *
 * Es un primer chat mínimo para probar el engine end-to-end con el módulo
 * Training; el diseño visual y la persistencia de la conversación son TODO.
 */
export function Noa() {
  const [open, setOpen] = useState(false);
  const portalTarget = useAppShellPortal();
  const pathname = usePathname();

  // Onboarding gestiona su propio layout sin navegación: NOA no pinta ahí.
  if (pathname.startsWith("/app/onboarding")) return null;
  if (!portalTarget) return null;

  return createPortal(
    open ? (
      <NoaSheet onClose={() => setOpen(false)} />
    ) : (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Abrir NOA"
        className="absolute bottom-24 right-4 z-50 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-lg transition-transform active:scale-95"
      >
        <Sparkles className="size-6" />
      </button>
    ),
    portalTarget,
  );
}

function NoaSheet({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { notify } = useToast();
  const [turns, setTurns] = useState<NoaTurn[]>([]);
  const [pending, setPending] = useState<NoaProposedAction[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [turns, pending]);

  function dispatch(action: NoaClientAction) {
    dispatchNoaAction(action, {
      navigate: (path) => {
        onClose();
        router.push(path);
      },
      notify,
    });
  }

  async function send() {
    const message = input.trim();
    if (!message || busy) return;

    const history = turns;
    setTurns((t) => [...t, { role: "user", content: message }]);
    setInput("");
    setPending([]);
    setBusy(true);

    try {
      const res = await fetch("/api/noa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message, history }),
      });
      // El engine ya devuelve 200 con un `reply` explicativo cuando algo falla
      // por dentro. Lo que llega aqui como no-OK es el guard de la route, y
      // cada caso merece su mensaje en vez de un "intentalo de nuevo" a secas.
      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", content: httpErrorMessage(res.status) },
        ]);
        return;
      }
      const data = (await res.json()) as NoaResponse;

      setTurns((t) => [
        ...t,
        { role: "assistant", content: data.reply || "…" },
      ]);
      // Acciones seguras: se ejecutan al vuelo.
      for (const action of data.actions) dispatch(action);
      // Acciones que requieren confirmación.
      setPending(data.pending);
    } catch {
      setTurns((t) => [
        ...t,
        {
          role: "assistant",
          content: "No he podido responder ahora mismo. Inténtalo de nuevo.",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function confirm(proposal: NoaProposedAction) {
    // Quita la tarjeta en cuanto se acepta (evita doble pulsación).
    setPending((p) => p.filter((a) => a.id !== proposal.id));
    setBusy(true);
    try {
      const res = await fetch("/api/noa", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          confirm: { toolName: proposal.toolName, args: proposal.args },
        }),
      });
      if (!res.ok) {
        setTurns((t) => [
          ...t,
          { role: "assistant", content: httpErrorMessage(res.status) },
        ]);
        return;
      }
      const data = (await res.json()) as NoaResponse;
      if (data.reply) {
        setTurns((t) => [...t, { role: "assistant", content: data.reply }]);
      }
      for (const action of data.actions) dispatch(action);
    } catch {
      setTurns((t) => [
        ...t,
        { role: "assistant", content: "No he podido completar la acción." },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="absolute inset-0 z-[70] flex flex-col justify-end md:items-center md:justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="flex h-[80%] w-full flex-col rounded-t-3xl border border-border bg-surface md:max-w-md md:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <span className="flex items-center gap-2 text-base font-semibold">
            <Sparkles className="size-5" />
            NOA
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex size-10 items-center justify-center rounded-full hover:bg-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div ref={scrollRef} className="flex flex-1 flex-col gap-3 overflow-y-auto p-5">
          {turns.length === 0 && (
            <p className="m-auto max-w-[16rem] text-center text-sm text-muted-foreground">
              Pregúntame por tus entrenos. Ej.: «¿cuántos entrenos llevo?».
            </p>
          )}
          {turns.map((t, i) => (
            <div key={i} className={cnBubble(t.role)}>
              {t.role === "assistant" ? <Markdown text={t.content} /> : t.content}
            </div>
          ))}
          {pending.map((a) => (
            <div
              key={a.id}
              className="flex flex-col gap-2 self-start rounded-2xl border border-border bg-background p-3"
            >
              <p className="text-sm">{a.summary}</p>
              <Button onClick={() => confirm(a)} className="py-2">
                <Check className="size-4" />
                Confirmar
              </Button>
            </div>
          ))}
          {busy && (
            <div className={cnBubble("assistant")}>Pensando…</div>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") send();
            }}
            placeholder="Escribe a NOA…"
            disabled={busy}
            className="min-w-0 flex-1 rounded-full border border-border bg-background px-4 py-3 text-sm outline-none focus:border-foreground"
          />
          <button
            type="button"
            onClick={send}
            disabled={busy || input.trim().length === 0}
            aria-label="Enviar"
            className="flex size-11 shrink-0 items-center justify-center rounded-full bg-foreground text-background disabled:opacity-40"
          >
            <Send className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function cnBubble(role: NoaTurn["role"]): string {
  return role === "user"
    ? "max-w-[80%] self-end rounded-2xl bg-foreground px-4 py-2.5 text-sm text-background"
    : "max-w-[80%] self-start rounded-2xl bg-muted px-4 py-2.5 text-sm";
}

/** Mensaje para los fallos que corta el guard de la route, antes del engine. */
function httpErrorMessage(status: number): string {
  if (status === 401) return "Tu sesión ha caducado. Vuelve a entrar y seguimos.";
  if (status === 429)
    return "Vas muy rápido para mí: espera unos segundos y lo intentamos otra vez.";
  return "No he podido responder ahora mismo. Inténtalo de nuevo.";
}
