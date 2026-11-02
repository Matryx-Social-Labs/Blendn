import * as WebBrowser from 'expo-web-browser'
import { AppState } from 'react-native'

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
  /** The ticket terms of sale the checkout sheet links (contract gap: the page is not published yet). */
  termsOfSale: 'https://blendn.app/terms/tickets',
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
  await present(url)
}

/**
 * Presents a page over the app and settles when the browser is gone. A sheet's action ("What's kept") opens this in the tick
 * the sheet closes. Presented on that Modal while it is still up, React Native's dismissal closes the browser instead and
 * leaves the empty Modal over the app, taking every touch (SCRUM-994). One macrotask lets React commit the close, so
 * `holdTurnWhile` sees the sheet as leaving and waits for it to go; a Modal that stays up (Tonight's Terms) is presented
 * over at once, as before.
 */
async function present(url: string): Promise<WebBrowser.WebBrowserResult> {
  await new Promise((resolve) => setTimeout(resolve, 0))
  // Holds the screen while the browser is up: a sheet that comes due under it waits (lib/modalTurn).
  return holdTurnWhile(() =>
    WebBrowser.openBrowserAsync(url, {
      controlsColor: COLOR.textPrimary,
      toolbarColor: COLOR.ink,
      dismissButtonStyle: 'close',
      enableBarCollapsing: true,
    })
  )
}

/** The ticket pay page's one host (ticketing contract §3): an order's `payUrl` opens only there. */
export const PAY_HOST = 'pay.blendn.app'

/**
 * An order's pay page (contract §4), in Safari View Controller / a Chrome Custom Tab, never as an in-app purchase. Settles
 * when the person is back: iOS when the browser closes; Android resolves `opened` at once, so it waits for the app to come
 * back to the front. Refuses anything but https on `PAY_HOST`: the link arrives from data.
 */
export async function openPayPage(url: string): Promise<void> {
  if (hostOfHttps(url) !== PAY_HOST) {
    Logger.warn('tickets', 'Refused a pay link that is not ours', { host: hostOf(url) })
    throw new Error('Not our pay page')
  }
  const result = await present(url)
  // `WebBrowserResultType.OPENED`, by its value: Android's answer the moment the tab is up.
  if (String(result.type) === 'opened') await backInFront()
}

/**
 * An organizer's own ticket page (Eventbrite, Showpass): Blend'n neither sells these nor vouches for the page, so it opens in
 * the in-app browser whose bar names the site, and only over https. Not `openInApp`, whose list is our own pages.
 */
export async function openTicketSite(url: string): Promise<void> {
  if (!hostOfHttps(url)) {
    Logger.warn('tickets', 'Refused a ticket link that is not https', { host: hostOf(url) })
    throw new Error('Not an https page')
  }
  await present(url)
}

const backInFront = () =>
  new Promise<void>((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return
      sub.remove()
      resolve()
    })
  })

const hostOfHttps = (url: string): string | null => {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' ? u.hostname : null
  } catch {
    return null
  }
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
