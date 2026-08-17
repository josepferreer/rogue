"use client";

import { useEffect, useState } from "react";
import { AlarmClock, Check } from "lucide-react";
import { PastelCard } from "@/components/ui/pastel-card";
import { Button } from "@/components/ui/button";
import {
  canScheduleExact,
  openExactAlarmSettings,
} from "@/lib/notifications/noa-reminders";
import { Capacitor } from "@capacitor/core";

/**
 * Permiso de alarmas exactas (Android 12+). Vive en Perfil > Ajustes > NOA.
 *
 * Sin este permiso los recordatorios de NOA llegan, pero Android los agrupa
 * para ahorrar bateria y pueden retrasarse 10-15 minutos con el movil en
 * reposo: un "avisame en 5 minutos" deja de tener sentido.
 *
 * No se pide sola al programar un aviso a proposito: abrir esa pantalla
 * REINICIA la app (y borra las alarmas exactas ya programadas), asi que tiene
 * que ser el usuario quien decida cuando hacerlo.
 */
export function NoaExactAlarmCard() {
  /**
   * `null` = todavia sin respuesta, que es tambien el estado permanente en
   * navegador: alli el efecto sale antes de preguntar nada. Un segundo estado
   * "soy nativo" seria redundante --y ademas obligaba a un setState sincrono
   * dentro del efecto, que es justo lo que no hay que hacer.
   */
  const [granted, setGranted] = useState<boolean | null>(null);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    // No necesita catch: canScheduleExact resuelve siempre (ver su try/catch).
    canScheduleExact().then((ok) => {
      if (alive) setGranted(ok);
    });
    return () => {
      alive = false;
    };
  }, []);

  // En navegador los recordatorios no existen: no hay nada que configurar.
  if (granted === null) return null;

  if (granted) {
    return (
      <PastelCard variant="neutral" className="flex items-center gap-3 p-4">
        <Check className="size-5 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Los recordatorios de NOA llegan a la hora exacta.
        </p>
      </PastelCard>
    );
  }

  return (
    <PastelCard variant="neutral" className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <AlarmClock className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium">Avisos puntuales</p>
          <p className="text-xs text-muted-foreground">
            Android está agrupando los recordatorios para ahorrar batería, así
            que pueden llegar hasta 15 minutos tarde. Actívalos como alarma para
            que suenen a la hora que pidas.
          </p>
        </div>
      </div>
      <Button variant="ghost" onClick={() => void openExactAlarmSettings()}>
        Abrir ajustes de Android
      </Button>
      <p className="px-1 text-[11px] text-muted-foreground">
        Se abrirá «Alarmas y recordatorios». Al volver, la app se reinicia: es
        cosa de Android, no se ha roto nada.
      </p>
    </PastelCard>
  );
}
