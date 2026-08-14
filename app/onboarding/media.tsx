import { Ionicons } from '@expo/vector-icons'
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
 * Tapping a photo promotes it to the front rather than opening a menu. One tap,
 * no modal, and the layout says which one won because the primary slot is the
 * big one. Removing moved to a corner button, since tap now means promote.
 */

const SLOTS = 6

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
              style={[styles.slot, primary && styles.slotPrimary]}
            >
              <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />

              {primary ? (
                <View style={styles.primaryTag}>
                  <Text style={styles.primaryTagText}>MAIN</Text>
                </View>
              ) : null}

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
            {/*
              The plus, alone, and that is the fix.
              
              It used to sit above a caption inside the same centred block — so
              the *block* was centred and the plus was not, which is exactly
              what it looked like. Guidance moved to the line under the grid,
              where it does not have to share a box with the thing it describes.
            */}
            {uploadingSlot !== null ? (
              <ActivityIndicator color={EMBER.accent} />
            ) : (
              <Ionicons name="add" size={32} color={EMBER.accent} />
            )}
          </Pressable>
        ) : null}
      </View>

      <Text style={styles.note}>
        {photos.length === 0
          ? 'Add up to 6 photos. The first one is what people see first.'
          : photos.length === 1
            ? 'Add up to 6. JPG and PNG.'
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
  slotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,144,109,0.35)',
    backgroundColor: 'transparent',
  },
  photo: { width: '100%', height: '100%' },

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
