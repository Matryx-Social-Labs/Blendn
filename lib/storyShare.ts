import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Clipboard from 'expo-clipboard'
import * as FileSystem from 'expo-file-system/legacy'
import { Image } from 'expo-image'
import { Linking, PixelRatio, Platform } from 'react-native'
import type { RefObject } from 'react'

import { STORY } from '../components/ds/StoryCard'
import { Logger } from './logger'
import { toast } from './toast'

/**
 * Getting a Story to Instagram (Flow 16 · 16.3): the link is copied first (the card carries no live URL, the Link
 * sticker does), then the 1080 × 1920 picture goes to the share sheet, where Instagram's Story is one tap.
 *
 * Instagram has a direct hand-off (`instagram-stories://share` with the picture on a private pasteboard type), but
 * writing that pasteboard is native code this app does not have; the share sheet is the route every platform offers.
 *
 * The two native modules it needs (`react-native-view-shot`, `expo-sharing`) are loaded when a Story is shared, not
 * when the app starts. A build that predates them cannot capture; it copies the link, opens Instagram's Story camera
 * and says so, rather than failing at launch.
 */

export const STORY_LINK_COPIED = 'Link copied — add it with the Link sticker'
const NO_PICTURE = "Couldn’t make the picture."

/** How long a freshly mounted cover gets to paint before the card is photographed. */
const COVER_PAINT_MS = 250
const COVER_PREFETCH_MS = 3000

const instagramStory = () => (Platform.OS === 'ios' ? 'instagram-stories://share' : 'instagram://story-camera')

/** The card's width in points, so that it is exactly 1080 device pixels across and the picture is never scaled. */
export const storyCaptureWidth = (): number => STORY.width / PixelRatio.get()

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** The cover cached and painted: a photograph taken before this would be a card with a hole where the flyer goes. */
export async function coverReady(uri: string | null | undefined): Promise<void> {
  if (!uri) return
  await Promise.race([Image.prefetch(uri).catch(() => false), wait(COVER_PREFETCH_MS)])
  await wait(COVER_PAINT_MS)
}

/**
 * The picture is a file in the system's temporary directory, 1080 × 1920 and a few hundred KB, and the share sheet may
 * still be reading it after it has returned (Instagram opens over it), so it cannot be deleted when the share ends.
 * It is deleted when the next one starts, and a file left by a launch that was killed mid-share is deleted at the next
 * launch (`sweepStoryCaptures`, called once from the root layout). Only the path of the last one is kept, in memory and
 * on disk, so nothing guesses at directories or file names the capture library chose.
 */
export const STORY_CAPTURE_KEY = 'blendn_story_capture'
let lastCapture: string | null = null

async function discard(uri: string | null): Promise<void> {
  if (!uri) return
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true })
  } catch (error) {
    Logger.debug('general', 'share:story:discard:failed', { error })
  }
}

/** Deletes the last Story picture, from this run or the one before. */
export async function sweepStoryCaptures(): Promise<void> {
  const previous = lastCapture ?? (await AsyncStorage.getItem(STORY_CAPTURE_KEY).catch(() => null))
  lastCapture = null
  await discard(previous)
  await AsyncStorage.removeItem(STORY_CAPTURE_KEY).catch(() => {})
}

/** The view as a PNG in the temporary directory, or a rejection (no module in this build, or the capture failed). The previous picture goes first. */
export async function captureStory(node: RefObject<unknown>): Promise<string> {
  await sweepStoryCaptures()
  // Required here, not imported above: a build that predates the module throws on this line, inside the caller's try.
  const { captureRef } = require('react-native-view-shot') as typeof import('react-native-view-shot')
  const uri = await captureRef(node as RefObject<never>, { format: 'png', quality: 1, result: 'tmpfile' })
  lastCapture = uri
  await AsyncStorage.setItem(STORY_CAPTURE_KEY, uri).catch(() => {})
  return uri
}

/** The picture in the system share sheet. */
export async function shareImageFile(uri: string): Promise<void> {
  const Sharing = require('expo-sharing') as typeof import('expo-sharing')
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available here')
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle: 'Share to Instagram' })
}

/** Instagram's Story camera, with no picture: the Link sticker still carries the copied link. */
export async function openStoryCamera(): Promise<void> {
  await Linking.openURL(instagramStory()).catch(() => Linking.openURL('instagram://app'))
}

export type StoryOutcome = 'image' | 'link' | 'failed'

/**
 * Copies the link, says so, then photographs the card and hands it to the share sheet. `url` is absent for a card that
 * has none (the recap). The link toast is the Story's confirmation; Copy in the tray has its own.
 *
 * `image` the picture went to the share sheet · `link` no picture, but Instagram's camera opened with the link
 * copied · `failed` nothing opened.
 */
export async function shareStory({ url, capture }: { url?: string; capture: () => Promise<string> }): Promise<StoryOutcome> {
  if (url) {
    try {
      await Clipboard.setStringAsync(url)
      toast(STORY_LINK_COPIED, 'success')
    } catch (error) {
      Logger.warn('general', 'share:story:copy:failed', { error })
      toast("Couldn’t copy the link. Try again.", 'error')
      return 'failed'
    }
  }
  try {
    await shareImageFile(await capture())
    return 'image'
  } catch (error) {
    Logger.warn('general', 'share:story:image:failed', { error })
  }
  try {
    await openStoryCamera()
    toast(url ? `${NO_PICTURE} The link is copied; add it with the Link sticker.` : NO_PICTURE, 'info')
    return 'link'
  } catch (error) {
    Logger.warn('general', 'share:story:camera:failed', { error })
    toast(url ? "Instagram didn’t open. The link is copied." : "Instagram didn’t open.", 'error')
    return 'failed'
  }
}
