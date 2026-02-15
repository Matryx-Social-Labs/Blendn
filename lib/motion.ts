export const MOTION_DURATION = {
  instant: 100,
  fast: 160,
  normal: 220,
  slow: 320,
} as const

export const MOTION_EASING = {
  standard: [0.2, 0, 0, 1] as const,
  entrance: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
} as const

export const MOTION_STAGGER = {
  xFast: 18,
  fast: 28,
  normal: 40,
} as const

export const MOTION_SPRING = {
  gentle: {
    damping: 18,
    stiffness: 220,
    mass: 0.9,
  },
  snappy: {
    damping: 16,
    stiffness: 280,
    mass: 0.75,
  },
} as const
