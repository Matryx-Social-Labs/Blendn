import type { PlusStatus } from './plus'
import { manageCard, type PlusStore } from './plusManage'
import { calendarDate } from './time'

/**
 * The line under "Blend'n+" on Me and in Settings (Flow 14 R4.1 · 13.1 · 12.2 · 14.5, Me · 01 to 03; D23): where the person
 * stands, in a sentence, never a banner. One helper for both rows, so one account never reads three ways (D-LM14). Pure.
 *
 *  - something to manage (a subscription, a pass, a hold): Manage's own sentence, "Renews 3 Nov · App Store";
 *  - a gift of ours (a trial, a grant): "Active until 23 Oct 2027", the row's title already says Blend'n+ (D-L25);
 *  - a launch season, sold nowhere: "Free during launch in your city" (`free`: the row opens the sheet that says so);
 *  - never subscribed: "from ₹199 a month" once the store has answered (never a price written here), "See plans" until then;
 *  - not loaded: nothing.
 */
export type PlusRowLine = { hint: string | null; free: boolean }

export function plusRowLine(status: PlusStatus | null | undefined, monthlyPrice: string | null, device: PlusStore): PlusRowLine {
  if (!status) return { hint: null, free: false }
  const card = manageCard(status, device)
  if (card?.status === 'launch') return { hint: 'Free during launch in your city', free: true }
  if (status.active && status.source === 'grant' && status.grant !== 'referral') {
    return { hint: `Active ${status.expiresAt ? `until ${calendarDate(status.expiresAt)}` : 'for now'}`, free: false }
  }
  if (card) return { hint: card.sentence, free: false }
  return { hint: monthlyPrice ? `from ${monthlyPrice} a month` : 'See plans', free: false }
}
