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
 * The first photo is the primary one: the server mirrors `photos[0]` onto
 * `User.image`, which is what DMs and conversation lists render.
 */

const SLOTS = 6

export default function MediaScreen() {
  const { user } = useAuth()
  const { draft, loaded, saving, commit, skip, goTo } = useOnboarding('media')

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
      onBack={() => goTo(previousStep('media')!)}
    >
      <View style={styles.grid}>
        {Array.from({ length: SLOTS }, (_, index) => {
          const url = photos[index]
          const busy = uploadingSlot === index
          // The first slot is twice as tall: it is the primary photo, mirrored
          // onto `User.image` and shown in DMs, so it earns the emphasis.
          const wide = index === 0

          return (
            <Pressable
              key={index}
              onPress={() => (url ? remove(index) : void add(index))}
              disabled={uploadingSlot !== null}
              accessibilityRole="button"
              accessibilityLabel={
                url
                  ? `Remove photo ${index + 1}`
                  : `Add ${index === 0 ? 'your main photo' : `photo ${index + 1}`}`
              }
              style={[styles.slot, wide && styles.slotWide, !url && styles.slotEmpty]}
            >
              {url ? (
                <>
                  <Image source={{ uri: url }} style={styles.photo} resizeMode="cover" />
                  <View style={styles.removeBadge}>
                    <Ionicons name="close" size={14} color={EMBER.onGradientChip} />
                  </View>
                </>
              ) : busy ? (
                <ActivityIndicator color={EMBER.accent} />
              ) : (
                <Ionicons name="add" size={24} color={EMBER.accent} />
              )}
            </Pressable>
          )
        })}
      </View>

      <Text style={styles.note}>
        JPG and PNG, up to 6 photos. Your first photo is the one people see first.
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
  slotWide: { width: '100%', aspectRatio: 1.3 },
  slotEmpty: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,144,109,0.35)',
    backgroundColor: 'transparent',
  },
  photo: { width: '100%', height: '100%' },
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
