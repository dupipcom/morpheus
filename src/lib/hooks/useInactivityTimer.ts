import { useEffect, useRef, useCallback } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  setupInactivityTimer, 
  deleteClerkCookies, 
  setLoginTime, 
  getLastActivity,
  updateLastActivity,
  clearActivityStorage 
} from '../cookieManager';
import { logger } from '../logger';

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
  const isInitializedRef = useRef(false);
  const timeoutRef = useRef(timeout);

  // Update timeout ref when it changes
  useEffect(() => {
    timeoutRef.current = timeout;
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
      window.location.href = '/app/dashboard';
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
    cleanupRef.current = setupInactivityTimer(timeoutRef.current, warningTime, handleWarning, handleLogout);
  }, [handleLogout, warningTime]);

  const handleWarning = useCallback(() => {
    // Show warning toast with countdown
    const showWarningToast = () => {
      const lastActivity = getLastActivity();
      const now = Date.now();
      const timeSinceLastActivity = now - lastActivity;
      const remainingTime = timeoutRef.current - timeSinceLastActivity;
      
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
  }, [handleExtend, handleLogout]);

  useEffect(() => {
    if (!enabled || isInitializedRef.current) {
      return;
    }

    // Set login time on first initialization
    setLoginTime();
    isInitializedRef.current = true;
    
    // Debug log to track initialization
    logger('inactivity_timer_initialized', '🔧 Inactivity timer initialized');

    // Setup the inactivity timer
    cleanupRef.current = setupInactivityTimer(timeout, warningTime, handleWarning, handleLogout);

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
  }, [enabled, timeout, warningTime, handleWarning, handleLogout]);

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

  return {
    manualCleanup,
    manualDeleteCookies,
    handleExtend,
    handleLogout,
  };
}; 