"use client";

import { useState, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { useUser, useAuth, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LayoutDashboard,
  Heart,
  MessageSquare,
  User,
  Building2,
  PlusSquare,
  BarChart3,
  Users,
  ShieldCheck,
  FileText,
  Menu,
  X,
  Home,
} from "lucide-react";
import MobileNav from "@/components/dashboard/mobile-nav";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
};

const tenantNav: NavItem[] = [
  { label: "Overview", href: "/dashboard/tenant", icon: LayoutDashboard },
  { label: "Saved Listings", href: "/dashboard/tenant/saved", icon: Heart },
  { label: "My Messages", href: "/dashboard/messages", icon: MessageSquare },
  { label: "Profile", href: "/dashboard/tenant/profile", icon: User },
];

const landlordNav: NavItem[] = [
  { label: "Overview", href: "/dashboard/landlord", icon: LayoutDashboard },
  { label: "My Listings", href: "/dashboard/landlord/listings", icon: Building2 },
  { label: "Add Listing", href: "/dashboard/landlord/listings/new", icon: PlusSquare },
  { label: "Messages", href: "/dashboard/messages", icon: MessageSquare },
  { label: "Analytics", href: "/dashboard/landlord/analytics", icon: BarChart3 },
  { label: "Profile", href: "/dashboard/landlord/profile", icon: User },
];

const adminNav: NavItem[] = [
  { label: "Overview", href: "/dashboard/admin", icon: LayoutDashboard },
  { label: "All Listings", href: "/dashboard/admin/listings", icon: Building2 },
  { label: "All Users", href: "/dashboard/admin/users", icon: Users },
  { label: "Messages", href: "/dashboard/messages", icon: MessageSquare },
  { label: "Reports", href: "/dashboard/admin/reports", icon: FileText },
];

function NavLink({
  item,
  isActive,
  onClick,
}: {
  item: NavItem;
  isActive: boolean;
  onClick?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
        isActive
          ? "bg-[#0f2044] text-white"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {item.label}
    </Link>
  );
}

function SidebarContent({
  navItems,
  pathname,
  userName,
  onNavClick,
}: {
  navItems: NavItem[];
  pathname: string;
  userName: string;
  onNavClick?: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-16 items-center px-4 border-b border-slate-200">
        <Link href="/" className="flex items-center gap-2">
          <Home className="h-6 w-6 text-[#0f2044]" />
          <span className="text-lg font-bold text-[#0f2044]">FurnishFinder</span>
        </Link>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            isActive={
              item.href === "/dashboard/tenant" ||
              item.href === "/dashboard/landlord" ||
              item.href === "/dashboard/admin"
                ? pathname === item.href
                : pathname.startsWith(item.href)
            }
            onClick={onNavClick}
          />
        ))}
      </nav>

      {/* User section */}
      <div className="border-t border-slate-200 p-4">
        <div className="flex items-center gap-3">
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-900 truncate">{userName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded: authLoaded, userId } = useAuth();
  const { user } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const convexUser = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip"
  );

  useEffect(() => {
    if (authLoaded && !isSignedIn) {
      router.replace("/sign-in");
    }
  }, [authLoaded, isSignedIn, router]);

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!authLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-50">
        <div className="space-y-3 w-64">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </div>
    );
  }

  if (!isSignedIn) {
    return null;
  }

  const role = convexUser?.role ?? "tenant";
  const navItems =
    role === "admin" ? adminNav : role === "landlord" ? landlordNav : tenantNav;
  const userName = user?.fullName ?? user?.firstName ?? "User";

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col md:fixed md:inset-y-0 bg-white border-r border-slate-200 z-30">
        <SidebarContent
          navItems={navItems}
          pathname={pathname}
          userName={userName}
        />
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Mobile sidebar drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-72 bg-white border-r border-slate-200 transform transition-transform duration-300 ease-in-out md:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="absolute top-4 right-4">
          <button
            onClick={() => setSidebarOpen(false)}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100"
            aria-label="Close sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <SidebarContent
          navItems={navItems}
          pathname={pathname}
          userName={userName}
          onNavClick={() => setSidebarOpen(false)}
        />
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col md:pl-60 min-h-0">
        {/* Mobile top bar */}
        <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 md:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="rounded-md p-1.5 text-slate-600 hover:bg-slate-100"
            aria-label="Open sidebar"
          >
            <Menu className="h-5 w-5" />
          </button>
          <Link href="/" className="flex items-center gap-2">
            <Home className="h-5 w-5 text-[#0f2044]" />
            <span className="font-bold text-[#0f2044]">FurnishFinder</span>
          </Link>
          <UserButton
            appearance={{
              elements: {
                avatarBox: "h-8 w-8",
              },
            }}
          />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
          {children}
        </main>

        <MobileNav role={convexUser?.role ?? "tenant"} />
      </div>
    </div>
  );
}
