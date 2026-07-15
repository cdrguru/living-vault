import { useState, type FormEvent } from 'react';

import { useAuth } from '@/hooks/AuthContext';
import { Button } from '@/dashboard/components/Button';

const msLogo = (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="16"
    height="16"
    viewBox="0 0 21 21"
    className="mr-2"
    aria-hidden="true"
    focusable="false"
  >
    <rect x="1" y="1" width="9" height="9" fill="#f25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
    <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
    <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
  </svg>
);

export function AuthPage() {
  const { signIn, signInWithPassword, fabricAuthEnabled, passwordAuthEnabled } =
    useAuth();
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSignIn = async () => {
    setError(null);
    setIsLoading(true);

    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordSignIn = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await signInWithPassword(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to sign in.');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-md border border-border-strong bg-surface-raised px-3 py-2 text-sm text-fg outline-none focus:border-accent-strong';

  const buttonLabel = isLoading
    ? fabricAuthEnabled
      ? 'Opening Fabric...'
      : 'Signing in...'
    : 'Sign in with Microsoft';

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center p-4">
      <div aria-hidden="true" className="glow-surface pointer-events-none absolute inset-x-0 top-0 h-64" />
      <div className="relative w-full max-w-sm">
        <div className="rounded-xl border border-border bg-surface p-8 shadow-raised">
          <div className="mb-8 flex flex-col items-center text-center">
            <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-strong text-accent-fg shadow-card">
              <svg aria-hidden="true" fill="none" height="26" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="26">
                <rect height="18" rx="2" width="18" x="3" y="3" />
                <circle cx="12" cy="12" r="3.2" />
                <path d="M12 3v3M12 18v3M3 12h3M18 12h3" strokeLinecap="round" />
              </svg>
            </span>
            <div className="eyebrow">{passwordAuthEnabled ? 'Self-host' : 'Fabric native'}</div>
            <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-fg">The Living Vault</h1>
            <p className="mt-2 text-sm text-subtle">Sign in to manage governed agentic assets.</p>
          </div>

          {passwordAuthEnabled ? (
            <form className="space-y-3" onSubmit={handlePasswordSignIn}>
              <input
                aria-label="Email"
                autoComplete="username"
                className={inputClass}
                disabled={isLoading}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email"
                required
                type="email"
                value={email}
              />
              <input
                aria-label="Password"
                autoComplete="current-password"
                className={inputClass}
                disabled={isLoading}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Password"
                required
                type="password"
                value={password}
              />
              <Button className="w-full" disabled={isLoading} type="submit" variant="primary">
                {isLoading ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>
          ) : (
            <Button className="w-full" disabled={isLoading} onClick={handleSignIn} variant="primary">
              {msLogo}
              {buttonLabel}
            </Button>
          )}

          {error && (
            <p className="mt-3 text-center text-sm text-danger-fg" role="alert">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
