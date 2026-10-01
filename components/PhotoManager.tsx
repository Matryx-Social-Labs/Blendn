import { Ionicons } from '@expo/vector-icons'
import * as Haptics from 'expo-haptics'
import { EMBER, EMBER_RADIUS, ICON, SPACE, TYPE } from '../lib/theme'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
    AccessibilityInfo,
    ActivityIndicator,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native'
import Animated, { Easing, LinearTransition } from 'react-native-reanimated'
import {
    cachePhoto,
    deletePhoto,
    getUserPhotos,
    ProfilePhoto,
    reorderPhotos,
    selectAndUploadPhoto
} from '../lib/photoUtils'
import { Logger } from '../lib/logger'
import { showSheet } from '../lib/sheet'
import { fadeOutFast } from './motion/presence'
import { useToast } from './Toast'
import { OptimizedImage } from './OptimizedImage'

const { width } = Dimensions.get('window')

/*
 * "Make main" moves a photo to the front, and the grid used to jump: the tile
 * you tapped vanished from its slot and reappeared first, with no line between
 * the two. The tiles now travel to their new slots, so you can see where your
 * photo went and what moved over to make room. The same applies when a
 * removal closes a gap.
 *
 * On-screen movement, so ease-in-out, 250ms. Positions only: tiles are fixed
 * size with no shadow or blur, so the layout pass per frame stays small (see
 * tasks/lessons.md). Reanimated skips it under Reduce Motion and the tiles
 * snap into place.
 */
const TILE_REFLOW = LinearTransition.duration(250).easing(Easing.bezier(0.77, 0, 0.175, 1))

interface PhotoManagerProps {
  userId: string
  maxPhotos?: number
  editable?: boolean
  onPhotosChange?: (photos: string[]) => void
  style?: any
}

/**
 * The URLs the server stored, in place of the ones sent (SCRUM-489). A photo
 * just added is held as its upload URL, and the server stores a sealed copy
 * under another key and deletes the upload, so the next write must send the
 * copy. Kept as sent when the server's list does not line up.
 */
const adoptStoredUrls = (list: ProfilePhoto[], stored?: string[]): ProfilePhoto[] =>
  stored && stored.length === list.length ? list.map((p, i) => ({ ...p, url: stored[i] })) : list

export default function PhotoManager({ 
  userId, 
  maxPhotos = 6, 
  editable = true, 
  onPhotosChange,
  style 
}: PhotoManagerProps) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const { showToast } = useToast()
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({})
  const onPhotosChangeRef = useRef<PhotoManagerProps['onPhotosChange'] | undefined>(undefined)
  // Measure available width to compute exact 3-col sizing
  const [containerWidth, setContainerWidth] = useState<number>(width - 32)
  const NUM_COLUMNS = 3
  const GAP = SPACE.sm
  const itemSize = Math.max(80, Math.floor((containerWidth - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS))

  // Sets state only once the request settles. A caller that wants the spinner
  // meanwhile sets `loading` itself.
  const loadPhotos = () =>
    getUserPhotos(userId)
      .then((userPhotos) => {
        setPhotos(userPhotos)

        // Pre-cache photos for better performance
        userPhotos.forEach(photo => {
          if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
            cachePhoto(photo.url).then(localPath => {
              if (localPath) {
                setCachedUrls(prev => ({ ...prev, [photo.url]: localPath }))
              }
            })
          }
        })
      })
      .catch((error) => {
        Logger.error('profile', 'PhotoManager: Load photos error', { error, userId })
      })
      .finally(() => setLoading(false))

  // A different user's photos are loading from the render that names them.
  const [photosFor, setPhotosFor] = useState(userId)
  if (userId !== photosFor) {
    setPhotosFor(userId)
    setLoading(true)
  }

  useEffect(() => {
    loadPhotos()
    // loadPhotos is redefined every render; only userId should trigger a reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Keep a stable reference to onPhotosChange to avoid triggering effects due to identity changes
  useEffect(() => {
    onPhotosChangeRef.current = onPhotosChange
  }, [onPhotosChange])

  // Notify parent only when photos actually change
  useEffect(() => {
    if (onPhotosChangeRef.current) {
      onPhotosChangeRef.current(photos.map(p => p.url))
    }
  }, [photos])

  const handleAddPhoto = async () => {
    if (photos.length >= maxPhotos) {
      showToast(`You can have up to ${maxPhotos} photos.`, 'info')
      return
    }

    if (!editable) return

    setUploading(true)
    AccessibilityInfo.announceForAccessibility('Uploading photo')
    try {
      const result = await selectAndUploadPhoto(userId)

      if (result.success && result.url) {
        const newPhoto: ProfilePhoto = {
          id: `${userId}_${photos.length}`,
          url: result.url,
          order: photos.length,
          isPrimary: photos.length === 0,
          metadata: result.metadata ? {
            ...result.metadata,
            uploadedAt: new Date().toISOString()
          } : undefined
        }

        setPhotos(prev => [...prev, newPhoto])

        /*
         * The upload succeeded; THIS is the write that puts it on the profile,
         * and `reorderPhotos` reports failure by returning false, never by
         * throwing. The first version ignored the boolean and logged "Photo
         * added" regardless — so a person saw the tile, and on the next load
         * it was gone, with the object orphaned in storage.
         */
        const newPhotoUrls = [...photos.map(p => p.url), result.url]
        const saved = await reorderPhotos(userId, newPhotoUrls, photos[0]?.url)
        if (!saved.ok) {
          setPhotos(prev => prev.filter(p => p.url !== result.url))
          // The server's sentence when it gave one -- "That looks like a
          // blank image" says what to do; a generic retry does not.
          // (`reorderPhotos` curates it: the server's refusal, or its own line.)
          showToast(saved.error, 'error')
          return
        }
        setPhotos(prev => adoptStoredUrls(prev, saved.photos))
        AccessibilityInfo.announceForAccessibility('Photo added')
        Logger.info('profile', 'PhotoManager: Photo added', { userId, path: result.path || result.url })
      } else if (result.error && !result.cancelled) {
        Logger.warn('profile', 'PhotoManager: upload refused', { error: result.error })
        /*
         * The picker's own checks ("Photo must be less than 5MB") are written
         * for the person; everything else it returns ("Upload failed with
         * status 502") is not, and gets the app's sentence.
         */
        showToast(/^Photo must be /.test(result.error) ? `${result.error}.` : "Couldn't upload that photo. Try again.", 'error')
      }
    } catch (error) {
      Logger.error('profile', 'PhotoManager: Add photo error', { error, userId })
      showToast("Couldn't upload that photo. Try again.", 'error')
    } finally {
      setUploading(false)
    }
  }

  /**
   * Make a photo the primary one.
   *
   * A reorder, not a flag: `photos[0]` **is** the primary everywhere -- the
   * match card, the DM avatar, and `User.image`, which the server mirrors from
   * it. So promoting is moving the item to the front, and there is no second
   * source of truth to keep in step.
   *
   * The PRIMARY badge already existed and the array was already ordered; what
   * was missing was any way to choose, so it was whichever photo happened to be
   * uploaded first.
   */
  const handleMakePrimary = useCallback(
    async (photoIndex: number) => {
      if (!editable || photoIndex === 0) return

      const reordered = [
        photos[photoIndex],
        ...photos.filter((_, i) => i !== photoIndex),
      ]
      // Optimistic: the grid reorders under the finger, and a failed write
      // puts it back rather than leaving the UI ahead of the server. The
      // haptic lands on the same frame the tiles start to move.
      setPhotos(reordered.map((p, i) => ({ ...p, order: i, isPrimary: i === 0 })))
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {})

      const saved = await reorderPhotos(userId, reordered.map((p) => p.url), photos[0]?.url)
      if (!saved.ok) {
        setPhotos(photos)
        showToast(saved.error, 'error')
        return
      }
      setPhotos(prev => adoptStoredUrls(prev, saved.photos))
    },
    [editable, photos, userId, showToast]
  )

  const handleRemovePhoto = useCallback((photoIndex: number) => {
    if (!editable) return

    const photo = photos[photoIndex]
    
    // The app's one sheet, like every other "are you sure" (lib/sheet.ts).
    showSheet({
      kind: 'actions',
      title: 'Remove this photo?',
      message: "It comes off your profile. You can add it again later.",
      actions: [
        {
          label: 'Remove photo',
          variant: 'destructive',
          then: async () => {
            try {
              // Remove from state immediately for better UX
              const newPhotos = photos.filter((_, index) => index !== photoIndex)
              setPhotos(newPhotos)

              // The profile write first, and the storage delete ONLY if it
              // held. Deleting the object while the profile still lists the
              // URL left a broken image on every screen that shows this
              // person, and nothing had told them the removal failed.
              const saved = await reorderPhotos(userId, newPhotos.map(p => p.url), photos[0]?.url)
              if (!saved.ok) {
                setPhotos(photos)
                showToast(saved.error, 'error')
                return
              }

              setPhotos(prev => adoptStoredUrls(prev, saved.photos))

              // Delete from storage in background
              deletePhoto(photo.url).catch(error => {
                Logger.error('profile', 'PhotoManager: Delete photo error', { error, url: photo.url })
              })
              
              Logger.info('profile', 'PhotoManager: Photo removed', { userId, url: photo.url })
            } catch (error) {
              Logger.error('profile', 'PhotoManager: Remove photo error', { error, userId })
              showToast("Couldn't remove that photo. Try again.", 'error')
              // Reload photos to restore state
              setLoading(true)
              loadPhotos()
            }
          },
        },
        { label: 'Cancel', cancel: true },
      ],
    })
    // loadPhotos is redefined every render; only the listed values should
    // recreate this callback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editable, photos, userId, showToast])

  const renderPhoto = useCallback(({ item, index }: { item: ProfilePhoto; index: number }) => {
    const cachedUrl = cachedUrls[item.url]

    return (
      <Animated.View
        layout={TILE_REFLOW}
        exiting={fadeOutFast}
        style={[styles.photoContainer, { width: itemSize, height: itemSize }]}
      >
        {/*
          `accessible={false}`: the wrapper has no action of its own, and as an
          accessible element it swallowed the badge and both buttons into one
          unlabelled stop — "Make main" and "Remove" were reachable by touch
          exploration only. The tile's name lives on the image below; the
          buttons stay independently focusable.
        */}
        <TouchableOpacity
          style={[styles.photo, { width: itemSize, height: itemSize }]}
          activeOpacity={0.8}
          accessible={false}
        >
          <OptimizedImage
            source={cachedUrl || item.url}
            style={styles.photoImage}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Photo ${index + 1} of ${photos.length}${item.isPrimary ? ', main photo' : ''}`}
            contentFit="cover"
            placeholder={require('../assets/images/icon.png')}
            transition={200}
            cachePolicy="memory-disk"
            width={Math.round(itemSize * 2)}
            height={Math.round(itemSize * 2)}
            quality={80}
          />
          
          {item.isPrimary ? (
            <View style={styles.primaryBadge}>
              <Text style={styles.primaryText}>Main</Text>
            </View>
          ) : (
            editable && (
              /*
               * The badge existed and there was no way to move it, so the
               * primary photo was whichever one happened to be uploaded first.
               * `photos[0]` is the primary everywhere -- match card, DM avatar,
               * and `User.image`, which the server mirrors from it.
               */
              <TouchableOpacity
                style={styles.makePrimaryButton}
                onPress={() => handleMakePrimary(index)}
                accessibilityRole="button"
                accessibilityLabel="Make this my main photo"
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.makePrimaryText}>Make main</Text>
              </TouchableOpacity>
            )
          )}
          
          {editable && (
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemovePhoto(index)}
              accessibilityRole="button"
              accessibilityLabel={`Remove photo ${index + 1}`}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="close-circle" size={ICON.lg} color={EMBER.destructive} />
            </TouchableOpacity>
          )}
        </TouchableOpacity>
      </Animated.View>
    )
  }, [cachedUrls, editable, handleRemovePhoto, handleMakePrimary, itemSize, photos.length])

  const renderAddPhoto = () => {
    if (!editable || photos.length >= maxPhotos) return null

    return (
      <TouchableOpacity
        style={[styles.addPhoto, { width: itemSize, height: itemSize }]}
        onPress={handleAddPhoto}
        disabled={uploading}
        accessibilityRole="button"
        accessibilityLabel="Add photo"
        accessibilityState={{ disabled: uploading, busy: uploading }}
      >
        {uploading ? (
          <ActivityIndicator size="small" color={EMBER.textSecondary} />
        ) : (
          <>
            <Ionicons name="add" size={32} color={EMBER.textSecondary} />
            <Text style={styles.addPhotoText}>Add photo</Text>
          </>
        )}
      </TouchableOpacity>
    )
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <ActivityIndicator size="large" color={EMBER.textSecondary} />
        <Text style={styles.loadingText}>Loading photos...</Text>
      </View>
    )
  }

  return (
    <View 
      style={[styles.container, style]}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/*
        One line, where there were four.

        The empty state used to be a camera icon, "No photos yet", "Add photos
        to make your profile stand out", and a dashed **Add Photo** tile — four
        elements saying the same thing, three of them restating the control's
        own label. The tile is the empty state; it does not need to be
        announced.

        What is worth a line is the thing nobody could work out from the screen:
        `GET /profiles/{id}` withholds `photos` entirely from a viewer who has
        not been revealed to and returns a 40px stored derivative instead. So
        the old copy was not just redundant, it was **wrong about the product** —
        a photo cannot make you stand out in a room that cannot see it.
      */}
      <Text style={styles.caption}>
        {photos.length}/{maxPhotos} · blurred until you both reveal
      </Text>

      {photos.length > 0 ? (
        <View style={[styles.photoGrid, styles.photoGridContent]}> 
          {photos.map((item, index) => (
            <React.Fragment key={item.id}>
              {renderPhoto({ item, index })}
            </React.Fragment>
          ))}
        </View>
      ) : null}

      {renderAddPhoto()}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACE.xxl,
  },
  loadingText: {
    ...TYPE.body,
    marginTop: SPACE.lg,
    color: EMBER.textSecondary,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACE.lg,
  },
  caption: {
    ...TYPE.meta,
    marginBottom: SPACE.md,
  },
  hint: {
    ...TYPE.meta,
    fontStyle: 'italic',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACE.sm,
  },
  photoGridContent: {
    padding: 0,
  },
  photoContainer: {
    margin: 0,
  },
  photo: {
    borderRadius: EMBER_RADIUS.sm,
    overflow: 'hidden',
    backgroundColor: EMBER.surfaceSunken,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  makePrimaryButton: {
    position: 'absolute',
    bottom: SPACE.sm,
    left: SPACE.sm,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xs,
    borderRadius: EMBER_RADIUS.sm,
    backgroundColor: EMBER.scrim,
  },
  makePrimaryText: { ...TYPE.caption, color: EMBER.textPrimary },
  primaryBadge: {
    position: 'absolute',
    top: SPACE.sm,
    left: SPACE.sm,
    backgroundColor: EMBER.scrim,
    paddingHorizontal: SPACE.sm,
    paddingVertical: SPACE.xxs,
    borderRadius: EMBER_RADIUS.sm,
  },
  primaryText: { ...TYPE.caption, color: EMBER.textPrimary },
  removeButton: {
    position: 'absolute',
    top: SPACE.xs,
    right: SPACE.xs,
    // White disc behind the red close-circle glyph, so it reads on any photo.
    backgroundColor: EMBER.textPrimary,
    borderRadius: EMBER_RADIUS.pill,
  },
  dragHandle: {
    position: 'absolute',
    bottom: SPACE.xs,
    right: SPACE.xs,
    backgroundColor: EMBER.scrim,
    borderRadius: EMBER_RADIUS.sm,
    padding: SPACE.xxs,
  },
  dragText: { ...TYPE.caption, color: EMBER.textPrimary },
  addPhoto: {
    borderRadius: EMBER_RADIUS.sm,
    borderWidth: 2,
    borderColor: EMBER.textTertiary,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: EMBER.surfaceMedia,
    marginTop: SPACE.sm,
  },
  addPhotoText: {
    ...TYPE.meta,
    marginTop: SPACE.xs,
  },
})
