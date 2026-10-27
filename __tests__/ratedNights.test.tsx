/**
 * Rating a night takes "Rate who you met" away everywhere at once, and coming
 * back says "You rated this night" (PR #401 drive 2: Going kept offering it,
 * and the rate screen reopened on "Nothing to rate").
 */
import { act, renderHook } from '@testing-library/react-native'
import { readFileSync } from 'fs'
import { join } from 'path'

import { isNightRated, markNightRated, useRatedNights } from '../lib/ratedNights'

const read = (...p: string[]) => readFileSync(join(__dirname, '..', ...p), 'utf8')

it('a rated night is known at once, and every reader re-renders', async () => {
  const hook = await renderHook(() => useRatedNights())
  const before = hook.result.current
  expect(isNightRated('n1')).toBe(false)
  await act(async () => markNightRated('n1'))
  expect(isNightRated('n1')).toBe(true)
  expect(hook.result.current).not.toBe(before)
})

it('the rate screen marks the night on either kind of rating, and says "You rated this night" when it was', () => {
  const src = read('app', 'rate', '[eventId].tsx')
  expect(src.match(/markNightRated\(String\(eventId\)\)/g)).toHaveLength(2)
  expect(src).toContain("ratedBefore ? 'You rated this night'")
  expect(src).toContain('!!own?.data?.ratedAt || isNightRated(id)')
})

it('Going swaps its Past row action for "Rated", and the Recap reads it too', () => {
  const going = read('app', '(tabs)', 'going.tsx')
  expect(going).toMatch(/trailing=\{isNightRated\(row\.id\) \? <RowNote text="Rated" \/> : undefined\}/)
  expect(going).toMatch(/below=\{\s*isNightRated\(row\.id\) \? undefined : \(/)
  expect(read('components', 'blendn', 'BlendnScreen.tsx')).toContain('rated={ratedEvent === recap.eventId || isNightRated(recap.eventId)}')
})
