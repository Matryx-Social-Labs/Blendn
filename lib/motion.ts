export const MOTION_DURATION = {
  fast: 160,
  normal: 220,
  slow: 320,
  /** First-load entrances on the Me tab: seen once, so they can be seen. */
  relaxed: 520,
} as const

export const MOTION_EASING = {
  entrance: [0.16, 1, 0.3, 1] as const,
  /**
   * A soft ease-out (easeOutCubic) for entrances you watch happen, the
   * once-per-load kind. `entrance` puts most of the movement in the first few
   * frames, which reads as a snap at 400ms+; this spreads it out and settles.
   */
  gentle: [0.33, 1, 0.68, 1] as const,
} as const

export const MOTION_STAGGER = {
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
