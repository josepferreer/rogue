import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { AppShell } from "@/components/layout/app-shell";
import { HydrationGate } from "@/components/hydration-gate";
import { ThemeProvider } from "@/components/theme-provider";
import { ServiceWorkerRegister } from "@/components/service-worker-register";
import { RogueProvider } from "@/lib/store/rogue-store";
import { CardioProvider } from "@/lib/store/cardio-store";
import { WorkoutSessionProvider } from "@/lib/store/workout-session-store";
import { OnboardingGate } from "@/components/onboarding-gate";
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
    default: "Rogue - Entrena con rango",
    template: "%s · Rogue",
  },
  description:
    "Planifica tus entrenamientos, explora la biblioteca de ejercicios y sube de rango musculo a musculo.",
  appleWebApp: {
    capable: true,
    title: "Rogue",
    statusBarStyle: "black-translucent",
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
  return (
    <html
      lang="es"
      suppressHydrationWarning
      className={`${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <RogueProvider>
            <WorkoutSessionProvider>
              <CardioProvider>
                <HydrationGate>
                  <AppShell>{children}</AppShell>
                </HydrationGate>
                <OnboardingGate />
              </CardioProvider>
            </WorkoutSessionProvider>
          </RogueProvider>
        </ThemeProvider>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
