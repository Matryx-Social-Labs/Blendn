import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { ReactNode } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { AtmosphericBackground } from './AtmosphericBackground'

import {
  EMBER,
  EMBER_GLOW,
  EMBER_GRADIENT,
  EMBER_RADIUS,
  EMBER_TYPE,
} from '../../lib/theme'
import { progressPercent, type OnboardingStep } from '../../lib/onboarding'
import { EmberButton } from './EmberControls'

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
  /** The second half of the headline, printed in the accent colour. Optional. */
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

  onBack?: () => void
}

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
  onBack,
}: Props) {
  const insets = useSafeAreaInsets()
  const percent = progressPercent(step)

  return (
    <View style={styles.root}>
      {/*
       * The two blurred blobs. `pointerEvents="none"` because they cover the
       * whole screen and would otherwise eat every tap on the form beneath.
       */}
      <AtmosphericBackground />

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
          {onBack ? <Ionicons name="arrow-back" size={20} color={EMBER.accent} /> : null}
        </Pressable>

        <View
          style={styles.progressTrack}
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: 100, now: percent }}
        >
          <LinearGradient
            colors={[...EMBER_GRADIENT.colors]}
            start={EMBER_GRADIENT.start}
            end={EMBER_GRADIENT.end}
            style={[styles.progressFill, { width: `${percent}%` }]}
          />
        </View>

        <Text style={styles.progressLabel}>{percent}%</Text>
      </View>

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
       * Pinned rather than at the end of the scroll, and translucent over the
       * page: the design puts the action within one-handed reach, and on a
       * screen with six fields a button that scrolls away is a button people
       * think is missing.
       */}
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
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
    gap: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  backButton: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.surfaceSunken,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: EMBER_RADIUS.pill,
    ...EMBER_GLOW.progress,
  },
  progressLabel: EMBER_TYPE.progress,

  scrollContent: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 32 },
  headlineBlock: { gap: 8, marginBottom: 40 },
  title: EMBER_TYPE.display,
  titleAccent: { color: EMBER.accent },
  subtitle: { ...EMBER_TYPE.subtitle, maxWidth: 300 },
  body: { gap: 40 },

  footer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 12,
    // The design's `backdrop-blur` again — same substitution as the blobs, and
    // here the near-opaque background is what actually stops text showing
    // through, not the blur.
    backgroundColor: 'rgba(15,14,14,0.94)',
  },
  secondary: {
    ...EMBER_TYPE.subtitle,
    textAlign: 'center',
    color: EMBER.textTertiary,
    paddingVertical: 4,
  },
})
