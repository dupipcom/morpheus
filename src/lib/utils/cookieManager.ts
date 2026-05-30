/**
 * Utility functions for managing Clerk cookies and inactivity timers
 */
import { logger } from '../logger';

export const INACTIVITY_TIMEOUT = 15000 * 60 * 1000; // 15 minutes in milliseconds (reduced for testing)
export const WARNING_TIME = 5 * 60 * 1000; // 5 minutes warning (shows at 1 minute elapsed = 5 minutes remaining)
const LAST_ACTIVITY_KEY = 'dpip_last_activity';
const LOGIN_TIME_KEY = 'dpip_login_time';

// Flag to prevent infinite loops when signing out
let isSigningOut = false;

/**
 * Fetches the user's lastLogin time from the server
 * @returns The lastLogin timestamp in milliseconds, or null if not available
 */
const getServerLastLogin = async (): Promise<number | null> => {
  try {
    const response = await fetch('/api/v1/user', { method: 'GET' });
    if (response.ok) {
      const user = await response.json();
      const lastLoginIso = user?.lastLogin as string | undefined;
      if (lastLoginIso) {
        return new Date(lastLoginIso).getTime();
      }
    }
    return null;
  } catch (error) {
    logger('get_server_last_login_error', `Error fetching server lastLogin: ${error}`);
    return null;
  }
};

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
    logger('delete_cookies_error', `Error deleting Clerk cookies: ${error}`);
  }
};

/**
 * Clears all cookies except those that start with 'dpip_*'
 * This is used when the session expires to preserve dpip-specific cookies
 */
export const clearAllCookiesExceptDpip = () => {
  try {
    // Get all cookies
    const cookies = document.cookie.split(';');
    const cookiesToDelete: string[] = [];
    
    logger('clear_cookies_start', `Starting to clear cookies. Found ${cookies.length} cookies`);
    
    // Find and delete all cookies except those starting with 'dpip_'
    cookies.forEach(cookie => {
      const [name] = cookie.split('=');
      const trimmedName = name.trim();
      
      // Skip cookies that start with 'dpip_'
      if (trimmedName.startsWith('dpip_')) {
        logger('clear_cookies_skipping', `Skipping dpip cookie: ${trimmedName}`);
        return;
      }
      
      cookiesToDelete.push(trimmedName);
      
      // Delete cookie by setting it to expire in the past
      // Try multiple domain and path combinations to ensure deletion
      const deletionOptions = [
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`,
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`,
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`,
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=strict;`,
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; secure; samesite=lax;`,
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname}; secure;`,
        `${trimmedName}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname}; secure;`
      ];
      
      deletionOptions.forEach(option => {
        document.cookie = option;
      });
    });
    
    logger('clear_cookies_complete', `Cleared ${cookiesToDelete.length} cookies: ${cookiesToDelete.join(', ')}`);
    
    // Also clear activity storage when cookies are deleted
    clearActivityStorage();
    
    // Dispatch custom event to notify providers that cookies were cleared
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dpip:cookiesCleared'));
    }
  } catch (error) {
    logger('clear_cookies_except_dpip_error', `Error clearing cookies except dpip_*: ${error}`);
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
// Global warning state to prevent multiple warnings across all timer instances
let globalWarningShown = false;
let globalTimerActive = false;

/**
 * Resets the global warning state - should be called when session is extended
 */
export const resetGlobalWarningState = (): void => {
  globalWarningShown = false;
};

/**
 * Resets the global timer state - should be called when cleaning up
 */
export const resetGlobalTimerState = (): void => {
  globalTimerActive = false;
  globalWarningShown = false;
  isSigningOut = false;
};

export const setupInactivityTimer = (
  timeout: number = INACTIVITY_TIMEOUT,
  warningTime: number = WARNING_TIME,
  onWarning?: () => void,
  onLogout?: () => void
) => {
  // Prevent multiple timer instances
  if (globalTimerActive) {
    logger('timer_already_active', 'Timer already active, skipping initialization');
    return () => {}; // Return empty cleanup function
  }
  
  globalTimerActive = true;
  
  let inactivityTimer: NodeJS.Timeout;
  let warningTimer: NodeJS.Timeout;
  let activityCheckInterval: NodeJS.Timeout;

  let lastResetTime = 0;
  const RESET_DEBOUNCE = 1000; // 1 second debounce

  const checkInactivity = async () => {
    // Prevent multiple sign-out attempts
    if (isSigningOut) {
      return;
    }

    const now = Date.now();
    
    // Check server lastLogin time from user data
    const serverLoginTime = await getServerLastLogin();
    
    if (serverLoginTime === null) {
      // If no server login time, set local login time and return
      const localLoginTime = getLoginTime();
      if (localLoginTime === null) {
        setLoginTime();
      }
      return;
    }
    
    const timeSinceLogin = now - serverLoginTime;
    
    // If current time is greater than the timeout period, clear cookies and expire session
    if (timeSinceLogin >= timeout) {
      if (isSigningOut) {
        return; // Already signing out, prevent infinite loop
      }
      
      isSigningOut = true;
      logger('session_timeout_expired', `Session expired. Time since login: ${Math.floor(timeSinceLogin / 60000)}min`);
      clearAllCookiesExceptDpip();
      
      if (onLogout) {
        onLogout();
      } else {
        // Fallback: redirect if no logout handler provided
        window.location.href = '/';
      }
      return;
    }
    
    // If user has been logged in for (timeout - warningTime), show warning (only once)
    if (timeSinceLogin >= (timeout - warningTime) && onWarning && !globalWarningShown) {
      logger('session_timeout_warning', 'Warning triggered');
      globalWarningShown = true;
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
    
    // Set up periodic checking for inactivity (check every 10 seconds for better accuracy)
    activityCheckInterval = setInterval(() => {
      checkInactivity().catch(err => {
        logger('check_inactivity_error', `Error checking inactivity: ${err}`);
      });
    }, 10000);
    
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
      clearAllCookiesExceptDpip();
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = '/app/dashboard';
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

  // Add visibility change handler to check session when tab becomes active
  const handleVisibilityChange = () => {
    if (!document.hidden) {
      // Tab became active, check if session expired while inactive
      logger('visibility_change', 'Tab became active, checking session');
      checkInactivity().catch(err => {
        logger('check_inactivity_error', `Error checking inactivity on visibility change: ${err}`);
      });
    }
  };
  
  // Add focus handler for better mobile support
  const handleFocus = () => {
    logger('window_focus', 'Window focused, checking session');
    checkInactivity().catch(err => {
      logger('check_inactivity_error', `Error checking inactivity on focus: ${err}`);
    });
  };
  
  document.addEventListener('visibilitychange', handleVisibilityChange);
  window.addEventListener('focus', handleFocus);

  // Check for existing inactivity on startup
  checkInactivity().catch(err => {
    logger('check_inactivity_error', `Error checking inactivity on startup: ${err}`);
  });
  
  // Start the timer
  resetTimer();

  // Function to reset warning flag (called when session is extended)
  const resetWarning = () => {
    globalWarningShown = false;
  };

  // Return cleanup function
  return () => {
    globalTimerActive = false;
    
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
    
    // Remove visibility change and focus listeners
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    window.removeEventListener('focus', handleFocus);
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
    logger('get_last_activity_error', `Error getting last activity: ${error}`);
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
    logger('update_last_activity_error', `Error updating last activity: ${error}`);
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
    logger('set_login_time_error', `Error setting login time: ${error}`);
  }
};

/**
 * Clears the login time from localStorage
 */
export const clearLoginTime = (): void => {
  try {
    localStorage.removeItem(LOGIN_TIME_KEY);
  } catch (error) {
    logger('clear_login_time_error', `Error clearing login time: ${error}`);
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
    logger('get_login_time_error', `Error getting login time: ${error}`);
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
    logger('clear_activity_storage_error', `Error clearing activity storage: ${error}`);
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
    logger('check_inactivity_logout_error', `Error checking inactivity logout: ${error}`);
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
    logger('get_time_remaining_error', `Error getting time remaining: ${error}`);
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
    logger('check_authentication_error', `Error checking authentication: ${error}`);
    return false;
  }
};

/**
 * Checks if the session has expired based on server lastLogin time
 * This is used when the page is loaded to check if the user should be logged out
 * @param timeout - Timeout in milliseconds (defaults to 6 minutes)
 * @returns Promise<boolean> - true if session has expired, false otherwise
 */
export const isSessionExpired = async (timeout: number = INACTIVITY_TIMEOUT): Promise<boolean> => {
  try {
    const serverLoginTime = await getServerLastLogin();
    
    // If no server login time, session hasn't expired
    if (serverLoginTime === null) {
      return false;
    }
    
    const now = Date.now();
    const timeSinceLogin = now - serverLoginTime;
    
    const hasExpired = timeSinceLogin >= timeout;
    
    if (hasExpired) {
      logger('session_expired_on_load', `Session expired on page load. Time since login: ${Math.floor(timeSinceLogin / 60000)}min`);
    }
    
    return hasExpired;
  } catch (error) {
    logger('check_session_expiration_error', `Error checking session expiration: ${error}`);
    return false;
  }
};

/**
 * Handles session expiration on page load
 * This should be called when the app initializes to check if the user should be logged out
 * Enhanced for mobile scenarios where new tabs should respect existing session expiration
 * @param timeout - Timeout in milliseconds (defaults to 15 minutes)
 * @param onLogout - Optional callback function to call when logging out
 */
export const handleSessionExpirationOnLoad = async (
  timeout: number = INACTIVITY_TIMEOUT,
  onLogout?: () => void
): Promise<void> => {
  try {
    // Check if this is a fresh login (no local login time but user is authenticated)
    const localLoginTime = getLoginTime();
    const isFreshLogin = localLoginTime === null;
    
    // For fresh logins, set login time and be lenient
    if (isFreshLogin) {
      logger('fresh_login_detected', 'Fresh login detected, setting login time and being lenient');
      setLoginTime();
      return; // Don't check expiration for fresh logins
    }

    // Check server lastLogin time from user data
    const serverLoginTime = await getServerLastLogin();
    const now = Date.now();
    
    if (serverLoginTime === null) {
      // If no server login time, set local login time and return
      logger('session_expiration_check', 'No server lastLogin found, setting local login time');
      setLoginTime();
      return;
    }
    
    const timeSinceLogin = now - serverLoginTime;
    
    logger('session_expiration_check', `Checking session expiration. Server lastLogin: ${new Date(serverLoginTime).toISOString()}, Time since login: ${Math.floor(timeSinceLogin / 60000)}min`);
    
    // If current time is greater than the timeout period, clear cookies and expire session
    if (timeSinceLogin >= timeout) {
      if (isSigningOut) {
        return; // Already signing out, prevent infinite loop
      }
      
      isSigningOut = true;
      logger('handling_session_expiration', `Logging out due to expired session. Time since login: ${Math.floor(timeSinceLogin / 60000)}min`);
      clearAllCookiesExceptDpip();
      
      if (onLogout) {
        onLogout();
      } else {
        // Fallback: redirect if no logout handler provided
        window.location.href = '/app/dashboard';
      }
    } else {
      logger('session_expiration_check', 'Session is still valid');
    }
  } catch (error) {
    logger('handle_session_expiration_error', `Error handling session expiration: ${error}`);
  }
};

/**
 * Immediate session expiration check for page load
 * This should be called as soon as the page loads, before any React components mount
 * @param timeout - Timeout in milliseconds (defaults to 6 minutes)
 * @returns Promise<boolean> - true if session is expired and user should be logged out
 */
export const checkSessionExpirationImmediate = async (timeout: number = INACTIVITY_TIMEOUT): Promise<boolean> => {
  try {
    const serverLoginTime = await getServerLastLogin();
    const now = Date.now();
    
    if (serverLoginTime === null) {
      // If no server login time, session is not expired
      logger('immediate_session_check', 'No server lastLogin found, session not expired');
      return false;
    }
    
    const timeSinceLogin = now - serverLoginTime;
    
    logger('immediate_session_check', `Immediate session check. Server lastLogin: ${new Date(serverLoginTime).toISOString()}, Time since login: ${Math.floor(timeSinceLogin / 60000)}min`);
    
    // If current time is greater than the timeout period, session is expired
    if (timeSinceLogin >= timeout) {
      logger('immediate_session_check', `Session expired. Time since login: ${Math.floor(timeSinceLogin / 60000)}min`);
      return true;
    }
    
    logger('immediate_session_check', 'Session is still valid');
    return false;
  } catch (error) {
    logger('immediate_session_check_error', `Error in immediate session check: ${error}`);
    return false;
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
    logger('get_session_info_error', `Error getting session info: ${error}`);
    return { error: 'Failed to get session info' };
  }
}; 