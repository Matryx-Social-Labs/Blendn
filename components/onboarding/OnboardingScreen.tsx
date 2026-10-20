import { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { Backdrop, ORB_LEVEL } from './Backdrop'
import { Dock } from './Dock'
import { RevealOnFocus, useRevealFocused } from './revealFocused'
import { Button } from '../ds/Button'
import { IconButton } from '../ds/IconButton'
import { monoCaption } from '../ds/MonoFamily'
import { ProgressBar } from '../ds/ProgressBar'
import { font, IC_HAIRLINE, useBoldText, useIncreaseContrast } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { Material } from '../ui/Material'
import { COLOR, ICON, SIZE, SPACE } from '../../lib/design/tokens'
import { KEYBOARD_BEHAVIOR, useKeyboardShown } from '../../lib/keyboard'
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
   */
  children?: ReactNode

  ctaLabel: string
  onContinue: () => void
  ctaDisabled?: boolean
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
  const { scrollRef, bodyRef, reveal, onScroll, onViewportLayout, onBodyLayout } = useRevealFocused()
  const android = Platform.OS === 'android'
  const circle = android ? SIZE.circleButtonAndroid : SIZE.circleButton
  const hasHeader = !!step || !!onBack

  return (
    <View style={styles.root}>
      <Backdrop level={ORB_LEVEL.onboarding} paused={keyboardUp} testID="onboarding-backdrop" />

      {hasHeader ? (
        <Material role="bar" testID="onboarding-header" style={[styles.header, { paddingTop: insets.top + SPACE.sm }, contrast && IC_HAIRLINE]}>
          <View style={[styles.headerRow, { height: circle }]}>
            {/* The back circle keeps its footprint on the first step, so the step label does not move between steps. */}
            {onBack ? (
              <IconButton icon={android ? 'arrow-left' : 'chevron-left'} accessibilityLabel="Back" onPress={onBack} testID="onboarding-back" />
            ) : null}
            {step ? (
              <Text testID="onboarding-step" style={[monoCaption(bold), styles.step]}>
                {`Step ${stepIndex(step) + 1} of ${ONBOARDING_STEPS.length}`}
              </Text>
            ) : null}
          </View>
        </Material>
      ) : (
        <View style={{ height: insets.top + SPACE.xl }} />
      )}

      {step ? (
        <View style={styles.progress}>
          <ProgressBar progress={progress(step)} testID="onboarding-progress" />
        </View>
      ) : null}

      {/*
       * The avoiding view holds the scroll AND the dock, with no offset: it used to hold only the scroll, so the keyboard
       * covered Continue. Its own frame is what `padding` measures against, so 0 is right.
       */}
      <KeyboardAvoidingView style={styles.flex} behavior={KEYBOARD_BEHAVIOR} keyboardVerticalOffset={0}>
        <ScrollView
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onLayout={onViewportLayout}
          style={styles.flex}
          contentContainerStyle={[styles.scrollContent, step ? null : styles.scrollContentBare]}
          keyboardShouldPersistTaps="handled"
          // Drag the form down to put the keyboard away, as in Messages.
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          showsVerticalScrollIndicator={false}
          // A screen with nothing to scroll must not rubber-band: it reads as the screen being broken.
          alwaysBounceVertical={false}
          scrollEnabled={!!children}
        >
          <View style={styles.headline}>
            <Text style={[font('display', bold), styles.title]} accessibilityRole="header">
              {title}
              {titleAccent ? <Text>{titleAccent}</Text> : null}
            </Text>
            {subtitle ? <Text style={[font('body', bold), styles.subtitle]}>{subtitle}</Text> : null}
          </View>

          {children ? (
            <RevealOnFocus.Provider value={reveal}>
              <View ref={bodyRef} onLayout={onBodyLayout} style={styles.body}>
                {children}
              </View>
            </RevealOnFocus.Provider>
          ) : null}
        </ScrollView>

        <Dock keyboardUp={keyboardUp} testID="onboarding-dock">
          <Button label={ctaLabel} onPress={onContinue} disabled={ctaDisabled} loading={ctaBusy} testID="onboarding-primary" />
          {/* The way out stays with the button; only the note waits for the keyboard to go. Off while the primary saves: a Skip during a save navigated twice. */}
          {secondaryLabel && onSecondary ? (
            <Button label={secondaryLabel} kind="tertiary" size="md" onPress={onSecondary} disabled={ctaBusy} testID="onboarding-secondary" />
          ) : null}
          {footerNote && !keyboardUp ? (
            <View style={styles.note}>
              <Icon name="lock" size={ICON.inline} color={COLOR.textTertiary} />
              <Text style={[font('label', bold), styles.noteText]}>{footerNote.toUpperCase()}</Text>
            </View>
          ) : null}
        </Dock>
      </KeyboardAvoidingView>
    </View>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLOR.ink },
  flex: { flex: 1 },
  header: { paddingHorizontal: SPACE.lg, paddingBottom: SPACE.sm },
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
})
