"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Search,
  MessageCircle,
  Heart,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@clerk/nextjs";
import { Id } from "@/convex/_generated/dataModel";

type Role = "tenant" | "landlord" | "admin";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  showBadge?: boolean;
};

function getNavItems(role: Role): NavItem[] {
  const savedHref =
    role === "landlord" ? "/dashboard/landlord" : "/dashboard/tenant";

  return [
    {
      label: "Dashboard",
      href: role === "landlord" ? "/dashboard/landlord" : role === "admin" ? "/dashboard/admin" : "/dashboard/tenant",
      icon: LayoutDashboard,
    },
    {
      label: "Search",
      href: "/search",
      icon: Search,
    },
    {
      label: "Messages",
      href: "/dashboard/messages",
      icon: MessageCircle,
      showBadge: true,
    },
    {
      label: "Saved",
      href: savedHref,
      icon: Heart,
    },
    {
      label: "Profile",
      href: "/dashboard/profile",
      icon: User,
    },
  ];
}

type ConversationSummary = {
  tenantId: Id<"users">;
  landlordId: Id<"users">;
  tenantRead: boolean;
  landlordRead: boolean;
};

function UnreadBadge() {
  const { userId: clerkId } = useAuth();
  const convexUser = useQuery(
    api.users.getByClerkId,
    clerkId ? { clerkId } : "skip"
  ) as { _id: Id<"users"> } | null | undefined;

  const conversations = useQuery(
    api.messages.getConversations,
    convexUser?._id ? { userId: convexUser._id } : "skip"
  ) as ConversationSummary[] | undefined;

  const unreadCount =
    conversations?.filter((c) =>
      c.tenantId === convexUser?._id ? !c.tenantRead : !c.landlordRead
    ).length ?? 0;

  if (unreadCount === 0) return null;

  return (
    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full px-1 leading-none">
      {unreadCount > 99 ? "99+" : unreadCount}
    </span>
  );
}

export default function MobileNav({ role }: { role: Role }) {
  const pathname = usePathname();
  const navItems = getNavItems(role);

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-slate-200"
      style={{ boxShadow: "0 -2px 12px rgba(0,0,0,0.08)" }}
    >
      <div className="flex items-stretch h-16">
        {navItems.map((item) => {
          const Icon = item.icon;
          // Determine active state: exact match for dashboard roots, prefix for others
          const isActive =
            item.href === pathname ||
            (item.href !== "/search" &&
              item.href !== "/" &&
              pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-[#1e3a8a]"
                  : "text-slate-400 hover:text-slate-600"
              )}
            >
              <div className="relative">
                <Icon
                  className={cn(
                    "w-5 h-5 transition-colors",
                    isActive ? "text-[#1e3a8a]" : "text-slate-400"
                  )}
                />
                {item.showBadge && <UnreadBadge />}
              </div>
              <span>{item.label}</span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-6 h-0.5 rounded-full bg-[#1e3a8a]" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
