import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
// Branded design system: Tabler core + the shared ArtForm suite-ui theme.
import "@tabler/core/dist/css/tabler.min.css";
import "@artform/suite-ui/theme.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arvo",
  description: "Know if your campaigns are winning before the results come in.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider>
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
            href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=DM+Sans:wght@400;500;700&display=swap"
          />
        </head>
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
