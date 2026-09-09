export type NavItem = {
  href: string;
  label: string;
  icon:
    | "dashboard"
    | "opportunities"
    | "contacts"
    | "competitors"
    | "alerts"
    | "market-brief"
    | "settings";
};

export const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/opportunities", label: "Opportunity Feed", icon: "opportunities" },
  { href: "/contacts", label: "Contact Intelligence", icon: "contacts" },
  { href: "/competitors", label: "Competitive Landscape", icon: "competitors" },
  { href: "/alerts", label: "Alert Center", icon: "alerts" },
  { href: "/market-brief", label: "Market Brief", icon: "market-brief" },
  { href: "/settings", label: "Settings", icon: "settings" },
];
