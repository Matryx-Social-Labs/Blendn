/**
 * The long-press menu for every kind of message (ROUND3 D 5.2): the table,
 * row by row.
 */
import { messageMenu } from '../lib/messageMenu'

const sent = { state: 'sent' as const, speech: true }

it('theirs in a room: the bar, then their card, Reply, Copy, Report…, Block…', () => {
  expect(messageMenu({ surface: 'room', mine: false, ...sent })).toEqual({
    kind: 'menu',
    reactions: true,
    items: ['person', 'reply', 'copy', 'report', 'block'],
  })
})

it('yours in a room: the bar, Reply, Copy — never reporting yourself', () => {
  expect(messageMenu({ surface: 'room', mine: true, ...sent })).toEqual({ kind: 'menu', reactions: true, items: ['reply', 'copy'] })
})

it('still sending: Copy only — it has no id to reply or react to', () => {
  expect(messageMenu({ surface: 'room', mine: true, state: 'sending', speech: true })).toEqual({ kind: 'menu', reactions: false, items: ['copy'] })
})

it('a room that refuses writes: no bar, Copy and Report…', () => {
  expect(messageMenu({ surface: 'room', mine: false, ...sent, refusesWrites: true })).toEqual({
    kind: 'menu',
    reactions: false,
    items: ['copy', 'report'],
  })
  expect(messageMenu({ surface: 'room', mine: true, ...sent, refusesWrites: true })).toEqual({ kind: 'menu', reactions: false, items: ['copy'] })
})

it('a DM has no reactions: theirs Reply · Copy · Report…, yours Reply · Copy', () => {
  expect(messageMenu({ surface: 'dm', mine: false, ...sent })).toEqual({ kind: 'menu', reactions: false, items: ['reply', 'copy', 'report'] })
  expect(messageMenu({ surface: 'dm', mine: true, ...sent })).toEqual({ kind: 'menu', reactions: false, items: ['reply', 'copy'] })
})

it('not sent: the Not sent sheet, in a room or a DM', () => {
  expect(messageMenu({ surface: 'dm', mine: true, state: 'failed', speech: true })).toEqual({ kind: 'failed' })
  expect(messageMenu({ surface: 'room', mine: true, state: 'failed', speech: true })).toEqual({ kind: 'failed' })
})

it('removed placeholders, broadcasts and polls open nothing', () => {
  expect(messageMenu({ surface: 'room', mine: true, state: 'removed', speech: true })).toEqual({ kind: 'none' })
  expect(messageMenu({ surface: 'room', mine: false, state: 'sent', speech: false })).toEqual({ kind: 'none' })
})
