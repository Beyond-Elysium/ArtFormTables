export type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "scenarios" | "campaign-data" | "import" | "integrations" | "settings";
};

export const navItems: NavItem[] = [
  { href: "/arvo", label: "Dashboard", icon: "dashboard" },
  { href: "/arvo/scenarios", label: "Saved Scenarios", icon: "scenarios" },
  { href: "/arvo/campaign-data", label: "Campaign Data", icon: "campaign-data" },
  { href: "/arvo/import", label: "Import Data", icon: "import" },
  { href: "/arvo/integrations", label: "Integrations", icon: "integrations" },
  { href: "/arvo/settings", label: "Settings", icon: "settings" },
];
