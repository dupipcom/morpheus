import { useEffect, useRef, useCallback } from 'react';
import { toast } from '@/components/ui/sonner';
import { 
  setupInactivityTimer, 
  deleteClerkCookies, 
  setLoginTime, 
  getLastActivity,
  getLoginTime,
  updateLastActivity,
  clearActivityStorage,
  resetGlobalWarningState,
  resetGlobalTimerState
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
  warningTime = 5 * 60 * 1000, // 5 minutes warning (shows after 10 minutes)
  enabled = true,
  onLogout
}: UseInactivityTimerOptions = {}) => {
  const cleanupRef = useRef<(() => void) | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const toastIdRef = useRef<string | number | null>(null);
  const isInitializedRef = useRef(false);
  const timeoutRef = useRef(timeout);
  const warningShownRef = useRef(false);

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
    
    // Reset warning flag
    warningShownRef.current = false;
    resetGlobalWarningState();
    
    // Reset login time locally and on server to extend session
    setLoginTime();
    // Fire-and-forget server update of lastLogin
    try {
      fetch('/api/v1/user', {
        method: 'POST',
        body: JSON.stringify({ lastLogin: true }),
        cache: 'no-store'
      });
    } catch {}
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
    // Prevent multiple warnings
    if (warningShownRef.current || toastIdRef.current) {
      return;
    }
    
    // Dismiss any existing session toasts globally
    toast.dismiss();
    
    warningShownRef.current = true;
    
    // Show warning toast with countdown
    const showWarningToast = () => {
      const loginTime = getLoginTime();
      const now = Date.now();
      
      if (!loginTime) {
        // If no login time, set it and return
        setLoginTime();
        return;
      }
      
      const timeSinceLogin = now - loginTime;
      const remainingTime = timeoutRef.current - timeSinceLogin;
      
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
      if (toastIdRef.current) {
        toast.dismiss(toastIdRef.current);
        toastIdRef.current = null;
      }
      warningShownRef.current = false;
      resetGlobalTimerState();
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
    if (toastIdRef.current) {
      toast.dismiss(toastIdRef.current);
      toastIdRef.current = null;
    }
    warningShownRef.current = false;
    resetGlobalTimerState();
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