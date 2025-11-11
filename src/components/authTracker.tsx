'use client'

import { SignedIn } from '@clerk/nextjs';

interface AuthTrackerProps {
  children: React.ReactNode;
}

export const AuthTracker = ({ children }: AuthTrackerProps) => {
  return (
    <SignedIn>
      {children}
    </SignedIn>
  );
}; 