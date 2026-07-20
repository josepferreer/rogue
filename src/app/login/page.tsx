"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/supabase/actions";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { InstallPwaButton } from "@/components/install-pwa-button";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  return (
    <div className="relative mx-auto flex min-h-dvh w-full flex-col justify-center bg-background px-6 py-10 md:max-w-sm">
      {/* Marca de agua: solo el simbolo, grande, muy tenue y difuminado. El
          contenido va en una capa z-10 por encima. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-mark-black.png"
          alt=""
          className="w-80 max-w-[90%] opacity-[0.08] blur-[2px] dark:hidden"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/logo-mark-white.png"
          alt=""
          className="hidden w-80 max-w-[90%] opacity-[0.10] blur-[2px] dark:block"
        />
      </div>

      <div className="relative z-10 mb-8">
        <h1 className="text-xl font-semibold tracking-tight">
          Sube de rango
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "login"
            ? "Registra cada entreno y escala de Principiante a Maestro, musculo a musculo."
            : "Crea tu cuenta y empieza a subir de rango desde tu primera serie."}
        </p>
      </div>

      <div className="relative z-10 mb-6 flex rounded-full border border-border p-1">
        <button
          type="button"
          onClick={() => setMode("login")}
          className={cn(
            "flex-1 rounded-full py-2 text-sm font-medium transition-colors",
            mode === "login"
              ? "bg-foreground text-background"
              : "text-muted-foreground",
          )}
        >
          Iniciar sesion
        </button>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={cn(
            "flex-1 rounded-full py-2 text-sm font-medium transition-colors",
            mode === "signup"
              ? "bg-foreground text-background"
              : "text-muted-foreground",
          )}
        >
          Crear cuenta
        </button>
      </div>

      <form action={formAction} className="relative z-10 flex flex-col gap-4">
        {mode === "login" ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="identifier" className="text-sm text-muted-foreground">
              Email o usuario
            </label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base outline-none focus:border-foreground"
            />
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="username" className="text-sm text-muted-foreground">
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                required
                minLength={3}
                maxLength={20}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="username"
                className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base outline-none focus:border-foreground"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm text-muted-foreground">
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base outline-none focus:border-foreground"
              />
            </div>
          </>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm text-muted-foreground">
            Contrasena
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-base outline-none focus:border-foreground"
          />
        </div>

        {state?.error && (
          <p className="text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" fullWidth disabled={pending} className="mt-2">
          {pending
            ? "Un momento..."
            : mode === "login"
              ? "Iniciar sesion"
              : "Crear cuenta"}
        </Button>
      </form>

      <div className="relative z-10">
        <InstallPwaButton />
      </div>
    </div>
  );
}
