import { compactCount } from '../lib/format'

/**
 * One way to print a count that can grow (owner 2026-11-05): exact to 999, then 1.2k / 12k / 1.2M, lowercase k, no
 * ".0", never more than there is (rounded down). Spoken labels keep the full number; this is for the eye.
 */
describe('compactCount', () => {
  it.each([
    [0, '0'],
    [5, '5'],
    [999, '999'],
    [1000, '1k'],
    [1049, '1k'],
    [1050, '1k'],
    [1099, '1k'],
    [1100, '1.1k'],
    [9999, '9.9k'],
    [10_000, '10k'],
    [12_480, '12k'],
    [999_999, '999k'],
    [1_000_000, '1M'],
    [1_200_000, '1.2M'],
    [25_000_000, '25M'],
  ])('%d → %s', (n, text) => expect(compactCount(n)).toBe(text))

  it('never prints more than there is: 1,999 is "1.9k", not "2k"', () => {
    expect(compactCount(1999)).toBe('1.9k')
  })
})
