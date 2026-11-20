import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Chasseur d'emploi", template: "%s · Chasseur d'emploi" },
  description: "Ton assistant de recherche d'emploi : évalue les offres, adapte ton CV, suis tes candidatures.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
