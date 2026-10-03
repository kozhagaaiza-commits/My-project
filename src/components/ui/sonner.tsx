"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

const MOBILE_QUERY = "(max-width: 767px)" // mobile < 768px (Блок 4.0)

function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

function useIsMobile() {
  return useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false
  )
}

interface AppToasterProps extends ToasterProps {
  /** Позиция тостов на mobile (< 768px); Блок 4.0: bottom-center. */
  mobilePosition?: ToasterProps["position"]
}

// Тема одна — тёмная (Блок 4.0), поэтому useTheme / next-themes не используются.
const Toaster = ({ mobilePosition, position, ...props }: AppToasterProps) => {
  const isMobile = useIsMobile()

  return (
    <Sonner
      theme="dark"
      position={isMobile && mobilePosition ? mobilePosition : position}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }
