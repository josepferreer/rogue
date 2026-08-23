"use client";

import { createPortal } from "react-dom";
import { useAppShellPortal } from "@/lib/use-app-shell-portal";
import { useFocusTrap } from "@/lib/use-focus-trap";
import { useEscapeToClose } from "@/lib/use-escape-to-close";
import { usePresence } from "@/lib/use-presence";

type Props = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmacion para acciones destructivas (descartar entreno, borrar dia...). */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancelar",
  onConfirm,
  onCancel,
}: Props) {
  const portalTarget = useAppShellPortal();
  const { mounted, state } = usePresence(open);
  useEscapeToClose(open, onCancel);
  // El dialogo declara aria-modal: el foco tiene que quedarse dentro de verdad.
  const panelRef = useFocusTrap<HTMLDivElement>(open);

  if (!mounted) return null;

  const content = (
    <div
      className="overlay-anim absolute inset-0 z-[60] flex items-center justify-center px-8"
      data-state={state}
      onClick={onCancel}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        className="dialog-anim w-full rounded-3xl border border-border bg-surface p-5 shadow-2xl md:max-w-sm"
        data-state={state}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-base font-semibold">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-full border border-border py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-full bg-destructive py-3 text-sm font-medium text-destructive-foreground transition-transform active:scale-[0.98]"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
}
