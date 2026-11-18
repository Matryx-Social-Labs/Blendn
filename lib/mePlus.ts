import type { PlusStatus } from './plus'
import { manageCard, type PlusStore } from './plusManage'
import { calendarDate } from './time'

/**
 * The line under "Blend'n+" on Me and in Settings (Flow 14 R4.1 · 13.1 · 12.2 · 14.5, Me · 01 to 03; D23): where the person
 * stands, in a sentence, never a banner. One helper for both rows, so one account never reads three ways (D-LM14). Pure.
 *
 *  - something to manage (a subscription, a pass, a hold): Manage's own sentence, "Renews 3 Nov · App Store";
 *  - a gift of ours (a trial, a grant): "Active until 23 Oct 2027", the row's title already says Blend'n+ (D-L25);
 *  - never subscribed: "from ₹199 a month" once the store has answered (never a price written here), "See plans" until then;
 *  - not loaded: nothing.
 */
export function plusRowLine(status: PlusStatus | null | undefined, monthlyPrice: string | null, device: PlusStore): string | null {
  if (!status) return null
  const card = manageCard(status, device)
  if (status.active && status.source === 'grant' && status.grant !== 'referral') {
    return `Active ${status.expiresAt ? `until ${calendarDate(status.expiresAt)}` : 'for now'}`
  }
  if (card) return card.sentence
  return monthlyPrice ? `from ${monthlyPrice} a month` : 'See plans'
}

/**
 * Whether Blend'n+ shows on Me and in Settings at all (owner ruling 2026-11-18: "keep the app completely free to use"): only
 * where the server says it is sold (`gated`, staging). Prod's PLUS_GATING is unset, so there it never shows, and with it the
 * "Free during launch" row and its sheet are gone. Not loaded is not shown either: a row never flashes in and out.
 */
export const showsPlus = (status: PlusStatus | null | undefined) => status?.gated === true
