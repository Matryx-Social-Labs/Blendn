import type { IconName } from '../components/ui/Icon'
import { DASHBOARD_HOST } from './links'
import type { AccountRefusal } from './sessionEnd'
import { SUPPORT_EMAIL } from './support'

/**
 * What each refused account is told (guidelines/flow-15 15.1 to 15.3). The server's sentence is the screen's words where
 * it has one (suspended, staff), word for word; a deleted account is never confirmed by the server, so its copy is ours,
 * neutral, and stops inviting retries ("never says deleted as a fact; never try again").
 */
export type AccountStateCopy = {
  icon: IconName
  title: string
  body: string
  /** The phrase in `body` that is the support address, drawn as a link. */
  link?: string
  note?: string
}

const SUSPENDED_TITLE = 'This account has been suspended.'

export function accountStateCopy(kind: AccountRefusal, sentence?: string): AccountStateCopy {
  switch (kind) {
    case 'suspended': {
      // The server writes "This account has been suspended. Contact … if you think that's a mistake.": the first sentence is the title.
      const rest = sentence?.startsWith(SUSPENDED_TITLE) ? sentence.slice(SUSPENDED_TITLE.length).trim() : sentence?.trim()
      return {
        icon: 'shield-off',
        title: SUSPENDED_TITLE,
        body: rest || `Contact ${SUPPORT_EMAIL} if you think that’s a mistake.`,
        link: SUPPORT_EMAIL,
        note: 'Replies within two days. Say which account and what happened.',
      }
    }
    case 'staff':
      return {
        icon: 'briefcase',
        title: 'Sign in at the dashboard',
        body: sentence?.trim() || 'This app is for attendees. Organizers, venue owners and sponsors sign in at the dashboard.',
        note: DASHBOARD_HOST,
      }
    case 'deleted':
      return {
        icon: 'user-x',
        title: 'We couldn’t sign you in with that account',
        body: 'If you deleted your Blend’n account, that’s expected: it can’t be signed into again. If you didn’t, support can look.',
      }
  }
}
