"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { NOTIFICATION_CARD_CLASS } from "./notification-stack";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info";

type Toast = {
  id: number;
  message: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  /** Muestra un aviso efimero (por defecto informativo). */
  notify: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_META: Record<
  ToastVariant,
  { icon: typeof Info; dot: string }
> = {
  success: { icon: CheckCircle2, dot: "text-green-500" },
  error: { icon: AlertCircle, dot: "text-red-500" },
  info: { icon: Info, dot: "text-muted-foreground" },
};

const AUTO_DISMISS_MS = 3200;

/** Sin suscripcion real: solo distingue servidor (false) de cliente (true). */
const subscribeNever = () => () => {};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // #notification-stack no existe cuando este provider se monta: HydrationGate
  // muestra un loader y solo monta AppShell (que lo contiene) tras hidratar. Por
  // eso NO se puede cachear el target una vez al montar (quedaria null para
  // siempre y los toasts nunca se pintarian). Se resuelve en cada render, ya con
  // el DOM listo; los toasts se disparan por interaccion, mucho despues.
  // false en SSR/hidratacion, true tras montar (mismo patron que SyncErrorToast).
  const mounted = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const portalTarget = mounted
    ? document.getElementById("notification-stack")
    : null;
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, variant: ToastVariant = "info") => {
      const id = ++idRef.current;
      setToasts((prev) => [...prev, { id, message, variant }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => ({ notify }), [notify]);

  const overlay =
    portalTarget && toasts.length > 0
      ? createPortal(
          <>
            {toasts.map((t) => {
              const meta = VARIANT_META[t.variant];
              const Icon = meta.icon;
              return (
                <div
                  key={t.id}
                  role="status"
                  className={cn(
                    NOTIFICATION_CARD_CLASS,
                    "[animation:toast-in_0.2s_ease-out]",
                  )}
                >
                  <Icon className={cn("size-5 shrink-0", meta.dot)} />
                  <p className="flex-1 text-sm font-medium">{t.message}</p>
                  <button
                    type="button"
                    onClick={() => dismiss(t.id)}
                    aria-label="Cerrar aviso"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              );
            })}
          </>,
          portalTarget,
        )
      : null;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {overlay}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx;
}
