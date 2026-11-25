/*
 * Flow 1c, option C (owner's pick, 2026-11-04): /sign-in and /forgot-password are drawn OVER the landing, which keeps
 * turning behind their glass sheet, so both are transparent modals with no stack animation of their own (the sheet grows
 * out of the Dock itself, components/onboarding/EmailSheet.tsx). A push would cover the landing and stop its sky.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const layout = readFileSync(join(__dirname, '../app/_layout.tsx'), 'utf8')
const screenOptions = (name: string) => {
  const at = layout.indexOf(`<Stack.Screen name="${name}"`)
  expect(at).toBeGreaterThan(-1)
  return layout.slice(at, layout.indexOf('/>', at))
}

it.each(['sign-in', 'forgot-password'])('%s is a transparent modal over the landing, with no animation of its own', (name) => {
  const options = screenOptions(name)
  expect(options).toMatch(/presentation: 'transparentModal'/)
  expect(options).toMatch(/animation: 'none'/)
  expect(options).toMatch(/contentStyle: \{ backgroundColor: 'transparent' \}/)
})
