/**
 * Settings → Blocked, the crews group (task 17 b1, advisor B-A 2026-11-25): first while there are any, "Crews · N", the
 * caption, a row per crew (its emblem, never a face) with a neutral Unblock behind a confirm, and "Show all N" past the first
 * few. Nothing at all when you blocked no crew.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

jest.mock('../lib/crewsApi', () => ({ crewsApi: { hiddenCrews: jest.fn(), unhideCrew: jest.fn() } }))
jest.mock('../lib/sheet', () => ({ showSheet: jest.fn() }))

import { BLOCKED_CREWS_FIRST, BlockedCrews } from '../components/settings/BlockedCrews'
import type { HiddenCrew } from '../lib/crews'
import { crewsApi } from '../lib/crewsApi'
import { showSheet, type ActionSheet } from '../lib/sheet'

const api = crewsApi as jest.Mocked<typeof crewsApi>
const crew = (id: string, name = id): HiddenCrew => ({ crewId: id, name, emblemSeed: id, hiddenAt: '2026-11-02T10:00:00Z' })
const answer = (crews: HiddenCrew[], totalCount: number, hasMore: boolean) =>
  ({ success: true, data: { crews, pagination: { page: 1, limit: crews.length, totalCount, totalPages: 1, hasMore } } }) as never

beforeEach(() => jest.clearAllMocks())

it('draws nothing when you blocked no crew', async () => {
  api.hiddenCrews.mockResolvedValue(answer([], 0, false))
  await render(<BlockedCrews />)
  await waitFor(() => expect(api.hiddenCrews).toHaveBeenCalled())
  expect(screen.queryByText('Crews')).toBeNull()
})

it('the group: Crews · N, the caption, a row per crew with Unblock', async () => {
  api.hiddenCrews.mockResolvedValue(answer([crew('orbit', 'Orbit'), crew('run', 'Indiranagar Sunrise Run Club of the Long Name')], 2, false))
  await render(<BlockedCrews />)
  await screen.findByText('Orbit')
  expect(api.hiddenCrews).toHaveBeenCalledWith(1, BLOCKED_CREWS_FIRST)
  expect(screen.getByText('You won’t see these crews in any room. They aren’t told.')).toBeTruthy()
  expect(screen.getByText('Indiranagar Sunrise Run Club of the Long Name')).toBeTruthy()
  expect(screen.getAllByText(/^Crew · blocked /)).toHaveLength(2)
  expect(screen.getByLabelText('Unblock Orbit')).toBeTruthy()
  expect(screen.queryByText(/^Show all/)).toBeNull()
})

it('Unblock asks first; confirming unhides it and the row goes', async () => {
  api.hiddenCrews.mockResolvedValue(answer([crew('orbit', 'Orbit')], 1, false))
  api.unhideCrew.mockResolvedValue({ success: true, data: { hidden: false } })
  await render(<BlockedCrews />)
  await fireEvent.press(await screen.findByLabelText('Unblock Orbit'))
  const confirm = (showSheet as jest.Mock).mock.calls[0][0] as ActionSheet
  expect(confirm.title).toBe('Unblock Orbit?')
  expect(confirm.message).toBe('Orbit can show in your rooms again. Its members aren’t told.')
  expect(api.unhideCrew).not.toHaveBeenCalled()
  const run = (confirm.actions[0] as { run: () => Promise<{ ok: boolean }> }).run
  await act(async () => {
    await run()
  })
  expect(api.unhideCrew).toHaveBeenCalledWith('orbit')
  expect(screen.queryByText('Orbit')).toBeNull()
})

it('past the first few: Show all N reads the rest', async () => {
  api.hiddenCrews
    .mockResolvedValueOnce(answer([crew('a'), crew('b'), crew('c')], 14, true))
    .mockResolvedValueOnce(answer([crew('a'), crew('b'), crew('c'), crew('d')], 14, false))
  await render(<BlockedCrews />)
  await fireEvent.press(await screen.findByText('Show all 14'))
  await screen.findByText('d')
  expect(api.hiddenCrews).toHaveBeenLastCalledWith(1, 50)
})

it('a failed read says so, with a retry', async () => {
  api.hiddenCrews.mockResolvedValueOnce({ success: false, error: 'x' } as never).mockResolvedValueOnce(answer([crew('orbit', 'Orbit')], 1, false))
  await render(<BlockedCrews />)
  await fireEvent.press(await screen.findByText('Blocked crews didn’t load. Tap to try again.'))
  await screen.findByText('Orbit')
})
