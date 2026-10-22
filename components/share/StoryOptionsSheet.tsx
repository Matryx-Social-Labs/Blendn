import { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, View } from 'react-native'

import { COLOR, SPACE } from '../../lib/design/tokens'
import { captureStory, coverReady, shareStory, storyCaptureWidth, type StoryOutcome } from '../../lib/storyShare'
import type { ShareEvent } from '../ds/LinkPreviewCard'
import { SettingsRow } from '../ds/SettingsRow'
import { Sheet } from '../ds/Sheet'
import { font, useBoldText } from '../ds/shared'
import { StoryCard, type RecapStat } from '../ds/StoryCard'

/** The preview in the sheet: 150 wide, a ninth of the file (the frame's `imageScaled(…, 150)`). */
const PREVIEW_WIDTH = 150
/** If the sheet's exit never reports, the share starts after this long. */
const LEAVE_FALLBACK_MS = 600

export type StoryVariant =
  | { kind: 'story'; event: ShareEvent }
  /** "Your September": complete past months only, no people, no venue names unless the toggle is on. */
  | { kind: 'recap'; month: string; stats: RecapStat[]; topVenue: string | null }

/** The words of each variant, in the frame's. */
const COPY = {
  story: {
    title: 'Share to your Story',
    toggle: 'Say I’m going',
    hint: 'Adds “I’m going” to the card. Off unless you turn it on.',
    note: 'The link is copied first — add it with the Link sticker. The card carries no name, no counts and nothing live.',
  },
  recap: {
    title: 'Share your September',
    toggle: 'Show top venue',
    hint: 'Adds the place you went most. Off unless you turn it on.',
    note: 'The card carries no people, no dates and no venue names unless you turn the toggle on.',
  },
} as const

/**
 * The Story options sheet (guidelines/flow-16 `storyOptions`, Flow 16 · 16.3): before Instagram opens, the card, the one
 * toggle (off), the Link-sticker note, "Share to Instagram" and "Not now". The toggle is the only thing the person
 * decides: "I'm going" and the recap's top venue exist on the card only when it is on.
 *
 * The picture that goes to Instagram is not the preview. It is a second copy of the card drawn off screen at exactly
 * 1080 device pixels across and photographed when Share is pressed (`lib/storyShare`), so the file is the export size
 * whatever the phone, and the preview can stay small. Both follow the toggle.
 *
 * `H.primary` on Share is the Sheet's own (a primary action); the toggle plays the row's `H.toggle`. Share closes the
 * sheet first and does the work once it has left: the "Link copied" toast would otherwise be behind it on iOS.
 */
export function StoryOptionsSheet({
  visible,
  onClose,
  onDismissed,
  onDone,
  variant,
  url,
  testID,
}: {
  visible: boolean
  onClose: () => void
  onDismissed?: () => void
  /** The share ran: `image` went to the share sheet, `link` only the link and Instagram's camera, `failed` neither. */
  onDone: (outcome: StoryOutcome) => void
  variant: StoryVariant
  /** The link copied first; the recap has none. */
  url?: string
  testID?: string
}) {
  const bold = useBoldText()
  const copy = COPY[variant.kind]
  const [on, setOn] = useState(false)
  /** Share to Instagram was pressed: the sheet is leaving, and the work starts when it has (toasts are hidden behind a Modal on iOS). */
  const [leaving, setLeaving] = useState(false)
  const started = useRef(false)
  const photograph = useRef<View>(null)

  // A new sheet is a new decision: the toggle starts off every time (adjusted as the sheet closes, not in an effect).
  const [wasVisible, setWasVisible] = useState(visible)
  if (visible !== wasVisible) {
    setWasVisible(visible)
    if (!visible) setOn(false)
  }

  const card = (width: number, id?: string) =>
    variant.kind === 'story' ? (
      <StoryCard kind="story" event={variant.event} going={on} width={width} testID={id} />
    ) : (
      <StoryCard kind="recap" month={variant.month} stats={variant.stats} topVenue={on ? variant.topVenue : null} width={width} testID={id} />
    )

  const share = async () => {
    if (started.current) return
    started.current = true
    const capture = async () => {
      await coverReady(variant.kind === 'story' ? variant.event.cover : null)
      return captureStory(photograph)
    }
    const outcome = await shareStory({ url, capture })
    started.current = false
    setLeaving(false)
    onDone(outcome)
  }

  // The sheet's exit reports through `onDismissed`; if it never does, the work starts anyway.
  const begin = () => {
    if (leaving) void share()
  }
  useEffect(() => {
    if (!leaving) return
    const timer = setTimeout(() => void share(), LEAVE_FALLBACK_MS)
    return () => clearTimeout(timer)
    // `share` is rebuilt every render and guards itself; the timer is for the one `leaving` turning on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaving])

  return (
    <>
      <Sheet
        visible={visible && !leaving}
        onClose={onClose}
        onDismissed={() => {
          onDismissed?.()
          begin()
        }}
        title={copy.title}
        testID={testID}
        actions={[
          { label: 'Share to Instagram', kind: 'primary', onPress: () => setLeaving(true), testID: testID && `${testID}-share` },
          { label: 'Not now', kind: 'tertiary', onPress: onClose, testID: testID && `${testID}-skip` },
        ]}
      >
        <View style={styles.preview} testID={testID && `${testID}-preview`}>
          {card(PREVIEW_WIDTH, testID && `${testID}-card`)}
        </View>
        <SettingsRow
          trail="switch"
          title={copy.toggle}
          hint={copy.hint}
          value={on}
          onValueChange={setOn}
          testID={testID && `${testID}-toggle`}
        />
        <Text style={[font('caption', bold), styles.note]}>{copy.note}</Text>
      </Sheet>
      {visible ? (
        <View ref={photograph} collapsable={false} pointerEvents="none" style={styles.offscreen} testID={testID && `${testID}-photo`}>
          {card(storyCaptureWidth(), testID && `${testID}-photo-card`)}
        </View>
      ) : null}
    </>
  )
}

const styles = StyleSheet.create({
  preview: { alignItems: 'center', paddingVertical: SPACE.sm },
  note: { color: COLOR.textTertiary },
  // Mounted and laid out at full size, but nowhere on screen: the photograph is of this view, not of what is visible.
  offscreen: { position: 'absolute', top: 0, left: -10000 },
})
