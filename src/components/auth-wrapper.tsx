'use client'

import { useAuth } from '@clerk/clerk-react';
import { useInactivityTimer } from '@/lib/hooks/useInactivityTimer';
import { INACTIVITY_TIMEOUT, WARNING_TIME, handleSessionExpirationOnLoad, getSessionInfo } from '@/lib/cookieManager';
import { logger } from '@/lib/logger';
import { useEffect, useMemo } from 'react';

interface AuthWrapperProps {
  children: React.ReactNode;
  isLoading: boolean;
}

export const AuthWrapper = ({ children, isLoading }: AuthWrapperProps) => {
  const { isLoaded, isSignedIn } = useAuth();

  // Check for session expiration on page load
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      // Only check if user is authenticated
      handleSessionExpirationOnLoad(INACTIVITY_TIMEOUT, () => {
        // Custom logout handler if needed
        window.location.href = '/app/dashboard';
      });
    }
  }, [isLoaded, isSignedIn]);

  // Memoize the timer configuration to prevent unnecessary re-renders
  const timerConfig = useMemo(() => ({
    timeout: INACTIVITY_TIMEOUT,
    warningTime: WARNING_TIME,
    enabled: !isLoading && isLoaded && isSignedIn, // Only enable when app is loaded, auth is loaded, and user is signed in
  }), [isLoading, isLoaded, isSignedIn]);

  // Setup inactivity timer with warning system
  const {
    handleExtend,
    handleLogout
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