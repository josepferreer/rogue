import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// La zona autenticada es todo lo que cuelga de /app. El resto (landing "/",
// /login, /api, assets) es publico.
const APP_PREFIX = "/app";

// Next.js 16 renombro "middleware" a "proxy" (mismo mecanismo). Ademas de
// refrescar el token de sesion de Supabase en cada request (para que las
// cookies no caduquen), hace de guard de autenticacion en servidor: asi el
// usuario deslogueado cae en /login sin el parpadeo que producia el redirect
// en cliente al abrir la PWA.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Sin variables de entorno de Supabase no hay sesion que refrescar: dejamos
  // pasar la request para que el layout muestre la pantalla de setup en vez de
  // reventar aqui creando el cliente con credenciales undefined.
  if (!isSupabaseConfigured()) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAppZone =
    pathname === APP_PREFIX || pathname.startsWith(`${APP_PREFIX}/`);

  // Deslogueado en la zona /app -> a login (en servidor, sin flash).
  if (!user && isAppZone) {
    return redirectKeepingCookies(request, response, "/login");
  }
  // Logueado que intenta ver /login -> a la app. El onboarding (perfil sin
  // completar) lo sigue resolviendo OnboardingGate en cliente, que necesita
  // leer el perfil ya hidratado y evita una query extra por request aqui.
  if (user && pathname === "/login") {
    return redirectKeepingCookies(request, response, "/app");
  }

  return response;
}

/**
 * Redirige preservando las cookies de sesion que Supabase pudo refrescar en
 * `response` (si se pierden, el usuario quedaria deslogueado tras el redirect).
 */
function redirectKeepingCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";
  const redirect = NextResponse.redirect(url);
  for (const cookie of response.cookies.getAll()) {
    redirect.cookies.set(cookie);
  }
  return redirect;
}

export const config = {
  matcher: [
    // Excluimos assets estaticos (incluida cualquier ruta con extension de
    // imagen/fuente como /brand/*.png): si no, el guard de auth redirigiria
    // esas peticiones a /login y no cargarian, p.ej. el logo del propio login.
    "/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf)$).*)",
  ],
};
