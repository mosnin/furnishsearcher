"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import { Brand } from "@/components/brand";
import Image from "next/image";
import { useAuth, UserButton } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Collapsible } from "@base-ui/react/collapsible";
import { dashboardHome, dashboardRouteAllowed } from "@/lib/dashboard-access";
import {
  Buildings,
  MagnifyingGlass,
  SidebarSimple,
  CaretDown,
  ArrowSquareOut,
  Plus,
  List,
  Wrench,
} from "@phosphor-icons/react";
import { Button, Modal, Input } from "@/components/ui-system/primitives";
import {
  dashboardGroups,
  rentalToolLinks,
  dashboardFooter,
  dashboardItemActive,
  type DashboardRole,
} from "@/components/dashboard/navigation";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { isSignedIn, isLoaded, userId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const user = useQuery(
    api.users.getByClerkId,
    userId ? { clerkId: userId } : "skip",
  );
  const summary = useQuery(api.inbox.summary, user?._id ? {} : "skip");
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);
  const [search, setSearch] = useState(false);
  const [term, setTerm] = useState("");
  const searchTrigger = useRef<HTMLElement | null>(null);
  const drawerTrigger = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (isLoaded && !isSignedIn) router.replace("/sign-in");
  }, [isLoaded, isSignedIn, router]);
  useEffect(() => {
    try {
      setCollapsed(
        localStorage.getItem("furnishsearcher.dashboard.rail") === "collapsed",
      );
    } catch {}
  }, []);
  useEffect(() => {
    setDrawer(false);
    setSearch(false);
  }, [pathname]);
  useEffect(() => {
    const open = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearch((v) => !v);
      }
    };
    window.addEventListener("keydown", open);
    return () => window.removeEventListener("keydown", open);
  }, []);
  useEffect(() => {
    if (user?.accountTypePending) {
      router.replace("/onboarding");
      return;
    }
    if (user && !dashboardRouteAllowed(user.role, pathname))
      router.replace(dashboardHome(user.role));
  }, [user, pathname, router]);
  if (!isLoaded || !isSignedIn || user === undefined)
    return (
      <div className="furnish-ui ds-empty" role="status">
        Opening your workspace…
      </div>
    );
  if (user?.accountTypePending)
    return (
      <div className="furnish-ui ds-empty" role="status">
        Opening account setup…
      </div>
    );
  if (!user)
    return (
      <div className="furnish-ui ds-empty">
        <h1>Complete your account setup</h1>
        <Link href="/onboarding">Continue setup</Link>
      </div>
    );
  if (!dashboardRouteAllowed(user.role, pathname))
    return (
      <div className="furnish-ui ds-empty" role="status">
        Opening your account dashboard…
      </div>
    );
  const role: DashboardRole = user.role;
  const groups = dashboardGroups(role);
  const pages = [
    ...groups
      .flatMap((group) => group.items)
      .filter((item) => item.href !== "/dashboard/rental-tools"),
    ...(role !== "admin" ? rentalToolLinks(role) : []),
    ...dashboardFooter,
  ];
  const roleLabel =
    role === "landlord"
      ? "Property owner"
      : role === "admin"
        ? "Administration"
        : "Traveler";
  const rail = (mobile = false) => (
    <>
      <div className="dashboard-workspace" aria-label={`${roleLabel} account`}>
        <span className="dashboard-workspace-mark">
          <AccountIcon role={role} />
        </span>
        <span className="dashboard-workspace-text">
          <strong>{roleLabel}</strong>
          <small>{user?.name ?? "Your account"}</small>
        </span>
      </div>
      <nav
        aria-label={
          mobile ? "Mobile dashboard navigation" : "Dashboard navigation"
        }
      >
        {groups.map((group) => (
          <div className="dashboard-nav-group" key={group.label}>
            <p>{group.label}</p>
            {group.items.map((item) =>
              item.href === "/dashboard/rental-tools" ? (
                <RentalToolsNav
                  key={item.href}
                  role={role}
                  pathname={pathname}
                  collapsed={!mobile && collapsed}
                  onNavigate={() => setDrawer(false)}
                />
              ) : (
                <Link
                  key={item.href}
                  href={item.href}
                  className="dashboard-nav-link"
                  aria-current={
                    dashboardItemActive(pathname, item.href)
                      ? "page"
                      : undefined
                  }
                  title={item.label}
                  onClick={() => setDrawer(false)}
                >
                  <item.icon weight="fill" />
                  <span>{item.label}</span>
                  {item.href === "/dashboard/messages" &&
                    summary?.ready &&
                    summary.unread > 0 && (
                      <small
                        key={summary.unread}
                        className="t-notification-badge"
                        aria-label={`${summary.unread} unread conversations`}
                      >
                        {summary.unread}
                      </small>
                    )}
                </Link>
              ),
            )}
          </div>
        ))}
      </nav>
      <div className="dashboard-rail-footer">
        {role === "landlord" && (
          <Link
            href="/dashboard/landlord/listings/new"
            className="dashboard-nav-link"
            title="Add listing"
          >
            <Plus weight="bold" />
            <span>Add listing</span>
          </Link>
        )}
        {dashboardFooter.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="dashboard-nav-link"
            aria-current={
              dashboardItemActive(pathname, item.href) ? "page" : undefined
            }
            title={item.label}
          >
            <item.icon weight="regular" />
            <span>{item.label}</span>
          </Link>
        ))}
        {!mobile && (
          <button
            className="dashboard-collapse"
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => {
              setCollapsed(!collapsed);
              try {
                localStorage.setItem(
                  "furnishsearcher.dashboard.rail",
                  !collapsed ? "collapsed" : "expanded",
                );
              } catch {}
            }}
          >
            <SidebarSimple size={16} />
            <span>Collapse sidebar</span>
          </button>
        )}
      </div>
    </>
  );
  return (
    <div className="furnish-ui dashboard-shell" data-collapsed={collapsed}>
      <a href="#dashboard-main" className="dashboard-skip">
        Skip to content
      </a>
      <header className="dashboard-bar">
        <Button
          variant="ghost"
          size="icon"
          className="dashboard-mobile-trigger"
          ref={drawerTrigger}
          onClick={() => setDrawer(true)}
          aria-label="Open navigation"
        >
          <List size={20} />
        </Button>
        <Link href="/dashboard" className="dashboard-brand">
          <Brand size={32} />
        </Link>
        <button
          ref={searchTrigger as React.RefObject<HTMLButtonElement>}
          className="dashboard-bar-search"
          onClick={() => {
            setTerm("");
            setSearch(true);
          }}
        >
          <MagnifyingGlass size={16} />
          <span>Go to a page</span>
          <kbd>⌘ K</kbd>
        </button>
        <div className="dashboard-bar-right">
          <Link href="/search">
            Browse rentals <ArrowSquareOut size={13} />
          </Link>
          <UserButton appearance={{ elements: { avatarBox: "h-7 w-7" } }} />
        </div>
      </header>
      <aside className="dashboard-rail">{rail()}</aside>
      <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
        {children}
      </main>
      <Modal
        open={drawer}
        onOpenChange={setDrawer}
        title="Navigation"
        className="ds-mobile-drawer"
        finalFocus={drawerTrigger}
      >
        <aside className="dashboard-rail">{rail(true)}</aside>
      </Modal>
      <Modal
        open={search}
        onOpenChange={setSearch}
        title="Go to a page"
        description="Find a page in your rental workspace."
        finalFocus={searchTrigger}
      >
        <div className="ds-nav-search">
          <Input
            aria-label="Find a dashboard page"
            placeholder="Search pages…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          {pages
            .filter((item) =>
              item.label.toLowerCase().includes(term.toLowerCase()),
            )
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSearch(false)}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </Link>
            ))}
          {!pages.some((item) =>
            item.label.toLowerCase().includes(term.toLowerCase()),
          ) && <p className="ds-caption">No pages match that search.</p>}
        </div>
      </Modal>
    </div>
  );
}

function AccountIcon({ role }: { role: DashboardRole }) {
  return (
    <Image
      className="dashboard-account-icon"
      src={`/icons/account-${role}.png`}
      width={36}
      height={36}
      alt=""
      quality={75}
    />
  );
}
function RentalToolsNav({
  role,
  pathname,
  collapsed,
  onNavigate,
}: {
  role: DashboardRole;
  pathname: string;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(
    pathname.startsWith("/dashboard/rental-tools"),
  );
  useEffect(() => {
    if (pathname.startsWith("/dashboard/rental-tools")) setOpen(true);
  }, [pathname]);
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={setOpen}
      className="dashboard-tools-nav"
    >
      <Collapsible.Trigger
        className="dashboard-nav-link"
        aria-label="Rental tools"
        title="Rental tools"
      >
        <Wrench weight="fill" />
        <span>Rental tools</span>
        <CaretDown size={11} />
      </Collapsible.Trigger>
      <Collapsible.Panel>
        <div className="dashboard-tool-items">
          {rentalToolLinks(role).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="dashboard-nav-link"
              aria-current={
                dashboardItemActive(pathname, item.href) ? "page" : undefined
              }
              title={item.label}
              onClick={onNavigate}
            >
              <item.icon size={14} />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </Collapsible.Panel>
    </Collapsible.Root>
  );
}
