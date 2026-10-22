import AsyncStorage from '@react-native-async-storage/async-storage'
import { useIsFocused } from 'expo-router'
import { useState } from 'react'

import { apiClient } from './apiClient'
import { isBlendnOpen } from './blendnOverlay'
import { Logger } from './logger'
import { isSheetOpen, showSheet } from './sheet'
import { currentUserId } from './useAuth'
import { useLatest } from './useLatest'

/**
 * The one-time ask after a person's first friendship (plans/friends-in-room.md, decision on Q1):
 * "Let friends see you when you're at the same event?", with Turn on and Not now.
 *
 * `friends_see_me_in_rooms` stays off by default and nobody's value is ever flipped for them: showing where
 * someone is must be their own choice. So that Friends here is not empty for everyone, this asks, once, at
 * the moment friends matter. Asking at friendship time reveals nothing about anyone's presence. It is
 * reachable afterwards in Settings.
 *
 * Once ever per account, the coach marks' flag (`<id>_seen_<userId>`, lib/coachMarks.ts), written when the ask
 * is shown, so a dismissed ask is not asked again. Never asked when the switch is already on, or when the
 * profile will not say.
 */
export const FRIENDS_SEE_ME_ASK_ID = 'friends_see_me_ask'

/** The toast of "You and {name} are friends" is read first. */
export const ASK_AFTER_MS = 800

export const FRIENDS_SEE_ME_TITLE = "Let friends see you when you're at the same event?"
/** The setting's own explanation, verbatim (plan copy table): the consent says what it does. */
export const FRIENDS_SEE_ME_BODY =
  "On: friends at the same event see you under Friends here, with your name and photo, and can message you. Off: you don't show up for friends at events at all."

const storageKey = (userId: string) => `${FRIENDS_SEE_ME_ASK_ID}_seen_${userId}`

/** Settings' own cache of the switches (`app/settings.tsx`). */
const settingsCacheKey = (userId: string) => `settings_preferences_${userId}`

/**
 * Turn on is a change to the setting, so what Settings reads is changed too: opened offline it shows the
 * switch on, not the false it cached before.
 */
async function rememberOn(userId: string): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(settingsCacheKey(userId))
    if (!raw) return
    await AsyncStorage.setItem(settingsCacheKey(userId), JSON.stringify({ ...JSON.parse(raw), friendsSeeMe: true }))
  } catch (e) {
    Logger.debug('friends', 'could not update the settings cache', { error: e })
  }
}
/** This launch's asks, so two friendships in a second are one ask. */
const asking = new Set<string>()

/** Whether the person's own switch is on; null when the profile would not say. */
function switchOf(data: unknown): boolean | null {
  const d = data as { profile?: Record<string, unknown> } & Record<string, unknown>
  const value = (d?.profile ?? d)?.friends_see_me_in_rooms
  return typeof value === 'boolean' ? value : null
}

/** Whether the screen that made the friendship is still the one in front: read when the ask is about to show. */
export function useStillHere(): () => boolean {
  const focused = useLatest(useIsFocused())
  // One function for the life of the screen: callers list it in their dependencies.
  const [stillHere] = useState(() => () => focused.current)
  return stillHere
}

/**
 * Called by the screens that make a friendship (the invite link on `friends`, Accept in Requests and in
 * Notifications), never by the API client. The ask is a sheet over whatever is on screen, so it waits out
 * the toast and then asks nothing of a person who has moved on: off the screen, the Room open, or another
 * sheet up (it never replaces one). Then nothing is written, so it is asked at the next friendship.
 */
export async function askFriendsSeeMe({ stillHere }: { stillHere: () => boolean }): Promise<void> {
  const userId = currentUserId()
  if (!userId || asking.has(userId)) return
  asking.add(userId)
  try {
    if ((await AsyncStorage.getItem(storageKey(userId))) === '1') return
    const profile = await apiClient.getProfile(userId)
    if (!profile.success || switchOf(profile.data) !== false) return
    await new Promise((resolve) => setTimeout(resolve, ASK_AFTER_MS))
    if (!stillHere() || isBlendnOpen() || isSheetOpen()) return
    await AsyncStorage.setItem(storageKey(userId), '1')
    showSheet({
      kind: 'actions',
      hue: 'rose',
      icon: 'users',
      title: FRIENDS_SEE_ME_TITLE,
      message: FRIENDS_SEE_ME_BODY,
      actions: [
        {
          label: 'Turn on',
          variant: 'primary',
          run: async () => {
            const saved = await apiClient.updateProfile(userId, { friends_see_me_in_rooms: true })
            if (saved.success) await rememberOn(userId)
            return saved.success ? { ok: true } : { ok: false, error: "Couldn't save “Friends can see I'm here”. Try again." }
          },
        },
        { label: 'Not now', variant: 'secondary', cancel: true },
      ],
    })
  } catch (e) {
    Logger.warn('friends', 'could not ask friends-see-me', { error: e })
  } finally {
    asking.delete(userId)
  }
}
