import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'

/**
 * Every KeyboardAvoidingView uses the one shared behaviour, on both platforms.
 *
 * Eight screens guessed per platform (`undefined` or `'height'` on Android)
 * on the reasoning that adjustResize handles it. With edgeToEdgeEnabled an
 * Android 15+ window ignores adjustResize, so the field being typed into sat
 * under the keyboard — driven on Android 16 on onboarding (SCRUM-78) and on
 * edit-profile. One constant, so the next screen cannot re-guess.
 */
const ROOT = join(__dirname, '..')
const files = execSync("grep -rl 'KeyboardAvoidingView' app components --include='*.tsx'", { cwd: ROOT })
  .toString()
  .trim()
  .split('\n')
  .filter(Boolean)

describe('KeyboardAvoidingView behaviour', () => {
  it('found the screens, so the loop below is not empty', () => {
    expect(files.length).toBeGreaterThanOrEqual(8)
  })

  it.each(files)('%s uses KEYBOARD_BEHAVIOR and no per-platform guess', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8')
    const uses = src.match(/<KeyboardAvoidingView[\s\S]*?>/g) ?? []
    for (const tag of uses) {
      expect(tag).toMatch(/behavior=\{KEYBOARD_BEHAVIOR\}/)
    }
    expect(src).not.toMatch(/behavior=\{Platform\.OS === 'ios' \? 'padding' : (undefined|'height')\}/)
  })

  it('the shared value is padding, which Android honours when the window will not resize', () => {
    expect(readFileSync(join(ROOT, 'lib/keyboard.ts'), 'utf8')).toMatch(/KEYBOARD_BEHAVIOR = 'padding' as const/)
  })
})
