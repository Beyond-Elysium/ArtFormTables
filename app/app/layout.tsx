import type { Metadata } from "next";
import { NuqsAdapter } from "nuqs/adapters/next/app";
// Branded ArtForm design system (compiled from core/scss/tabler.scss).
import "@tabler/core/dist/css/tabler.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ArtForm Dashboards",
  description: "Live analytics dashboards by ArtForm.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@900&family=Fira+Sans:wght@400;500;700&family=Montserrat:wght@400;500;600;700&display=swap"
        />
      </head>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  );
}
