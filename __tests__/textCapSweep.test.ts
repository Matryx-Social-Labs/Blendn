/**
 * DS-22, the AX caps sweep (FIX-ROUND-FINAL §2.1, §4 "After all four merge"): a `<Text>` with no `maxFontSizeMultiplier`
 * draws at 3.571× at AX XXXL, past every role's cap. `font()` (components/ds/shared.ts) returns a style and never caps, so
 * each call site must. This pins every one in `app/`, `components/` and `lib/`.
 *
 * A text counts as capped when it:
 * - sets `maxFontSizeMultiplier` (the role's `MAX_FONT_SCALE`, or `CONTROL_FONT_CAP` on a control), or
 * - opts out of scaling (`allowFontScaling={false}`), or
 * - spreads props (`{...rest}`), which a wrapper uses to pass its caller's cap through, or
 * - is nested inside another text: React Native's nested spans inherit the outer text's cap.
 * The DS `components/ui/Text` (`variant`) applies `MAX_FONT_SCALE[variant]` itself, so only React Native's own `Text`,
 * `TextInput` and `Animated.Text` are read here.
 *
 * Read through the TypeScript parser, so a comment never counts and an aliased import (`Text as RNText`) does.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import ts from 'typescript'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']

/**
 * Exceptions, each with its reason. Keyed `file:<jsx line>`, so a moved line is re-read rather than silently allowed.
 */
const EXCEPTIONS: Record<string, string> = {
  // `MonoRun`'s divider, struck run and brand-face space are spans: MonoRun renders only inside its caller's mono Text
  // (the next test holds every caller to that), and a nested span inherits that Text's cap.
  'components/ds/MonoFamily.tsx:36': 'MonoRun divider span, nested in the caller’s capped Text',
  'components/ds/MonoFamily.tsx:40': 'MonoRun struck span, nested in the caller’s capped Text',
  'components/ds/MonoFamily.tsx:57': 'MonoRun space span, nested in the caller’s capped Text',
}

/** `app/preview` is the design gallery: it redirects home outside a development build (`app/preview/_layout.tsx`). */
const SKIP_DIRS = new Set(['app/preview'])

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return SKIP_DIRS.has(rel) ? [] : sources(rel)
    return entry.name.endsWith('.tsx') ? [rel] : []
  })
}

type Jsx = ts.JsxElement | ts.JsxSelfClosingElement
const openingOf = (node: Jsx) => (ts.isJsxElement(node) ? node.openingElement : node)

/** The names this file gives React Native's text components (`Text`, `Text as RNText`, `TextInput`), and `Animated.Text`. */
function textTags(file: ts.SourceFile): Set<string> {
  const tags = new Set(['Animated.Text'])
  for (const statement of file.statements) {
    if (!ts.isImportDeclaration(statement) || (statement.moduleSpecifier as ts.StringLiteral).text !== 'react-native') continue
    const bindings = statement.importClause?.namedBindings
    if (!bindings || !ts.isNamedImports(bindings)) continue
    for (const element of bindings.elements) {
      const imported = (element.propertyName ?? element.name).text
      if (imported === 'Text' || imported === 'TextInput') tags.add(element.name.text)
    }
  }
  return tags
}

const parse = (rel: string) => ts.createSourceFile(rel, fs.readFileSync(path.resolve(ROOT, rel), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
const lineOf = (file: ts.SourceFile, node: ts.Node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1

function isCapped(open: ts.JsxOpeningLikeElement, file: ts.SourceFile): boolean {
  return open.attributes.properties.some((attribute) => {
    if (ts.isJsxSpreadAttribute(attribute)) return true
    const name = attribute.name.getText(file)
    if (name === 'maxFontSizeMultiplier') return true
    return name === 'allowFontScaling' && !!attribute.initializer && /\bfalse\b/.test(attribute.initializer.getText(file))
  })
}

/** Every outermost React Native text with no cap, as `file:line`. */
function uncappedTexts(rel: string): string[] {
  const file = parse(rel)
  const tags = textTags(file)
  const found: string[] = []
  const visit = (node: ts.Node, inText: boolean) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const open = openingOf(node)
      const isText = tags.has(open.tagName.getText(file))
      if (isText && !inText && !isCapped(open, file)) found.push(`${rel}:${lineOf(file, open)}`)
      ts.forEachChild(node, (child) => visit(child, inText || (isText && ts.isJsxElement(node))))
      return
    }
    ts.forEachChild(node, (child) => visit(child, inText))
  }
  visit(file, false)
  return found
}

/** Every `<MonoRun>` that is not inside a text: its spans would then carry no cap of their own. */
function looseMonoRuns(rel: string): string[] {
  const file = parse(rel)
  const tags = textTags(file)
  const found: string[] = []
  const visit = (node: ts.Node, inText: boolean) => {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const tag = openingOf(node).tagName.getText(file)
      if (tag === 'MonoRun' && !inText) found.push(`${rel}:${lineOf(file, node)}`)
      ts.forEachChild(node, (child) => visit(child, inText || (tags.has(tag) && ts.isJsxElement(node))))
      return
    }
    ts.forEachChild(node, (child) => visit(child, inText))
  }
  visit(file, false)
  return found
}

const FILES = DIRS.flatMap(sources)

describe('every user-visible text has a font cap (DS-22)', () => {
  it('no React Native text in app/, components/ or lib/ is uncapped, outside the listed exceptions', () => {
    const uncapped = FILES.flatMap(uncappedTexts)
    expect(uncapped.filter((site) => !(site in EXCEPTIONS))).toEqual([])
  })

  it('every exception is still needed, so the list never outlives its reason', () => {
    const uncapped = new Set(FILES.flatMap(uncappedTexts))
    expect(Object.keys(EXCEPTIONS).filter((site) => !uncapped.has(site))).toEqual([])
  })

  it('MonoRun only ever renders inside a text, which is what its exceptions rely on', () => {
    expect(FILES.filter((rel) => rel !== 'components/ds/MonoFamily.tsx').flatMap(looseMonoRuns)).toEqual([])
  })

  // The scanner itself: an uncapped Text is found, an aliased one too, and each way of being capped is accepted.
  it('reads what it claims to read', () => {
    const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'text-cap-')), 'probe.tsx')
    fs.writeFileSync(
      tmp,
      [
        "import { Text as RNText, TextInput } from 'react-native'",
        'export const A = () => <RNText>uncapped</RNText>',
        'export const B = () => <TextInput />',
        'export const C = () => <RNText maxFontSizeMultiplier={2}>capped</RNText>',
        'export const D = () => <RNText allowFontScaling={false}>fixed</RNText>',
        'export const E = () => <RNText maxFontSizeMultiplier={2}>outer <RNText>nested</RNText></RNText>',
      ].join('\n'),
    )
    try {
      expect(uncappedTexts(tmp)).toEqual([`${tmp}:2`, `${tmp}:3`])
    } finally {
      fs.unlinkSync(tmp)
    }
  })
})
