'use client'

// TODO: The Steady tasks toolbar was removed during the Do rebuild (#441 follow-up).
// The layout wrapper below is kept because app pages rely on it for spacing.
export const ViewMenu = ({ active, children }: { active: string; children?: React.ReactNode }) => {
  void active
  void children
  return (
    <div className="relative p-4 w-full max-w-[1200px] p-4 m-auto mb-4 md:mb-8">
      <div className="m-auto grid grid-cols-1 md:grid-cols-4 grid-rows-auto md:grid-rows-auto gap-4 auto-rows-min" />
    </div>
  )
}
