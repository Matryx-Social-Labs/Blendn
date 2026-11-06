import { useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import Animated, { cubicBezier } from 'react-native-reanimated'

import type { DetailBlock } from '../../lib/eventDetails'
import { SectionHeader } from '../ds/SectionHeader'
import { font, useBoldText } from '../ds/shared'
import ScalePress from '../motion/ScalePress'
import { fadeInFast } from '../motion/presence'
import { Icon } from '../ui/Icon'
import { COLOR, DURATION, EASING, ICON, MAX_FONT_SCALE, SIZE, SPACE, TYPE } from '../../lib/design/tokens'
import { useReducedMotion } from '../../lib/motion'

/** The FAQ chevron's turn, as a CSS transition curve. */
const TURN_EASE = cubicBezier(...EASING.entrance)

/**
 * The event page's body sections: the experience and the organiser's details. Presentational only: they take formatted
 * strings and draw them; the screen keeps the data, the permissions and the handlers. The facts are `EventGuide`, the
 * dock `DockRow` (Flow 4 E-B).
 */
export const SCENE_PADDING_HORIZONTAL = SPACE.gutter
export const SCENE_SECTION_GAP = SPACE.xxl

/**
 * The prose under a heading: `body` on `textSecondary`.
 *
 * A caller with a phrase to lift (the event's own name, matched exactly) wraps it in `SceneBodyAccent`, which raises it
 * from `textSecondary` to `textPrimary`.
 */
export function SceneBody({ children }: { children: React.ReactNode }) {
  const bold = useBoldText()
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={[font('body', bold), styles.secondary]}>{children}</Text>
}

export function SceneBodyAccent({ children }: { children: string }) {
  return <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.ink}>{children}</Text>
}

/**
 * The sticky call to action. Frame `1227:2904`, as Flow 3's dock draws it.
 *
 * A full-width pill: the gradient while there is something still to do, 8%
 * white once it is done (A78).
 *
 * ## The price is not drawn
 *
 * The frame reads "Join the Experience  $45". There is no ticketing, no
 * payment, and everything is free — so a price here would be the interface
 * inventing a commitment the product cannot honour. The label says joining,
 * which is what actually happens.
 */
export type SceneCTAState = 'rsvp' | 'rsvpd' | 'waitlisted' | 'join' | 'going' | 'ended' | 'rate' | 'cancelled'

/** Before the doors: the RSVP slot's state from the server's answer. One copy, with the rest of the attendance state. */
export { rsvpCtaState } from '../../lib/attendanceState'

/**
 * What the organiser wrote about the event, under one heading per kind.
 *
 * `event_details` has been collected by the dashboard, stored, and served on
 * this very payload since it existed — and drawn by nothing. Accessibility is
 * the field that makes this worth building rather than deleting: an organiser
 * writes "step-free entrance" and the person deciding whether they can come
 * could not see it.
 *
 * The blocks arrive already ordered and already cleaned by
 * `lib/eventDetails.ts`; this draws them and makes no decisions, so a JSON
 * column holding something unexpected is that module's problem and never
 * reaches a `<Text>`.
 *
 * Questions are expandable, and nothing else is. A FAQ is a list you scan for
 * the one that is yours, so collapsing it is the difference between a section
 * and a wall; house rules are three lines you should not have to ask for.
 */
export function SceneDetails({ blocks }: { blocks: readonly DetailBlock[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const reduceMotion = useReducedMotion()
  if (!blocks.length) return null

  return (
    <View style={styles.detailGroup}>
      {blocks.map((block) => (
        <View key={block.key} style={styles.detailBlock}>
          <SectionHeader title={block.title} />

          {block.kind === 'prose' ? <SceneBody>{block.body}</SceneBody> : null}

          {block.kind === 'pairs' ? (
            <View style={styles.detailPairs}>
              {block.pairs.map((p) => (
                <View key={p.label} style={styles.detailPair}>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={styles.detailPairLabel}>{p.label}</Text>
                  <Text maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.detailPairValue}>{p.value}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {block.kind === 'faq'
            ? block.items.map((item) => {
                const id = `${block.key}:${item.question}`
                const isOpen = open === id
                return (
                  /*
                    A toggle, so the selection tick ScalePress fires by default
                    is the right haptic. The chevron turns rather than swapping
                    glyphs, so it reads as the same control changing state; the
                    answer fades in, and the row's height snaps (tasks/lessons.md —
                    no layout transitions). No exit fade: the height has already
                    snapped shut, so a fading answer would sit on the row below.

                    The answer is a sibling of the button, not inside it: a
                    labelled button is one VoiceOver stop that reads only its
                    label, so an answer inside it could be opened and never heard.
                  */
                  <View key={id} style={styles.detailQuestion}>
                  <ScalePress
                    pressedScale={0.98}
                    onPress={() => setOpen(isOpen ? null : id)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: isOpen }}
                    accessibilityLabel={item.question}
                    style={styles.detailQuestionButton}
                  >
                    <View style={styles.detailQuestionRow}>
                      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.bodyStrong} style={styles.detailQuestionText}>{item.question}</Text>
                      <Animated.View
                        style={{
                          transform: [{ rotate: isOpen ? '180deg' : '0deg' }],
                          transitionProperty: 'transform',
                          transitionDuration: reduceMotion ? 0 : DURATION.base,
                          transitionTimingFunction: TURN_EASE,
                        }}
                      >
                        <Icon name="chevron-down" size={ICON.control} color={COLOR.textSecondary} />
                      </Animated.View>
                    </View>
                  </ScalePress>
                    {isOpen ? (
                      <Animated.Text entering={fadeInFast} maxFontSizeMultiplier={MAX_FONT_SCALE.body} style={styles.detailAnswer}>
                        {item.answer}
                      </Animated.Text>
                    ) : null}
                  </View>
                )
              })
            : null}
        </View>
      ))}
    </View>
  )
}



const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  detailGroup: { gap: SPACE.xxl },
  detailBlock: { gap: SPACE.lg },
  detailPairs: { gap: SPACE.md },
  detailPair: { gap: SPACE.xxs },
  detailPairLabel: { ...TYPE.bodyStrong, color: COLOR.textPrimary },
  detailPairValue: { ...TYPE.body, color: COLOR.textSecondary },
  detailQuestion: { gap: SPACE.sm },
  detailQuestionButton: { minHeight: SIZE.control, justifyContent: 'center' },
  detailQuestionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: SPACE.md },
  detailQuestionText: { ...TYPE.bodyStrong, color: COLOR.textPrimary, flex: 1 },
  detailAnswer: { ...TYPE.body, color: COLOR.textSecondary, paddingBottom: SPACE.xs },
})
