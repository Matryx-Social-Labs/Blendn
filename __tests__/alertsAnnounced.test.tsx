/**
 * An alert is said (motion audit M3). `accessibilityRole="alert"` alone announces nothing: a failed Google sign-in played
 * H.error and a screen reader heard nothing. Every alert carries a live region (Android) and goes through `useAnnounced`
 * (iOS), the FieldNotes pattern.
 */
import { render } from '@testing-library/react-native'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'
import { AccessibilityInfo, Platform, Text } from 'react-native'

import { useAnnounced } from '../components/ds/shared'

const ROOT = join(__dirname, '..')
const files = (dir: string): string[] =>
  readdirSync(join(ROOT, dir)).flatMap((f) => {
    const p = join(dir, f)
    return statSync(join(ROOT, p)).isDirectory() ? files(p) : /\.tsx$/.test(f) ? [p] : []
  })

it('every alert has a live region, and its file says it with useAnnounced', () => {
  const offenders: string[] = []
  for (const f of [...files('app'), ...files('components')]) {
    const src = readFileSync(join(ROOT, f), 'utf8')
    src.split('\n').forEach((line, i) => {
      if (!line.includes('accessibilityRole="alert"')) return
      if (!line.includes('accessibilityLiveRegion=') || !src.includes('useAnnounced(')) offenders.push(`${f}:${i + 1}`)
    })
  }
  expect(offenders).toEqual([])
})

function Alert({ text }: { text: string | null }) {
  useAnnounced(text)
  return <Text>{text}</Text>
}

it('useAnnounced says new text once on iOS, nothing for none, and again when it changes', async () => {
  jest.replaceProperty(Platform, 'OS', 'ios')
  const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  const r = await render(<Alert text={null} />)
  expect(say).not.toHaveBeenCalled()
  await r.rerender(<Alert text="Couldn’t sign in with Google." />)
  await r.rerender(<Alert text="Couldn’t sign in with Google." />)
  expect(say).toHaveBeenCalledTimes(1)
  expect(say).toHaveBeenCalledWith('Couldn’t sign in with Google.', { queue: false })
  await r.rerender(<Alert text="Too many tries." />)
  expect(say).toHaveBeenCalledTimes(2)
  jest.restoreAllMocks()
})

it('Android leaves it to the live region, so it is not read twice', async () => {
  jest.replaceProperty(Platform, 'OS', 'android')
  const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibilityWithOptions').mockImplementation(() => {})
  await render(<Alert text="Couldn’t sign in." />)
  expect(say).not.toHaveBeenCalled()
  jest.restoreAllMocks()
})
