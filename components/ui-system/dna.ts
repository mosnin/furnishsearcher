export const dashboardDNA = {
  version: "0.2.0",
  status: "provisional",
  sources: {
    company: "mosnin/company-os-web@94827a320e06958995263b32a44d6fc8c227d7a1",
    home: "mosnin/chippiv2@8db38e36b0cc26dc4218ee4fea755417236887cc",
    workflow:
      "ui-builder-os/custom-ui-os@a074662c84e6d4991c94c397af1b120be737320b",
  },
  surface: {
    bar: "#ffffff",
    rail: "#ffffff",
    canvas: "#ffffff",
    raised: "#ffffff",
  },
  text: { primary: "#303030", secondary: "#616161" },
  geometry: {
    topbar: 56,
    rail: 240,
    control: 28,
    input: 32,
    radius: 8,
    cardRadius: 12,
    gutter: 16,
  },
  icons: "Phosphor; filled navigation, regular actions",
  scope: "Public application, role dashboards and their portals",
} as const;
