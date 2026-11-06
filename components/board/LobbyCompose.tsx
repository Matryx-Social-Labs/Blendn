import { useCallback, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text as RNText, TextInput, View } from 'react-native'

import { Avatar } from '../ds/Avatar'
import { Button } from '../ds/Button'
import { Chip } from '../ds/Chip'
import { monoCaption } from '../ds/MonoFamily'
import { SegmentedControl } from '../ds/SegmentedControl'
import { Sheet } from '../ds/Sheet'
import { Stepper } from '../ds/Stepper'
import { font, minTarget, useBoldText } from '../ds/shared'
import type { BoardPostKind } from '../../lib/board'
import {
  codePoints,
  COMPOSE_TYPES,
  kindGlyph,
  LOBBY_POST_MAX,
  lobbyDraft,
  mayPost,
  subKindChips,
  takesSpots,
  type LobbyAttachment,
  type LobbyDraft,
  type LobbyMeta,
  type LobbySubKind,
} from '../../lib/lobby'
import { COLOR, FONT_FAMILY, MAX_FONT_SCALE, SPACE, TYPE } from '../../lib/design/tokens'
import { ComposePhoto } from './ComposePhoto'

/** The server's 0–20 (`spacesLeft`); a post offers at least one. */
const MAX_SPOTS = 20
/** `.lsheet .sh`: the header row. */
const HEAD_HEIGHT = 56
/** `.ltext`: the words' box is four lines' room before it grows. */
const TEXT_MIN_HEIGHT = 96
/** `.lphoto` sits 10 under the counter. */
// design-exception: the photo row is 10 pt under the counter (`.lphoto` margin-top 10px); off-scale.
const ATTACH_GAP = 10
/** `.las`: 14 above the name, under the hairline. */
// design-exception: Posting as is 14 pt under its hairline (`.las` padding-top 14px); off-scale.
const AS_PAD = 14
/** `.las`: the mark and the words, 10 apart. */
const AS_GAP = SPACE.sm + SPACE.xxs
const MARK = 32
/** `.lstep`: the spots row is a target tall. */
const SPOTS_ROW = 44

const firstKind = (kind: BoardPostKind, allowed: LobbyMeta['subKinds'] | null | undefined, ticketsHidden: boolean): LobbySubKind | null =>
  subKindChips(kind, allowed, ticketsHidden)[0]?.subKind ?? null

/**
 * C-A, one sheet over the Lobby (mockups/redesign-2026-11/lobby, frames `cA-*`): Cancel, New post and Post pinned with the
 * type segment, then the kind, spots for a ride or spots offer, the words inside 280, a photo, and who you post as.
 *
 * Owns its draft, so typing redraws this and not the Lobby under it. The screen remounts it after a post, which drops the
 * draft; on a refusal it stays open with every word kept and the server's sentence under them.
 */
export function LobbyCompose({
  visible,
  posting,
  refusal,
  onPost,
  onCancel,
  initialKind = 'offer',
  pseudonym = null,
  subKinds,
  ticketsHidden = false,
}: {
  visible: boolean
  posting: boolean
  refusal: string | null
  onPost: (draft: LobbyDraft) => void
  onCancel: () => void
  /** Where the sheet opens: a start card's type. */
  initialKind?: BoardPostKind
  /** Your room name at this event; the row is left out for a server that does not send it. */
  pseudonym?: string | null
  subKinds?: LobbyMeta['subKinds'] | null
  ticketsHidden?: boolean
}) {
  const bold = useBoldText()
  // The sheet is glass on iOS and a solid surface on Android (`Sheet`): a fill on it follows.
  const onGlass = Platform.OS === 'ios'
  const titleRef = useRef<View>(null)
  const [kind, setKind] = useState<BoardPostKind>(initialKind)
  const [subKind, setSubKind] = useState(() => firstKind(initialKind, subKinds, ticketsHidden))
  const [body, setBody] = useState('')
  const [spots, setSpots] = useState(1)
  const [attached, setAttached] = useState<{ attachment: LobbyAttachment | null; uploading: boolean }>({ attachment: null, uploading: false })
  const onAttach = useCallback((next: typeof attached) => setAttached(next), [])

  const chips = subKindChips(kind, subKinds, ticketsHidden)
  const counted = codePoints(body)
  const ready = mayPost({ body, uploading: attached.uploading })
  const pickType = (index: number) => {
    const next = COMPOSE_TYPES[index].kind
    setKind(next)
    setSubKind(firstKind(next, subKinds, ticketsHidden))
  }

  const header = (
    <View style={styles.head}>
      <View style={styles.headRow}>
        <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={(minTarget() - TYPE.rowTitle.lineHeight) / 2} style={styles.headSide} testID="board-composer-cancel">
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('rowTitle', bold), styles.secondary]}>Cancel</RNText>
        </Pressable>
        <View ref={titleRef} accessible accessibilityRole="header" style={styles.headTitle}>
          <RNText numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.group} style={[font('group', bold), styles.ink, styles.center]}>New post</RNText>
        </View>
        <View style={[styles.headSide, styles.headEnd]}>
          <Button
            label="Post"
            kind={ready ? 'primary' : 'secondary'}
            onGlass={onGlass}
            size="pill"
            disabled={!ready}
            loading={posting}
            pressHaptic={false}
            onPress={() => onPost(lobbyDraft({ kind, subKind, body, spots, attachment: attached.attachment }))}
            testID="board-composer-post"
          />
        </View>
      </View>
      <SegmentedControl
        compact
        semantics="radio"
        items={COMPOSE_TYPES.map((t) => t.label)}
        selected={COMPOSE_TYPES.findIndex((t) => t.kind === kind)}
        onChange={pickType}
        disabled={posting}
        testID="board-kind"
      />
    </View>
  )

  return (
    <Sheet visible={visible} onClose={onCancel} header={header} focusRef={titleRef} testID="board-composer">
      <View>
        {chips.length ? (
          <View style={styles.chips} accessibilityRole="radiogroup">
            {chips.map((c) => (
              <Chip
                key={c.subKind}
                label={c.label}
                icon={kindGlyph(kind, c.subKind)}
                size="header"
                selection="single"
                selected={subKind === c.subKind}
                onPress={() => setSubKind(c.subKind)}
                testID={`board-sub-${c.subKind}`}
              />
            ))}
          </View>
        ) : null}
        {kind === 'offer' && subKind && takesSpots(kind, subKind) ? (
          <View style={[styles.spots, chips.length ? styles.spotsUnder : null]}>
            <View style={styles.flex}>
              <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.rowTitle} style={[font('rowTitle', bold), styles.ink]}>Spots</RNText>
              <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>How many can join you</RNText>
            </View>
            <Stepper label="How many can join you" value={spots} onChange={setSpots} min={1} max={MAX_SPOTS} onGlass={onGlass} disabled={posting} />
          </View>
        ) : null}
        <TextInput
          accessibilityLabel="Your post"
          value={body}
          onChangeText={setBody}
          multiline
          editable={!posting}
          placeholder="Where from, when, anything people should know"
          placeholderTextColor={COLOR.textTertiary}
          selectionColor={COLOR.textPrimary}
          cursorColor={COLOR.textPrimary}
          textAlignVertical="top"
          maxFontSizeMultiplier={MAX_FONT_SCALE.body}
          style={[font('body', bold), styles.ink, styles.text, chips.length ? styles.textUnder : null]}
          testID="board-composer-input"
        />
        <RNText
          accessibilityLabel={`${counted} of ${LOBBY_POST_MAX} characters`}
          maxFontSizeMultiplier={MAX_FONT_SCALE.caption}
          style={[monoCaption(bold), styles.count, counted > LOBBY_POST_MAX && styles.refused]}
        >
          {`${counted} / ${LOBBY_POST_MAX}`}
        </RNText>
        {refusal ? (
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.refused]}>{refusal}</RNText>
        ) : null}
        <View style={styles.attach}>
          <ComposePhoto onChange={onAttach} disabled={posting} />
        </View>
        {pseudonym ? (
          <View style={styles.as} accessible accessibilityLabel={`Posting as ${pseudonym}, anonymous in this event`}>
            <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>Posting as</RNText>
            <Avatar kind="creature" pseudonym={pseudonym} size={MARK} />
            <View style={styles.flex}>
              <RNText numberOfLines={1} maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.brand[500]), styles.ink]}>{pseudonym}</RNText>
              <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>Anonymous in this event</RNText>
            </View>
          </View>
        ) : null}
      </View>
    </Sheet>
  )
}

const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  refused: { color: COLOR.destructive },
  center: { textAlign: 'center' },
  flex: { flex: 1 },
  head: { gap: SPACE.md },
  headRow: { height: HEAD_HEIGHT, flexDirection: 'row', alignItems: 'center' },
  // The two ends share the width, so the title is centred on the sheet whatever Cancel and Post measure.
  headSide: { flex: 1, alignItems: 'flex-start', justifyContent: 'center' },
  headEnd: { alignItems: 'flex-end' },
  headTitle: { flexShrink: 0 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  spots: { minHeight: SPOTS_ROW, flexDirection: 'row', alignItems: 'center', gap: SPACE.md },
  spotsUnder: { marginTop: SPACE.lg },
  text: { minHeight: TEXT_MIN_HEIGHT, padding: 0 },
  textUnder: { marginTop: SPACE.md },
  count: { alignSelf: 'flex-end', color: COLOR.textTertiary },
  attach: { marginTop: ATTACH_GAP },
  as: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: AS_GAP,
    marginTop: SPACE.lg,
    paddingTop: AS_PAD,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: COLOR.hairline,
  },
})
