// Shared visual tokens for Blendn's UI foundation.
// Sourced from Figma (Zi2KcUzhEcLRdqyit22LdQ) — dark, warm "atmospheric" theme.
export const APP_COLORS = {
  backgroundBase: '#0F0E0E',
  backgroundElevated: '#141313',
  backgroundCard: '#211F1F',
  backgroundInput: '#272525',
  separator: 'rgba(174,170,170,0.16)',
  textPrimary: '#FFFFFF',
  textSecondary: '#AEAAAA',
  textTertiary: '#787574',
  // Coral → pink accent, used as a 135deg gradient on primary CTAs/badges/active states.
  accent: '#FF906D',
  accentSecondary: '#FF6D8D',
  accentGradient: ['#FF906D', '#FF6D8D'] as [string, string],
  accentPressed: '#E8785A',
  // Dark text/icon color used on top of the coral/pink gradient for contrast.
  onAccent: '#5B1600',
  // Secondary highlight used on event meta tags (date/location pills).
  highlight: '#F79EFF',
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
  '2xl': 32,
  '3xl': 48,
  pill: 999,
} as const

// Google Fonts family names, loaded via @expo-google-fonts in app/_layout.tsx.
export const APP_FONTS = {
  heading: 'PlusJakartaSans_700Bold',
  headingExtraBold: 'PlusJakartaSans_800ExtraBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_500Medium',
  bodySemiBold: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
  bodyExtraBold: 'Manrope_800ExtraBold',
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
  // Primary CTAs render as a 135deg gradient pill (see expo-linear-gradient usage in
  // ActionTray.tsx / shared button components) rather than a flat background.
  primary: {
    gradient: APP_COLORS.accentGradient,
    text: APP_COLORS.onAccent,
    disabledGradient: ['rgba(255,144,109,0.4)', 'rgba(255,109,141,0.4)'] as [string, string],
  },
  secondary: {
    background: APP_COLORS.backgroundCard,
    text: APP_COLORS.textPrimary,
    border: APP_COLORS.separator,
    pressed: APP_COLORS.backgroundInput,
    disabled: 'rgba(255,255,255,0.06)',
  },
  destructive: {
    background: APP_COLORS.destructive,
    text: APP_COLORS.textPrimary,
    pressed: '#D12D24',
    disabled: 'rgba(255,59,48,0.45)',
  },
} as const
