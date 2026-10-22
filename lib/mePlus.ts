import type { PlusStatus } from './plus'
import { manageCard, type PlusStore } from './plusManage'

/**
 * The line under "Blend'n+" on Me (Flow 14 R4.1 · 13.1 · 12.2 · 14.5, Me · 01 to 03): where the person stands, in a sentence,
 * never a banner. Pure, so every state runs in a plain node test.
 *
 *  - something to manage (a subscription, a pass, a gift, a hold): Manage's own sentence, "Renews 3 Nov · App Store";
 *  - a launch season, sold nowhere: "Free during launch in your city" (`free`: the row opens the sheet that says so);
 *  - never subscribed: the store's own price, "₹199 a month", once the store has answered (never a price written here);
 *  - not loaded, or no price yet: just the name.
 */
export type MePlusLine = { hint: string | null; free: boolean }

export function mePlusLine(status: PlusStatus | null | undefined, monthlyPrice: string | null, device: PlusStore): MePlusLine {
  if (!status) return { hint: null, free: false }
  const card = manageCard(status, device)
  if (card?.status === 'launch') return { hint: 'Free during launch in your city', free: true }
  if (card) return { hint: card.sentence, free: false }
  return { hint: monthlyPrice ? `${monthlyPrice} a month` : null, free: false }
}
