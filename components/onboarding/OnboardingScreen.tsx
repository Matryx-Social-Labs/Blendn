import { barTop } from '../../lib/barGeometry'
import { ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Backdrop, ORB_LEVEL } from './Backdrop'
import { KeyboardPage } from './KeyboardPage'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { ProgressBar } from '../ds/ProgressBar'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, SIZE, SPACE } from '../../lib/design/tokens'
import { useKeyboardShown } from '../../lib/keyboard'
import { ONBOARDING_STEPS, progress, stepIndex, type OnboardingStep } from '../../lib/onboarding'

/**
 * The frame every onboarding screen sits in (guidelines/flow-2, `frame`).
 *
 * Eight screens share a header, a scrolling middle and a pinned dock, and the only things that differ are the headline, the
 * fields and the label on the button. Written once here rather than eight times: the parts that are easy to get subtly
 * different across eight files (the safe-area maths, the keyboard behaviour, the progress arithmetic) are exactly the parts
 * nobody notices are inconsistent until a device shows it.
 *
 * L0 the brand orbs at 0.45 (held while the keyboard is up), L2 a glass header with the back circle and "Step n of 8", the
 * 4 pt progress bar under it, the body, and an L2 glass dock with the gradient primary, a text secondary and the lock note.
 */

interface Props {
  /**
   * Drives the header and the progress bar. Absent on the one screen after the last step, "Bring your friends", which is past
   * the flow's 100% and draws neither.
   */
  step?: OnboardingStep
  title: string
  /** The second half of the headline, set as its own span. It is `textPrimary` like the rest: the accent on these screens is the CTA's. */
  titleAccent?: string
  subtitle?: string
  /**
   * The form body. Optional because the two permission screens have no form: their content is an illustration, which is
   * still a child. A screen with nothing to scroll does not scroll.
   *
   * The page follows the focused field by itself (`KeyboardPage`): a text field needs nothing spread onto it.
   */
  children?: ReactNode

  ctaLabel: string
  onContinue: () => void
  ctaDisabled?: boolean
  /**
   * A press on the primary while it is off: the screen says why (a sentence under the field) rather than leave a dead button.
   * A disabled button takes no press, so the press is taken by the wrapper around it.
   */
  onCtaDisabledPress?: () => void
  /** The primary refused (motion #20): its shake and the one `H.error`. */
  ctaRefused?: boolean
  ctaBusy?: boolean

  /** Under the primary: "Maybe later", "Skip". */
  secondaryLabel?: string
  onSecondary?: () => void

  /** A reassurance line under the secondary button, with the lock (location's "your precise location is never shared"). */
  footerNote?: string

  onBack?: () => void
}

/** The subtitle's reading measure, from the frame. */
const SUBTITLE_MEASURE = 340

export function OnboardingScreen({
  step,
  title,
  titleAccent,
  subtitle,
  children,
  ctaLabel,
  onContinue,
  ctaDisabled,
  onCtaDisabledPress,
  ctaRefused,
  ctaBusy,
  secondaryLabel,
  onSecondary,
  footerNote,
  onBack,
}: Props) {
  const insets = useSafeAreaInsets()
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const keyboardUp = useKeyboardShown()
  const android = Platform.OS === 'android'
  const circle = android ? SIZE.circleButtonAndroid : SIZE.circleButton

  return (
    <View style={styles.root}>
      <Backdrop level={ORB_LEVEL.onboarding} paused={keyboardUp} testID="onboarding-backdrop" />

      {/* The glass bar is there on every step, the empty one too (Bring your friends, the first step's missing back). */}
      <Material role="bar" testID="onboarding-header" style={[styles.header, { paddingTop: barTop(insets.top) }, contrast && IC_HAIRLINE]}>
        <View style={[styles.headerRow, { height: circle }]}>
          {onBack ? (
            <IconButton icon={android ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={onBack} testID="onboarding-back" />
          ) : null}
          {step ? (
            <Text testID="onboarding-step" style={[styles.stepLabel, styles.step]}>
              {`Step ${stepIndex(step) + 1} of ${ONBOARDING_STEPS.length}`}
            </Text>
          ) : null}
        </View>
      </Material>

      {step ? (
        <View style={styles.progress}>
          <ProgressBar progress={progress(step)} testID="onboarding-progress" />
        </View>
      ) : null}

      <KeyboardPage
        scrollProps={{
          testID: 'onboarding-scroll',
          contentContainerStyle: [styles.scrollContent, step ? null : styles.scrollContentBare],
          // A screen with nothing to scroll must not rubber-band: it reads as the screen being broken.
          alwaysBounceVertical: false,
          scrollEnabled: !!children,
        }}
        dockProps={{ keyboardUp, testID: 'onboarding-dock' }}
        dock={
          <>
            {/* A disabled primary takes no press: the wrapper does, so a tap on it can say why it is off. */}
            <Pressable accessible={false} disabled={!ctaDisabled || !onCtaDisabledPress} onPress={onCtaDisabledPress} testID="onboarding-primary-frame">
              <Button label={ctaLabel} onPress={onContinue} disabled={ctaDisabled} refused={ctaRefused} loading={ctaBusy} testID="onboarding-primary" />
            </Pressable>
            {/* The way out stays with the button; only the note waits for the keyboard to go. Off while the primary saves: a Skip during a save navigated twice. */}
            {secondaryLabel && onSecondary ? (
              <Button label={secondaryLabel} kind="tertiary" size="md" onPress={onSecondary} disabled={ctaBusy} testID="onboarding-secondary" />
            ) : null}
            {footerNote && !keyboardUp ? (
              <View style={styles.note}>
                {/* design-exception: the frame draws the lock at 14 and the note at 11/16, a step under the scale */}
                <Icon name="lock" size={14} color={COLOR.textTertiary} />
                <Text style={[font('label', bold), styles.noteText, styles.noteSize]}>{footerNote.toUpperCase()}</Text>
              </View>
            ) : null}
          </>
        }
      >
        <View style={styles.headline}>
          <Text style={[font('display', bold), styles.title]} accessibilityRole="header">
            {title}
            {titleAccent ? <Text>{titleAccent}</Text> : null}
          </Text>
          {subtitle ? <Text style={[font('body', bold), styles.subtitle]}>{subtitle}</Text> : null}
        </View>

        {children ? (
          <View testID="onboarding-body" style={styles.body}>
            {children}
          </View>
        ) : null}
      </KeyboardPage>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.ink },
  flex: { flex: 1 },
  // Flow 2 `frame`: the glass bar is 104 (the circle 56 to 100, 4 under it); the circle starts at the inset here, as every bar does.
  header: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.xs },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  step: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: COLOR.textSecondary },
  progress: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm },
  scrollContent: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl, gap: SPACE.xl },
  scrollContentBare: { paddingTop: SPACE.xl },
  headline: { gap: SPACE.sm },
  title: { color: COLOR.textPrimary },
  subtitle: { color: COLOR.textSecondary, maxWidth: SUBTITLE_MEASURE },
  body: { gap: SPACE.xl },
  note: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.sm },
  noteText: { color: COLOR.textTertiary, textAlign: 'center', flexShrink: 1 },
  // design-exception: the frame sets the note at 11/16 and the step label at 13 with 0.3 tracking, off the type scale
  noteSize: { fontSize: 11, lineHeight: 16 },
  // design-exception: the frame's step label is Geist Mono 13 with 0.3 tracking
  stepLabel: { fontFamily: FONT_FAMILY.mono[500], fontSize: 13, lineHeight: 16, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
})
