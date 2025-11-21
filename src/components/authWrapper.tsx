'use client'

import { useAuth, useClerk } from '@clerk/clerk-react';
import { useInactivityTimer } from '@/lib/hooks/useInactivityTimer';
import { INACTIVITY_TIMEOUT, WARNING_TIME, handleSessionExpirationOnLoad, getSessionInfo, clearAllCookiesExceptDpip } from '@/lib/cookieManager';
import { logger } from '@/lib/logger';
import { useEffect, useMemo, useCallback } from 'react';

interface AuthWrapperProps {
  children: React.ReactNode;
  isLoading: boolean;
}

export const AuthWrapper = ({ children, isLoading }: AuthWrapperProps) => {
  const { isLoaded, isSignedIn } = useAuth();
  const { signOut } = useClerk();

  // Create a logout handler that uses Clerk's signOut
  const handleSessionExpirationLogout = useCallback(async () => {
    try {
      logger('auth_wrapper_logout', 'Signing out via Clerk due to session expiration');
      // Clear all cookies except dpip_* ones before signing out
      clearAllCookiesExceptDpip();
      await signOut();
    } catch (error) {
      logger('auth_wrapper_logout_error', `Error signing out: ${error}`);
      // Fallback to redirect if signOut fails
      window.location.href = '/';
    }
  }, [signOut]);

  // Check for session expiration on page load and when auth state changes
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Only check if user is authenticated
      handleSessionExpirationOnLoad(INACTIVITY_TIMEOUT, handleSessionExpirationLogout);
    }
  }, [isLoaded, isSignedIn, handleSessionExpirationLogout]);

  // Additional check for session expiration when window regains focus
  useEffect(() => {
    const handleWindowFocus = () => {
      if (isLoaded && isSignedIn) {
        handleSessionExpirationOnLoad(INACTIVITY_TIMEOUT, handleSessionExpirationLogout);
      }
    };

    window.addEventListener('focus', handleWindowFocus);
    return () => window.removeEventListener('focus', handleWindowFocus);
  }, [isLoaded, isSignedIn, handleSessionExpirationLogout]);

  // Memoize the timer configuration to prevent unnecessary re-renders
  const timerConfig = useMemo(() => ({
    timeout: INACTIVITY_TIMEOUT,
    warningTime: WARNING_TIME,
    enabled: !isLoading && isLoaded && isSignedIn, // Only enable when app is loaded, auth is loaded, and user is signed in
    onLogout: handleSessionExpirationLogout, // Pass the logout handler to the timer
  }), [isLoading, isLoaded, isSignedIn, handleSessionExpirationLogout]);

  // Setup inactivity timer with warning system
  const {
    handleExtend,
    handleLogout: timerHandleLogout
  } = useInactivityTimer(timerConfig);

  // Log initialization only once and set up global test function
  useEffect(() => {
    logger('auth_wrapper', 'Initialized');
    
    // Expose test functions globally for debugging
    if (typeof window !== 'undefined') {
      (window as any).testInactivityWarning = handleExtend;
      (window as any).getSessionInfo = getSessionInfo;
    }
  }, [handleExtend]);

  return <>{children}</>;
}; 