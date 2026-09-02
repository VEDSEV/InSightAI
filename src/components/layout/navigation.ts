import type { LucideIcon } from "lucide-react";
import { BarChart3, Database, Home, Lightbulb } from "lucide-react";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
};

export const primaryNavigation: readonly NavigationItem[] = [
  { id: "home", label: "Home", href: "/", icon: Home, enabled: true },
  { id: "insights", label: "Insights", href: "/#insights", icon: Lightbulb, enabled: true },
  { id: "explore", label: "Explore", href: "/?view=advanced", icon: BarChart3, enabled: true },
  { id: "data", label: "Data", href: "/#data", icon: Database, enabled: true },
] as const;
