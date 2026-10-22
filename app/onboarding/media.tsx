import { ScreenProfiler } from '../../lib/perf'
import { useState } from 'react'
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'

import { font, PRESSED_WASH, useBoldText } from '../../components/ds/shared'
import { useToast } from '../../components/Toast'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { PhotoTile, MAIN_RATIO } from '../../components/onboarding/PhotoTile'
import { photoNote, readyPhotos, withMainFirst, type PhotoTile as Tile } from '../../components/onboarding/photoTiles'
import { Icon } from '../../components/ui/Icon'
import { COLOR, DURATION, ICON, PRESS, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import ScalePress from '../../components/motion/ScalePress'
import { selectPhoto, uploadPhoto } from '../../lib/photoUtils'
import { useAuth } from '../../lib/useAuth'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step seven: photos.
 *
 * Six slots, and every one of them optional. This is the highest-friction thing
 * the flow asks for, and refusing to let anyone in without a photo loses more
 * people than the empty avatars cost.
 *
 * `selectPhoto` and `uploadPhoto` are reused rather than reimplemented: they already do the source sheet, the camera
 * permission (the library needs none — see `pickImage`), validation, a quality check, and the presigned upload. Writing a
 * second upload path here would be a second thing to keep in step with Tigris. They are the two halves of
 * `selectAndUploadPhoto`, split so the tile can be on screen, with its progress, while the upload runs, and so a failed
 * upload keeps the file for Retry.
 *
 * **Photos only, not video.** The frame's caption offers "JPG, PNG and MP4 up
 * to 20MB", and the upload path is images end to end — `pickImage` asks the picker for
 * `['images']`, and the server moderates profile photos through an
 * image check that has nothing to say about a video. Offering MP4 would mean
 * either an unmoderated video on a profile or a rejection after the upload
 * finished. In `docs/ONBOARDING.md`.
 *
 * ## Choosing which one is the primary
 *
 * `photos[0]` is not just the first one you happened to add — the server
 * mirrors it onto `User.image`, and that is the single image DMs, conversation
 * lists and the reveal all render. So it needs to be a choice, not an accident
 * of upload order.
 *
 * **Tap, not long-press.** A long-press is discoverable by accident or not at
 * all, and this is something people should find the first time they look at
 * the screen — so it gets the gesture everyone tries first, and a caption says
 * so in words rather than relying on anyone guessing.
 *
 * The current main photo is unmistakable three ways at once: it is the big
 * slot, it carries a ring, and it is labelled. Removing moved to its own corner
 * target, because a single tap cannot mean both "choose this" and "delete this".
 *
 * ## The pulled photo
 *
 * The design draws a fourth tile state, "This photo was removed. Add a different one.", for a photo moderation took down
 * after it was added. The server now says which photos it pulled (`photo_states`, blendn-admin #716), but only on your own
 * `GET /profiles/:id`, which onboarding's draft does not read: Edit profile draws it (`components/PhotoManager.tsx`). Here a photo
 * pulled mid-onboarding is simply gone from the next read of the draft.
 */

const SLOTS = 6
const GRID_GAP = SPACE.lg
const WELL = 48

let tileKey = 0
const nextKey = () => `tile-${++tileKey}`

function MediaScreenInner() {
  const { user } = useAuth()
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('media')
  const { showToast } = useToast()
  const reduceMotion = useReducedMotion()
  const bold = useBoldText()
  const window = useWindowDimensions()
  const slot = Math.floor((window.width - SPACE.gutter * 2 - GRID_GAP) / 2)

  const [tiles, setTiles] = useState<Tile[]>([])

  /*
   * The draft's photos, whenever they change: once it has loaded, and again
   * when a save swaps each upload for the copy the server stored and deleted
   * the upload (SCRUM-491). Back from the next step returns to this screen
   * still mounted, and Continue re-sending a deleted upload was refused.
   */
  const [shown, setShown] = useState<string[] | undefined>(undefined)
  if (loaded && draft.photos !== shown) {
    setShown(draft.photos)
    setTiles((draft.photos ?? []).map((url) => ({ key: url, state: 'ready' as const, url })))
  }

  const uploading = tiles.some((tile) => tile.state === 'uploading')
  const replace = (key: string, next: Tile) => setTiles((current) => current.map((tile) => (tile.key === key ? next : tile)))

  /** Upload a chosen file into its tile, with the ring following it; a failure keeps the file under Retry. */
  const upload = async (key: string, uri: string) => {
    if (!user?.id) return
    replace(key, { key, state: 'uploading', uri, progress: 0 })
    const result = await uploadPhoto(uri, user.id, undefined, 'profile', (progress) =>
      setTiles((current) => current.map((tile) => (tile.key === key && tile.state === 'uploading' ? { ...tile, progress } : tile)))
    )
    if (result.success && result.url) {
      replace(key, { key, state: 'ready', url: result.url })
      return
    }
    // The tile says it did not get there, with Retry; the one error haptic answers it.
    replace(key, { key, state: 'failed', uri })
    H.error()
  }

  const add = async () => {
    if (!user?.id || uploading || tiles.length >= SLOTS) return
    const picked = await selectPhoto()
    // A cancelled picker is not a failure. Anything else says why, in the
    // validator's or the server's words ("Photo must be less than 5MB"); it
    // used to say nothing, and the empty slot looked like a tap that missed.
    if (!picked.ok) {
      if (!picked.cancelled) showToast(picked.error || "That photo wasn’t added. Try again.", 'error', { haptic: 'error' })
      return
    }
    const key = nextKey()
    setTiles((current) => [...current, { key, state: 'uploading', uri: picked.uri, progress: 0 }])
    await upload(key, picked.uri)
  }

  const remove = (key: string) => setTiles((current) => current.filter((tile) => tile.key !== key))

  /** Move a photo to the front. `photos[0]` is what everyone else sees. */
  const makePrimary = (key: string) => {
    // A choice between photos changes: the selection tick.
    H.select()
    setTiles((current) => withMainFirst(current, key))
  }

  // The tiles glide to their places as one is made main or removed; Reduce Motion lets them land.
  const glide = reduceMotion ? undefined : LinearTransition.springify().stiffness(SPRING.settle.stiffness).damping(SPRING.settle.damping)
  const leave = reduceMotion ? undefined : FadeOut.duration(DURATION.quick)
  // A photo lands with a fade (Reduce Motion: its own shorter one), so adding one is seen, not a tile appearing.
  const enter = FadeIn.duration(motionTokens(reduceMotion).duration.base)

  return (
    <OnboardingScreen
      step="media"
      title="Add your "
      titleAccent="photos"
      subtitle="Up to six. Recent photos where your face is clear work best."
      ctaLabel="Continue"
      ctaBusy={saving}
      ctaDisabled={uploading}
      onContinue={() => void commit({ photos: readyPhotos(tiles) })}
      secondaryLabel="Skip for now"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      <Text style={[font('meta', bold), styles.note]}>{photoNote(tiles.length)}</Text>

      {/* Every photo so far, plus one well to add the next. Six empty squares made the screen twice as tall as it needed to be. */}
      <View style={styles.grid}>
        {tiles.map((tile, index) => (
          <PhotoTile
            key={tile.key}
            tile={tile}
            index={index}
            slot={slot}
            onMakeMain={() => makePrimary(tile.key)}
            onRemove={() => remove(tile.key)}
            onRetry={() => (tile.state === 'failed' ? void upload(tile.key, tile.uri) : undefined)}
            retryDisabled={uploading}
            animation={{ layout: glide, exiting: leave, entering: enter }}
          />
        ))}

        {tiles.length < SLOTS ? (
          <Animated.View layout={glide} style={[styles.well, tiles.length === 0 ? [styles.wide, { height: Math.round(slot * MAIN_RATIO) }] : { width: slot, height: slot }]}>
            <ScalePress
              onPress={() => void add()}
              disabled={uploading}
              pressedScale={Platform.OS === 'android' ? 1 : PRESS.scale}
              android_ripple={{ color: PRESSED_WASH.android }}
              accessibilityRole="button"
              accessibilityLabel={tiles.length === 0 ? 'Add your main photo' : 'Add a photo'}
              accessibilityState={{ disabled: uploading }}
              style={styles.wellPress}
            >
              <View style={styles.wellDisc}>
                <Icon name="plus" size={ICON.nav} color={COLOR.textPrimary} />
              </View>
              {tiles.length === 0 ? <Text style={[font('meta', bold), styles.muted]}>Add a photo</Text> : null}
            </ScalePress>
          </Animated.View>
        ) : null}
      </View>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  note: { color: COLOR.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  muted: { color: COLOR.textSecondary },
  wide: { width: '100%' },
  well: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken, borderWidth: 1, borderColor: COLOR.hairlineStrong, overflow: 'hidden' },
  wellPress: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md },
  wellDisc: { width: WELL, height: WELL, borderRadius: RADIUS.capsule, backgroundColor: COLOR.surface, alignItems: 'center', justifyContent: 'center' },
})


/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function MediaScreen() {
  return (
    <ScreenProfiler id="onboard-media">
      <MediaScreenInner />
    </ScreenProfiler>
  )
}
