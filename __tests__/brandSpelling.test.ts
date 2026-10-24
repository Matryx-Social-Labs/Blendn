/**
 * The brand is "Blend’n+" in every string a person reads (YOU-11, B-T3). A source pin over `app/`, `components/` and `lib/`:
 * string literals, template parts and JSX text are read through the TypeScript parser, so comments (where the old spelling is
 * harmless shorthand) never count.
 *
 * `OTHER_PACKAGES` lists files the final fix round gives to other packages (DS-13, TG-13, GO-14) that still carry the old
 * spelling. Each entry must still need it: once its owner fixes the file, the second test fails until the entry goes.
 */
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']
const WRONG = /Blendn\+/

const OTHER_PACKAGES = new Set([
  'components/ds/GoLiveSheet.tsx', // P-DS, DS-13
  'lib/useGoLive.ts', // P-TOG, TG-13
  'lib/savedEvents.ts', // P-OUT, GO-14
  'app/(tabs)/going.tsx', // P-OUT, GO-14 (the locked row's hint)
])

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return sources(rel)
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : []
  })
}

/** Every piece of text the file hands to the screen: string literals, template parts, JSX text. */
function stringsIn(rel: string): string[] {
  const file = ts.createSourceFile(rel, fs.readFileSync(path.join(ROOT, rel), 'utf8'), ts.ScriptTarget.Latest, true, rel.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) out.push(node.text)
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

const offenders = () => DIRS.flatMap(sources).filter((rel) => stringsIn(rel).some((s) => WRONG.test(s)))

describe('the brand is spelled Blend’n+', () => {
  it('in every string under app/, components/ and lib/', () => {
    expect(offenders().filter((rel) => !OTHER_PACKAGES.has(rel))).toEqual([])
  })

  it('the files left to other packages still need their place on the list', () => {
    const found = new Set(offenders())
    expect([...OTHER_PACKAGES].filter((rel) => !found.has(rel))).toEqual([])
  })

  it('reads strings, not comments', () => {
    expect(stringsIn('lib/plusFree.ts').some((s) => WRONG.test(s))).toBe(false)
  })
})
