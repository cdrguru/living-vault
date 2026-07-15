import type { AuthUser, IAuthService } from './IAuthService';

const DEMO_USER: AuthUser = {
  id: 'demo-admin',
  email: 'ava@contoso.com',
  name: 'Ava Thompson',
};

export class DemoAuthService implements IAuthService {
  readonly fabricAuthEnabled = false;

  async signIn(): Promise<AuthUser> {
    return DEMO_USER;
  }

  async signOut(): Promise<void> {
    return Promise.resolve();
  }

  async getCurrentUser(): Promise<AuthUser | null> {
    return DEMO_USER;
  }

  async initEmbeddedAuth(): Promise<AuthUser | null> {
    return null;
  }
}
