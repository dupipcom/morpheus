/**
 * Utility functions for managing Clerk cookies and inactivity timers
 */

const INACTIVITY_TIMEOUT = 15 * 60 * 1000; // 15 minutes in milliseconds
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
 * Sets up an inactivity timer that deletes Clerk cookies after the specified timeout
 * Uses localStorage to persist activity tracking across browser sessions
 * @param timeout - Timeout in milliseconds (defaults to 15 minutes)
 * @param onWarning - Callback function called when warning should be shown
 * @param onLogout - Callback function called when session should be terminated
 */
export const setupInactivityTimer = (
  timeout: number = INACTIVITY_TIMEOUT,
  onWarning?: () => void,
  onLogout?: () => void
) => {
  let inactivityTimer: NodeJS.Timeout;
  let warningTimer: NodeJS.Timeout;
  let activityCheckInterval: NodeJS.Timeout;

  const checkInactivity = () => {
    const lastActivity = getLastActivity();
    const now = Date.now();
    const timeSinceLastActivity = now - lastActivity;
    
    // If user has been inactive for the full timeout period, logout immediately
    if (timeSinceLastActivity >= timeout) {
      deleteClerkCookies();
      clearActivityStorage();
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = '/login';
      }
      return;
    }
    
    // If user has been inactive for (timeout - warningTime), show warning
    const warningTime = 2 * 60 * 1000; // 2 minutes
    if (timeSinceLastActivity >= (timeout - warningTime) && onWarning) {
      onWarning();
    }
  };

  const resetTimer = () => {
    // Update last activity in localStorage
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
    
    // Set up periodic checking for inactivity
    activityCheckInterval = setInterval(checkInactivity, 1000); // Check every second
    
    // Set warning timer (2 minutes before timeout)
    const warningTime = 2 * 60 * 1000; // 2 minutes
    warningTimer = setTimeout(() => {
      if (onWarning) {
        onWarning();
      }
    }, timeout - warningTime);
    
    // Set logout timer
    inactivityTimer = setTimeout(() => {
      deleteClerkCookies();
      clearActivityStorage();
      if (onLogout) {
        onLogout();
      } else {
        window.location.href = '/login';
      }
    }, timeout);
  };

  // Activity events to reset the timer
  const activityEvents = [
    'mousedown',
    'mousemove',
    'keypress',
    'scroll',
    'touchstart',
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
    return lastActivity ? parseInt(lastActivity, 10) : Date.now();
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
    localStorage.setItem(LAST_ACTIVITY_KEY, Date.now().toString());
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
    console.log('Login time set:', timestamp, 'for key:', LOGIN_TIME_KEY);
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