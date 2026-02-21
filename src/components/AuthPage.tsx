import { useAuthStore } from '../store';

interface AuthPageProps {
  onStatusMessage: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function AuthPage({ onStatusMessage }: AuthPageProps) {
  const { user, isAuthenticated, signIn, signOut } = useAuthStore();

  const handleSignIn = () => {
    signIn();
    onStatusMessage('Opening sign-in window...', 'info');
  };

  const handleSignOut = async () => {
    await signOut();
    onStatusMessage('Signed out.', 'success');
  };

  return (
    <section className="popup-page">
      <div className="flex items-center justify-between gap-2 mb-2.5">
        <div className="flex items-center gap-2">
          {!isAuthenticated ? (
            <button
              onClick={handleSignIn}
              className="btn-primary bg-gradient-signin px-3 py-2 rounded-[10px] text-white font-semibold text-[13px] border-none cursor-pointer shadow-btn hover:shadow-btn-primary-hover hover:-translate-y-0.5 transition-all inline-flex items-center gap-2.5"
            >
              Sign in with Google
            </button>
          ) : (
            <button
              onClick={handleSignOut}
              className="btn-secondary bg-white/[0.03] border border-white/[0.04] text-text px-3 py-2 rounded-[10px] font-semibold text-[13px] cursor-pointer shadow-btn hover:bg-white/[0.06] hover:-translate-y-0.5 transition-all inline-flex items-center gap-2.5"
            >
              Sign out
            </button>
          )}
        </div>
        <div className="text-xs text-muted">
          {isAuthenticated && user ? `Signed in as ${user.displayName || user.email}` : ''}
        </div>
      </div>
    </section>
  );
}
