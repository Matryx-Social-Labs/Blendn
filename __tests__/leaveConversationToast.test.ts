/*
 * What a conversation's leave says it did (RC drive 4 D-12): "Block and report" ended on "Unmatched Eli Rc. Report
 * sent." though the person was blocked. Each action says its own.
 */
jest.mock('../lib/apiClient', () => ({ apiClient: { leaveConversation: jest.fn(async () => ({ success: true, data: {} })) } }))
jest.mock('../lib/logger', () => ({ Logger: { debug: jest.fn(), warn: jest.fn(), error: jest.fn(), info: jest.fn() } }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))

/* eslint-disable import/first */
import { apiClient } from '../lib/apiClient'
import { leaveConversationSheet } from '../lib/safetyUtils'
import type { ActionSheet, ReasonSheet, Sheet, SheetOutcome } from '../lib/sheet'
/* eslint-enable import/first */

const actionsOf = (sheet: Sheet) => (sheet as ActionSheet).actions as Array<{ label: string; run?: () => Promise<SheetOutcome>; next?: () => Sheet }>
const pick = (sheet: Sheet, label: string) => actionsOf(sheet).find((a) => a.label === label)!

describe.each([
  ['a match', true, 'Unmatch', 'Unmatched Eli Rc'],
  ['a conversation', false, 'End conversation', 'Conversation ended'],
])('leaving %s', (_what, fromMatch, verb, left) => {
  it('Block and report says the block and the report', async () => {
    const sheet = leaveConversationSheet('c1', 'Eli Rc', false, undefined, fromMatch)
    const reasons = pick(sheet, 'Block and report…').next!() as ReasonSheet
    const outcome = await reasons.run('spam')
    expect(apiClient.leaveConversation).toHaveBeenLastCalledWith('c1', { action: 'block', report: { reason: 'spam' } })
    expect(outcome).toEqual({ ok: true, toast: 'Eli Rc is blocked. Report sent. Our team will review it.' })
  })

  it(`${verb} and report says the leave and the report; ${verb} alone says the leave`, async () => {
    const sheet = leaveConversationSheet('c1', 'Eli Rc', false, undefined, fromMatch)
    const reasons = pick(sheet, `${verb} and report…`).next!() as ReasonSheet
    expect(await reasons.run('spam')).toEqual({ ok: true, toast: `${left}. Report sent. Our team will review it.` })
    expect(await pick(sheet, verb).run!()).toEqual({ ok: true, toast: left })
  })
})
