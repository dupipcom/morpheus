/**
 * Utility functions for managing Clerk cookies and inactivity timers
 */
import { logger } from './logger';

export const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
export const WARNING_TIME = 2 * 60 * 1000; // 2 minutes in milliseconds
const LAST_ACTIVITY_KEY = 'dpip_last_activity';
const LOGIN_TIME_KEY = 'dpip_login_time';

/**
 * Deletes all cookies that start with '__clerk'
 */
export const deleteClerkCookies = () => {
  try {
    // Get all cookies
    const cookies = document.cookie.split(';');
    
    // Common Clerk cookie patterns
    const clerkCookiePatterns = [
      '__clerk',
      'clerk-db',
      'clerk-session',
      '__session',
      '__client',
      '__clerk_client',
      '__clerk_session'
    ];
    
    // Find and delete Clerk cookies
    cookies.forEach(cookie => {
      const [name] = cookie.split('=');
      const trimmedName = name.trim();
      
      // Check if cookie matches any Clerk pattern
      const isClerkCookie = clerkCookiePatterns.some(pattern => 
        trimmedName.startsWith(pattern)
      );
      
      if (isClerkCookie) {
        // Delete cookie by setting it to expire in the past
        // Try multiple domain and path combinations to ensure deletion
        const deletionOptions = [
          `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`,
          `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`,
          `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`,
          `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict;`,
          `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=lax;`
        ];
        
        deletionOptions.forEach(option => {
          document.cookie = option;
        });
      }
    });
    
    // Also clear activity storage when cookies are deleted
    clearActivityStorage();
  } catch (error) {
    console.error('Error deleting Clerk cookies:', error);
  }
};

/**
 * Sets up a session timeout timer that deletes Clerk cookies after the specified timeout
 * Uses login time from localStorage to measure session duration
 * @param timeout - Timeout in milliseconds (defaults to 1 minute)
 * @param warningTime - Warning time in milliseconds (defaults to 30 seconds)
 * @param onWarning - Callback function called when warning should be shown
 * @param onLogout - Callback function called when session should be terminated
 */
export const setupInactivityTimer = (
  timeout: number = INACTIVITY_TIMEOUT,
  warningTime: number = WARNING_TIME,
  onWarning?: () => void,
  onLogout?: () => void
) => {
  let inactivityTimer: NodeJS.Timeout;
  let warningTimer: NodeJS.Timeout;
  let activityCheckInterval: NodeJS.Timeout;

  let warningShown = false;
  let lastResetTime = 0;
  const RESET_DEBOUNCE = 1000; // 1 second debounce

  const checkInactivity = () => {
    const loginTime = getLoginTime();
    const now = Date.now();
    
    // If no login time is set, set it now and return
    if (loginTime === null) {
      setLoginTime();
      return;
    }
    
    const timeSinceLogin = now - loginTime;
    
    // If user has been logged in for the full timeout period, logout immediately
    if (timeSinceLogin >= timeout) {
      logger('session_timeout_expired', 'Session expired');
      deleteClerkCookies();
      clearActivityStorage();
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = '/login';
      }
      return;
    }
    
    // If user has been logged in for (timeout - warningTime), show warning (only once)
    if (timeSinceLogin >= (timeout - warningTime) && onWarning && !warningShown) {
      logger('session_timeout_warning', 'Warning triggered');
      warningShown = true;
      onWarning();
    }
  };

  const resetTimer = () => {
    const now = Date.now();
    
    // Debounce rapid resets
    if (now - lastResetTime < RESET_DEBOUNCE) {
      return;
    }
    lastResetTime = now;
    
    // Update last activity in localStorage (for other purposes)
    updateLastActivity();
    
    // Clear existing timers
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    if (warningTimer) {
      clearTimeout(warningTimer);
    }
    if (activityCheckInterval) {
      clearInterval(activityCheckInterval);
    }
    
    // Set up periodic checking for inactivity (check every 30 seconds instead of every second)
    activityCheckInterval = setInterval(checkInactivity, 30000);
    
    // Set warning timer
    logger('setting_warning_timer', 'Timer set');
    warningTimer = setTimeout(() => {
      logger('warning_timer_fired', 'Warning fired');
      if (onWarning) {
        onWarning();
      }
    }, timeout - warningTime);
    
    // Set logout timer
    inactivityTimer = setTimeout(() => {
      logger('session_timeout_expired', 'Timeout reached');
      deleteClerkCookies();
      clearActivityStorage();
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = '/login';
      }
    }, timeout);
  };

  // Activity events to reset the timer (reduced to prevent excessive resets)
  const activityEvents = [
    'mousedown',
    'keypress',
    'click',
    'focus'
  ];

  // Add event listeners for user activity
  activityEvents.forEach(event => {
    document.addEventListener(event, resetTimer, true);
  });

  // Check for existing inactivity on startup
  checkInactivity();
  
  // Start the timer
  resetTimer();

  // Function to reset warning flag (called when session is extended)
  const resetWarning = () => {
    warningShown = false;
  };

  // Return cleanup function
  return () => {
    if (inactivityTimer) {
      clearTimeout(inactivityTimer);
    }
    if (warningTimer) {
      clearTimeout(warningTimer);
    }
    if (activityCheckInterval) {
      clearInterval(activityCheckInterval);
    }
    activityEvents.forEach(event => {
      document.removeEventListener(event, resetTimer, true);
    });
  };
};

/**
 * Gets the last activity timestamp from localStorage
 */
export const getLastActivity = (): number => {
  try {
    const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
    if (!lastActivity) {
      // If no last activity is stored, set it to now and return it
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, now.toString());
      logger('no_stored_activity', 'Setting initial activity');
      return now;
    }
    const result = parseInt(lastActivity, 10);
    logger('get_last_activity', 'Retrieved');
    return result;
  } catch (error) {
    console.error('Error getting last activity:', error);
    return Date.now();
  }
};

/**
 * Updates the last activity timestamp in localStorage
 */
export const updateLastActivity = (): void => {
  try {
    const timestamp = Date.now().toString();
    localStorage.setItem(LAST_ACTIVITY_KEY, timestamp);
    logger('update_last_activity', 'Updated');
  } catch (error) {
    console.error('Error updating last activity:', error);
  }
};

/**
 * Sets the login time in localStorage
 */
export const setLoginTime = (): void => {
  try {
    const timestamp = Date.now().toString();
    localStorage.setItem(LOGIN_TIME_KEY, timestamp);
    updateLastActivity(); // Also update last activity on login
  } catch (error) {
    console.error('Error setting login time:', error);
  }
};

/**
 * Clears the login time from localStorage
 */
export const clearLoginTime = (): void => {
  try {
    localStorage.removeItem(LOGIN_TIME_KEY);
  } catch (error) {
    console.error('Error clearing login time:', error);
  }
};

/**
 * Gets the login time from localStorage
 */
export const getLoginTime = (): number | null => {
  try {
    const loginTime = localStorage.getItem(LOGIN_TIME_KEY);
    return loginTime ? parseInt(loginTime, 10) : null;
  } catch (error) {
    console.error('Error getting login time:', error);
    return null;
  }
};

/**
 * Clears all activity-related localStorage items
 */
export const clearActivityStorage = (): void => {
  try {
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(LOGIN_TIME_KEY);
  } catch (error) {
    console.error('Error clearing activity storage:', error);
  }
};

/**
 * Checks if the user should be logged out due to inactivity
 * @param timeout - Timeout in milliseconds (defaults to 15 minutes)
 * @returns true if user should be logged out, false otherwise
 */
export const shouldLogoutDueToInactivity = (timeout: number = INACTIVITY_TIMEOUT): boolean => {
  try {
    const lastActivity = getLastActivity();
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivity;
    
    return timeSinceLastActivity >= timeout;
  } catch (error) {
    console.error('Error checking inactivity logout:', error);
    return false;
  }
};

/**
 * Gets the time remaining before logout due to inactivity
 * @param timeout - Timeout in milliseconds (defaults to 15 minutes)
 * @returns time remaining in milliseconds, or 0 if already expired
 */
export const getTimeRemainingBeforeLogout = (timeout: number = INACTIVITY_TIMEOUT): number => {
  try {
    const lastActivity = getLastActivity();
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivity;
    
    return Math.max(0, timeout - timeSinceLastActivity);
  } catch (error) {
    console.error('Error getting time remaining:', error);
    return 0;
  }
};

/**
 * Checks if user is currently authenticated by looking for Clerk cookies
 */
export const isAuthenticated = (): boolean => {
  try {
    const cookies = document.cookie.split(';');
    return cookies.some(cookie => {
      const [name] = cookie.split('=');
      return name.trim().startsWith('__clerk');
    });
  } catch (error) {
    console.error('Error checking authentication:', error);
    return false;
  }
};

/**
 * Checks if the session has expired based on login time
 * This is used when the page is loaded to check if the user should be logged out
 * @param timeout - Timeout in milliseconds (defaults to 15 minutes)
 * @returns true if session has expired, false otherwise
 */
export const isSessionExpired = (timeout: number = INACTIVITY_TIMEOUT): boolean => {
  try {
    const loginTime = getLoginTime();
    
    // If no login time is set, session hasn't expired
    if (loginTime === null) {
      return false;
    }
    
    const now = Date.now();
    const timeSinceLogin = now - loginTime;
    
    const hasExpired = timeSinceLogin >= timeout;
    
    if (hasExpired) {
      logger('session_expired_on_load', 'Session expired on page load');
    }
    
    return hasExpired;
  } catch (error) {
    console.error('Error checking session expiration:', error);
    return false;
  }
};

/**
 * Handles session expiration on page load
 * This should be called when the app initializes to check if the user should be logged out
 * @param timeout - Timeout in milliseconds (defaults to 15 minutes)
 * @param onLogout - Optional callback function to call when logging out
 */
export const handleSessionExpirationOnLoad = (
  timeout: number = INACTIVITY_TIMEOUT,
  onLogout?: () => void
): void => {
  if (isSessionExpired(timeout)) {
    logger('handling_session_expiration', 'Logging out due to expired session');
    deleteClerkCookies();
    clearActivityStorage();
    
    if (onLogout) {
      onLogout();
    } else {
      window.location.href = '/login';
    }
  }
};

/**
 * Gets session information for debugging purposes
 * @returns object with session details
 */
export const getSessionInfo = () => {
  try {
    const loginTime = getLoginTime();
    const lastActivity = getLastActivity();
    const now = Date.now();
    
    if (loginTime === null) {
      return {
        hasLoginTime: false,
        isAuthenticated: isAuthenticated(),
        message: 'No login time set'
      };
    }
    
    const timeSinceLogin = now - loginTime;
    const timeSinceLastActivity = now - lastActivity;
    const isExpired = timeSinceLogin >= INACTIVITY_TIMEOUT;
    
    return {
      hasLoginTime: true,
      isAuthenticated: isAuthenticated(),
      loginTime: new Date(loginTime).toISOString(),
      lastActivity: new Date(lastActivity).toISOString(),
      timeSinceLogin: `${Math.floor(timeSinceLogin / 60000)} minutes`,
      timeSinceLastActivity: `${Math.floor(timeSinceLastActivity / 60000)} minutes`,
      isExpired,
      timeout: `${Math.floor(INACTIVITY_TIMEOUT / 60000)} minutes`
    };
  } catch (error) {
    console.error('Error getting session info:', error);
    return { error: 'Failed to get session info' };
  }
}; 