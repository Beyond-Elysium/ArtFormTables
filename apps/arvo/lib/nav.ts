export type NavItem = {
  href: string;
  label: string;
  icon: "dashboard" | "scenarios" | "campaign-data" | "import" | "integrations" | "settings";
};

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/scenarios", label: "Saved Scenarios", icon: "scenarios" },
  { href: "/campaign-data", label: "Campaign Data", icon: "campaign-data" },
  { href: "/import", label: "Import Data", icon: "import" },
  { href: "/integrations", label: "Integrations", icon: "integrations" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
