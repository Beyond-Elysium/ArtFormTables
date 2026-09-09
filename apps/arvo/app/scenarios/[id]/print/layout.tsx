// Chrome-free layout for the print/PDF route: no NavSidebar, no PageHeader —
// just the branded design system, imported directly since this segment never
// renders under (dashboard)/layout.tsx.
import "@tabler/core/dist/css/tabler.min.css";
import "@artform/suite-ui/theme.css";

export default function ScenarioPrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="scenario-print">{children}</div>;
}
