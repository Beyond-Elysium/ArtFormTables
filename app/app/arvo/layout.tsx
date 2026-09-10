import type { Metadata } from "next";
import "@artform/suite-ui/theme.css";
import "@arvo/app/globals.css";

export const metadata: Metadata = {
  title: "Arvo",
  description: "Know if your campaigns are winning before the results come in.",
};

export default function ArvoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
