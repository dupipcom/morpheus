import { useEffect, useRef, useState, useCallback } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  setupInactivityTimer, 
  deleteClerkCookies, 
  setLoginTime, 
  getLastActivity,
  updateLastActivity,
  clearActivityStorage 
} from '../cookieManager';

interface UseInactivityTimerOptions {
  timeout?: number;
  warningTime?: number;
  enabled?: boolean;
  onLogout?: () => void;
}

/**
 * React hook for managing inactivity timer with warning system
 * @param options - Configuration options for the inactivity timer
 */
export const useInactivityTimer = ({
  timeout = 15 * 60 * 1000, // 15 minutes
  warningTime = 2 * 60 * 1000, // 2 minutes
  enabled = true,
  onLogout
}: UseInactivityTimerOptions = {}) => {
  const cleanupRef = useRef<(() => void) | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toastIdRef = useRef<string | number | null>(null);

  const handleWarning = useCallback(() => {
    // Show warning toast with countdown
    const showWarningToast = () => {
      const lastActivity = getLastActivity();
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      const remainingTime = timeout - timeSinceLastActivity;
      
      if (remainingTime <= 0) {
        handleLogout();
        return;
      }
      
      const minutes = Math.floor(remainingTime / 60000);
      const seconds = Math.floor((remainingTime % 60000) / 1000);
      const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;
      
      // Update or create toast
      if (toastIdRef.current) {
        toast.loading(`Session expires in ${timeString}`, {
          id: toastIdRef.current,
          action: {
            label: 'Extend Session',
            onClick: handleExtend,
          },
          cancel: {
            label: 'Logout Now',
            onClick: handleLogout,
          },
        });
      } else {
        toastIdRef.current = toast.loading(`Session expires in ${timeString}`, {
          action: {
            label: 'Extend Session',
            onClick: handleExtend,
          },
          cancel: {
            label: 'Logout Now',
            onClick: handleLogout,
          },
        });
      }
    };
    
    // Show initial warning
    showWarningToast();
    
    // Start countdown to update toast
    const countdown = setInterval(showWarningToast, 1000);
    countdownIntervalRef.current = countdown;
  }, [timeout]);

  const handleLogout = useCallback(() => {
    // Dismiss warning toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    
    deleteClerkCookies();
    clearActivityStorage();
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = '/login';
    }
  }, [onLogout]);

  const handleExtend = useCallback(() => {
    // Dismiss warning toast
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    
    // Clear existing countdown
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    
    // Update last activity to extend session
    updateLastActivity();
    
    // Show success toast
    toast.success('Session extended successfully');
    
    // Reset the inactivity timer
    if (cleanupRef.current) {
      cleanupRef.current();
    }
    cleanupRef.current = setupInactivityTimer(timeout, handleWarning, handleLogout);
  }, [timeout, handleWarning, handleLogout]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Setup the inactivity timer
    cleanupRef.current = setupInactivityTimer(timeout, handleWarning, handleLogout);

    // Cleanup function
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
        countdownIntervalRef.current = null;
      }
    };
  }, [timeout, enabled, handleWarning, handleLogout]);

  // Manual cleanup function
  const manualCleanup = useCallback(() => {
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Manual cookie deletion function
  const manualDeleteCookies = useCallback(() => {
    deleteClerkCookies();
  }, []);

  // Format time for display
  const formatTime = useCallback((ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }, []);

  return {
    manualCleanup,
    manualDeleteCookies,
    handleExtend,
    handleLogout,
  };
}; 