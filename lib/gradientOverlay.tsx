import React, { createContext, useContext, useMemo, useRef } from 'react'
import { Animated } from 'react-native'

type GradientOverlayContextValue = {
  opacityValue: Animated.Value
  setScrollProgress: (offsetY: number, fadeDistance?: number) => void
}

const GradientOverlayContext = createContext<GradientOverlayContextValue | null>(null)

export function GradientOverlayProvider({ children }: { children: React.ReactNode }) {
  const opacityValue = useRef(new Animated.Value(0)).current

  const setScrollProgress = (offsetY: number, fadeDistance: number = 402) => {
    const clamped = Math.max(0, Math.min(1, offsetY / fadeDistance))
    // Use native driver for smoother updates; value is read only for opacity style
    opacityValue.setValue(clamped)
  }

  const value = useMemo(() => ({ opacityValue, setScrollProgress }), [opacityValue])
  return (
    <GradientOverlayContext.Provider value={value}>{children}</GradientOverlayContext.Provider>
  )
}

export function useGradientOverlay() {
  const ctx = useContext(GradientOverlayContext)
  if (!ctx) throw new Error('useGradientOverlay must be used within GradientOverlayProvider')
  return ctx
}


