import AsyncStorage from '@react-native-async-storage/async-storage'
import { createElement } from 'react'

import { TokenStorage } from './apiClient'
import { mayAskForPush } from './crewPushAsk'
import { Logger } from './logger'
import { initializePushNotifications } from './notifications'
import { clearPushDeclined, hasDeclinedPush, markPushDeclined } from './pushDecline'
import { showSheet } from './sheet'
import { LockScreenPreview, type SampleNotification } from '../components/ds/LockScreenPreview'
import type { Hue } from '../components/ds/shared'

/**
 * Asking for push in context (Flow 9 · 9.7): at the two moments a push pays off, the first time only.
 * A going RSVP ("Want a heads-up if the time or venue changes?") and a like that is not yet mutual ("Want to
 * know when it's mutual?"). Joining a crew has its own (`lib/crewPushAsk`).
 *
 * It asks as little as the frames allow:
 * - only a phone that can still be asked (never answered, `mayAskForPush`): once the phone has said no, or yes,
 *   nothing here ever asks again; the bell's "Push is off" row and Settings are the way back;
 * - once per account and per moment, whatever the answer: Not now is not asked again either;
 * - a no anywhere (Not now at either moment, or "Maybe later" on an older build's onboarding step) is remembered per account
 *   (`lib/pushDecline`) and ends the asking; "Turn on notifications" clears it.
 *
 * "Turn on notifications" is the one that asks the phone (the OS dialog follows); it is silent until then.
 *
 * What it looks like (SCRUM-1006, FLOW-WALK § 2.x): a lock screen of three of our own sample notifications, personalised
 * with the event just RSVP'd to (`askSamples`), above the question. The like moment leads with the match.
 */
export type AskMoment = 'rsvp' | 'like'

/** The ask is lit in the world it is asked from: a like is among people (a profile, the Room), an RSVP on an event. */
const ASK_HUE: Record<AskMoment, Hue> = { like: 'rose', rsvp: 'ember' }

export const ASK_COPY: Record<AskMoment, { title: string; body: string }> = {
  rsvp: {
    title: 'Want a heads-up if the time or venue changes?',
    body: 'Only what you’d want: a new time or venue, a wave back, your crew heading out. Change it any time in Settings.',
  },
  like: {
    title: 'Want to know when you both wave?',
    body: 'One notification when someone waves back. Nothing for a wave on its own. Change it in Settings.',
  },
}

/** When a like is asked from outside an event, its samples name none. */
const NO_EVENT = 'Your event'

/** The lock screen's samples: our own notifications, never a real person's name or photo ("Someone"). */
export function askSamples(moment: AskMoment, eventTitle?: string): SampleNotification[] {
  const title = eventTitle?.trim()
  const update = { title: title || NO_EVENT, body: 'New time: 7 PM. Same place.' }
  // The words first, the title last: a body is two lines, and a long title cut there must not take "waved back" with it.
  const match = { title: 'You both waved', body: title ? `Someone waved back at ${title}.` : 'Someone waved back.' }
  const crew = { title: 'Your crew is heading out', body: '3 going tonight.' }
  return moment === 'like' ? [match, update, crew] : [update, match, crew]
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

/** `eventTitle`: the event the RSVP is at, for the samples. A like's callers pass none today, so its samples name no event. */
export async function askPushInContext(moment: AskMoment, eventTitle?: string): Promise<boolean> {
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
      hue: ASK_HUE[moment],
      art: createElement(LockScreenPreview, { samples: askSamples(moment, eventTitle), testID: 'push-ask-lock' }),
      title,
      message: body,
      actions: [
        {
          label: 'Turn on notifications',
          variant: 'strong',
          then: () => void clearPushDeclined(user.id).then(() => initializePushNotifications()).catch(() => {}),
        },
        // Not now is a no too: the next moment does not ask again.
        { label: 'Not now', variant: 'tertiary', then: () => void markPushDeclined(user.id) },
      ],
    })
    return true
  } catch (error) {
    Logger.warn('notifications', 'push ask failed', { error: error as never })
    return false
  }
}
