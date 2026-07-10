"use server";

import { redirect } from "next/navigation";
import { createClient } from "./server";

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
    const { data } = await supabase.rpc("email_for_username", {
      p_username: identifier,
    });
    // No revelamos si el username existe o no: mismo error generico.
    if (!data) return { error: "Usuario/email o contrasena incorrectos." };
    email = data;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Usuario/email o contrasena incorrectos." };

  redirect("/");
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
    return { error: "La contrasena debe tener al menos 8 caracteres." };
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
    return { error: error.message };
  }

  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
