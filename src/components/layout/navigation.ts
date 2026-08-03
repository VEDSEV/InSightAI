import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  Bot,
  Boxes,
  Megaphone,
  PackageSearch,
  ReceiptText,
  UsersRound,
} from "lucide-react";

export type NavigationItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  enabled: boolean;
};

export const primaryNavigation: readonly NavigationItem[] = [
  { id: "overview", label: "Overview", href: "/", icon: BarChart3, enabled: true },
  { id: "sales", label: "Sales", href: "/sales", icon: ReceiptText, enabled: false },
  { id: "products", label: "Products", href: "/products", icon: Boxes, enabled: false },
  { id: "customers", label: "Customers", href: "/customers", icon: UsersRound, enabled: false },
  { id: "marketing", label: "Marketing", href: "/marketing", icon: Megaphone, enabled: false },
  { id: "ai-analyst", label: "AI Analyst", href: "/ai-analyst", icon: Bot, enabled: false },
  { id: "reports", label: "Reports", href: "/reports", icon: PackageSearch, enabled: false },
] as const;
