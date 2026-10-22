import type { PlusStatus as ManageStatus } from '../components/ds/ManageStatusRow'
import type { PlusStatus } from './plus'

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
  if (!iso) return null
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null
  const sameYear = at.getFullYear() === new Date(now).getFullYear()
  return at.toLocaleDateString([], { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) })
}

const through = (date: string | null, otherwise: string) => (date ? `until ${date}` : otherwise)

/**
 * The card, or null when there is nothing to manage: not loaded, or somebody who
 * has never had Blend'n+ (they have the page, not this screen).
 */
export function manageCard(
  status: PlusStatus | null | undefined,
  store: PlusStore,
  now: number = Date.now()
): { status: ManageStatus; sentence: string } | null {
  if (!status) return null
  const date = shortDate(status.expiresAt, now)
  const name = STORE_NAME[store]
  const bought = status.source === 'apple' ? 'App Store' : status.source === 'google' ? 'Google Play' : null

  if (!status.active) {
    if (status.state === 'expired') return { status: 'expired', sentence: `${date ? `It ended ${date}. ` : ''}Everything you had is still yours to see; the extras are locked.` }
    if (status.state === 'refunded') return { status: 'refunded', sentence: 'The store refunded this, so Blend’n+ is off. You can start again anytime.' }
    // A launch season: sold nowhere, free everywhere (the server's `gated`).
    if (!status.gated) return { status: 'launch', sentence: 'Everything’s unlocked in your city for now. Nothing to pay, nothing renews.' }
    return null
  }

  if (status.product === 'night_pass') {
    return { status: 'night', sentence: `${date ? `Until ${date}, ${new Date(status.expiresAt ?? '').toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}. ` : ''}It doesn’t renew; another one adds 24 hours.` }
  }

  if (status.source === 'grant') {
    if (status.grant === 'referral') return { status: 'referral', sentence: `Your referral month runs ${through(date, 'for now')}. Nothing renews unless you choose a plan.` }
    // A trial or a gift we cannot tell apart: both end on their date and renew nothing.
    return { status: status.grant === 'trial' ? 'trial' : 'active', sentence: `Blend’n+ ${through(date, 'for now')} · nothing renews` }
  }

  switch (status.state) {
    case 'cancelled':
      return { status: 'cancelled', sentence: `You keep Blend’n+ ${through(date, 'for now')}. Nothing renews after that.` }
    case 'grace':
      return { status: 'grace', sentence: `You still have Blend’n+. Fix it in ${name} to keep Blend’n+${date ? ` after ${date}` : ''}.` }
    case 'hold':
      return { status: 'hold', sentence: `Blend’n+ is paused until the payment is fixed in ${name}.` }
    case 'paused':
      return { status: 'paused', sentence: `You paused Blend’n+ in ${name}.` }
    default:
      return { status: 'active', sentence: `${date ? `Renews ${date}` : 'Blend’n+ is on'}${bought ? ` · ${bought}` : ''}` }
  }
}

/** Whether Settings › Blend'n+ is this screen: there is something to manage, rather than something to buy. */
export function hasSomethingToManage(status: PlusStatus | null | undefined): boolean {
  return manageCard(status, 'ios') !== null
}

/** "Start Blend'n+" only where a subscription ended or was refunded: the one place the screen sells. */
export const startsAgain = (status: ManageStatus): boolean => status === 'expired' || status === 'refunded'
