import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { AuthProvider, useAuth } from '@/hooks/AuthContext';
import type { AuthUser, IAuthService } from '@/services/IAuthService';

const USER: AuthUser = { id: 'u1', email: 'dev@contoso.com', name: 'dev' };

function makeService(over: Partial<IAuthService> = {}): IAuthService {
  return {
    fabricAuthEnabled: false,
    async signIn() {
      return USER;
    },
    async signOut() {},
    async getCurrentUser() {
      return null;
    },
    async initEmbeddedAuth() {
      return null;
    },
    ...over,
  };
}

/** A probe consumer that exposes the context state and actions as DOM. */
function Probe() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="state">
        {auth.loading ? 'loading' : auth.isAuthenticated ? auth.user!.email : 'anonymous'}
      </span>
      <span data-testid="error">{auth.error ?? ''}</span>
      <button onClick={() => void auth.signIn().catch(() => {})}>sign in</button>
      <button onClick={() => void auth.signOut()}>sign out</button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('resolves an existing session from getCurrentUser after the loading gate', async () => {
    render(
      <AuthProvider authService={makeService({ getCurrentUser: async () => USER })}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('dev@contoso.com');
    });
  });

  it('settles to anonymous when the initial auth check rejects', async () => {
    render(
      <AuthProvider
        authService={makeService({
          initEmbeddedAuth: async () => {
            throw new Error('embedded auth unavailable');
          },
        })}
      >
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
    });
  });

  it('signs in to an authenticated state and signs out back to anonymous', async () => {
    render(
      <AuthProvider authService={makeService()}>
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
    });

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    expect(screen.getByTestId('state')).toHaveTextContent('dev@contoso.com');

    await userEvent.click(screen.getByRole('button', { name: 'sign out' }));
    expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
  });

  it('surfaces a sign-in failure as error state and stays unauthenticated', async () => {
    render(
      <AuthProvider
        authService={makeService({
          signIn: async () => {
            throw new Error('IdP said no');
          },
        })}
      >
        <Probe />
      </AuthProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
    });

    await userEvent.click(screen.getByRole('button', { name: 'sign in' }));
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('IdP said no');
    });
    expect(screen.getByTestId('state')).toHaveTextContent('anonymous');
  });
});
