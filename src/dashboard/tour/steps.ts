/**
 * The guided tour script. Each step names a route to navigate to and a DOM
 * anchor to point at; the anchor names are the single source of truth, used both
 * here and as the data-tour attribute values in the layout. The step-registry
 * test asserts every route is a real nav path and every anchor is registered, so
 * a renamed anchor or a typo cannot ship a dangling step.
 */
export const TOUR_ANCHORS = {
  sidebarNav: "sidebar-nav",
  headerSync: "header-sync",
  commandPalette: "command-palette",
  exceptionQueue: "exception-queue",
  pageMain: "page-main",
  settingsLink: "settings-link",
} as const;

export type TourAnchor = (typeof TOUR_ANCHORS)[keyof typeof TOUR_ANCHORS];

export interface TourStep {
  id: string;
  route: string;
  anchor: TourAnchor;
  title: string;
  body: string;
}

// The tour leads with proof: it opens on the Overview, pulls in data, then walks
// the three hero surfaces in order before landing on Settings. The path is
// Overview -> Monitor (exception queue) -> Model canvas -> Cost -> Settings, so a
// first-time viewer sees the value (what needs attention, the live data model,
// what it costs) before being asked to configure anything.
export const TOUR_STEPS: TourStep[] = [
  {
    id: "navigate",
    route: "/",
    anchor: TOUR_ANCHORS.sidebarNav,
    title: "Navigate the Vault",
    body: "Every view from a health Overview to the data Model lives on this left rail. It is always here; Settings sits at the bottom.",
  },
  {
    id: "sync",
    route: "/",
    anchor: TOUR_ANCHORS.headerSync,
    title: "Pull in your library and usage",
    body: "Sync from the Fabric Library to load the catalog, then Sync telemetry to fold in real usage. Both are one click and fully reversible.",
  },
  {
    id: "monitor",
    route: "/monitor",
    anchor: TOUR_ANCHORS.exceptionQueue,
    title: "See what needs attention",
    body: "The Monitor leads with an exception queue: the riskiest, stalest, and most wasteful assets first. Acknowledge, snooze, or dismiss each one in place.",
  },
  {
    id: "model",
    route: "/model",
    anchor: TOUR_ANCHORS.pageMain,
    title: "Explore the data model",
    body: "The Rayfin entities as an interactive diagram. Search, pan, and select a table to trace its relationships.",
  },
  {
    id: "cost",
    route: "/cost",
    anchor: TOUR_ANCHORS.pageMain,
    title: "Watch the cost",
    body: "Modeled spend and cost per success, split by type and by health quadrant. Figures are estimated from tokens at list prices, not billed.",
  },
  {
    id: "settings",
    route: "/settings",
    anchor: TOUR_ANCHORS.settingsLink,
    title: "Make it yours",
    body: "You are here. Wire your real data, set your defaults, read the glossary, and replay this tour anytime.",
  },
];
