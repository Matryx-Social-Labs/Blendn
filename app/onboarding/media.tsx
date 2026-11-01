import { ScreenProfiler } from '../../lib/perf'
import { useEffect, useState } from 'react'
import { Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'

import { font, PRESSED_WASH, useBoldText } from '../../components/ds/shared'
import { useToast } from '../../components/Toast'
import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { PhotoTile, PulledPhotoTile, MAIN_RATIO } from '../../components/onboarding/PhotoTile'
import { photoNote, readyPhotos, withMainFirst, withoutPulledDraftPhotos, type PhotoTile as Tile } from '../../components/onboarding/photoTiles'
import { Icon } from '../../components/ui/Icon'
import { COLOR, DURATION, ICON, MAX_FONT_SCALE, PRESS, RADIUS, SPACE, SPRING } from '../../lib/design/tokens'
import { H } from '../../lib/haptics'
import { motionTokens, useReducedMotion } from '../../lib/motion'
import ScalePress from '../../components/motion/ScalePress'
import { RepositionHost } from '../../components/profile/Reposition'
import { YouSeeTheySee } from '../../components/onboarding/YouSeeTheySee'
import { loadPulledPhotos, selectPhoto, uploadPhoto } from '../../lib/photoUtils'
import { mainWasPulled, type PulledPhoto } from '../../lib/photoStates'
import { markPulledSeen } from '../../lib/pulledNotices'
import { SUPPORT_EMAIL } from '../../lib/support'
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
 * after it was added. The server says which photos it pulled (`photo_states`, blendn-admin #716) on your own `GET /profiles/:id`,
 * which onboarding's draft does not read, so this screen reads it too: an empty tile with a shield for each pulled one, and the draft
 * reconciled with the photos that are up (`withoutPulledDraftPhotos`), so Continue never sends a pulled URL back.
 */

const SLOTS = 6
const GRID_GAP = SPACE.lg
const WELL = 48
const HINTS_ACROSS = 5
const HINT_GAP = SPACE.sm

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
  /** The small places still free past the add well: five across, so all six places read at a glance (audit A11). */
  const hintSlot = Math.floor((window.width - SPACE.gutter * 2 - HINT_GAP * (HINTS_ACROSS - 1)) / HINTS_ACROSS)

  const [tiles, setTiles] = useState<Tile[]>([])
  /** The photos moderation took down since they were added (`photo_states`, your own profile): empty tiles with a shield, until dismissed or replaced. */
  const [pulled, setPulled] = useState<PulledPhoto[]>([])
  /** The photos that are up, once any has been pulled: the draft may still list a pulled one, and Continue must not send it. */
  const [liveOnly, setLiveOnly] = useState<string[] | null>(null)
  const userId = user?.id
  useEffect(() => {
    if (!loaded || !userId) return
    let alive = true
    void loadPulledPhotos(userId).then((own) => {
      if (!alive) return
      setPulled(own.pulled)
      // Reconciled only when something was pulled: the draft is otherwise what it was, and a failed read (no list) judges nothing.
      if (own.pulled.length > 0 && own.live) {
        setLiveOnly(own.live)
        setTiles((current) => withoutPulledDraftPhotos(current, own.live as string[]))
      }
    })
    return () => {
      alive = false
    }
  }, [loaded, userId])

  /*
   * The draft's photos, whenever they change: once it has loaded, and again
   * when a save swaps each upload for the copy the server stored and deleted
   * the upload (SCRUM-491). Back from the next step returns to this screen
   * still mounted, and Continue re-sending a deleted upload was refused.
   */
  const [shown, setShown] = useState<string[] | undefined>(undefined)
  if (loaded && draft.photos !== shown) {
    setShown(draft.photos)
    setTiles(withoutPulledDraftPhotos((draft.photos ?? []).map((url) => ({ key: url, state: 'ready' as const, url })), liveOnly ?? (draft.photos ?? [])))
  }

  // The empty tiles never take the well's slot: the last one is always the way to add.
  const pulledShown = pulled.slice(0, Math.max(0, SLOTS - 1 - tiles.length))
  const hints = Math.max(0, SLOTS - tiles.length - pulledShown.length - (tiles.length < SLOTS ? 1 : 0))
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
    const picked = await selectPhoto({ main: tiles.length === 0 })
    // A cancelled picker is not a failure. Anything else says why, in the
    // validator's or the server's words ("Photo must be less than 5MB"); it
    // used to say nothing, and the empty slot looked like a tap that missed.
    if (!picked.ok) {
      if (!picked.cancelled) showToast(picked.error || "That photo wasn’t added. Try again.", 'error', { haptic: 'error' })
      return
    }
    // A different photo stands in for the first removed one: its notice is done.
    const replaced = pulled[0]
    if (replaced) {
      setPulled((current) => current.filter((p) => p !== replaced))
      void markPulledSeen(user.id, replaced)
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
      title="Add "
      titleAccent="a photo"
      subtitle="Until you choose to show who you are, people see it blurred."
      // Empty, the primary is the picker (direction A): a Continue that saves nothing was a dead end dressed as progress.
      ctaLabel={tiles.length === 0 ? 'Choose a photo' : 'Continue'}
      ctaBusy={saving}
      ctaDisabled={uploading}
      onContinue={() => void (tiles.length === 0 ? add() : commit({ photos: readyPhotos(tiles) }))}
      secondaryLabel="Later"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {mainWasPulled(pulled) ? (
        <View testID="media-main-pulled" style={styles.mainPulled}>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.noteStrong]}>
            {tiles.length > 0 ? 'Your main photo was removed. The next one is your main photo now.' : 'Your main photo was removed.'}
          </Text>
          <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.note]}>Think we got it wrong? Write to {SUPPORT_EMAIL}.</Text>
        </View>
      ) : (
        <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.note]}>{photoNote(tiles.length)}</Text>
      )}
      {tiles[0]?.state === 'ready' ? <YouSeeTheySee uri={tiles[0].url} /> : null}
      {/* The reposition step a chosen photo goes through (6.3 #08); it draws nothing until one is asked. */}
      <RepositionHost />

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

        {pulledShown.map((notice, k) => (
          <PulledPhotoTile
            key={`pulled-${notice.pulledAt ?? k}`}
            slot={slot}
            disabled={uploading}
            onAdd={() => void add()}
            onDismiss={() => {
              setPulled((current) => current.filter((p) => p !== notice))
              if (userId) void markPulledSeen(userId, notice)
            }}
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
              {/* The first place is the main one (A11): it says so before anything is in it. */}
              {tiles.length === 0 ? (
                <Text maxFontSizeMultiplier={MAX_FONT_SCALE.meta} style={[font('meta', bold), styles.muted]}>
                  Main photo
                </Text>
              ) : null}
            </ScalePress>
          </Animated.View>
        ) : null}

        {/*
         * The places left past the add well, small and quiet: the six are seen at once without six large wells making the
         * step twice as tall. Decorative: the well above is the one way to add, and says so.
         */}
        {hints > 0 ? (
          <Animated.View layout={glide} style={styles.hints} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {Array.from({ length: hints }, (_, i) => (
              <View key={i} testID={`media-slot-hint-${i}`} style={[styles.hint, { width: hintSlot, height: hintSlot }]} />
            ))}
          </Animated.View>
        ) : null}
      </View>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  note: { color: COLOR.textSecondary },
  noteStrong: { color: COLOR.textPrimary },
  mainPulled: { gap: SPACE.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP },
  muted: { color: COLOR.textSecondary },
  wide: { width: '100%' },
  well: { borderRadius: RADIUS.mediaInCard, backgroundColor: COLOR.surfaceSunken, borderWidth: 1, borderColor: COLOR.hairlineStrong, overflow: 'hidden' },
  wellPress: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: SPACE.md },
  hints: { width: '100%', flexDirection: 'row', gap: HINT_GAP },
  hint: { borderRadius: RADIUS.thumb, backgroundColor: COLOR.surfaceSunken, borderWidth: StyleSheet.hairlineWidth, borderColor: COLOR.hairline },
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
