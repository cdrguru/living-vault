/** Button copy for the committed fabric-library projection import. */
export function fabricSyncLabels(demoMode: boolean): {
  idleLabel: string;
  idleShort: string;
} {
  return demoMode
    ? { idleLabel: "Load demo library", idleShort: "Library" }
    : { idleLabel: "Sync from Fabric Library", idleShort: "Sync" };
}