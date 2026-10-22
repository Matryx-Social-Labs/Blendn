import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AccessibilityInfo, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'

import { Banner } from './ds/Banner'
import { CONTROL_FONT_CAP, font, useBoldText } from './ds/shared'
import { DraggableTile } from './profile/DraggableTile'
import { AddFace, FailedFace, PhotoFace, PulledFace, UploadingFace } from './profile/PhotoGridTile'
import { SkeletonBlock } from './Skeleton'
import { useToast } from './Toast'
import { COLOR, FONT_FAMILY, RADIUS, SPACE } from '../lib/design/tokens'
import { H } from '../lib/haptics'
import { Logger } from '../lib/logger'
import { inSlotOrder, moveItem, reordered, type GridSpec } from '../lib/photoOrder'
import { cachePhoto, deletePhoto, loadUserPhotos, ProfilePhoto, reorderPhotos, selectAndUploadPhoto, uploadPhoto } from '../lib/photoUtils'
import { showSheet } from '../lib/sheet'

const COLUMNS = 3
const GAP = SPACE.sm
/** The three skeleton tiles of the loading frame (Flow 6 edit 11). */
const SKELETON_TILES = 3

interface PhotoManagerProps {
  userId: string
  maxPhotos?: number
  /** A tile is lifted (true) or let go (false): the host stops its scroll while one is in the hand. */
  onDragging?: (dragging: boolean) => void
}

/** A photo on its way up, or one that did not get there: it holds the next slot and its file, so Retry has something to send. */
type Pending = { uri: string; state: 'uploading' | 'failed'; progress: number }

/**
 * The URLs the server stored, in place of the ones sent (SCRUM-489). A photo
 * just added is held as its upload URL, and the server stores a sealed copy
 * under another key and deletes the upload, so the next write must send the
 * copy. Kept as sent when the server's list does not line up.
 */
const adoptStoredUrls = (list: ProfilePhoto[], stored?: string[]): ProfilePhoto[] =>
  stored && stored.length === list.length ? list.map((p, i) => ({ ...p, url: stored[i] })) : list

/**
 * Edit profile's photos (Flow 6 edit 01 to 06, 11; R4.1 6.3 and 6-4): up to six squares, three across, the first marked Main, an empty
 * dashed slot for each one still to come. Photos save on their own; drag one (a long press lifts it, `H.drag`) to reorder, and the
 * first is what people see. A screen reader gets the same through each photo's actions (Make main photo, Move earlier, Move later).
 *
 * One photo write at a time (SCRUM-497). A new tile carries its upload's URL until the add's write returns the sealed copy the server
 * keeps — it deletes the upload. Reordering and Remove stayed live meanwhile, so a quick drag re-sent the upload ("That photo did not
 * finish uploading"), and a failed write put back a grid that still held it. The ref refuses a second write even within one frame;
 * `busy` is what the tiles show.
 *
 * A photo on its way is a tile with a progress bar; one that did not get there is a tile with Retry (it keeps the file). A photo
 * moderation took down (`pulled`) is a tile that says so; the server sends no such flag yet, so none is drawn today.
 */
export default function PhotoManager({ userId, maxPhotos = 6, onDragging }: PhotoManagerProps) {
  const [photos, setPhotos] = useState<ProfilePhoto[]>([])
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [pending, setPending] = useState<Pending | null>(null)
  const [uploading, setUploading] = useState(false)
  const writing = useRef(false)
  const addedCount = useRef(0)
  const [saving, setSaving] = useState(false)
  const busy = uploading || saving
  const { showToast } = useToast()
  const bold = useBoldText()
  const { width: windowWidth } = useWindowDimensions()
  const [cachedUrls, setCachedUrls] = useState<Record<string, string>>({})
  // The grid's width is the card's inside: measured, with the screen's gutters and the card's padding as the first guess.
  const [containerWidth, setContainerWidth] = useState<number>(windowWidth - SPACE.gutter * 2 - SPACE.xl * 2)
  const itemSize = Math.max(1, Math.floor((containerWidth - GAP * (COLUMNS - 1)) / COLUMNS))
  const grid: GridSpec = useMemo(() => ({ itemSize, gap: GAP, columns: COLUMNS }), [itemSize])
  const rows = Math.ceil(maxPhotos / COLUMNS)
  const gridHeight = rows * itemSize + (rows - 1) * GAP

  // Where each tile sits while one is being dragged, and which one that is (-1: none).
  const positions = useSharedValue<number[]>([])
  const active = useSharedValue(-1)
  useEffect(() => {
    positions.set(photos.map((_, i) => i))
  }, [photos, positions])

  const loadPhotos = useCallback(
    () =>
      loadUserPhotos(userId).then((userPhotos) => {
        if (userPhotos === null) {
          setLoadFailed(true)
          setLoading(false)
          return
        }
        setLoadFailed(false)
        setPhotos(userPhotos)
        setLoading(false)
        // Pre-cache photos for better performance
        userPhotos.forEach((photo) => {
          if (photo.url.startsWith('http://') || photo.url.startsWith('https://')) {
            cachePhoto(photo.url).then((localPath) => {
              if (localPath) setCachedUrls((prev) => ({ ...prev, [photo.url]: localPath }))
            })
          }
        })
      }),
    [userId]
  )

  // A different user's photos are loading from the render that names them.
  const [photosFor, setPhotosFor] = useState(userId)
  if (userId !== photosFor) {
    setPhotosFor(userId)
    setLoading(true)
  }

  useEffect(() => {
    loadPhotos().catch((error) => Logger.error('profile', 'PhotoManager: Load photos error', { error, userId }))
  }, [loadPhotos, userId])

  /**
   * The add's write: the upload held its URL, and THIS is the write that puts it on the profile. `reorderPhotos` reports failure by
   * returning false, never by throwing; ignoring it logged "Photo added" for a tile that was gone on the next load.
   */
  const putOnProfile = async (url: string, path?: string) => {
    // A key of its own: an index-built one repeats after a photo is removed or moved, and two tiles would share one.
    const newPhoto: ProfilePhoto = { id: `${userId}_new_${(addedCount.current += 1)}`, url, order: photos.length, isPrimary: photos.length === 0 }
    setPhotos((prev) => [...prev, newPhoto])
    setPending(null)
    const saved = await reorderPhotos(userId, [...photos.map((p) => p.url), url], photos[0]?.url)
    if (!saved.ok) {
      setPhotos((prev) => prev.filter((p) => p.url !== url))
      // The server's sentence when it gave one -- "That looks like a blank image" says what to do; a generic retry does not.
      showToast(saved.error, 'error', { haptic: 'error' })
      return
    }
    H.success()
    setPhotos((prev) => adoptStoredUrls(prev, saved.photos))
    AccessibilityInfo.announceForAccessibility('Photo added')
    Logger.info('profile', 'PhotoManager: Photo added', { userId, path: path || url })
  }

  const onProgress = (progress: number) => setPending((prev) => (prev && prev.state === 'uploading' ? { ...prev, progress } : prev))

  /** The upload failed after the file was chosen: the tile keeps it for Retry, and the toast says it in words. */
  const upFailed = (error?: string) => {
    setPending((prev) => (prev ? { ...prev, state: 'failed' } : null))
    showToast(error && /^Photo must be /.test(error) ? `${error}.` : "Couldn’t upload that photo. Try again.", 'error', { haptic: 'error' })
  }

  const handleAddPhoto = async () => {
    if (photos.length >= maxPhotos) {
      showToast(`You can have up to ${maxPhotos} photos.`, 'info')
      return
    }
    if (writing.current) return
    writing.current = true
    setUploading(true)
    AccessibilityInfo.announceForAccessibility('Uploading photo')
    try {
      const result = await selectAndUploadPhoto(userId, {
        onPicked: (uri) => setPending({ uri, state: 'uploading', progress: 0 }),
        onProgress,
      })
      if (result.success && result.url) {
        await putOnProfile(result.url, result.path)
      } else if (result.error && !result.cancelled) {
        Logger.warn('profile', 'PhotoManager: upload refused', { error: result.error })
        /*
         * The picker's own checks ("Photo must be less than 5MB") are written for the person; everything else it returns
         * ("Upload failed with status 502") is not, and gets the app's sentence.
         */
        upFailed(result.error)
      } else {
        setPending(null)
      }
    } catch (error) {
      Logger.error('profile', 'PhotoManager: Add photo error', { error, userId })
      upFailed()
    } finally {
      writing.current = false
      setUploading(false)
    }
  }

  /** Retry on a tile that did not upload: the same file, to the same slot. */
  const handleRetry = async () => {
    if (!pending || writing.current) return
    writing.current = true
    setUploading(true)
    setPending({ ...pending, state: 'uploading', progress: 0 })
    try {
      const result = await uploadPhoto(pending.uri, userId, undefined, 'profile', onProgress)
      if (result.success && result.url) await putOnProfile(result.url, result.path)
      else upFailed(result.error)
    } catch (error) {
      Logger.error('profile', 'PhotoManager: Retry upload error', { error, userId })
      upFailed()
    } finally {
      writing.current = false
      setUploading(false)
    }
  }

  /**
   * Save a new order. A reorder, not a flag: `photos[0]` **is** the primary everywhere -- the match card, the DM avatar, and
   * `User.image`, which the server mirrors from it -- so there is no second source of truth to keep in step. Optimistic: the grid is
   * already there under the finger, and a failed write puts it back (the tiles travel home) rather than leaving the UI ahead of the
   * server. The haptic waits for the server: outcome after truth (§10.1).
   */
  const commitOrder = useCallback(
    async (reorderedPhotos: ProfilePhoto[]) => {
      if (writing.current) return
      writing.current = true
      setSaving(true)
      setPhotos(reorderedPhotos.map((p, i) => ({ ...p, order: i, isPrimary: i === 0 })))
      try {
        const saved = await reorderPhotos(userId, reorderedPhotos.map((p) => p.url), photos[0]?.url)
        if (!saved.ok) {
          setPhotos(photos)
          showToast(saved.error, 'error', { haptic: 'error' })
          return
        }
        H.success()
        setPhotos((prev) => adoptStoredUrls(prev, saved.photos))
      } finally {
        writing.current = false
        setSaving(false)
      }
    },
    [photos, userId, showToast]
  )

  /** A drag ended: the order the slots say, written once, and nothing at all when it ended where it began. */
  const handleDrop = useCallback(
    (slots: number[]) => {
      if (slots.length !== photos.length || !reordered(slots)) return
      // A write is already in flight (an upload landed under the finger): the drop is not queued behind it, the tiles go home, and
      // the person drags again once it has settled. Dragging is off while one is open, so this is only a lift that began before it.
      if (writing.current) {
        positions.set(photos.map((_, i) => i))
        return
      }
      void commitOrder(inSlotOrder(photos, slots))
    },
    [photos, commitOrder, positions]
  )

  /** The screen reader's way to move a photo, and anyone's way to make one main. */
  const handleAction = useCallback(
    (index: number, action: string) => {
      const to = action === 'makeMain' ? 0 : action === 'earlier' ? index - 1 : action === 'later' ? index + 1 : index
      if (to === index || to < 0 || to >= photos.length) return
      void commitOrder(moveItem(photos, index, to))
    },
    [photos, commitOrder]
  )

  const handleRemovePhoto = useCallback(
    (photoIndex: number) => {
      if (writing.current) return
      const photo = photos[photoIndex]
      // The app's one sheet, like every other "are you sure" (lib/sheet.ts).
      showSheet({
        kind: 'actions',
        hue: 'violet',
        title: 'Remove this photo?',
        message: 'It comes off your profile. You can add it again later.',
        actions: [
          {
            label: 'Remove photo',
            variant: 'destructive',
            then: async () => {
              if (writing.current) return
              writing.current = true
              setSaving(true)
              try {
                // Remove from state immediately for better UX
                const newPhotos = photos.filter((_, index) => index !== photoIndex)
                setPhotos(newPhotos)

                // The profile write first, and the storage delete ONLY if it held. Deleting the object while the profile still
                // listed the URL left a broken image on every screen that shows this person.
                const saved = await reorderPhotos(userId, newPhotos.map((p) => p.url), photos[0]?.url)
                if (!saved.ok) {
                  setPhotos(photos)
                  showToast(saved.error, 'error', { haptic: 'error' })
                  return
                }
                setPhotos((prev) => adoptStoredUrls(prev, saved.photos))
                // Delete from storage in background
                deletePhoto(photo.url).catch((error) => {
                  Logger.error('profile', 'PhotoManager: Delete photo error', { error, url: photo.url })
                })
                Logger.info('profile', 'PhotoManager: Photo removed', { userId, url: photo.url })
              } catch (error) {
                Logger.error('profile', 'PhotoManager: Remove photo error', { error, userId })
                showToast("Couldn’t remove that photo. Try again.", 'error', { haptic: 'error' })
                // Reload photos to restore state
                setLoading(true)
                void loadPhotos()
              } finally {
                writing.current = false
                setSaving(false)
              }
            },
          },
          { label: 'Cancel', cancel: true },
        ],
      })
    },
    [photos, userId, showToast, loadPhotos]
  )

  const onLayout = (e: LayoutChangeEvent) => setContainerWidth(e.nativeEvent.layout.width)

  const header = (
    <View style={styles.header}>
      <Text accessibilityRole="header" maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('label', bold), styles.label]}>
        Photos
      </Text>
      {loading || loadFailed ? null : (
        <Text maxFontSizeMultiplier={CONTROL_FONT_CAP} style={[font('caption', bold, FONT_FAMILY.mono[500]), styles.sub]}>
          {photos.length} of {maxPhotos} · saved as you go
        </Text>
      )}
    </View>
  )

  if (loading) {
    return (
      <View style={styles.container}>
        {header}
        <View testID="photos-loading" accessibilityLabel="Loading photos" accessibilityState={{ busy: true }} style={styles.skeleton} onLayout={onLayout}>
          {Array.from({ length: SKELETON_TILES }, (_, i) => (
            <SkeletonBlock key={i} width={itemSize} height={itemSize} borderRadius={RADIUS.rowInCard} />
          ))}
        </View>
      </View>
    )
  }

  if (loadFailed) {
    // Never an empty grid for a read that failed: "Add photo" there would write a one-photo list over the ones the server has.
    return (
      <View style={styles.container}>
        {header}
        <Banner
          kind="error"
          text="Your photos didn’t open."
          action={{
            label: 'Try again',
            onPress: () => {
              setLoading(true)
              void loadPhotos()
            },
          }}
          testID="photos-failed"
        />
      </View>
    )
  }

  const emptySlots = Array.from({ length: Math.max(0, maxPhotos - photos.length - (pending ? 1 : 0)) }, (_, k) => photos.length + (pending ? 1 : 0) + k)
  const slotRect = (slot: number) => ({
    position: 'absolute' as const,
    left: (slot % COLUMNS) * (itemSize + GAP),
    top: Math.floor(slot / COLUMNS) * (itemSize + GAP),
    width: itemSize,
    height: itemSize,
  })

  return (
    <View style={styles.container}>
      {header}
      <View onLayout={onLayout} style={{ height: gridHeight }}>
        {photos.map((item, index) => {
          const uri = cachedUrls[item.url] || item.url
          const n = photos.length
          const actions =
            n > 1
              ? [
                  ...(index > 0 ? [{ name: 'makeMain', label: 'Make main photo' }, { name: 'earlier', label: 'Move earlier' }] : []),
                  ...(index < n - 1 ? [{ name: 'later', label: 'Move later' }] : []),
                ]
              : undefined
          return (
            <DraggableTile
              key={item.id}
              testID={`photo-tile-${index}`}
              index={index}
              count={n}
              grid={grid}
              positions={positions}
              active={active}
              enabled={!busy}
              onDrop={handleDrop}
              onLift={onDragging}
            >
              {item.pulled ? (
                <PulledFace onRemove={() => handleRemovePhoto(index)} removeLabel={`Remove photo ${index + 1}`} removeDisabled={busy} />
              ) : (
                <PhotoFace
                  uri={uri}
                  label={`Photo ${index + 1} of ${n}${item.isPrimary ? ', main photo' : ''}`}
                  main={index === 0}
                  onRemove={() => handleRemovePhoto(index)}
                  removeLabel={`Remove photo ${index + 1}`}
                  removeDisabled={busy}
                  actions={actions}
                  onAction={(name) => handleAction(index, name)}
                />
              )}
            </DraggableTile>
          )
        })}

        {pending ? (
          <View style={slotRect(photos.length)}>
            {pending.state === 'uploading' ? <UploadingFace progress={pending.progress} /> : <FailedFace onRetry={() => void handleRetry()} disabled={busy} />}
          </View>
        ) : null}

        {emptySlots.map((slot, k) => (
          <View key={slot} style={slotRect(slot)}>
            {/* One Add in the reading order; every empty slot is still a tap target for a finger. */}
            <AddFace
              onPress={() => {
                // A failed tile is left behind by choosing again.
                if (pending?.state === 'failed') setPending(null)
                void handleAddPhoto()
              }}
              disabled={busy}
              busy={uploading}
              label="Add photo"
              accessible={k === 0}
            />
          </View>
        ))}
      </View>
      <Text style={[font('meta', bold), styles.note]}>Photos save on their own. Drag to reorder; the first is what people see.</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: SPACE.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  label: { color: COLOR.textSecondary },
  sub: { color: COLOR.textTertiary },
  skeleton: { flexDirection: 'row', gap: GAP },
  note: { color: COLOR.textTertiary },
})
