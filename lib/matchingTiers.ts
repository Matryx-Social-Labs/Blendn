/**
 * Who sees each matching field (Flow 14 · 14.0, `flow14.js` SEES and the field → tier board). A: chosen tastes. B: origin-like.
 * C: identity. O: owner only. The sentence is the design's; the glyph says it at a glance (eye, eye-off, lock).
 */
export type Tier = 'A' | 'B' | 'C' | 'O'

export const TIER_SEES: Record<Tier, string> = {
  A: 'Shown to people you match with.',
  B: 'Shown to people you match with, in rooms of 8 or more.',
  C: 'Shown only after you reveal yourself.',
  O: 'Nobody but you sees this.',
}

export const TIER_ICON: Record<Tier, 'eye' | 'eye-off' | 'lock'> = { A: 'eye', B: 'eye', C: 'eye-off', O: 'lock' }

export const FIELD_TIER = {
  interests: 'A',
  iplTeam: 'A',
  thisOrThat: 'A',
  artists: 'A',
  intent: 'A',
  sign: 'A',
  languages: 'B',
  homeState: 'B',
  workField: 'B',
  college: 'C',
  neighbourhood: 'C',
  occupation: 'C',
  prompts: 'C',
  photos: 'C',
  gender: 'O',
  interestedIn: 'O',
  orientation: 'O',
} as const satisfies Record<string, Tier>

export type MatchingField = keyof typeof FIELD_TIER

/**
 * Orientation is owner-only until the person turns "show on profile" on (`show_orientation`); then `GET /profiles/:id` sends it to
 * everyone who may see who they are, which is Tier C. Saying "nobody" then would be false reassurance about special-category data.
 */
export const orientationTier = (shownOnProfile: boolean): Tier => (shownOnProfile ? 'C' : 'O')

/** The sentence under a field, and its glyph. `tier` overrides the field's own (orientation, by consent). */
export const whoSees = (field: MatchingField, tier: Tier = FIELD_TIER[field]): { tier: Tier; text: string; icon: (typeof TIER_ICON)[Tier] } => {
  return { tier, text: TIER_SEES[tier], icon: TIER_ICON[tier] }
}
