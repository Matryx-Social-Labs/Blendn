import { barTop } from '../../lib/barGeometry'
import { ReactNode } from 'react'
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Backdrop, ORB_LEVEL } from './Backdrop'
import { KeyboardPage } from './KeyboardPage'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { ProgressBar } from '../ds/ProgressBar'
import { CONTROL_FONT_CAP, font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SIZE, SPACE } from '../../lib/design/tokens'
import { useKeyboardShown } from '../../lib/keyboard'
import { progress, stepLabel, type OnboardingStep } from '../../lib/onboarding'

/**
 * The frame every onboarding screen sits in (guidelines/flow-2, `frame`).
 *
 * Every step shares a header, a scrolling middle and a pinned dock, and the only things that differ are the headline, the
 * fields and the label on the button. Written once here rather than per screen: the parts that are easy to get subtly
 * different across files (the safe-area maths, the keyboard behaviour, the progress arithmetic) are exactly the parts
 * nobody notices are inconsistent until a device shows it.
 *
 * L0 the brand orbs at 0.45 (held while the keyboard is up), L2 a glass header with the back circle and "Step n of 5", the
 * 4 pt progress bar under it, the body, and an L2 glass dock with the gradient primary, a text secondary and the lock note (a sentence in meta).
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
   * The form body. Optional because a permission screen has no form: its content is an illustration, which is
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

  /** A quiet way out in the header's top-right, kept out of the primary column (step 1's "Not you?", Flow 2). */
  headerAction?: { label: string; accessibilityLabel: string; onPress: () => void }
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
  headerAction,
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
          {step && stepLabel(step) ? (
            // Bar chrome in a row the circle's height: it stops where a control does (RC drive 5: 40 pt under the back circle).
            <Text testID="onboarding-step" maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[styles.stepLabel, styles.step]}>
              {stepLabel(step)}
            </Text>
          ) : null}
          {headerAction ? (
            <View style={styles.headerAction}>
              <Button
                label={headerAction.label}
                accessibilityLabel={headerAction.accessibilityLabel}
                kind="tertiary"
                size="sm"
                onPress={headerAction.onPress}
                testID="onboarding-header-action"
              />
            </View>
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
                {/* design-exception: the frame draws the lock at 14 */}
                <Icon name="lock" size={14} color={COLOR.textSecondary} />
                {/* A sentence, set as one (D13): meta in sentence case, capped at meta's role, secondary grey (≥ 4.5:1 on ink). */}
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.noteText]}>
                  {footerNote}
                </Text>
              </View>
            ) : null}
          </>
        }
      >
        <View style={styles.headline}>
          {/* The display cap is what keeps the longest headline word on one line ("journe / y", "prefer / ences": RC drive 5). */}
          <Text testID="onboarding-title" maxFontSizeMultiplier={MAX_FONT_SCALE.display} style={[font('display', bold), styles.title]} accessibilityRole="header">
            {title}
            {titleAccent ? <Text>{titleAccent}</Text> : null}
          </Text>
          {subtitle ? (
            <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.subtitle]}>
              {subtitle}
            </Text>
          ) : null}
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
  // The wrapper is the target: a child's hitSlop past its parent's bounds is dead on Android, so the 44/48 lives here.
  headerAction: { marginLeft: 'auto', minHeight: minTarget(), minWidth: minTarget(), justifyContent: 'center' },
  step: { position: 'absolute', left: 0, right: 0, textAlign: 'center', color: COLOR.textSecondary },
  progress: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.sm },
  scrollContent: { paddingHorizontal: SPACE.gutter, paddingTop: SPACE.lg, paddingBottom: SPACE.xxl, gap: SPACE.xl },
  scrollContentBare: { paddingTop: SPACE.xl },
  headline: { gap: SPACE.sm },
  title: { color: COLOR.textPrimary },
  subtitle: { color: COLOR.textSecondary, maxWidth: SUBTITLE_MEASURE },
  body: { gap: SPACE.xl },
  note: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: SPACE.xs, paddingHorizontal: SPACE.sm },
  noteText: { color: COLOR.textSecondary, textAlign: 'center', flexShrink: 1 },
  // The frame's mono step label at caption's 12/16 (SCRUM-865: it was a raw 13).
  stepLabel: { ...font('caption', false, FONT_FAMILY.mono[500]), fontVariant: ['tabular-nums'] },
})
