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

export const metadata: Metadata = {
  applicationName: "Rogue",
  title: {
    default: "Rogue · Entrena, come y registra tu progreso",
    template: "%s · Rogue",
  },
  description:
    "Rutinas y biblioteca de ejercicios, comidas por codigo de barras con sus macros, y rutas de cardio con mapa. Aplicacion Android.",
  formatDetection: { telephone: false },
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
