import { useCallback, useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native'

import { apiClient } from '../../lib/apiClient'
import { COLOR, ICON, MAX_FONT_SCALE, SPACE, TYPE } from '../../lib/design/tokens'
import { Logger } from '../../lib/logger'
import { mePreviewFrom, type MePreview } from '../../lib/mePreview'
import { personFace } from '../../lib/personFace'
import { metaLine } from '../../lib/roomLens'
import { PersonCardContent } from '../ds/PersonCard'
import { SegmentedControl } from '../ds/SegmentedControl'
import { Sheet, type SheetAction } from '../ds/Sheet'
import { StateScreen } from '../ds/StateScreen'
import { font, useBoldText } from '../ds/shared'
import { SkeletonCircle, SkeletonLine } from '../Skeleton'
import { Icon, type IconName } from '../ui/Icon'

const SIDES = ['Anonymous', 'Shown'] as const
/** The person sheet's face (`PersonCard`), so the skeleton does not jump when the card lands. */
const FACE = 72

const ANONYMOUS_NOTE =
  'People in a room see this until you show who you are, plus what you answer and have in common there. This name is from your last room; each room gives you its own.'
const SHOWN_NOTE = 'People you show yourself to see this. Each room also adds what you answer there.'
const NO_ROOM_TITLE = 'You get a room name when you check in'
const NO_ROOM_BODY = 'Until you show who you are, people there see that name.'
const SPARSE = 'Your photo, bio, interests and work show here once you add them.'

export interface SeeAsOthersSheetProps {
  visible: boolean
  onClose: () => void
  /** Offered when there is nothing but a name to show. */
  onEdit: () => void
}

/**
 * "See as others do" (Me + settings A 01; `see-as-others` A, SCRUM-1099): the room's person sheet with you in it, read-only,
 * before and after you show who you are. Both cards are the server's own (`GET /me/preview`), read afresh at every opening, so
 * an edit made in between shows. What one room adds (an answer, things in common) has no place here and is said in words.
 *
 * Edit profile opens once this sheet has left the screen: iOS refuses to present over a Modal that is still leaving. There is no
 * way to a whole page of yourself: Me is that page (`chatRoom.test.ts`).
 */
export function SeeAsOthersSheet({ visible, onClose, onEdit }: SeeAsOthersSheetProps) {
  const [side, setSide] = useState(0)
  const [preview, setPreview] = useState<MePreview | 'failed' | null>(null)
  // Each opening starts over: Anonymous first, and nothing from last time.
  const [was, setWas] = useState(visible)
  if (was !== visible) {
    setWas(visible)
    if (visible) {
      setSide(0)
      setPreview(null)
    }
  }
  const ask = useRef(0)
  const editing = useRef(false)

  const load = useCallback(async () => {
    const mine = ++ask.current
    let read: MePreview | null = null
    try {
      const result = await apiClient.getMePreview()
      read = result.success ? mePreviewFrom(result.data) : null
    } catch (error) {
      Logger.warn('profile', 'preview failed', { error })
    }
    if (mine === ask.current) setPreview(read ?? 'failed')
  }, [])

  useEffect(() => {
    if (!visible) return
    void load()
    return () => void ask.current++ // eslint-disable-line react-hooks/exhaustive-deps -- a counter: an answer that lands after a close is dropped
  }, [visible, load])

  const retry = () => {
    setPreview(null)
    void load()
  }
  const edit = () => {
    editing.current = true
    onClose()
  }
  const onDismissed = () => {
    if (!editing.current) return
    editing.current = false
    onEdit()
  }

  const ready = preview !== null && preview !== 'failed' ? preview : null
  const named = ready?.named
  const sparse = !!named && !named.photo && !named.about && !named.work && !named.interests.length
  const actions: SheetAction[] = sparse && side === 1 ? [{ label: 'Edit profile', kind: 'lit', icon: 'pencil', onPress: edit, testID: 'see-as-edit' }] : []

  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} title="See as others do" actions={actions} testID="see-as-others">
      <View style={styles.body}>
        {preview === 'failed' ? (
          <StateScreen
            icon="cloud-off"
            title="Your preview didn’t load"
            body="Check your connection and try again."
            actions={[{ label: 'Try again', onPress: retry }]}
          />
        ) : (
          <>
            <SegmentedControl items={SIDES} selected={side} onChange={setSide} testID="see-as-side" />
            {!ready ? <PreviewSkeleton /> : side === 0 ? <AnonymousSide card={ready.anonymous} /> : <ShownSide card={ready.named} sparse={sparse} />}
          </>
        )}
      </View>
    </Sheet>
  )
}

function AnonymousSide({ card }: { card: MePreview['anonymous'] }) {
  if (!card) return <StateScreen icon="eye-off" litWell title={NO_ROOM_TITLE} body={NO_ROOM_BODY} testID="see-as-no-room" />
  return (
    <>
      <PersonCardContent
        variant="preview"
        person={{ face: personFace({ named: false, name: card.name }), name: card.name, meta: metaLine(false, card.age) }}
        testID="see-as-card"
      />
      <Note icon="eye-off" text={ANONYMOUS_NOTE} />
    </>
  )
}

function ShownSide({ card, sparse }: { card: MePreview['named']; sparse: boolean }) {
  return (
    <>
      <PersonCardContent
        variant="preview"
        person={{
          face: personFace({ named: true, name: card.name, photo: card.photo }),
          name: card.name,
          meta: metaLine(true, card.age),
          bio: { about: card.about, interests: card.interests, work: card.work },
        }}
        testID="see-as-card"
      />
      <Note icon="eye" text={sparse ? SPARSE : SHOWN_NOTE} />
    </>
  )
}

/** One quiet line under a card: the glyph on its first line, which grows with the text up to its cap (as `WhoSees`). */
function Note({ icon, text }: { icon: IconName; text: string }) {
  const bold = useBoldText()
  const line = TYPE.meta.lineHeight * Math.min(useWindowDimensions().fontScale || 1, MAX_FONT_SCALE.meta)
  return (
    <View accessible accessibilityLabel={text} style={styles.note}>
      <View style={[styles.glyph, { height: line }]}>
        <Icon name={icon} size={ICON.inline} color={COLOR.textSecondary} />
      </View>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.noteText]}>
        {text}
      </Text>
    </View>
  )
}

function PreviewSkeleton() {
  return (
    <View accessible accessibilityLabel="Loading your preview" accessibilityState={{ busy: true }} style={styles.skeleton}>
      <SkeletonCircle width={FACE} />
      <View style={styles.skeletonText}>
        <SkeletonLine width="60%" />
        <SkeletonLine width="40%" />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  body: { gap: SPACE.lg },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.sm },
  glyph: { justifyContent: 'center' },
  noteText: { flex: 1, color: COLOR.textSecondary },
  skeleton: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md + SPACE.xxs, height: FACE },
  skeletonText: { flex: 1, gap: SPACE.sm },
})
