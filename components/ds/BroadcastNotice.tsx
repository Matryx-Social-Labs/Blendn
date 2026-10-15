import { Image } from 'expo-image'
import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useState } from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'

import { Icon } from '../ui/Icon'
import { COLOR, FONT_FAMILY, ICON, MATERIAL, RADIUS, SPACE, TYPE } from '../../lib/design/tokens'
import { IconButton } from './IconButton'
import { BUBBLE, plural, timeFont } from './chatShared'
import { font, IC_HAIRLINE, minTarget, useBoldText, useIncreaseContrast } from './shared'

/** The page's media corner (12) and the announcement's mark (a 28 pt white square, 8 pt corners). */
const MEDIA_RADIUS = 12
const MARK = 28
/** Media keeps a 16:9 slot (ROUND3 D 5.5's first-frame poster). */
const MEDIA_RATIO = 16 / 9

export type BroadcastMedia =
  | { kind: 'image'; uri: string }
  /** `duration` as the server formats it, "0:30". */
  | { kind: 'video'; uri: string; poster?: string; duration: string }

export type BroadcastNoticeProps = {
  kind: 'announcement' | 'sponsored'
  /** The organiser or the brand, as the label names them. */
  from: string
  text: string
  time: string
  /** Either may carry an image; sponsored may carry a video. */
  media?: BroadcastMedia
  testID?: string
}

/** "0:30" → "30 seconds", "1:05" → "1 minute 5 seconds". */
export function spokenDuration(duration: string) {
  const [m, s] = duration.split(':').map(Number)
  return [m ? plural(m, 'minute') : '', s ? plural(s, 'second') : ''].filter(Boolean).join(' ')
}

/**
 * The organiser or a sponsor speaking to the whole room
 * (guidelines/components/BroadcastNotice.html): full width, no tail, no
 * creature, so it never looks like a person talking. An announcement is
 * `surface` with the organiser's mark and label; a sponsored notice is
 * `surfaceSunken`, labelled "Sponsored · {brand}" and quieter, so a paid
 * message never borrows the room's voice.
 *
 * A video never autoplays (ROUND3 D 5.5): its poster and a play button that
 * names its length; a tap plays it inline, muted, with a sound toggle, once;
 * at its end the poster returns. "Couldn't load this · Try again" when it
 * fails. Before the poster loads, the slot is a static `surface` block.
 *
 * Read as one element ("Announcement from Toit: {text}, {time}"), the play
 * button after it. No haptic, play included. Increase Contrast: the hairline.
 */
export function BroadcastNotice({ kind, from, text, time, media, testID }: BroadcastNoticeProps) {
  const bold = useBoldText()
  const contrast = useIncreaseContrast()
  const announcement = kind === 'announcement'
  const label = `${announcement ? 'Announcement' : 'Sponsored'} · ${from}`.toUpperCase()

  return (
    <View
      testID={testID}
      style={[styles.card, announcement ? styles.announcement : styles.sponsored, contrast && IC_HAIRLINE]}
    >
      <View
        accessible
        accessibilityLabel={`${announcement ? `Announcement from ${from}` : `Sponsored, ${from}`}: ${text}, ${time}`}
        style={styles.words}
      >
        <View style={styles.head}>
          {announcement ? (
            <View style={styles.mark}>
              <Text maxFontSizeMultiplier={1} style={[font('caption', bold, FONT_FAMILY.brand[700]), styles.markText]}>
                {from.slice(0, 1).toUpperCase()}
              </Text>
            </View>
          ) : (
            <Icon name="megaphone" size={ICON.inline} color={COLOR.textTertiary} />
          )}
          <Text style={[font('label', bold), { color: announcement || contrast ? COLOR.textPrimary : COLOR.textSecondary }]}>{label}</Text>
        </View>
        <Text style={[font('body', bold), { color: announcement ? COLOR.textPrimary : COLOR.textSecondary }]}>{text}</Text>
      </View>
      {media ? <Media media={media} testID={testID && `${testID}-media`} /> : null}
      {/* Read with the words above; the media's own controls come between. */}
      <Text accessibilityElementsHidden importantForAccessibility="no" style={timeFont(bold)}>
        {time}
      </Text>
    </View>
  )
}

function Media({ media, testID }: { media: BroadcastMedia; testID?: string }) {
  if (media.kind === 'image') {
    return <Image testID={testID} source={{ uri: media.uri }} style={styles.media} contentFit="cover" accessible={false} />
  }
  return <Video media={media} testID={testID} />
}

type VideoState = 'poster' | 'playing' | 'failed'

/**
 * The video slot. `attempt` keys the player, so Try again builds a new one.
 * ponytail: no progress bar (R3-D5 draws one); it comes with a timeUpdate
 * listener if people ask how long is left.
 */
function Video({ media, testID }: { media: Extract<BroadcastMedia, { kind: 'video' }>; testID?: string }) {
  const bold = useBoldText()
  const [state, setState] = useState<VideoState>('poster')
  const [attempt, setAttempt] = useState(0)

  return (
    <View testID={testID} style={styles.media}>
      {media.poster && state !== 'failed' ? (
        <Image source={{ uri: media.poster }} style={StyleSheet.absoluteFill} contentFit="cover" accessible={false} />
      ) : null}
      {state === 'poster' ? (
        <>
          <View style={styles.center}>
            <IconButton
              icon="play"
              tier="media"
              accessibilityLabel={`Play video, ${spokenDuration(media.duration)}`}
              onPress={() => setState('playing')}
            />
          </View>
          <View style={styles.duration} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Text maxFontSizeMultiplier={1.3} style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.white]}>
              {media.duration}
            </Text>
          </View>
        </>
      ) : null}
      {state === 'playing' ? (
        <Playing key={attempt} uri={media.uri} onEnd={() => setState('poster')} onError={() => setState('failed')} />
      ) : null}
      {state === 'failed' ? (
        <View style={styles.center}>
          <Icon name="cloud-off" color={COLOR.textSecondary} />
          <Text style={[font('meta', bold), styles.secondary]}>Couldn’t load this</Text>
          <Pressable
            accessibilityRole="button"
            hitSlop={(minTarget() - TYPE.meta.lineHeight) / 2}
            onPress={() => {
              setAttempt((n) => n + 1)
              setState('playing')
            }}
          >
            <Text style={[font('meta', bold, FONT_FAMILY.brand[700]), styles.white]}>Try again</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  )
}

/** Mounted only while it plays: one decoder, and none for a poster nobody tapped. */
function Playing({ uri, onEnd, onError }: { uri: string; onEnd: () => void; onError: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true
    p.loop = false
  })
  const [muted, setMuted] = useState(true)

  useEffect(() => {
    // `player` is expo-video's native object, not React state; a property write is its only API for sound.
    // eslint-disable-next-line react-hooks/immutability
    player.muted = muted
  }, [player, muted])

  useEffect(() => {
    const ended = player.addListener('playToEnd', onEnd)
    const status = player.addListener('statusChange', ({ status: now }) => {
      if (now === 'error') onError()
    })
    player.play()
    return () => {
      ended.remove()
      status.remove()
    }
    // The player is this mount's; the callbacks only set the parent's state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player])

  return (
    <>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} allowsPictureInPicture={false} accessible={false} />
      <View style={styles.sound}>
        <IconButton icon={muted ? 'volume-x' : 'volume-2'} tier="media" accessibilityLabel={muted ? 'Turn sound on' : 'Turn sound off'} onPress={() => setMuted(!muted)} />
      </View>
    </>
  )
}

const styles = StyleSheet.create({
  card: { borderRadius: BUBBLE.radius, paddingVertical: SPACE.md, paddingHorizontal: SPACE.lg, gap: SPACE.sm },
  announcement: { backgroundColor: COLOR.surface },
  sponsored: { backgroundColor: COLOR.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
  words: { gap: SPACE.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  mark: {
    width: MARK,
    height: MARK,
    borderRadius: RADIUS.thumb,
    backgroundColor: COLOR.textPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markText: { color: COLOR.ink },
  media: { aspectRatio: MEDIA_RATIO, borderRadius: MEDIA_RADIUS, overflow: 'hidden', backgroundColor: COLOR.surface },
  center: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', gap: SPACE.sm },
  duration: {
    position: 'absolute',
    right: SPACE.sm,
    bottom: SPACE.sm,
    height: SPACE.xl,
    paddingHorizontal: SPACE.sm,
    borderRadius: RADIUS.capsule,
    backgroundColor: MATERIAL.scrimPill,
    justifyContent: 'center',
  },
  sound: { position: 'absolute', right: SPACE.sm, bottom: SPACE.sm },
  white: { color: COLOR.textPrimary },
  secondary: { color: COLOR.textSecondary },
})
