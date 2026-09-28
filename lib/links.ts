import { COMMUNITY_GUIDELINES_URL } from './communityGuidelines'

/**
 * The web pages the app links out to.
 *
 * One list, because the sign-in screens promise the Terms and the Privacy
 * Policy in a sentence and Settings links to the same two. Kept apart they
 * drift, and the sentence on the first screen anyone sees linked to nothing.
 */
export const BLENDN_LINKS = {
  safety: 'https://blendn.app/safety',
  guidelines: COMMUNITY_GUIDELINES_URL,
  help: 'https://blendn.app/help',
  terms: 'https://blendn.app/terms',
  privacy: 'https://blendn.app/privacy',
  deleteAccount: 'https://www.blendn.app/delete-account',
} as const
