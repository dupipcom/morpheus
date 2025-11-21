"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, ToasterProps, toast } from "sonner"

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: "bg-background text-foreground border-border font-sans rounded-lg shadow-lg",
          title: "text-foreground font-sans font-medium",
          description: "text-muted-foreground font-sans text-sm",
          actionButton: "bg-primary text-primary-foreground font-sans hover:bg-primary/90 rounded-md",
          cancelButton: "bg-muted text-muted-foreground font-sans hover:bg-muted/80 rounded-md",
          success: "bg-background border-success",
          error: "bg-background border-destructive",
          loading: "bg-background border-border",
          info: "bg-background border-border",
          warning: "bg-background border-border",
        },
      }}
      style={
        {
          "--normal-bg": "var(--background)",
          "--normal-text": "var(--foreground)",
          "--normal-border": "var(--border)",
          "--success-bg": "var(--background)",
          "--success-text": "var(--success)",
          "--success-border": "var(--success)",
          "--error-bg": "var(--background)",
          "--error-text": "var(--destructive)",
          "--error-border": "var(--destructive)",
          "--loading-bg": "var(--background)",
          "--loading-text": "var(--foreground)",
          "--loading-border": "var(--border)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster, toast }
