/*
 * SCRUM-1109: Android 14+ draws `sp` along its own curves (AOSP FontScaleConverterFactory), so a 30 sp line grows less than
 * a 24 sp title in it. The port must give Android's own numbers: the table points exactly, linear between them.
 */
import { androidSpToDp } from '../lib/design/androidFontScale'

describe('androidSpToDp: Android 14+ sp → dp, as FontScaleConverterFactory draws it', () => {
  it('reads the table at its own points (1.3 and 2.0)', () => {
    expect(androidSpToDp(24, 1.3)).toBeCloseTo(26.4)
    expect(androidSpToDp(30, 1.3)).toBeCloseTo(30)
    expect(androidSpToDp(24, 2)).toBeCloseTo(36)
    expect(androidSpToDp(30, 2)).toBeCloseTo(38)
  })

  it('interpolates between sizes in a table (28 sp at 2.0) and from 0 under its first size', () => {
    expect(androidSpToDp(28, 2)).toBeCloseTo(36 + (2 * 4) / 6)
    expect(androidSpToDp(4, 1.5)).toBeCloseTo(6)
  })

  it('past the last size, scales by the last pair', () => {
    expect(androidSpToDp(200, 2)).toBeCloseTo(200)
  })

  it('between two tables, lerps them (1.4 is halfway from 1.3 to 1.5)', () => {
    expect(androidSpToDp(24, 1.4)).toBeCloseTo((26.4 + 28) / 2)
  })

  it('is linear under 1.04 and past the last table, as Android is', () => {
    expect(androidSpToDp(24, 1)).toBe(24)
    expect(androidSpToDp(24, 0.85)).toBeCloseTo(20.4)
    expect(androidSpToDp(24, 2.5)).toBeCloseTo(60)
  })

  it('a reported 1.2999999 reads as the 1.3 table', () => {
    expect(androidSpToDp(24, 1.2999999)).toBeCloseTo(26.4, 3)
  })
})
