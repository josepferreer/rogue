import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Cliente de Supabase para Server Components/Actions. Debe crearse por
 * request (no reutilizar la instancia) porque lee las cookies de la request
 * actual via next/headers.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Llamado desde un Server Component: un proxy en curso ya
            // refresca la sesion, se puede ignorar.
          }
        },
      },
    },
  );
}

/**
 * Cliente autenticado con un token en la cabecera, para clientes SIN cookies.
 *
 * La app movil (Rogue v2, React Native) no tiene cookies de este dominio, asi
 * que no puede usar `createClient()`. Manda su token de Supabase en
 * `Authorization: Bearer` y aqui se construye un cliente que lo arrastra en
 * cada consulta.
 *
 * IMPORTANTE: se usa la clave PUBLICA, no la de servicio. La seguridad de NOA
 * es la RLS de Supabase --una herramienta no puede leer datos de otro usuario
 * porque la fila no le pertenece--, y la clave de servicio se la saltaria
 * entera, convirtiendo cada herramienta en una puerta abierta a la base.
 *
 * Sin sesion persistida ni refresco automatico: esto vive lo que dura una
 * peticion, y en el servidor no hay donde guardar nada.
 */
export function createBearerClient(accessToken: string) {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}
