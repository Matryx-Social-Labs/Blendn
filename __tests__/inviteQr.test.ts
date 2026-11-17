/** The invite QR (Flow 7 2-A) encodes the link it is drawn for, at error correction H, so the face over its centre still scans. */
import { qrModules } from '../components/friends/InviteQr'

it('is a square code of the URL, its finder corners dark, and a longer URL a larger code', () => {
  const short = qrModules('https://www.blendn.app/f/abcdefghijklmnopqrstuv')
  expect(short.n % 4).toBe(1) // 21, 25, 29, 33…: a QR is 17 + 4 × version modules wide
  for (const [x, y] of [[0, 0], [short.n - 1, 0], [0, short.n - 1]]) expect(short.dark(x, y)).toBe(true)
  expect(qrModules(`https://www.blendn.app/f/${'x'.repeat(120)}`).n).toBeGreaterThan(short.n)
})
