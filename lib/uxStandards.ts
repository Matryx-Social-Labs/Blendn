import { APP_MOTION, CONTROL, EMBER_RADIUS, GUTTER, SPACE } from './theme'

export type BlendnPrinciple = 'simplicity' | 'fluidity' | 'delight'

export const BLENDN_UX_PRINCIPLES: Record<BlendnPrinciple, string> = {
  simplicity: 'One primary action per step. Defer advanced controls until needed.',
  fluidity: 'Prefer contextual overlays and continuity transitions over abrupt screen swaps.',
  delight: 'Use selective polish on meaningful moments, not on every tap.',
}

export const INTERACTION_STANDARDS = {
  minTouchTarget: CONTROL.md,
  sectionSpacing: SPACE.xxl,
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
    topInset: SPACE.xxxl,
    horizontalPadding: GUTTER,
    cornerRadius: EMBER_RADIUS.lg,
  },
  default: {
    maxHeightPercent: 0.55,
    topInset: SPACE.xxxl,
    horizontalPadding: GUTTER,
    cornerRadius: EMBER_RADIUS.lg,
  },
  expanded: {
    maxHeightPercent: 0.8,
    topInset: SPACE.xxl,
    horizontalPadding: GUTTER,
    cornerRadius: EMBER_RADIUS.lg,
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
