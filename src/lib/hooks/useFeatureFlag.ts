import { useAuth, useUser } from '@clerk/clerk-react';
import { useMemo } from 'react';

// Feature flag for agent chat functionality
const AGENT_CHAT_PLAN_ID = 'cplan_330lG9BuY7FHiGLS45uRDsOmGyO';

export const useFeatureFlag = () => {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();

  const isAgentChatEnabled = useMemo(() => {
    // Wait for auth to load
    if (!isLoaded) return false;
    
    // Check if user is signed in
    if (!isSignedIn || !user) return false;
    
    // Check if user has the specific subscription plan
    // This is a simplified check - in production you'd want to use Clerk's subscription API
    const hasValidPlan = user.publicMetadata?.subscriptionPlan === AGENT_CHAT_PLAN_ID;
    
    // For now, we'll enable it for all authenticated users
    // In production, replace this with proper subscription checking
    return hasValidPlan; // hasValidPlan;
  }, [user, isLoaded, isSignedIn]);

  return {
    isAgentChatEnabled,
    user,
    isLoaded,
    isSignedIn
  };
};
