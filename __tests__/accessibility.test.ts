import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * The accessibility sweep across the built screens — splash, sign-in,
 * onboarding, the Pulse and the Scene.
 *
 * ## The rule, stated once
 *
 * **Text in a fixed-height container needs a cap. Text in a growing one does
 * not.** React Native *clips* a glyph to its line height where CSS lets it
 * overflow, so scaled text in a box something else has already sized renders
 * as sliced letterforms rather than as large text. Capping everything would
 * defeat the setting for exactly the people it exists for, which is why this
 * is a list of specific places and not a blanket.
 *
 * ## What is deliberately *not* here
 *
 * Controls whose visible text is their label. A chip that renders `Nightlife`
 * needs `accessibilityRole` and `accessibilityState`, which the onboarding and
 * about-you chips already have — adding `accessibilityLabel="Nightlife"` is a
 * second copy of the same string that can drift from what is on screen.
 *
 * An audit that counted `accessibilityLabel` per `Pressable` flagged those as
 * gaps. They were not.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('text in a fixed-height box is capped', () => {
  const FIXED_BOXES: Array<[string, string[]]> = [
    ['onboarding button + input (EMBER_CONTROL_HEIGHT)', ['components', 'onboarding', 'EmberControls.tsx']],
    ['the tab bar label (TAB_BAR_LINE)', ['app', '(tabs)', '_layout.tsx']],
    ['the featured card (fixed aspect)', ['components', 'pulse', 'FeaturedCard.tsx']],
    ['the hero title (48/56)', ['components', 'scene', 'SceneHero.tsx']],
    ['the amenity tiles (126pt)', ['components', 'scene', 'SceneSections.tsx']],
    ['the bell badge (18pt)', ['components', 'pulse', 'NotificationBell.tsx']],
  ]

  it.each(FIXED_BOXES)('%s', (_label, parts) => {
    expect(read(...parts)).toContain('maxFontSizeMultiplier')
  })

  it('the tab bar is the tightest, because its height is a constant others read', () => {
    /*
     * `tabBarTop` derives the bar's height from `TAB_BAR_LINE`. A label that
     * grows does not make the bar taller — it overflows a box whose size
     * something else decided, and drags the Pulse's hero card sizing with it,
     * since that measures against the same number.
     */
    expect(read('app', '(tabs)', '_layout.tsx')).toContain('maxFontSizeMultiplier={1.2}')
  })
})

describe('decoration is hidden from the accessibility tree', () => {
  const DECORATIVE: Array<[string, string[]]> = [
    ['the splash animation', ['components', 'IntroAnimation.tsx']],
    ['the onboarding glow', ['components', 'onboarding', 'AtmosphericBackground.tsx']],
    ['the permission illustrations', ['components', 'onboarding', 'PermissionIllustration.tsx']],
    ['the sign-in wordmark', ['app', 'sign-in.tsx']],
  ]

  it.each(DECORATIVE)('%s carries both platform flags', (_label, parts) => {
    /*
     * `pointerEvents="none"` keeps decoration away from a *finger* and does
     * nothing whatsoever for VoiceOver — which would otherwise walk a stack of
     * empty views before reaching the question being asked.
     *
     * Both flags, because `accessibilityElementsHidden` is iOS and
     * `importantForAccessibility` is Android, and neither implies the other.
     */
    const src = read(...parts)
    expect(src).toContain('accessibilityElementsHidden')
    expect(src).toContain('importantForAccessibility="no-hide-descendants"')
  })
})

describe('the Scene keeps what the earlier pass gave it', () => {
  it('groups the hero caption instead of leaving four fragments', () => {
    expect(read('components', 'scene', 'SceneHero.tsx')).toContain('accessibilityRole="header"')
  })

  it('does not let the avatar row announce the creatures', () => {
    // Unlabelled it says "butterfly, turtle, fox" — worse than silence,
    // because it is confidently wrong about what is on screen.
    expect(read('components', 'scene', 'SceneSections.tsx')).toContain(
      'accessibilityLabel={`${count} people interested`}'
    )
  })
})
