import * as WebBrowser from 'expo-web-browser'

import { COMMUNITY_GUIDELINES_URL } from './communityGuidelines'
import { COLOR } from './design/tokens'
import { Logger } from './logger'
import { hostOf } from './urlHost'
import { holdTurnWhile } from './modalTurn'

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
    // Its host only: a link that arrives from data is anyone's string, and its path or query can carry anything.
    Logger.warn('general', 'Refused to open a page that is not ours in the in-app browser', { host: hostOf(url) })
    throw new Error('Not one of our pages')
  }
  // Holds the screen while the browser is up: a sheet that comes due under it waits (lib/modalTurn).
  // `afterClosing`: a sheet's action ("What's kept") opens it in the tick the sheet closes. Presented on that Modal while
  // it is still up, React Native's dismissal closes the browser instead and leaves the empty Modal over the app, taking
  // every touch (SCRUM-994), so it waits for the Modal holding the screen to go. One that stays up is presented over
  // after MODAL_GONE_FALLBACK_MS.
  await holdTurnWhile(
    () =>
      WebBrowser.openBrowserAsync(url, {
        controlsColor: COLOR.textPrimary,
        toolbarColor: COLOR.ink,
        dismissButtonStyle: 'close',
        enableBarCollapsing: true,
      }),
    { afterClosing: true }
  )
}

/** Where organisers, venue owners and sponsors sign in (Flow 15 #2). Not one of our in-app pages: it opens in the browser. */
export const DASHBOARD_HOST = 'dashboard.blendn.app'
export const DASHBOARD_URL = `https://${DASHBOARD_HOST}`

const OUR_HOSTS: ReadonlySet<string> = new Set(['blendn.app', 'www.blendn.app'])

export function isOurPage(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && OUR_HOSTS.has(u.hostname)
  } catch {
    return false
  }
}
