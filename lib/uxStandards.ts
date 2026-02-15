import { APP_MOTION, APP_SIZE, APP_SPACING } from './theme'

export type BlendnPrinciple = 'simplicity' | 'fluidity' | 'delight'

export const BLENDN_UX_PRINCIPLES: Record<BlendnPrinciple, string> = {
  simplicity: 'One primary action per step. Defer advanced controls until needed.',
  fluidity: 'Prefer contextual overlays and continuity transitions over abrupt screen swaps.',
  delight: 'Use selective polish on meaningful moments, not on every tap.',
}

export const INTERACTION_STANDARDS = {
  minTouchTarget: APP_SIZE.touchTarget,
  sectionSpacing: APP_SPACING.lg,
  inlineValidationFirst: true,
  destructiveRequiresExplicitConfirm: true,
  allowBackdropDismissForDestructive: false,
} as const

export type TraySize = 'compact' | 'default' | 'expanded'

export const TRAY_SPECS: Record<
  TraySize,
  {
    maxHeightPercent: number
    topInset: number
    horizontalPadding: number
    cornerRadius: number
  }
> = {
  compact: {
    maxHeightPercent: 0.35,
    topInset: APP_SPACING['4xl'],
    horizontalPadding: APP_SPACING.md,
    cornerRadius: 20,
  },
  default: {
    maxHeightPercent: 0.55,
    topInset: APP_SPACING['3xl'],
    horizontalPadding: APP_SPACING.md,
    cornerRadius: 24,
  },
  expanded: {
    maxHeightPercent: 0.8,
    topInset: APP_SPACING['2xl'],
    horizontalPadding: APP_SPACING.sm,
    cornerRadius: 24,
  },
}

export const TRANSITION_SPECS = {
  tabChangeMs: APP_MOTION.duration.fast,
  trayEnterMs: APP_MOTION.duration.normal,
  trayExitMs: APP_MOTION.duration.fast,
  feedbackPulseMs: APP_MOTION.duration.instant,
} as const

export const HIGH_VALUE_DELIGHT_MOMENTS = [
  'first_match',
  'event_check_in_success',
  'profile_completion',
] as const

export type HighValueDelightMoment = typeof HIGH_VALUE_DELIGHT_MOMENTS[number]
