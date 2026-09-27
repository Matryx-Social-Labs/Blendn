import { Ionicons } from '@expo/vector-icons'
import { ReactNode, useEffect } from 'react'
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import {
  EMBER,
  EMBER_RADIUS,
  GUTTER,
  ICON,
  SPACE,
  TYPE,
} from '../../lib/theme'
import { progressPercent, type OnboardingStep } from '../../lib/onboarding'
import { EmberButton } from './EmberControls'
import { KEYBOARD_BEHAVIOR } from '../../lib/keyboard'

/**
 * The frame every onboarding screen sits in.
 *
 * Eight screens share a header, a scrolling middle and a pinned footer, and the
 * only things that differ are the headline, the fields and the label on the
 * button. Written once here rather than eight times: the parts that are easy to
 * get subtly different across eight files — the safe-area maths, the keyboard
 * behaviour, the progress arithmetic — are exactly the parts nobody notices are
 * inconsistent until a device shows it.
 */

interface Props {
  step: OnboardingStep
  title: string
  /**
   * The second half of the headline, set as its own span. Optional. It is
   * `textPrimary` like the rest: the accent on these screens is the CTA's.
   */
  titleAccent?: string
  subtitle?: string
  /**
   * The form body. Optional because the two permission screens have none —
   * their content is the headline, the explanation and the two buttons. The
   * design puts an illustration there; there is no exported asset for it, and
   * an invented one would be a drawing nobody designed.
   */
  children?: ReactNode

  ctaLabel: string
  onContinue: () => void
  ctaDisabled?: boolean
  ctaBusy?: boolean

  /** Rendered under the primary button. "Maybe later", "Save as draft". */
  secondaryLabel?: string
  onSecondary?: () => void

  /**
   * A reassurance line under the secondary button — e.g. location's "your
   * precise location is never shared with strangers." Optional: most screens
   * have nothing sensitive enough to need one.
   */
  footerNote?: string

  onBack?: () => void
}

const EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1)
/** The width the bar last showed, so the next step's bar can start from it. */
let lastShownPercent = 0

export function OnboardingScreen({
  step,
  title,
  titleAccent,
  subtitle,
  children,
  ctaLabel,
  onContinue,
  ctaDisabled,
  ctaBusy,
  secondaryLabel,
  onSecondary,
  footerNote,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets()
  const percent = progressPercent(step)
  const reduceMotion = useReducedMotion()
  /*
   * The bar fills from where the last step left it.
   *
   * Every step is its own screen, so each mounted with the fill already at
   * its new width — the bar never visibly moved, and "you are further along"
   * went unsaid. Now it starts at the previous step's width (going back, it
   * drains) and eases to this one once the push has mostly landed.
   *
   * `width`, which is normally off-limits: the fill is absolutely positioned
   * and has no children that lay out, so nothing else re-flows — and `scaleX`
   * would squash its rounded end. Reduce Motion: it is simply at its width.
   */
  const fill = useSharedValue(reduceMotion ? percent : lastShownPercent)
  useEffect(() => {
    lastShownPercent = percent
    if (reduceMotion) {
      fill.set(percent)
      return
    }
    fill.set(withDelay(200, withTiming(percent, { duration: 300, easing: EASE_OUT })))
  }, [percent, reduceMotion, fill])
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.get()}%` }))

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        {/*
         * The back chevron keeps its footprint when there is nowhere to go
         * back to, rather than being removed — otherwise the progress bar
         * shifts left on the first screen and jumps right on the second.
         */}
        <Pressable
          onPress={onBack}
          disabled={!onBack}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Go back"
          style={styles.backButton}
        >
          {onBack ? <Ionicons name="arrow-back" size={ICON.md} color={EMBER.textPrimary} /> : null}
        </Pressable>

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <Animated.View style={[styles.progressFill, fillStyle]} />
        </View>

        <Text style={styles.progressLabel}>{percent}%</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={KEYBOARD_BEHAVIOR}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          /*
           * A screen with nothing to scroll must not scroll.
           *
           * The two permission screens have no body at all — headline, a
           * sentence, two buttons — and a ScrollView bounces by default even
           * when its content fits. That rubber-band on a fixed page reads as
           * the screen being broken, or as content hiding below the fold that
           * never arrives.
           *
           * `alwaysBounceVertical` off is the general rule: bounce only when
           * there is genuinely something below. `scrollEnabled` off when there
           * is no body at all makes those two pages properly immovable rather
           * than merely still.
           */
          alwaysBounceVertical={false}
          scrollEnabled={!!children}
        >
          <View style={styles.headlineBlock}>
            <Text style={styles.title}>
              {title}
              {titleAccent ? <Text style={styles.titleAccent}>{titleAccent}</Text> : null}
            </Text>
            {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          </View>

          {children ? <View style={styles.body}>{children}</View> : null}
        </ScrollView>
      </KeyboardAvoidingView>

      {/*
       * Pinned rather than at the end of the scroll, and opaque over the
       * page: the design puts the action within one-handed reach, and on a
       * screen with six fields a button that scrolls away is a button people
       * think is missing.
       */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, SPACE.lg) }]}>
        <EmberButton
          label={ctaLabel}
          onPress={onContinue}
          disabled={ctaDisabled}
          busy={ctaBusy}
        />
        {secondaryLabel && onSecondary ? (
          <Pressable onPress={onSecondary} hitSlop={8} accessibilityRole="button">
            <Text style={styles.secondary}>{secondaryLabel}</Text>
          </Pressable>
        ) : null}
        {footerNote ? (
          <View style={styles.footerNoteRow}>
            <Ionicons name="lock-closed" size={ICON.sm} color={EMBER.textTertiary} />
            <Text style={styles.footerNote}>{footerNote.toUpperCase()}</Text>
          </View>
        ) : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: EMBER.bg },
  flex: { flex: 1 },


  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.lg,
    paddingHorizontal: GUTTER,
    paddingBottom: SPACE.xl,
  },
  backButton: { width: ICON.md, height: ICON.md, alignItems: 'center', justifyContent: 'center' },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    overflow: 'hidden',
  },
  // Flat, like every surface (docs/DESIGN_SYSTEM.md): a plain fill whose
  // width animates, clipped to the track's pill by `overflow: hidden`.
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.textPrimary,
  },
  progressLabel: TYPE.label,

  scrollContent: { paddingHorizontal: GUTTER, paddingTop: SPACE.sm, paddingBottom: SPACE.xxl },
  headlineBlock: { gap: SPACE.sm, marginBottom: SPACE.xxl },
  title: TYPE.display,
  titleAccent: { color: EMBER.textPrimary },
  subtitle: { ...TYPE.body, color: EMBER.textSecondary, maxWidth: 300 },
  body: { gap: SPACE.xxl },

  footer: {
    paddingHorizontal: GUTTER,
    paddingTop: SPACE.lg,
    gap: SPACE.md,
    // Opaque page colour, so scrolled text never shows through the button.
    backgroundColor: EMBER.bg,
  },
  secondary: {
    ...TYPE.body,
    textAlign: 'center',
    color: EMBER.textTertiary,
    paddingVertical: SPACE.xs,
  },
  footerNoteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: SPACE.xs,
  },
  footerNote: { ...TYPE.label, color: EMBER.textTertiary },
})
