import type { PlusStatus as ManageStatus } from '../components/ds/ManageStatusRow'
import type { PlusStatus } from './plus'
import { calendarDate, clockTime } from './time'

/**
 * Manage (Settings › Blend'n+, Flow 12 · 12.3): what is true about the person's
 * Blend'n+, in the design's words. Pure, so every status runs in a plain node
 * test.
 *
 * The server says today whether Blend'n+ is active, what it is, where it was
 * bought and until when (`GET /me/plus`). It does not yet say *how* a
 * subscription stands (cancelled, a payment that failed, paused, ended,
 * refunded) or which grant a free one is (a trial, a referral month): those
 * are `state` and `grant`, read here when they arrive and never guessed. Until
 * then a subscription is "active" and a grant is "until ‹date› · nothing renews",
 * which is true of every grant.
 */

/** How a subscription stands, as the stores report it to the server. */
export type PlusState = 'active' | 'cancelled' | 'grace' | 'hold' | 'paused' | 'expired' | 'refunded'
/** Which of our own gifts a `grant` is. */
export type PlusGrant = 'trial' | 'referral'

export type PlusStore = 'ios' | 'android'
const STORE_NAME: Record<PlusStore, string> = { ios: 'the App Store', android: 'Google Play' }

/** "3 Nov", with the year only when it is not this one. */
export function shortDate(iso: string | null | undefined, now: number = Date.now()): string | null {
  return calendarDate(iso, { now }) || null
}

const through = (date: string | null, otherwise: string) => (date ? `until ${date}` : otherwise)

/** "9:42 PM tomorrow", "9:42 PM today", or "25 Oct, 9:42 PM": a pass stacks, so the day matters (Flow 12 `night`). The app's one clock (r7 M7). */
function passEnd(iso: string, now: number): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const time = clockTime(at)
  const midnight = (ms: number) => new Date(new Date(ms).getFullYear(), new Date(ms).getMonth(), new Date(ms).getDate()).getTime()
  const days = Math.round((midnight(at.getTime()) - midnight(now)) / 86_400_000)
  if (days === 0) return `${time} today`
  if (days === 1) return `${time} tomorrow`
  return `${shortDate(iso, now)}, ${time}`
}

/** The store a status is about: where it was bought, else the one this phone has. */
const storeOf = (status: PlusStatus, device: PlusStore): PlusStore => (status.source === 'apple' ? 'ios' : status.source === 'google' ? 'android' : device)

export type ManageCard = { status: ManageStatus; sentence: string; store: PlusStore }

/**
 * The card, or null when there is nothing to manage: not loaded, or somebody who
 * has never had Blend'n+ (they have the page, not this screen). `device` is the
 * store of this phone, used where the status does not say where it was bought.
 */
export function manageCard(status: PlusStatus | null | undefined, device: PlusStore, now: number = Date.now()): ManageCard | null {
  if (!status) return null
  const store = storeOf(status, device)
  const card = (kind: ManageStatus, sentence: string): ManageCard => ({ status: kind, sentence, store })
  const date = shortDate(status.expiresAt, now)
  const name = STORE_NAME[store]
  const bought = status.source === 'apple' ? 'App Store' : status.source === 'google' ? 'Google Play' : null

  if (!status.active) {
    // The stores' own answers come first: a payment on hold or a pause is a subscription that exists, `active: false`.
    if (status.state === 'hold') return card('hold', `Blend’n+ is paused until the payment is fixed in ${name}.`)
    if (status.state === 'paused') return card('paused', `You paused Blend’n+ in ${name}.`)
    // A launch season: sold nowhere, free everywhere (the server's `gated`). Nothing is locked then, so nothing "ended" is said.
    if (!status.gated) return card('launch', 'Everything’s unlocked in your city for now. Nothing to pay, nothing renews.')
    if (status.state === 'expired') return card('expired', `${date ? `It ended ${date}. ` : ''}Everything you had is still yours to see; the extras are locked.`)
    if (status.state === 'refunded') return card('refunded', 'The store refunded this, so Blend’n+ is off. You can start again anytime.')
    return null
  }

  if (status.product === 'night_pass') {
    const end = status.expiresAt ? passEnd(status.expiresAt, now) : null
    return card('night', `${end ? `Until ${end}. ` : ''}It doesn’t renew; another one adds 24 hours.`)
  }

  if (status.source === 'grant') {
    if (status.grant === 'referral') return card('referral', `Your referral month runs ${date ? `to ${date}` : 'for now'}. Nothing renews unless you choose a plan.`)
    // A trial or a gift we cannot tell apart: both end on their date and renew nothing.
    return card(status.grant === 'trial' ? 'trial' : 'active', `Blend’n+ ${through(date, 'for now')} · nothing renews`)
  }

  switch (status.state) {
    case 'cancelled':
      return card('cancelled', `You keep Blend’n+ ${through(date, 'for now')}. Nothing renews after that.`)
    case 'grace':
      return card('grace', `You still have Blend’n+. Fix it in ${name} to keep Blend’n+${date ? ` after ${date}` : ''}.`)
    case 'hold':
      return card('hold', `Blend’n+ is paused until the payment is fixed in ${name}.`)
    case 'paused':
      return card('paused', `You paused Blend’n+ in ${name}.`)
    case 'active':
      return card('active', `${date ? `Renews ${date}` : 'Blend’n+ is on'}${bought ? ` · ${bought}` : ''}`)
    default:
      // The server has not said how it stands: it is on until its date, and that is all we know.
      return card('active', `Blend’n+ ${through(date, 'is on')}${bought ? ` · ${bought}` : ''}`)
  }
}

/** Whether Settings › Blend'n+ is this screen: there is something to manage, rather than something to buy. */
export function hasSomethingToManage(status: PlusStatus | null | undefined): boolean {
  return manageCard(status, 'ios') !== null
}

/** "Start Blend'n+" only where a subscription ended or was refunded: the one place the screen sells. */
export const startsAgain = (status: ManageStatus): boolean => status === 'expired' || status === 'refunded'
