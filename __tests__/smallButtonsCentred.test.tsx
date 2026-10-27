/*
 * A small Button hugs its label with `alignSelf: 'flex-start'`, which beats a wrapper's `alignItems: 'center'`.
 * The frames centre these three, so each passes its own `alignSelf: 'center'` (Flow 1 sign-in and forgot, Flow 2 photo tile).
 */
import fs from 'fs'
import path from 'path'

const read = (p: string) => fs.readFileSync(path.join(__dirname, '..', p), 'utf8')

it.each([
  ['app/sign-in.tsx', 'sign-in-forgot'],
  ['app/forgot-password.tsx', 'forgot-different'],
  ['components/onboarding/PhotoTile.tsx', 'photo-retry-'],
])('%s centres its small button (%s)', (file, testID) => {
  const src = read(file)
  const at = src.indexOf(testID)
  expect(at).toBeGreaterThan(-1)
  const tag = src.slice(src.lastIndexOf('<Button', at), src.indexOf('/>', at) + 2)
  expect(tag).toMatch(/style=\{styles\.centred\}/)
  expect(src).toMatch(/centred: \{ alignSelf: 'center' \}/)
})
