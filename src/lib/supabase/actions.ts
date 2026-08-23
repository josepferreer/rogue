"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";
import { createAdminClient } from "./admin";

export type AuthState = { error?: string } | undefined;

export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const identifier = String(formData.get("identifier") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();

  let email = identifier;
  if (!identifier.includes("@")) {
    // Resolucion username -> email con la clave secreta (bypassa RLS), para
    // que este lookup no sea invocable por cualquiera con la clave publica
    // (evitaria enumerar usernames/emails validos). Nunca se devuelve el
    // email al navegador: solo se usa aqui, en el servidor, para el login.
    const admin = createAdminClient();
    const { data } = await admin
      .from("profiles")
      .select("email")
      .ilike("username", identifier)
      .maybeSingle();
    // No revelamos si el username existe o no: mismo error generico.
    if (!data) return { error: "Usuario/email o contraseña incorrectos." };
    email = data.email;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Usuario/email o contraseña incorrectos." };

  redirect("/app");
}

export async function signUp(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return {
      error: "El usuario debe tener 3-20 caracteres (letras, numeros, _).",
    };
  }
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { username } },
  });
  if (error) {
    if (error.message.includes("Database error")) {
      return { error: "Ese nombre de usuario ya esta en uso." };
    }
    // `error.message` viene de Supabase Auth en INGLES y acababa en pantalla
    // ("User already registered", "Password should be at least..."). Se traducen
    // los casos conocidos y el resto cae en un mensaje generico en español.
    const m = error.message.toLowerCase();
    if (m.includes("already registered") || m.includes("already been registered")) {
      return { error: "Ese email ya tiene una cuenta." };
    }
    if (m.includes("password")) {
      return { error: "La contraseña no cumple los requisitos minimos." };
    }
    if (m.includes("email") && m.includes("invalid")) {
      return { error: "El email no es valido." };
    }
    if (m.includes("rate limit") || m.includes("too many")) {
      return { error: "Demasiados intentos. Prueba dentro de un rato." };
    }
    return { error: "No se pudo crear la cuenta. Intentalo de nuevo." };
  }

  redirect("/app/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  // scope "local": solo limpia la sesion de este dispositivo (borra las
  // cookies). Evita la revocacion "global", que hace una llamada de red para
  // invalidar TODAS las sesiones del usuario y bloqueaba el cierre de sesion
  // (lento en PWA/movil). El try/catch garantiza que un fallo de red no impida
  // el redirect: las cookies ya se han limpiado y el proxy hara de guard.
  try {
    await supabase.auth.signOut({ scope: "local" });
  } catch {
    // Ignorado a proposito: seguimos al redirect igualmente.
  }
  redirect("/login");
}
