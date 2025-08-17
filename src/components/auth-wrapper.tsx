'use client'

import { useAuth } from '@clerk/clerk-react';
import { useInactivityTimer } from '@/lib/hooks/useInactivityTimer';

interface AuthWrapperProps {
  children: React.ReactNode;
  isLoading: boolean;
}

export const AuthWrapper = ({ children, isLoading }: AuthWrapperProps) => {
  const { isLoaded, isSignedIn } = useAuth();

  // Setup inactivity timer with warning system
  const {
    handleExtend,
    handleLogout
  } = useInactivityTimer({
    timeout: 15 * 60 * 1000, // 15 minutes
    warningTime: 2 * 60 * 1000, // 2 minutes warning
    enabled: !isLoading && isLoaded, // Only enable when app is loaded and auth is loaded
  });

  return <>{children}</>;
}; 