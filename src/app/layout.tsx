import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { SetupNotice } from "@/components/setup-notice";
import { getMissingSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";

/**
 * Layout de lo unico que queda servido desde aqui: la landing y la API de NOA.
 *
 * Este proyecto ERA la app: una PWA en /app envuelta en Capacitor para Android.
 * Ya no. La app es Rogue v2, nativa (React Native), y esto se queda como la
 * pagina de presentacion mas el backend del asistente. Por eso se fueron el
 * service worker, el manifiesto y el sincronizador de la barra de estado: no
 * tienen a quien servir.
 */

// Plus Jakarta Sans y JetBrains Mono, las MISMAS que usa la app. La landing
// ensena la app: si no comparten tipografia, la promesa no se sostiene.
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jbmono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const DESCRIPCION =
  "Rutinas con progresión de cargas, 374 ejercicios en castellano, comidas por " +
  "código de barras con sus macros y rutas de cardio con mapa. Aplicación Android.";

export const metadata: Metadata = {
  // metadataBase existe para que las rutas relativas de las imagenes de abajo
  // se resuelvan a URL absolutas: Open Graph no admite rutas relativas.
  metadataBase: new URL("https://rogue-two.vercel.app"),
  applicationName: "Rogue",
  title: {
    default: "Rogue · Entrena, come y registra tu progreso",
    template: "%s · Rogue",
  },
  // Con tildes. La descripcion las llevaba sin poner mientras el resto de la
  // pagina si, y es el texto que sale en Google.
  description: DESCRIPCION,
  formatDetection: { telephone: false },
  /*
    ANTES NO HABIA NADA DE ESTO, y el enlace se comparte mucho: sin Open Graph,
    pegar rogue-two.vercel.app en WhatsApp o Telegram salia como una URL pelada,
    sin titulo, sin imagen y sin una linea que dijera que es.

    La imagen es el logotipo y la tarjeta se declara "summary" --la pequena y
    cuadrada-- a proposito, porque el fichero es cuadrado (1920x1920). Pedir
    "summary_large_image" con una imagen cuadrada la recorta por arriba y por
    abajo. El dia que haya una ilustracion apaisada de 1200x630 se cambian las
    dos cosas a la vez.
  */
  openGraph: {
    type: "website",
    locale: "es_ES",
    siteName: "Rogue",
    title: "Rogue · Entrena, come y registra tu progreso",
    description: DESCRIPCION,
    url: "/",
    images: [{ url: "/brand/logo-full-black.png", width: 1920, height: 1920, alt: "Rogue" }],
  },
  twitter: {
    card: "summary",
    title: "Rogue · Entrena, come y registra tu progreso",
    description: DESCRIPCION,
    images: ["/brand/logo-full-black.png"],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Se permite el zoom: bloquearlo incumple WCAG 1.4.4 y deja sin ampliar a
  // quien lo necesita.
  maximumScale: 5,
  userScalable: true,
  // Los dos de la paleta "Clean" de la app, para que la barra del navegador en
  // movil no desentone con la pagina.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F2ECEA" },
    { media: "(prefers-color-scheme: dark)", color: "#131016" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const missingEnv = getMissingSupabaseEnv();

  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${jakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased" suppressHydrationWarning>
        {missingEnv.length > 0 ? (
          <SetupNotice missing={missingEnv} />
        ) : (
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            {children}
          </ThemeProvider>
        )}
      </body>
    </html>
  );
}
