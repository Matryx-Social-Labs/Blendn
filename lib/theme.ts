// Shared visual tokens for Blendn's UI foundation.
export const APP_COLORS = {
  backgroundBase: '#000000',
  backgroundElevated: '#1C1C1E',
  backgroundCard: '#2C2C2E',
  separator: 'rgba(255,255,255,0.14)',
  textPrimary: '#FFFFFF',
  textSecondary: '#EBEBF599',
  textTertiary: '#EBEBF54D',
  accent: '#0A84FF',
  accentPressed: '#0060DF',
  destructive: '#FF3B30',
  success: '#34C759',
} as const

export const APP_SPACING = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
} as const

export const APP_RADIUS = {
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  pill: 999,
} as const

export const APP_SIZE = {
  touchTarget: 44,
  iconSm: 16,
  iconMd: 20,
  iconLg: 24,
} as const

export const APP_ELEVATION = {
  low: {
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  medium: {
    shadowColor: '#000000',
    shadowOpacity: 0.22,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  high: {
    shadowColor: '#000000',
    shadowOpacity: 0.3,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
} as const

export const APP_MOTION = {
  duration: {
    instant: 90,
    fast: 160,
    normal: 220,
    slow: 300,
  },
  easing: {
    entrance: [0.16, 1, 0.3, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
    standard: [0.2, 0, 0, 1] as const,
  },
} as const

export const APP_CTA = {
  primary: {
    background: APP_COLORS.accent,
    text: APP_COLORS.textPrimary,
    pressed: APP_COLORS.accentPressed,
    disabled: 'rgba(10,132,255,0.4)',
  },
  secondary: {
    background: APP_COLORS.backgroundElevated,
    text: APP_COLORS.textPrimary,
    border: APP_COLORS.separator,
    pressed: APP_COLORS.backgroundCard,
    disabled: 'rgba(255,255,255,0.08)',
  },
  destructive: {
    background: APP_COLORS.destructive,
    text: APP_COLORS.textPrimary,
    pressed: '#D12D24',
    disabled: 'rgba(255,59,48,0.45)',
  },
} as const
