import { Skeleton } from "./skeleton"
import { Logo } from "./nav"

// Skeleton for settings view
export const SettingsSkeleton = () => {
  return (
    <div className="max-w-[720px] m-auto p-4">
      {/* Daily Actions Section */}
      <div>
        <Skeleton className="h-6 w-48 my-8" />
        <div className="flex flex-col md:flex-row mb-8">
          <Skeleton className="h-9 md:basis-2/3 md:mr-4 my-4 md:my-0" />
          <Skeleton className="h-9 w-full md:w-[120px] mb-4 mr-4" />
          <Skeleton className="h-9 w-full md:w-[120px] mb-4 mr-4" />
          <Skeleton className="h-9 w-full md:w-[120px] mb-4" />
          <Skeleton className="h-9 w-20 md:ml-4" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-4 border rounded h-12">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Weekly Actions Section */}
      <div>
        <Skeleton className="h-6 w-48 my-8 mt-16" />
        <div className="flex flex-col md:flex-row mb-8">
          <Skeleton className="h-9 md:basis-2/3 md:mr-4 my-4 md:my-0" />
          <Skeleton className="h-9 w-full md:w-[120px] mb-4 mr-4" />
          <Skeleton className="h-9 w-full md:w-[120px] mb-4 mr-4" />
          <Skeleton className="h-9 w-full md:w-[120px] mb-4" />
          <Skeleton className="h-9 w-20 md:ml-4" />
        </div>
        <div className="space-y-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center space-x-4 p-4 border rounded h-12">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-8" />
            </div>
          ))}
        </div>
      </div>

      {/* Settings Fields */}
      <div className="space-y-4">
        <Skeleton className="h-6 w-48 mt-8" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-6 w-48 mt-8" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-6 w-48 mt-8" />
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-6 w-48 mt-8" />
        <Skeleton className="h-9 w-full" />
      </div>
    </div>
  )
}

// Skeleton for task view
export const TaskViewSkeleton = () => {
  return (
    <div className="max-w-[1200px] m-auto p-4">
      <Skeleton className="h-6 w-64 mx-auto mb-8" />
      
      {/* Task Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 rounded-md" />
        ))}
      </div>

      {/* Earnings */}
      <Skeleton className="h-6 w-48 mx-auto mb-8" />

      {/* Carousel */}
      <div className="flex justify-center mb-8">
        <div className="flex space-x-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="text-center space-y-2">
              <Skeleton className="h-4 w-16 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto" />
              <Skeleton className="h-10 w-24 mx-auto" />
              <Skeleton className="h-10 w-24 mx-auto" />
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <div className="space-y-4 mx-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
      </div>
    </div>
  )
}

// Skeleton for mood view
export const MoodViewSkeleton = () => {
  return (
    <div className="max-w-[720px] m-auto p-4">
      <Skeleton className="h-6 w-48 mx-auto mb-8" />
      
      {/* Text Area */}
      <div className="mb-16">
        <Skeleton className="h-6 w-48 mb-4" />
        <Skeleton className="h-32 w-full" />
      </div>

      {/* Mood Sliders */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mb-24">
          <Skeleton className="h-6 w-32 mb-4" />
          <Skeleton className="h-4 w-full mb-4" />
          <Skeleton className="h-6 w-full" />
        </div>
      ))}

      {/* Carousel */}
      <div className="flex justify-center">
        <div className="flex space-x-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="text-center space-y-2">
              <Skeleton className="h-4 w-16 mx-auto" />
              <Skeleton className="h-4 w-20 mx-auto" />
              <Skeleton className="h-10 w-24 mx-auto" />
              <Skeleton className="h-10 w-24 mx-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Skeleton for analytics view
export const AnalyticsViewSkeleton = () => {
  return (
    <div className="max-w-[1200px] w-full m-auto p-4 md:px-32">
      {/* Analysis Text */}
      <div className="space-y-2 mb-8">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>

      {/* Charts */}
      <div className="space-y-16">
        <div>
          <Skeleton className="h-8 w-48 mx-auto mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
        
        <div>
          <Skeleton className="h-8 w-48 mx-auto mb-8" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    </div>
  )
}

// Generic loading skeleton
export const LoadingSkeleton = () => {
  return (
    <div className="flex flex-col center text-center w-full m-auto">
      {/* Navigation Menu List */}
      <div className="grid grid-cols-3">
        <Skeleton className="h-10 w-16 mx-auto" />
        <Skeleton className="h-10 w-20 mx-auto" />
        <Skeleton className="h-10 w-16 mx-auto" />
      </div>
      
      {/* Balance Section */}
      <div className="my-8">
        <Skeleton className="h-4 w-32 mx-auto mb-2" />
        <div className="flex justify-center">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-9 w-9 ml-2" />
        </div>
      </div>
    </div>
  )
}

// Skeleton for navigation component
export const NavSkeleton = () => {
  return (
    <nav className="sticky top-0 bg-gradient-to-bl 
          from-[#c4abefcc]
          to-[#f1cfffcc]
          to-50%
          dark:to-[#3e365ccc]
          dark:from-[#563769cc] p-8 z-[999]">
      <div className="flex justify-between">
        {/* Left side - empty */}
        <div className="md:flex hidden md:basis-1/3 items-center justify-start">
        </div>
        
        {/* Center - Logo */}
        <div className="relative basis-1/3 flex justify-start sm:justify-center">
          <Logo />
        </div>
        
        {/* Right side - skeleton for auth-dependent items */}
        <div className="flex items-center justify-end basis-1/3">
          
          {/* Sign Up button - hidden on mobile, visible on lg */}
          <div className="ml-2 flex items-center justify-center hidden lg:flex">
            <Skeleton className="h-9 w-20" />
          </div>
          <div className="ml-2 flex items-center justify-center flex lg:hidden">
            <Skeleton className="h-9 w-9" />
          </div>
          
          {/* Login button - hidden on mobile, visible on lg */}
          <div className="ml-2 flex items-center justify-center hidden lg:flex">
            <Skeleton className="h-9 w-16" />
          </div>
          <div className="ml-2 flex items-center justify-center flex lg:hidden">
            <Skeleton className="h-9 w-9" />
          </div>
          
          {/* User button */}
          <div className="ml-2 flex items-center justify-center">
            <Skeleton className="h-9 w-9" />
          </div>
          
          {/* Theme switch */}
          <div className="ml-2 flex items-center justify-center">
            <Skeleton className="h-[1.15rem] w-8" />
          </div>
        </div>
      </div>
    </nav>
  )
} 