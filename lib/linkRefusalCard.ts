import type { StateScreenProps } from '../components/ds/StateScreen'
import type { EventLoadFailure } from './eventLinkRefusal'
import { NO_LONGER_AVAILABLE } from './noLongerAvailable'

/**
 * The card for an event that could not be opened (Flow 15 #9, #10), in the frames' words. A refusal never carries a
 * haptic of its own; the two fixes are primaries and play `H.primary`, the way out to the Pulse plays nothing.
 */
export function linkRefusalCard(
  failure: EventLoadFailure | null,
  go: { toPulse: () => void; toProfile: () => void }
): Pick<StateScreenProps, 'icon' | 'title' | 'body' | 'actions' | 'testID'> {
  switch (failure) {
    case 'minor':
      // Under 18 gets no fix and no sign-in loop.
      return { icon: 'shield', title: 'This event is 18+', body: 'Blend’n events are for adults. This link can’t open for you.', testID: 'link-minor' }
    case 'age_unknown':
      return {
        icon: 'calendar',
        title: 'Add your age to open this',
        body: 'Events on Blend’n are 18+. Add your date of birth once; nobody else ever sees it.',
        actions: [{ label: 'Add your age', onPress: go.toProfile }],
        testID: 'link-age-unknown',
      }
    case 'profile':
      return {
        icon: 'user-round-pen',
        title: 'Finish your profile first',
        body: 'Add a name and a photo, then this link opens. We’ll hold it.',
        actions: [{ label: 'Finish my profile', onPress: go.toProfile }],
        testID: 'link-profile',
      }
    case 'broken':
      return {
        icon: 'unlink',
        title: 'This link is broken',
        body: 'It’s missing a part. Ask whoever sent it for a fresh one.',
        actions: [{ label: 'Go to the Pulse', kind: 'strong', pressHaptic: false, onPress: go.toPulse }],
        testID: 'link-broken',
      }
    default:
      // `notFound`: organiser suspended or the event removed, one calm landing (Flow 15 #10).
      return {
        icon: 'calendar-off',
        title: NO_LONGER_AVAILABLE.title,
        body: NO_LONGER_AVAILABLE.body,
        actions: [{ label: 'See what’s on tonight', kind: 'strong', pressHaptic: false, onPress: go.toPulse }],
        testID: 'link-gone',
      }
  }
}
