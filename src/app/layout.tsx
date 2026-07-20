import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeColorSync } from "@/components/theme-color-sync";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { SetupNotice } from "@/components/setup-notice";
import { getMissingSupabaseEnv } from "@/lib/supabase/env";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  applicationName: "Rogue",
  title: {
    default: "Rogue - Entrena, come y registra tu progreso",
    template: "%s · Rogue",
  },
  description:
    "Controla tus rutinas y biblioteca de ejercicios, escanea alimentos por codigo de barras con sus macros y registra tus rutas de cardio. Todo en una PWA.",
  appleWebApp: {
    capable: true,
    title: "Rogue",
    statusBarStyle: "default",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0c0c0e" },
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
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        {missingEnv.length > 0 ? (
          <SetupNotice missing={missingEnv} />
        ) : (
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <ThemeColorSync />
            {children}
          </ThemeProvider>
        )}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
