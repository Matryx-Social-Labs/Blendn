import * as WebBrowser from 'expo-web-browser'

import { COMMUNITY_GUIDELINES_URL } from './communityGuidelines'
import { COLOR } from './design/tokens'
import { Logger } from './logger'

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

/**
 * Opens one of our web pages (the guidelines, the Terms, the Privacy Policy,
 * help) in the in-app browser, over the app, so closing it lands back on the
 * screen that asked. Store pages and system settings are not ours and stay with
 * `Linking`: the store's own app should open for them.
 *
 * Only https pages on our own hosts open (`OUR_HOSTS`): anything else is logged
 * and refused, so a link that arrives from data can never put another site in
 * front of someone inside our app. Rejects when it was refused or no browser
 * could open it, so a caller keeps its "That page didn't open" toast or log line.
 */
export async function openInApp(url: string): Promise<void> {
  if (!isOurPage(url)) {
    Logger.warn('general', 'Refused to open a page that is not ours in the in-app browser', { url })
    throw new Error('Not one of our pages')
  }
  await WebBrowser.openBrowserAsync(url, {
    controlsColor: COLOR.textPrimary,
    toolbarColor: COLOR.ink,
    dismissButtonStyle: 'close',
    enableBarCollapsing: true,
  })
}

const OUR_HOSTS: ReadonlySet<string> = new Set(['blendn.app', 'www.blendn.app'])

export function isOurPage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && OUR_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}
