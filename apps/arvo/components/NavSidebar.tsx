"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import {
  IconLayoutDashboard,
  IconFolders,
  IconDatabase,
  IconUpload,
  IconPlug,
  IconSettings,
} from "@tabler/icons-react";
import type { NavItem } from "@/lib/nav";
import { navItems } from "@/lib/nav";

const ICONS: Record<NavItem["icon"], typeof IconLayoutDashboard> = {
  dashboard: IconLayoutDashboard,
  scenarios: IconFolders,
  "campaign-data": IconDatabase,
  import: IconUpload,
  integrations: IconPlug,
  settings: IconSettings,
};

export function NavSidebar() {
  const pathname = usePathname();

  return (
    <aside className="navbar navbar-vertical navbar-expand-lg" data-bs-theme="dark">
      <div className="container-fluid">
        <button
          className="navbar-toggler"
          type="button"
          data-bs-toggle="collapse"
          data-bs-target="#sidebar-menu"
        >
          <span className="navbar-toggler-icon" />
        </button>
        <Link href="/arvo" className="navbar-brand navbar-brand-autodark">
          Arvo
        </Link>
        <div className="collapse navbar-collapse" id="sidebar-menu">
          <ul className="navbar-nav pt-lg-3">
            {navItems.map((item) => {
              const Icon = ICONS[item.icon];
              const active =
                item.href === "/arvo"
                  ? pathname === "/arvo"
                  : pathname.startsWith(item.href);
              return (
                <li key={item.href} className={`nav-item${active ? " active" : ""}`}>
                  <Link className="nav-link" href={item.href}>
                    <span className="nav-link-icon d-md-none d-lg-inline-block">
                      <Icon size={20} stroke={1.75} />
                    </span>
                    <span className="nav-link-title">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-auto pt-3 pb-2 px-2">
            <UserButton showName />
          </div>
        </div>
      </div>
    </aside>
  );
}
