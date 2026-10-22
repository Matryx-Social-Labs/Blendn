import AsyncStorage from '@react-native-async-storage/async-storage'

import { apiClient } from './apiClient'
import { Logger } from './logger'
import { showSheet } from './sheet'
import { currentUserId } from './useAuth'

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
/** This launch's asks, so two friendships in a second are one ask. */
const asking = new Set<string>()

/** Whether the person's own switch is on; null when the profile would not say. */
function switchOf(data: unknown): boolean | null {
  const d = data as { profile?: Record<string, unknown> } & Record<string, unknown>
  const value = (d?.profile ?? d)?.friends_see_me_in_rooms
  return typeof value === 'boolean' ? value : null
}

/** Called by the friend routes after a friendship is made (sent by link, or accepted). */
export async function askFriendsSeeMe(): Promise<void> {
  const userId = currentUserId()
  if (!userId || asking.has(userId)) return
  asking.add(userId)
  try {
    if ((await AsyncStorage.getItem(storageKey(userId))) === '1') return
    const profile = await apiClient.getProfile(userId)
    if (!profile.success || switchOf(profile.data) !== false) return
    await new Promise((resolve) => setTimeout(resolve, ASK_AFTER_MS))
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
