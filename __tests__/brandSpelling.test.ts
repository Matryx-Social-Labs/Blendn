/**
 * The brand is "Blend’n+" in every string a person reads (YOU-11, B-T3). A source pin over `app/`, `components/` and `lib/`:
 * string literals, template parts and JSX text are read through the TypeScript parser, so comments (where the old spelling is
 * harmless shorthand) never count.
 *
 * The other packages' files (DS-13 GoLiveSheet, TG-13 useGoLive, GO-14 savedEvents and Going) are fixed and merged, so
 * there is no pending list: every file is held to it.
 */
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']
const WRONG = /Blendn\+/

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
    expect(offenders()).toEqual([])
  })

  it('reads strings, not comments', () => {
    expect(stringsIn('lib/plusFree.ts').some((s) => WRONG.test(s))).toBe(false)
  })
})
