import { browserSession } from '@microsoft/rayfin-auth';
import { RayfinClient, type RayfinRuntimeConfig } from '@microsoft/rayfin-client';
import { dataService } from '@microsoft/rayfin-data';

import type { BlankAppSchema } from '../../rayfin/data/schema';

interface RayfinClientConfig {
  baseUrl: string;
  publishableKey: string;
  runtimeConfig: RayfinRuntimeConfig;
}

function createClient(config: RayfinClientConfig) {
  return RayfinClient.create({
    ...config,
    auth: browserSession({ storage: true }),
    services: { data: dataService<BlankAppSchema>() },
  });
}

export type AppClient = ReturnType<typeof createClient>;

let client: AppClient | null = null;
let localDev = false;

export function initRayfinClient(config: RayfinClientConfig, isLocal: boolean): AppClient {
  if (client) throw new Error('Rayfin client is already initialized.');
  client = createClient(config);
  localDev = isLocal;
  return client;
}

export function getRayfinClient(): AppClient {
  if (!client) throw new Error('Rayfin client not initialized. Call bootstrapAuth() first.');
  return client;
}

export function getFabricRuntimeConfig(): RayfinRuntimeConfig | undefined {
  return client?.runtimeConfig;
}

export function isLocalBackend(): boolean {
  return localDev;
}
