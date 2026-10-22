import AsyncStorage from '@react-native-async-storage/async-storage'

import { TokenStorage } from './apiClient'
import { mayAskForPush } from './crewPushAsk'
import { Logger } from './logger'
import { initializePushNotifications } from './notifications'
import { clearPushDeclined, hasDeclinedPush, markPushDeclined } from './pushDecline'
import { showSheet } from './sheet'

/**
 * Asking for push in context (Flow 9 · 9.7): at the two moments a push pays off, the first time only.
 * A going RSVP ("Want a heads-up if the time or venue changes?") and a like that is not yet mutual ("Want to
 * know when it's mutual?"). Joining a crew has its own (`lib/crewPushAsk`).
 *
 * It asks as little as the frames allow:
 * - only a phone that can still be asked (never answered, `mayAskForPush`): once the phone has said no, or yes,
 *   nothing here ever asks again; the bell's "Push is off" row and Settings are the way back;
 * - once per account and per moment, whatever the answer: Not now is not asked again either;
 * - a no anywhere ("Maybe later" in onboarding, or Not now at the other moment) is remembered per account
 *   (`lib/pushDecline`) and ends the asking; Continue clears it.
 *
 * "Continue" is the one that asks the phone (the OS dialog follows); it is silent until then.
 */
export type AskMoment = 'rsvp' | 'like'

export const ASK_COPY: Record<AskMoment, { title: string; body: string }> = {
  rsvp: {
    title: 'Want a heads-up if the time or venue changes?',
    body: 'We’ll only tell you about this event: a new time, a new venue, or if it’s called off. You can change this any time in Settings.',
  },
  like: {
    title: 'Want to know when it’s mutual?',
    body: 'One notification if they like you back. Nothing for likes you haven’t returned. You can change this any time in Settings.',
  },
}

const keyFor = (userId: string, moment: AskMoment) => `blendn.pushAsk.${moment}.${userId}`

async function alreadyAsked(userId: string, moment: AskMoment): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(keyFor(userId, moment))) === '1'
  } catch {
    // Unknown reads as asked: better not to ask than to ask twice.
    return true
  }
}

export async function askPushInContext(moment: AskMoment): Promise<boolean> {
  try {
    const user = await TokenStorage.getUser()
    if (!user) return false
    if (await alreadyAsked(user.id, moment)) return false
    // An earlier no, in onboarding or at the other moment, is a no (`lib/pushDecline`): only Settings or the bell's row can undo it.
    if (await hasDeclinedPush(user.id)) return false
    if (!(await mayAskForPush())) return false
    await AsyncStorage.setItem(keyFor(user.id, moment), '1')
    const { title, body } = ASK_COPY[moment]
    showSheet({
      kind: 'actions',
      icon: 'bell',
      title,
      message: body,
      actions: [
        {
          label: 'Continue',
          variant: 'primary',
          then: () => void clearPushDeclined(user.id).then(() => initializePushNotifications()).catch(() => {}),
        },
        // Not now is a no too: the next moment does not ask again.
        { label: 'Not now', variant: 'secondary', then: () => void markPushDeclined(user.id) },
      ],
    })
    return true
  } catch (error) {
    Logger.warn('notifications', 'push ask failed', { error: error as never })
    return false
  }
}
