import type { Metadata } from "next";
import { League_Spartan, Fira_Sans, Montserrat } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import { NuqsAdapter } from "nuqs/adapters/next/app";
// Branded ArtForm design system (compiled from core/scss/tabler.scss).
import "@tabler/core/dist/css/tabler.min.css";
import "./globals.css";

// Self-hosted brand fonts (next/font): downloaded at build time and served
// from our own origin — no runtime request to the Google Fonts CDN, no FOUT,
// and the PDF renderer no longer depends on the CDN being reachable.
const leagueSpartan = League_Spartan({
  subsets: ["latin"],
  weight: "900",
  variable: "--font-league-spartan",
  display: "swap",
});
const firaSans = Fira_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-fira-sans",
  display: "swap",
});
const montserrat = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-montserrat",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${leagueSpartan.variable} ${firaSans.variable} ${montserrat.variable}`}
    >
      <body>
        <ClerkProvider>
          <NuqsAdapter>{children}</NuqsAdapter>
        </ClerkProvider>
      </body>
    </html>
  );
}
