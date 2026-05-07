// Brand override surface. Fork-friendly: a downstream brand only needs to edit
// this file, brand/theme.css, and the assets in public/brand/ to re-skin the app.
// Component code reads from `brand` instead of inlining product copy.

export interface BrandConfig {
  productName: string;
  shortName: string;
  tagline?: string;
  logoUrl?: string;
  faviconUrl?: string;
  copy: {
    headerUserPrefix: string;
    headerSessionPrefix: string;
    sidebarTitle: string;
    sidebarSubtitle: string;
    sidebarNewSession: string;
    sidebarEmpty: string;
    sidebarLoading: string;
    serverPickerAdd: string;
    serverPickerCancel: string;
    serverPickerSubmit: string;
    serverPickerNamePlaceholder: string;
    serverPickerUrlPlaceholder: string;
    connection: {
      idle: string;
      connecting: string;
      open: string;
      reconnecting: string;
      closed: string;
      error: string;
    };
  };
}

export const brand: BrandConfig = {
  productName: "Lincoln Loop Console",
  shortName: "Lincoln Loop",
  tagline: "Perfect-fit software. Built to last.",
  logoUrl: "/brand/lincoln-loop-logo.svg",
  faviconUrl: "/brand/lincoln-loop-favicon.svg",
  copy: {
    headerUserPrefix: "user:",
    headerSessionPrefix: "session:",
    sidebarTitle: "Recent loops",
    sidebarSubtitle: "Newest activity first",
    sidebarNewSession: "New loop",
    sidebarEmpty: "No loops yet",
    sidebarLoading: "Loading loops...",
    serverPickerAdd: "+ Add environment",
    serverPickerCancel: "Cancel",
    serverPickerSubmit: "Add",
    serverPickerNamePlaceholder: "Name",
    serverPickerUrlPlaceholder: "https://server.example.com",
    connection: {
      idle: "Idle",
      connecting: "Connecting",
      open: "Connected",
      reconnecting: "Reconnecting",
      closed: "Disconnected",
      error: "Error",
    },
  },
};
