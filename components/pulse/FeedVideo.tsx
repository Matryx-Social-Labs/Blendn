import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect } from 'react'
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native'

/**
 * A clip playing inside a feed card.
 *
 * ## Mount it only when it should play
 *
 * This component **is** the single-active-player policy. It does not take an
 * `active` prop and pause itself — the caller mounts it for the one card that
 * is on screen and unmounts it for the rest, so no inactive player is ever
 * constructed.
 *
 * The alternative, one `useVideoPlayer` per card paused until visible, still
 * allocates a decoder per card. On a feed of ten that is ten decoders, which on
 * older hardware is where the scroll starts dropping frames and the battery
 * starts going — and it fails quietly, as jank rather than as an error.
 *
 * ## The poster is not this component's job
 *
 * The card draws its cover image underneath, always, and this mounts over it.
 * So the first paint is a real photograph rather than a black rectangle, and a
 * clip that fails to load leaves the card looking finished instead of broken.
 * There is no loading spinner for the same reason: the poster *is* the loading
 * state, and it is one the user cannot tell from the finished thing.
 *
 * ## Muted, looping, no controls
 *
 * A feed that makes noise when you scroll past it is a feed people close. Sound
 * belongs on the event's own screen, where opening it is a choice. Looping
 * because these are ten-second clips and a card that plays once and freezes on
 * an arbitrary frame looks like it broke.
 */
export function FeedVideo({
  source,
  style,
}: {
  /** A direct MP4 URL. See `docs/MEDIA.md` for what the pipeline guarantees. */
  source: string
  style?: StyleProp<ViewStyle>
}) {
  const player = useVideoPlayer(source, (p) => {
    p.loop = true
    p.muted = true
  })

  useEffect(() => {
    /*
     * `play()` in an effect rather than in the setup callback.
     *
     * The setup runs while the player is still being constructed, and calling
     * play there races the source load — on a cold cache it starts, finds
     * nothing buffered and stalls, leaving the poster up until something else
     * nudges it.
     */
    player.play()
  }, [player])

  return (
    <VideoView
      player={player}
      style={[StyleSheet.absoluteFill, style]}
      contentFit="cover"
      nativeControls={false}
      // Nothing here should offer full-screen or PiP: the card is a preview,
      // and the event's own screen is where the media gets a real surface.
      allowsFullscreen={false}
      allowsPictureInPicture={false}
      accessible={false}
    />
  )
}
