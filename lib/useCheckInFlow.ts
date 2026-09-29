import { router } from 'expo-router'
import { useState } from 'react'
import { useReducedMotion } from 'react-native-reanimated'
import { apiClient } from './apiClient'
import { CONFETTI_PEAK_MS } from './confetti'
import { askIntentRoute, revealOffer, submitCheckIn, type CheckInOutcome } from './checkIn'
import { isExpectedRefusal } from './checkInRefusal'
import { getCurrentLocation as getLocationFix, type CheckInLocation, type ShowTray } from './locationFix'
import { Logger } from './logger'
import { NotificationHelpers } from './notifications'
import { useAuth } from './useAuth'
import { useInteractionFeedback } from './useInteractionFeedback'

/**
 * The event screen's check-in, as a hook, so a second door runs it unchanged.
 *
 * `lib/checkIn.ts` holds what is the same wherever the button is: the request
 * and how its answer is read. This is the layer above it that was still
 * written inline in `EventDetailScreen` — the rules, the position, the trays
 * for each answer, the haptics, the reveal offer and "Why do you go out?" —
 * lifted out whole for the Blend'n room's hold-to-check-in, which must say
 * exactly what the event screen says. The trays are still the caller's own
 * (`showTray` / `closeTray`); only what they say lives here.
 */

const CHECKIN_RULES_TEXT = [
  'Before you check in, please confirm:',
  '1. You are physically at the event venue.',
  '2. Location permission is enabled and accurate.',
  '3. Fake/spoofed check-ins are not allowed.',
  '4. One active check-in per event/account.',
  '5. Follow venue rules and Blendn community guidelines.',
  '6. Harassment, hate speech, or unsafe behavior is prohibited.',
  '7. Violations can lead to check-in revocation or account restrictions.',
].join('\n')

export type CheckInFlowResult = 'checkedIn' | 'refused' | 'cancelled' | 'failed'

/** A check-in that left the user inside: a fresh one, or one they already had. */
export type CheckedInOutcome =
  | Extract<CheckInOutcome, { kind: 'checkedIn' }>
  | Extract<CheckInOutcome, { kind: 'refused' }>

export type UseCheckInFlowOptions = {
  eventId: string
  /** For the check-in notification; "Event" when not known yet. */
  eventTitle?: string | null
  showTray: ShowTray
  closeTray: () => void
  /**
   * The user is checked in — the outcome is the fresh check-in, or the refusal
   * that says they already were. The caller's optimistic state goes here.
   */
  onCheckedIn?: (outcome: CheckedInOutcome) => void
  /** "Open Maps" on a refusal a map can fix. Without it the button only closes. */
  onOpenMaps?: () => void
  /** "Go to Chat" on the success tray (`afterSuccess: 'tray'` only). */
  onOpenChat?: () => void | Promise<void>
  /** The fix the check-in was sent from, before it is sent. */
  onLocated?: (location: CheckInLocation) => void
  /**
   * `'tray'` (default) ends a check-in with "Checked in / Go to Chat", as the
   * event screen always has. `'none'` skips that one tray, for a screen that
   * moves straight into the room — the reveal offer, "Why do you go out?" and
   * the notification still happen, because they are about the user, not the
   * screen.
   */
  afterSuccess?: 'tray' | 'none'
}

export function useCheckInFlow({
  eventId,
  eventTitle,
  showTray,
  closeTray,
  onCheckedIn,
  onOpenMaps,
  onOpenChat,
  onLocated,
  afterSuccess = 'tray',
}: UseCheckInFlowOptions) {
  const { user } = useAuth()
  const feedback = useInteractionFeedback()
  const reduceMotion = useReducedMotion()
  const [checkingIn, setCheckingIn] = useState(false)
  /**
   * Counts fresh check-ins, for `<ConfettiBurst trigger={celebrations} />`.
   * It bumps when the server says yes, at the same moment as the success
   * haptic. "You were already in" doesn't count: that isn't news.
   */
  const [celebrations, setCelebrations] = useState(0)

  const getCurrentLocation = () => getLocationFix({ showTray, closeTray })

  /**
   * Run the check-in. Without `skipRules` the rules tray comes first, and the
   * promise settles on its answer: `'cancelled'`, or the check-in's own result
   * after "I Agree". A tray dismissed by its backdrop never answers, so render
   * from `checkingIn`, not from this promise being pending.
   */
  const start = async (opts?: { skipRules?: boolean }): Promise<CheckInFlowResult> => {
    if (!opts?.skipRules) {
      return new Promise<CheckInFlowResult>((resolve) => {
        showTray('Rules and regulations', CHECKIN_RULES_TEXT, [
          {
            label: 'Cancel',
            onPress: () => {
              closeTray()
              resolve('cancelled')
            },
          },
          {
            label: "I Agree, Continue",
            variant: 'primary',
            onPress: () => {
              closeTray()
              start({ skipRules: true }).then(resolve)
            },
          },
        ])
      })
    }

    setCheckingIn(true)

    try {
      Logger.journey('checkin', 'detail:start', { eventId })
      if (!user) {
        Logger.journey('auth', 'detail:blocked:notSignedIn')
        showTray('Sign in required', 'Please sign in to check in to events.')
        setCheckingIn(false)
        return 'failed'
      }

      // Get current location
      const location = await getCurrentLocation()
      if (!location) {
        Logger.warn('events', 'checkin:location:unavailable')
        setCheckingIn(false)
        return 'failed'
      }

      onLocated?.(location)

      const outcome = await submitCheckIn(eventId, location)

      if (outcome.kind === 'timeout') {
        Logger.warn('events', 'checkin:timeout')
        showTray('Still checking you in', 'This is taking longer than expected. Please try again.', [
          { label: 'Cancel', onPress: closeTray },
          {
            label: 'Retry',
            variant: 'primary',
            onPress: () => {
              closeTray()
              start({ skipRules: true })
            }
          }
        ])
        return 'failed'
      } else if (outcome.kind === 'refused') {
        // The door saying no (too far, not open yet) is the flow working, not
        // a failure: info, so Sentry only hears about requests that broke.
        if (isExpectedRefusal(outcome.errorCode)) {
          Logger.info('events', 'checkin:refused', { code: outcome.errorCode })
        } else {
          Logger.error('events', 'checkin:api:error', { title: outcome.refusal.title })
        }
        const { refusal } = outcome
        if (outcome.alreadyCheckedIn) {
          Logger.journey('checkin', 'detail:alreadyCheckedIn')
          onCheckedIn?.(outcome)
        } else {
          feedback.error()
        }

        showTray(
          refusal.title,
          refusal.message,
          refusal.offerDirections
            ? [
                { label: 'Done', onPress: closeTray },
                {
                  label: 'Open Maps',
                  variant: 'primary',
                  onPress: () => {
                    closeTray()
                    onOpenMaps?.()
                  },
                },
              ]
            : undefined
        )
        // Already in is the answer the user wanted, whatever the server calls it.
        return outcome.alreadyCheckedIn ? 'checkedIn' : 'refused'
      } else {
        Logger.journey('checkin', 'detail:success', { eventId })
        feedback.success()
        setCelebrations((n) => n + 1)
        // Update check-in status directly - no need for another API call. Now,
        // not after the trays, so the button turns as the confetti pops.
        onCheckedIn?.(outcome)
        // A tray or a pushed screen would cover the confetti, so the next step
        // waits until the burst has peaked and is on its way down.
        await new Promise((r) => setTimeout(r, reduceMotion ? 0 : CONFETTI_PEAK_MS))

        // What follows a check-in is decided in `lib/checkIn.ts`, the same for
        // this door and the Pulse's; only the trays are this screen's.
        const { askIntent } = outcome
        const closeAndAsk = () => {
          closeTray()
          if (askIntent) router.push(askIntentRoute(eventId))
        }

        if (outcome.revealSuggestion) {
          const offer = await revealOffer({
            id: user.id,
            firstName: user.name?.trim().split(/\s+/)[0] ?? null,
            image: user.image,
          })
          showTray(offer.title, offer.message, [
            { label: offer.cancel, onPress: closeAndAsk },
            {
              label: offer.confirm,
              variant: 'primary',
              onPress: () => {
                closeAndAsk()
                apiClient
                  .setMatchPreferences(eventId, { revealed: true })
                  .catch((e) => Logger.error('match', 'reveal from prompt failed', { error: e }))
              },
            },
          ])
        } else if (afterSuccess === 'tray') {
          // Keep user in context and offer next step instead of forcing a full-screen jump.
          showTray(
            'Checked in',
            'You are now checked in. Join the event chat now, or stay on this screen.',
            [
              {
                label: 'Stay here',
                onPress: closeAndAsk,
              },
              {
                label: 'Go to Chat',
                variant: 'primary',
                onPress: async () => {
                  if (askIntent) {
                    closeAndAsk()
                    return
                  }
                  closeTray()
                  await onOpenChat?.()
                }
              }
            ]
          )
        } else if (askIntent) {
          // No tray to hang the question from, so it is asked straight away.
          router.push(askIntentRoute(eventId))
        }

        // Send check-in success notification to the user
        try {
          await NotificationHelpers.checkInNotification(
            eventTitle || 'Event',
            user.id
          )
        } catch (notificationError) {
          Logger.warn('events', 'checkInNotification:failed', { error: notificationError as any })
          // Don't fail check-in if notification fails
        }

        return 'checkedIn'
      }
    } catch (error) {
      Logger.error('events', 'checkin:exception', { error: error as any })
      feedback.error()
      showTray('Check-in failed', 'Something went wrong. Please try again.')
      return 'failed'
    } finally {
      setCheckingIn(false)
    }
  }

  return { checkingIn, celebrations, start, getCurrentLocation }
}
