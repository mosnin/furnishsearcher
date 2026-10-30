import {
  House,
  Buildings,
  CalendarBlank,
  Users,
  ChatCircle,
  ChartBar,
  CreditCard,
  Star,
  Wrench,
  Lifebuoy,
  Heart,
  MagnifyingGlass,
  UserCircle,
  FileText,
  ShieldCheck,
  SquaresFour,
  ArrowSquareOut,
} from "@phosphor-icons/react";
export type DashboardRole = "tenant" | "landlord" | "admin";
export function dashboardGroups(role: DashboardRole) {
  const activity = [
    {
      label: "Inquiries & stays",
      href: "/dashboard/inquiries",
      icon: CalendarBlank,
    },
    { label: "Messages", href: "/dashboard/messages", icon: ChatCircle },
    { label: "Reviews", href: "/dashboard/reviews", icon: Star },
  ];
  if (role === "admin")
    return [
      {
        label: "Workspace",
        items: [
          { label: "Home", href: "/dashboard/admin", icon: House },
          {
            label: "All listings",
            href: "/dashboard/admin/listings",
            icon: Buildings,
          },
          {
            label: "Review moderation",
            href: "/dashboard/admin/reviews",
            icon: ShieldCheck,
          },
          { label: "Users", href: "/dashboard/admin/users", icon: Users },
          {
            label: "Reports",
            href: "/dashboard/admin/reports",
            icon: ChartBar,
          },
          {
            label: "Support & reports",
            href: "/dashboard/admin/support",
            icon: Lifebuoy,
          },
          { label: "Messages", href: "/dashboard/messages", icon: ChatCircle },
        ],
      },
    ];
  return [
    {
      label: "Workspace",
      items:
        role === "landlord"
          ? [
              { label: "Home", href: "/dashboard/landlord", icon: House },
              {
                label: "Listings",
                href: "/dashboard/landlord/listings",
                icon: Buildings,
              },
              {
                label: "Tenant requests",
                href: "/dashboard/landlord/requests",
                icon: Users,
              },
              ...activity,
              {
                label: "Analytics",
                href: "/dashboard/landlord/analytics",
                icon: ChartBar,
              },
            ]
          : [
              { label: "Home", href: "/dashboard/tenant", icon: House },
              ...activity,
              {
                label: "Housing requests",
                href: "/dashboard/housing-requests",
                icon: FileText,
              },
            ],
    },
    ...(role === "tenant"
      ? [
          {
            label: "Your search",
            items: [
              {
                label: "Saved rentals",
                href: "/dashboard/tenant/saved",
                icon: Heart,
              },
              {
                label: "Saved searches",
                href: "/dashboard/tenant/searches",
                icon: MagnifyingGlass,
              },
            ],
          },
        ]
      : []),
    {
      label: "Manage",
      items: [
        {
          label: "Rental tools",
          href: "/dashboard/rental-tools",
          icon: Wrench,
        },
        ...(role === "landlord"
          ? [
              {
                label: "Billing",
                href: "/dashboard/landlord/billing",
                icon: CreditCard,
              },
            ]
          : []),
        { label: "Support", href: "/dashboard/support", icon: Lifebuoy },
      ],
    },
  ];
}
export const dashboardFooter = [
  { label: "Profile & account", href: "/dashboard/profile", icon: UserCircle },
  { label: "Market insights", href: "/market-insights", icon: ChartBar },
  { label: "Browse rentals", href: "/search", icon: ArrowSquareOut },
  {
    label: "Component library",
    href: "/dashboard/design-system",
    icon: SquaresFour,
  },
];
export function dashboardItemActive(path: string, href: string) {
  if (
    ["/dashboard/landlord", "/dashboard/tenant", "/dashboard/admin"].includes(
      href,
    )
  )
    return path === href;
  return path === href || path.startsWith(`${href}/`);
}

export function rentalToolLinks(role: DashboardRole) {
  return [
    {
      label: "Tenant screening",
      href: "/dashboard/rental-tools/screening",
      icon: ShieldCheck,
    },
    {
      label: "Lease documents",
      href: "/dashboard/rental-tools/lease",
      icon: FileText,
    },
    {
      label: "Rent collection",
      href: "/dashboard/rental-tools/rent-collection",
      icon: CreditCard,
    },
    ...(role === "landlord"
      ? [
          {
            label: "Landlord insurance",
            href: "/dashboard/rental-tools/insurance",
            icon: ShieldCheck,
          },
          {
            label: "Damage protection",
            href: "/dashboard/rental-tools/damage-protection",
            icon: ShieldCheck,
          },
        ]
      : []),
  ];
}
