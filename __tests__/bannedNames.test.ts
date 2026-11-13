/**
 * The names the owner retired on 2026-11-05 (SCRUM-1027, `.context/plans/naming-review.md` in blendn-admin) never come
 * back in a string a person reads: the Board is the Lobby, the crew match is a Mix, "blend in" is "Blend’n", the organizer’s
 * Event Pass is Event Insights, the venue door pass is an offer code, spaces are spots, "Liking as" is "Sending as", and "centre" is "center".
 *
 * A source pin over `app/`, `components/` and `lib/`, read through the TypeScript parser like `brandSpelling.test.ts`:
 * string literals, template parts and JSX text count; comments, imports and code identifiers (`BoardPost`, `blendId`)
 * never do. A literal with no space that does not start with a capital is a route, a key, a kind or a testID
 * (`/board/[eventId]`, `'blend'`, `board-top`), never copy, so it is skipped. Brand words stay: Blend’n, Blend’n+. On 2026-11-12 Wave replaced Like for
 * people (SCRUM-1042): "It’s mutual", "matched" and a person's Like are retired; a crew's "Like for {crew}" stays.
 */
import fs from 'fs'
import path from 'path'
import ts from 'typescript'

const ROOT = path.join(__dirname, '..')
const DIRS = ['app', 'components', 'lib']

/** Each retired name, as it can appear in copy. */
const BANNED: readonly { name: string; pattern: RegExp; allowIn?: readonly string[] }[] = [
  { name: 'Board (now Lobby)', pattern: /\b[Bb]oard\b(?![- ]?gam)/ },
  { name: 'blend in (now Blend’n)', pattern: /\bblend(s|ed|ing)? in\b/i },
  { name: 'Blend, the crew match (now Mix)', pattern: /\bBlends?\b(?!['’]n|&apos;n|&rsquo;n)/ },
  { name: 'Event Pass (now Event Insights)', pattern: /\bEvent Pass(es)?\b/i },
  { name: 'door pass (now offer code)', pattern: /\bdoor pass/i },
  { name: 'spaces left (now spots)', pattern: /\bspaces? left\b/i },
  { name: 'Liking as (now Sending as)', pattern: /\bliking as\b/i },
  { name: 'centre (now center)', pattern: /\bcentr(e|es|ed|ing)\b/i },
  // Wave replaced Like for people (owner ruling 2026-11-12, SCRUM-1042). A crew's "Like for {crew}" stays until crew waves.
  { name: 'It’s mutual (now You both waved)', pattern: /\bit[’']s mutual\b/i },
  { name: 'matched, between people (now You both waved)', pattern: /\bmatched\b/i },
  // Crews names 7 (owner 2026-11-12, SCRUM-1052): the hold's "With {crew}" is how you tell your crew, so the button is gone;
  // its words stay only as the crew-chat line, which the server writes. The list footer's promise had no surface behind it.
  { name: 'Tell your crew — We’re here, the button (now With {crew} at the hold)', pattern: /\btell your crew\b/i },
  { name: 'see where your crew is (no such surface)', pattern: /\bwhere your crew is\b/i },
  {
    name: 'Like, a person gesture (now Wave)',
    pattern: /^Liked?$|\bLiked?\s+(?!for\b)[A-Z]|\b[Yy]ou liked\b|\blikes? (you|them) back\b/,
    // A crew's like of a crew (the Mix) is still a like until crew waves ship.
    allowIn: ['components/ds/CrewCard.tsx', 'components/crews/CrewsView.tsx'],
  },
]

/** A server's sentence from before the rename, read so an older server still lands on the Lobby's own copy (lib/board.ts). */
const ALLOWED = new Set(['The board closes when the doors open — the room is open instead'])

/** A route, a key, a kind or a testID: no space, and no capital to start. */
const isIdentifierLike = (s: string) => !/\s/.test(s) && !/^[A-Z]/.test(s)

function sources(dir: string): string[] {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) return sources(rel)
    return /\.(ts|tsx)$/.test(entry.name) ? [rel] : []
  })
}

/** Every piece of text the source hands to the screen: string literals, template parts, JSX text. Not imports. */
function copyIn(source: string, name = 'x.tsx'): string[] {
  const file = ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, name.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)
  const out: string[] = []
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return
    if (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) || ts.isJsxText(node)) {
      const text = node.text.trim()
      if (text && !isIdentifierLike(text) && !ALLOWED.has(text)) out.push(text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

/** A `code span` in a description names a field, a route or an event (`board:postRemoved`), not the feature. */
const prose = (text: string) => text.replace(/`[^`]*`/g, '')

const offences = (texts: string[], rel = '') =>
  texts.flatMap((text) =>
    BANNED.filter((b) => !b.allowIn?.includes(rel) && b.pattern.test(prose(text))).map((b) => `${b.name}: “${text.slice(0, 120)}”`)
  )

describe('retired names stay retired (naming review 2026-11-05)', () => {
  it('in every string under app/, components/ and lib/', () => {
    const files = DIRS.flatMap(sources)
    expect(files.length).toBeGreaterThan(200)
    const found = files.flatMap((rel) => offences(copyIn(fs.readFileSync(path.join(ROOT, rel), 'utf8'), rel), rel).map((o) => `${rel} · ${o}`))
    expect(found).toEqual([])
  })

  it('catches each old name planted in copy', () => {
    const planted = [
      '<Text>The Board</Text>',
      "title: 'This board isn’t here'",
      "label: 'Hold to blend in'",
      'const t = `Blend with ${name}`',
      "toast: 'It’s a Blend'",
      "'Event Pass'",
      '<Text>DOOR PASS</Text>',
      "'2 spaces left'",
      "<Text>Liking as</Text>",
      "title=\"Help centre\"",
      '<Text>It’s mutual</Text>',
      "'You matched in the room'",
      "label: 'Like'",
      "label: 'Liked'",
      'const a = `You liked ${name}`',
      "hint: 'They’re only told if they like you back.'",
    ]
    for (const source of planted) expect({ source, hits: offences(copyIn(source)).length }).toEqual({ source, hits: 1 })
  })

  it('lets the new names, the brand, routes, keys and words that only contain “board” through', () => {
    const fine = [
      "<Text>The Lobby</Text>",
      "label: 'Hold to Blend’n'",
      "'Blend’n+ is on'",
      "'Mix with Nebula'",
      "router.push('/board/[eventId]')",
      "kind === 'blend'",
      'testID="board-top"',
      "'Open the dashboard'",
      "'Finish onboarding'",
      "'Copied to the clipboard'",
      "'Board gamers'",
      "// the Board, in a comment",
      "import { BoardEntry } from '../components/board/BoardSections'",
      "'The board closes when the doors open — the room is open instead'",
      'const t = `Like for ${crew}`',
      "'Liked for your crew'",
      "'You both waved'",
      "'That looks like an email'",
      "'Wave back'",
    ]
    for (const source of fine) expect({ source, hits: offences(copyIn(source)) }).toEqual({ source, hits: [] })
  })
})
