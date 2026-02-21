import { useState, useEffect } from 'react';
import { Navbar, AuthPage, ProfileView, ProfileEdit } from './components';
import { useAuthStore } from './store';
import type { Page } from './types';

export default function App() {
  const { isAuthenticated, isLoading, checkSession, setTokens } = useAuthStore();
  const [currentPage, setCurrentPage] = useState<Page>('auth');
  const [statusMessage, setStatusMessage] = useState<{
    text: string;
    type: 'success' | 'error' | 'info';
  } | null>(null);

  // Check session on mount
  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Navigate to profile view when authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      setCurrentPage('profile-view');
    } else if (!isAuthenticated && !isLoading) {
      setCurrentPage('auth');
    }
  }, [isAuthenticated, isLoading]);

  // Listen for auth message from popup window (OAuth callback page posts a message)
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      try {
        if (event.data && event.data.type === 'WITTY_WING_AUTH') {
          const { accessToken, refreshToken, token } = event.data;
          // Support both new structure (accessToken/refreshToken) and old structure (token) for backward compatibility
          const finalAccess = accessToken || token;
          if (finalAccess && refreshToken) {
            setTokens(finalAccess, refreshToken);
            handleStatusMessage('Signed in successfully!', 'success');
          } else if (finalAccess) {
            // fallback if refresh token is missing for some reason
            chrome.storage.local.set({ serverJwt: finalAccess });
            handleStatusMessage('Signed in (legacy mode)!', 'success');
            checkSession();
          }
        }
      } catch (e) {
        console.error('Error handling message event:', e);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [setTokens, checkSession]);

  const handleNavigate = (page: Page) => {
    setCurrentPage(page);
  };

  const handleStatusMessage = (text: string, type: 'success' | 'error' | 'info') => {
    setStatusMessage({ text, type });
    // Clear message after 3 seconds
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const handleHelp = () => {
    handleStatusMessage('Help: Sign in for server-based replies (no API key required).', 'info');
  };

  const getStatusColor = (type: 'success' | 'error' | 'info') => {
    switch (type) {
      case 'success':
        return 'text-success';
      case 'error':
        return 'text-danger';
      case 'info':
      default:
        return 'text-muted';
    }
  };

  if (isLoading) {
    return (
      <div className="w-[360px] p-3 bg-gradient-body min-h-[200px] flex items-center justify-center">
        <div className="text-muted text-sm">Loading...</div>
      </div>
    );
  }

  return (
    <div className="w-[360px] p-3 bg-gradient-body text-text font-sans antialiased">
      <div className="card bg-[rgba(7,10,20,0.65)] rounded-xl p-3 shadow-card backdrop-blur-sm">
        <h2 className="text-left mb-4 ml-1.5 font-display text-lg font-bold tracking-tight">
          WittyWing
        </h2>

        <Navbar currentPage={currentPage} onNavigate={handleNavigate} onHelp={handleHelp} />

        {currentPage === 'auth' && <AuthPage onStatusMessage={handleStatusMessage} />}

        <hr className="border-none border-t border-white/[0.06] my-3" />

        {currentPage === 'profile-view' && isAuthenticated && (
          <ProfileView onNavigate={handleNavigate} onStatusMessage={handleStatusMessage} />
        )}

        {currentPage === 'profile-edit' && isAuthenticated && (
          <ProfileEdit onNavigate={handleNavigate} onStatusMessage={handleStatusMessage} />
        )}

        {!isAuthenticated && currentPage !== 'auth' && (
          <div className="text-muted text-sm py-4 text-center">
            Please sign in to access your profile.
          </div>
        )}

        {statusMessage && (
          <div className={`mt-2 text-xs text-center ${getStatusColor(statusMessage.type)}`}>
            {statusMessage.text}
          </div>
        )}

        <div className="text-center mt-2.5 text-[11px] text-muted">v1.2 • WittyWing</div>
      </div>
    </div>
  );
}
