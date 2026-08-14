import { Ionicons } from '@expo/vector-icons'
import { LinearGradient } from 'expo-linear-gradient'
import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native'

import { OnboardingScreen } from '../../components/onboarding/OnboardingScreen'
import { useAuth } from '../../lib/useAuth'
import { previousStep } from '../../lib/onboarding'
import { selectAndUploadPhoto } from '../../lib/photoUtils'
import { EMBER, EMBER_RADIUS, EMBER_TYPE } from '../../lib/theme'
import { useOnboarding } from '../../lib/useOnboarding'

/**
 * Step seven — photos.
 *
 * Six slots, and every one of them optional. This is the highest-friction thing
 * the flow asks for, and refusing to let anyone in without a photo loses more
 * people than the empty avatars cost.
 *
 * `selectAndUploadPhoto` is reused rather than reimplemented: it already does
 * the source sheet, the permission request, validation, a quality check, and
 * the presigned upload. Writing a second upload path here would be a second
 * thing to keep in step with Tigris.
 *
 * **Photos only, not video.** The frame's caption offers "JPG, PNG and MP4 up
 * to 20MB", and the upload path is images end to end — `pickImage` requests
 * `MediaTypeOptions.Images`, and the server moderates profile photos through an
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
 * slot, it carries an accent ring, and it is labelled. One of those alone is a
 * decoration; together they are a state. Removing moved to its own corner
 * target, because a single tap cannot mean both "choose this" and "delete this".
 */

const SLOTS = 6

/**
 * A plus drawn as two rectangles, not as a glyph.
 *
 * This has now been "centred" twice and been wrong twice, for two different
 * reasons. First it shared a centred block with a caption, so the block was
 * centred and the plus rode above it. Then it was alone and still off, because
 * an icon font centres by *font metrics* — the glyph sits inside a line box
 * with ascender and descender space, `includeFontPadding` adds more on Android,
 * and none of that is symmetrical around the mark you actually see.
 *
 * Two rectangles have no metrics to argue with. The parent centres a
 * fixed-size square, and the bars are centred inside it by construction, so
 * this is exact on every platform and cannot drift when the icon set changes.
 */
function Plus({ size = 28, thickness = 2 }: { size?: number; thickness?: number }) {
  const bar = {
    position: 'absolute' as const,
    backgroundColor: EMBER.accent,
    borderRadius: thickness,
  }
  return (
    /*
     * Fills the slot and centres inside itself, rather than being a child the
     * slot centres.
     *
     * The slot already says `alignItems: center, justifyContent: center`, and
     * the plus still landed at the bottom edge on a device — so something about
     * the parent's box is not what it reads as. Rather than keep guessing at
     * which of `aspectRatio`, the wrapping row, or a stale Fast Refresh style
     * is responsible, this stops depending on the parent at all: an absolute
     * fill has one possible size, and the bars centre within that.
     *
     * `pointerEvents="none"` so covering the slot does not swallow the tap that
     * opens the picker.
     */
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
          <View style={[bar, { width: size, height: thickness }]} />
          <View style={[bar, { width: thickness, height: size }]} />
        </View>
      </View>
    </View>
  )
}

export default function MediaScreen() {
  const { user } = useAuth()
  const { draft, loaded, saving, commit, skip, goBack } = useOnboarding('media')

  const [photos, setPhotos] = useState<string[]>([])
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null)

  useEffect(() => {
    if (!loaded) return
    setPhotos(draft.photos ?? [])
  }, [loaded]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = async (slot: number) => {
    if (!user?.id || uploadingSlot !== null) return
    setUploadingSlot(slot)
    const result = await selectAndUploadPhoto(user.id)
    setUploadingSlot(null)
    // A cancelled picker is not a failure and already said so in its own sheet;
    // an upload error alerts from inside `selectAndUploadPhoto`.
    if (result.success && result.url) setPhotos((current) => [...current, result.url!])
  }

  const remove = (index: number) =>
    setPhotos((current) => current.filter((_, i) => i !== index))

  /** Move a photo to the front. `photos[0]` is what everyone else sees. */
  const makePrimary = (index: number) =>
    setPhotos((current) => [current[index], ...current.filter((_, i) => i !== index)])

  return (
    <OnboardingScreen
      step="media"
      title="Upload your "
      titleAccent="identity"
      subtitle="Authenticity is the soul of our gallery. Share moments that capture the real you."
      ctaLabel="Finalize Identity"
      ctaBusy={saving}
      onContinue={() => void commit({ photos })}
      secondaryLabel="Skip for now"
      onSecondary={() => void skip()}
      onBack={goBack}
    >
      {/*
        Only as many slots as are useful: every photo so far, plus one empty
        one to add the next. Six empty dashed squares made the screen twice as
        tall as it needed to be and most of that height was nothing.
      */}
      <View style={styles.grid}>
        {photos.map((url, index) => {
          const primary = index === 0

          return (
            <Pressable
              key={url}
              onPress={() => (primary ? undefined : makePrimary(index))}
              disabled={uploadingSlot !== null || primary}
              accessibilityRole="button"
              accessibilityLabel={
                primary ? 'Your main photo' : `Make photo ${index + 1} your main photo`
              }
              style={[styles.slot, primary && styles.slotPrimary, primary && styles.slotChosen]}
            >
              <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />

              {primary ? (
                <>
                  {/* A scrim under the label, so it survives a bright photo. */}
                  <LinearGradient
                    colors={['rgba(15,14,14,0)', 'rgba(15,14,14,0.85)']}
                    style={styles.primaryScrim}
                    pointerEvents="none"
                  />
                  <View style={styles.primaryTag}>
                    <Text style={styles.primaryTagText}>MAIN PHOTO</Text>
                  </View>
                </>
              ) : (
                /*
                 * The prompt lives on the photos that are *not* chosen, which
                 * is where the action is. Putting it on the main one would
                 * label the thing that has nothing left to do.
                 */
                <View style={styles.makeMain}>
                  <Text style={styles.makeMainText}>Make main</Text>
                </View>
              )}

              {/*
                Remove is its own hit target now that tapping the photo means
                "make this the main one". A single tap cannot mean both.
              */}
              <Pressable
                onPress={() => remove(index)}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                style={styles.removeBadge}
              >
                <Ionicons name="close" size={14} color={EMBER.onGradientChip} />
              </Pressable>
            </Pressable>
          )
        })}

        {photos.length < SLOTS ? (
          <Pressable
            onPress={() => void add(photos.length)}
            disabled={uploadingSlot !== null}
            accessibilityRole="button"
            accessibilityLabel={photos.length === 0 ? 'Add your main photo' : 'Add a photo'}
            style={[styles.slot, photos.length === 0 && styles.slotPrimary, styles.slotEmpty]}
          >
            {uploadingSlot !== null ? <ActivityIndicator color={EMBER.accent} /> : <Plus />}
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.note}>
        {photos.length === 0
          ? 'Your main photo is the one people see on your profile and in messages. Add up to 6.'
          : photos.length === 1
            ? 'This is your main photo. Add more and you can pick a different one.'
            : 'Tap any photo to make it your main one. JPG and PNG, up to 6.'}
      </Text>
    </OnboardingScreen>
  )
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  slot: {
    width: '48%',
    aspectRatio: 1,
    borderRadius: EMBER_RADIUS.card,
    backgroundColor: EMBER.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  slotPrimary: { width: '100%', aspectRatio: 1.3 },
  // The ring is the third signal, after size and the label. Any one of them
  // alone reads as decoration; together they read as a state.
  slotChosen: { borderWidth: 2, borderColor: EMBER.accent },
  slotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,144,109,0.35)',
    backgroundColor: 'transparent',
  },
  photo: { width: '100%', height: '100%' },

  primaryScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 88 },
  makeMain: {
    position: 'absolute',
    bottom: 8,
    alignSelf: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: 'rgba(15,14,14,0.75)',
  },
  makeMainText: { ...EMBER_TYPE.helper, fontSize: 10, color: EMBER.textPrimary },
  primaryTag: {
    position: 'absolute',
    left: 12,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
  },
  primaryTagText: { ...EMBER_TYPE.helper, color: EMBER.onGradientChip, fontSize: 10 },
  removeBadge: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: EMBER_RADIUS.pill,
    backgroundColor: EMBER.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: EMBER_TYPE.helper,
})
