import { AuthError } from '@microsoft/rayfin-client';

import type { AppClient } from './rayfinClient';

import { type AuthUser, type IAuthService, toAuthUser } from './IAuthService';

// Local-dev fixture credentials for the bundled local backend, which ships
// without Fabric/Entra. Placeholders only: override with VITE_MOCK_EMAIL and
// VITE_MOCK_PASSWORD. They authenticate a throwaway local account created on
// first sign-in, reach only a developer's machine, and never touch production.
const MOCK_EMAIL = import.meta.env.VITE_MOCK_EMAIL ?? 'dev@example.com';
const MOCK_PASSWORD =
  import.meta.env.VITE_MOCK_PASSWORD ?? 'change-me-local-dev';

/**
 * Local-development auth service. Used when the API URL targets localhost.
 *
 * Signs into the bundled local backend with a fixed email/password. No
 * Fabric/Entra wiring required. If the dev account does not exist yet on
 * the local backend, it is created on first sign-in.
 */
export class MockAuthService implements IAuthService {
  readonly fabricAuthEnabled = false;

  constructor(private readonly client: AppClient) {}

  async signIn(): Promise<AuthUser> {
    const auth = this.client.auth;

    // Try sign-in. If the credentials are rejected (also how the backend
    // reports "user does not exist") create the account and retry. Other
    // errors such as network or server failures propagate unchanged.
    try {
      await auth.signIn({ email: MOCK_EMAIL, password: MOCK_PASSWORD });
    } catch (err) {
      if (!(err instanceof AuthError) || err.code !== 'INVALID_GRANT') {
        throw err;
      }
      await auth.signUp({ email: MOCK_EMAIL, password: MOCK_PASSWORD });
      await auth.signIn({ email: MOCK_EMAIL, password: MOCK_PASSWORD });
    }

    const session = auth.getSession();
    if (!session.isAuthenticated || !session.user) {
      throw new Error('Local mock sign-in failed to establish a session.');
    }
    return toAuthUser(session.user);
  }

  async signOut(): Promise<void> {
    await this.client.auth.signOut();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    const session = this.client.auth.getSession();
    if (!session.isAuthenticated || !session.user) return null;
    return toAuthUser(session.user);
  }

  async initEmbeddedAuth(): Promise<AuthUser | null> {
    // Embedded Fabric flow is not used in local-dev mode.
    return null;
  }
}
