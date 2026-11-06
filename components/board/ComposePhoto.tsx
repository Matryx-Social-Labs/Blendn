import { Image } from 'expo-image'
import { useEffect, useRef, useState } from 'react'
import { Platform, Pressable, StyleSheet, Text as RNText, View } from 'react-native'

import { Button } from '../ds/Button'
import { UploadRing } from '../ds/ChatBubble'
import { TextField } from '../ds/TextField'
import { font, HueProvider, minTarget, SELECTION, useBoldText } from '../ds/shared'
import { Icon } from '../ui/Icon'
import { LOBBY_ALT_MAX, type LobbyAttachment } from '../../lib/lobby'
import { pickImage, uploadChatPhoto } from '../../lib/photoUtils'
import { COLOR, FONT_FAMILY, MATERIAL, MAX_FONT_SCALE, RADIUS, SPACE } from '../../lib/design/tokens'
import { OPACITY, tint } from '../../lib/theme'

/**
 * The compose sheet's photo (C-A `.lphoto`, `.lwarn`): the one picked from the library, never a person's profile face.
 * Every pick is warned about first ("You're anonymous here"), and nothing leaves the phone until Use it. Then it goes up
 * through `uploadChatPhoto`, which re-encodes it first so no location data leaves, with its ring; Post waits for it.
 * `__tests__/board.test.ts` holds this file to that, and every other board file to no image.
 */

/** `.ltile`, `.ladd`. */
const TILE = 96
/** `.ltile .x`: the remove button, a target by its slop. */
const REMOVE = 24
/** `.lwarn`: 14 in, a 20 corner (between the scale's 16 and 24). */
// design-exception: the warning card is 14 pt in with a 20 pt corner (`.lwarn` padding 14px, border-radius 20px); both off-scale.
const WARN_PAD = 14
const WARN_RADIUS = 20
/** `.lpside .alt`: the alt-text chip is 32 tall. */
const ALT_CHIP = 32
/** `.lwarn span`: the warning's words at 82% white. */
const WARN_INK = tint(COLOR.textPrimary, 0.82)
const VIOLET = SELECTION.violet
// design-exception: the frame's glyphs here are off the 16/20/24 scale: the warning's eye 18, the add tile's 22, the remove ×'s 14.
const WARN_GLYPH = 18
const ADD_GLYPH = 22
const REMOVE_GLYPH = 14

type Shot = { uri: string }
type Stage = { kind: 'none' } | { kind: 'warn'; shot: Shot } | { kind: 'sending'; shot: Shot; progress: number } | { kind: 'ready'; shot: Shot; url: string }

export function ComposePhoto({ onChange, disabled = false }: { onChange: (next: { attachment: LobbyAttachment | null; uploading: boolean }) => void; disabled?: boolean }) {
  const bold = useBoldText()
  const [stage, setStage] = useState<Stage>({ kind: 'none' })
  const [alt, setAlt] = useState('')
  const [altOpen, setAltOpen] = useState(false)
  const [failed, setFailed] = useState<string | null>(null)
  // Each upload's ticket: one removed or replaced mid-flight lands on nothing.
  const sent = useRef(0)

  const url = stage.kind === 'ready' ? stage.url : null
  const uploading = stage.kind === 'sending'
  useEffect(() => onChange({ attachment: url ? { url, alt } : null, uploading }), [url, alt, uploading, onChange])

  const choose = async () => {
    const result = await pickImage('library')
    const uri = result?.assets?.[0]?.uri
    // Nothing chosen from the warning's Choose another: the warning goes with the photo it was about.
    if (!uri) return setStage((now) => (now.kind === 'warn' ? { kind: 'none' } : now))
    setFailed(null)
    setStage({ kind: 'warn', shot: { uri } })
  }
  const send = async (shot: Shot) => {
    const ticket = ++sent.current
    setStage({ kind: 'sending', shot, progress: 0 })
    const up = await uploadChatPhoto(shot.uri, (progress) => {
      if (sent.current === ticket) setStage({ kind: 'sending', shot, progress })
    })
    if (sent.current !== ticket) return
    if (up.ok) {
      setStage({ kind: 'ready', shot, url: up.url })
      return
    }
    setFailed(up.error)
    setStage({ kind: 'none' })
  }
  const remove = () => {
    sent.current += 1
    setStage({ kind: 'none' })
    setAlt('')
    setAltOpen(false)
  }

  if (stage.kind === 'warn') {
    return (
      <HueProvider value="violet">
        <View testID="compose-warning" style={styles.warn}>
          <View style={styles.warnHead}>
            <Icon name="eye-off" size={WARN_GLYPH} color={VIOLET.glyph} />
            <RNText accessibilityRole="header" maxFontSizeMultiplier={MAX_FONT_SCALE.control} style={[font('control', bold, FONT_FAMILY.brand[700]), styles.ink]}>
              You’re anonymous here
            </RNText>
          </View>
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), { color: WARN_INK }]}>
            A face, a number plate or your street in a photo can show who you are.
          </RNText>
          <View style={styles.warnActions}>
            <Button label="Choose another" kind="secondary" onGlass={Platform.OS === 'ios'} size="pill" disabled={disabled} onPress={() => void choose()} />
            <Button label="Use it" kind="lit" size="pill" disabled={disabled} onPress={() => void send(stage.shot)} testID="compose-use-it" />
          </View>
        </View>
      </HueProvider>
    )
  }

  if (stage.kind === 'none') {
    return (
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add a photo"
          disabled={disabled}
          onPress={() => void choose()}
          style={({ pressed }) => [styles.tile, styles.add, pressed && styles.pressed]}
          testID="compose-add"
        >
          <Icon name="image" size={ADD_GLYPH} color={COLOR.textSecondary} />
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold, FONT_FAMILY.brand[500]), styles.secondary]}>Photo</RNText>
        </Pressable>
        {failed ? (
          <RNText accessibilityLiveRegion="polite" maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.refused, styles.flex]}>{failed}</RNText>
        ) : null}
      </View>
    )
  }

  const shot = stage.shot
  return (
    <View style={styles.photo}>
      <View style={styles.row}>
        <View style={styles.tile}>
          <Image source={{ uri: shot.uri }} style={StyleSheet.absoluteFill} contentFit="cover" accessible accessibilityRole="image" accessibilityLabel={alt.trim() || 'Your photo'} />
          {stage.kind === 'sending' ? <UploadRing progress={stage.progress} label="Uploading your photo" /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Remove photo"
            hitSlop={(minTarget() - REMOVE) / 2}
            onPress={remove}
            style={styles.remove}
            testID="compose-remove"
          >
            <Icon name="x" size={REMOVE_GLYPH} color={COLOR.textPrimary} />
          </Pressable>
        </View>
        <View style={styles.side}>
          {altOpen ? null : (
            <Pressable accessibilityRole="button" accessibilityLabel="Add alt text" onPress={() => setAltOpen(true)} style={({ pressed }) => [styles.altChip, pressed && styles.pressed]}>
              <Icon name="type" size={16} color={COLOR.textPrimary} />
              <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold, FONT_FAMILY.brand[500]), styles.ink]}>Add alt text</RNText>
            </Pressable>
          )}
          <RNText maxFontSizeMultiplier={MAX_FONT_SCALE.note} style={[font('note', bold), styles.secondary]}>
            We remove location data from photos. Others see it once it’s checked.
          </RNText>
        </View>
      </View>
      {altOpen ? <TextField label="Alt text" value={alt} onChangeText={setAlt} limit={LOBBY_ALT_MAX} placeholder="What’s in the photo" autoFocus /> : null}
    </View>
  )
}

const styles = StyleSheet.create({
  ink: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
  refused: { color: COLOR.destructive },
  flex: { flex: 1 },
  pressed: { opacity: OPACITY.pressed },
  photo: { gap: SPACE.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACE.md },
  tile: { width: TILE, height: TILE, borderRadius: RADIUS.rowInCard, overflow: 'hidden' },
  add: { borderWidth: 1, borderColor: COLOR.hairlineStrong, alignItems: 'center', justifyContent: 'center', gap: SPACE.xs },
  remove: {
    position: 'absolute',
    top: SPACE.xs + SPACE.xxs,
    right: SPACE.xs + SPACE.xxs,
    width: REMOVE,
    height: REMOVE,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.scrimPill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  side: { flex: 1, gap: SPACE.sm, paddingTop: SPACE.xxs },
  altChip: {
    alignSelf: 'flex-start',
    height: ALT_CHIP,
    paddingHorizontal: SPACE.md,
    borderRadius: RADIUS.capsule,
    backgroundColor: COLOR.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.xs + SPACE.xxs,
  },
  warn: { padding: WARN_PAD, gap: SPACE.xs, borderRadius: WARN_RADIUS, backgroundColor: VIOLET.fill, borderWidth: 1, borderColor: VIOLET.edge },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  warnActions: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm, marginTop: SPACE.sm },
})
