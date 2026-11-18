/**
 * One button language (buttons board C, owner 2026-11-17, SCRUM-1063): a press that draws a button's look is the DS
 * `Button` / `IconButton` / `HoldToConfirm`, never a hand-rolled `Pressable`. A fake button drifts: WaveBackPill's hue-rim
 * outline, four "new" pills in four looks, Directions in its own glass, the room info's tinted Check out row.
 *
 * "A button's look", read from the source: a `Pressable` / `ScalePress` with `accessibilityRole="button"` whose own style
 * is a capsule (`RADIUS.capsule` / `RADIUS.button`) with a fill or a rim (`backgroundColor`, `borderWidth`, or a
 * `<Material>` / `<GradientFill>` drawn inside it). Rows and cards (a card radius) are not buttons and pass.
 * `components/ds` and `components/ui` are where buttons are drawn, so they are not read.
 *
 * And `strong` stays retired: the type has no such kind, and no call site may name it.
 */
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = path.join(__dirname, '..')
const READ = ['app', 'components']
const SKIP = [path.join('components', 'ds'), path.join('components', 'ui')]
const PRESSABLES = new Set(['Pressable', 'ScalePress', 'Animated.Pressable', 'AnimatedPressable'])
const CAPSULE = /RADIUS\.(capsule|button)\b/
const FILLED = /\b(backgroundColor|borderWidth)\s*:/
const DRAWN_FILL = /<(Material|GradientFill)\b/

/**
 * The pressables that look like a button on purpose, and why (file → how many). Adding one needs a reason a DS kind cannot
 * carry; the count keeps a second one in the same file from riding on it.
 */
const ICON_CIRCLE = 'a hand-drawn icon circle (no label); not on the board’s retire list. Follow-up: IconButton (SCRUM-1063)'
const ALLOWED: Record<string, { count: number; why: string }> = {
  'app/index.tsx': { count: 2, why: 'the Google and email sign-in buttons: brand-mandated looks (board: acceptable brand exceptions)' },
  'app/(tabs)/going.tsx': { count: 2, why: ICON_CIRCLE },
  'app/about.tsx': { count: 1, why: 'the version chip (tap to copy): a chip, not an action' },
  'components/board/ComposePhoto.tsx': { count: 2, why: 'remove and alt-text controls drawn on a photo: overlay controls' },
  'components/board/FromTheLobby.tsx': { count: 1, why: 'the From the Lobby bar: a banner that opens the Lobby, not a button' },
  'components/board/LobbyParts.tsx': { count: 1, why: 'the composer prompt ("Post something"): a field stand-in' },
  'components/crews/CrewMembers.tsx': { count: 1, why: ICON_CIRCLE },
  'components/home/LocateButton.tsx': { count: 1, why: 'the map’s locate control: map chrome' },
  'components/onboarding/PhotoTile.tsx': { count: 2, why: 'remove badges on a photo tile: overlay controls' },
  'components/profile/PhotoGridTile.tsx': { count: 2, why: 'remove badges on a photo tile: overlay controls' },
  'components/scene/EventGuide.tsx': { count: 1, why: ICON_CIRCLE },
  'components/venue/VenueSections.tsx': { count: 1, why: ICON_CIRCLE },
}

type Finding = { file: string; line: number; tag: string }

/** Every `StyleSheet.create({ key: {…} })` entry in the file, as its source text. */
function styleEntries(source: ts.SourceFile): Map<string, string> {
  const entries = new Map<string, string>()
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'StyleSheet.create' && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const prop of node.arguments[0].properties) {
        if (ts.isPropertyAssignment(prop)) entries.set(prop.name.getText(source), prop.initializer.getText(source))
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return entries
}

/** The fake buttons in one file's source. */
export function fakeButtons(file: string, text: string): Finding[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const styles = styleEntries(source)
  const found: Finding[] = []
  const check = (opening: ts.JsxOpeningElement | ts.JsxSelfClosingElement, element: ts.Node) => {
    const tag = opening.tagName.getText(source)
    if (!PRESSABLES.has(tag)) return
    const attrs = opening.attributes.properties
    const attr = (name: string) => attrs.find((a): a is ts.JsxAttribute => ts.isJsxAttribute(a) && a.name.getText(source) === name)
    const role = attr('accessibilityRole')?.initializer?.getText(source) ?? ''
    if (!/['"]button['"]/.test(role)) return
    const styleText = attr('style')?.initializer?.getText(source) ?? ''
    // The style as written inline, and every `styles.x` it names.
    const own = [styleText, ...[...styleText.matchAll(/\bstyles\.(\w+)/g)].map((m) => styles.get(m[1]) ?? '')].join('\n')
    if (!CAPSULE.test(own)) return
    const inside = element.getText(source).slice(opening.getText(source).length)
    if (!FILLED.test(own) && !DRAWN_FILL.test(inside)) return
    found.push({ file, line: source.getLineAndCharacterOfPosition(opening.getStart(source)).line + 1, tag })
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) check(node.openingElement, node)
    else if (ts.isJsxSelfClosingElement(node)) check(node, node)
    ts.forEachChild(node, visit)
  }
  visit(source)
  return found
}

function sources(): string[] {
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP.includes(rel) && entry.name !== 'preview') walk(rel)
      } else if (rel.endsWith('.tsx')) out.push(rel)
    }
  }
  READ.forEach(walk)
  return out
}

describe('no hand-rolled buttons outside the DS', () => {
  it('finds none but the allowed ones, each with its reason', () => {
    const counts = new Map<string, Finding[]>()
    for (const file of sources()) {
      const found = fakeButtons(file, fs.readFileSync(path.join(ROOT, file), 'utf8'))
      if (found.length) counts.set(file, found)
    }
    const unexplained = [...counts].filter(([file, found]) => found.length > (ALLOWED[file]?.count ?? 0)).flatMap(([, found]) => found)
    expect(unexplained.map((f) => `${f.file}:${f.line} <${f.tag}>`)).toEqual([])
  })

  it('every allowance still has its button (a stale one would hide the next)', () => {
    for (const [file, { count }] of Object.entries(ALLOWED)) {
      expect(fakeButtons(file, fs.readFileSync(path.join(ROOT, file), 'utf8'))).toHaveLength(count)
    }
  })

  // Negative controls: the scanner catches the shapes it is for, and passes the ones it is not.
  const pill = (style: string, inner = '<Text>Wave back</Text>') => `
    import { Pressable, StyleSheet, Text } from 'react-native'
    export const X = () => <Pressable accessibilityRole="button" onPress={() => {}} style={${style}}>${inner}</Pressable>
    const styles = StyleSheet.create({
      pill: { borderRadius: RADIUS.capsule, borderWidth: 1, borderColor: COLOR.brandRose },
      glass: { borderRadius: RADIUS.capsule, overflow: 'hidden' },
      row: { borderRadius: RADIUS.rowInCard, backgroundColor: COLOR.surface },
    })`

  it('catches a capsule with a rim (WaveBackPill as it was)', () => {
    expect(fakeButtons('x.tsx', pill('styles.pill'))).toHaveLength(1)
  })

  it('catches a capsule with glass drawn inside (Directions as it was)', () => {
    expect(fakeButtons('x.tsx', pill('styles.glass', '<Material role="media" /><Text>Directions</Text>'))).toHaveLength(1)
  })

  it('catches it through a pressed-style function and inline styles', () => {
    expect(fakeButtons('x.tsx', pill('({ pressed }) => [styles.pill, pressed && styles.row]'))).toHaveLength(1)
    expect(fakeButtons('x.tsx', pill('{ borderRadius: RADIUS.capsule, backgroundColor: sel.fill }'))).toHaveLength(1)
  })

  it('passes a row or a card, and a capsule with nothing drawn', () => {
    expect(fakeButtons('x.tsx', pill('styles.row'))).toEqual([])
    expect(fakeButtons('x.tsx', pill('styles.glass'))).toEqual([])
  })

  it('passes a press that is not a button (a link, a toggle row)', () => {
    expect(fakeButtons('x.tsx', pill('styles.pill').replace('accessibilityRole="button"', 'accessibilityRole="link"'))).toEqual([])
  })
})

// Every `'strong'` literal in app/, components/ and lib/ is counted (to zero) by `litSweep.test.ts`.
describe('strong is retired', () => {
  const STRONG = /\bkind=["']strong["']|\bkind:\s*["']strong["']|\bvariant:\s*["']strong["']|\bvariant=["']strong["']/

  it('the Button kinds and the sheet variants have no strong (control: the pattern catches it)', () => {
    expect(fs.readFileSync(path.join(ROOT, 'components/ds/Button.tsx'), 'utf8')).not.toMatch(/export type ButtonKind = [^\n]*'strong'/)
    expect(fs.readFileSync(path.join(ROOT, 'lib/sheet.ts'), 'utf8')).not.toMatch(/variant\?: [^\n]*'strong'/)
    expect(STRONG.test(`<Button kind="strong" />`)).toBe(true)
    expect(STRONG.test(`{ label: 'OK', kind: 'strong' }`)).toBe(true)
  })
})
