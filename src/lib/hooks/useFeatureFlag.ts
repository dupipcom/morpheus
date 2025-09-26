import { useAuth } from '@clerk/clerk-react';
import { useMemo } from 'react';


export const useFeatureFlag = () => {
  const { isLoaded, isSignedIn, ...user } = useAuth();

  const isAgentChatEnabled = useMemo(() => {
    // Wait for auth to load
    if (!isLoaded) return false;
    
    // Check if user is signed in
    if (!isSignedIn || !user) return false;
    
    // Check if user has the specific subscription plan
    // This is a simplified check - in production you'd want to use Clerk's subscription API
    const hasValidPlan = user.has({ feature: 'ai_assistant' });
    
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
