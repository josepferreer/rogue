"use client";

import { useActionState, useState } from "react";
import { signIn, signUp, type AuthState } from "@/lib/supabase/actions";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const action = mode === "login" ? signIn : signUp;
  const [state, formAction, pending] = useActionState<AuthState, FormData>(
    action,
    undefined,
  );

  return (
    <div className="mx-auto flex w-full flex-1 flex-col justify-center px-6 py-10 md:max-w-sm">
      <h1 className="mb-1 text-2xl font-semibold">Rogue</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        {mode === "login"
          ? "Inicia sesion para ver tus rangos y tu historial."
          : "Crea una cuenta para guardar tu progreso."}
      </p>

      <div className="mb-6 flex rounded-full border border-border p-1">
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

      <form action={formAction} className="flex flex-col gap-4">
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

        <button
          type="submit"
          disabled={pending}
          className="mt-2 rounded-full bg-foreground py-3 text-sm font-medium text-background disabled:opacity-60"
        >
          {pending
            ? "Un momento..."
            : mode === "login"
              ? "Iniciar sesion"
              : "Crear cuenta"}
        </button>
      </form>
    </div>
  );
}
