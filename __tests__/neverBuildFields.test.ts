import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

/**
 * Never build (plan v2 §8.4, the owner's ruling of 2026-10-01): no caste,
 * community, religion, gotra, surname, kundli or guna score, skin tone, and no
 * veg / non-veg — in India a documented caste proxy. Not a field the app asks
 * for, sends, stores or shows. MV-G01 on the client; blendn-admin carries the
 * same guard over the schema and the API (`never-build-fields.test.ts`).
 *
 * Identifiers, not prose: object keys and identifier-shaped string literals
 * in app/, components/ and lib/, comments stripped — the comments that explain
 * the ruling name the words.
 *
 * Negative control (recorded in the PR body, the client has no registry):
 * a `diet` key in `lib/aboutYou.ts`'s `aboutYouUpdate` body fails "no field".
 */

const NEVER = new Set([
  'kundli', 'kundali', 'guna', 'manglik', 'nakshatra', 'varna', 'caste', 'jati', 'gotra', 'religion',
  'religious', 'surname', 'skin', 'veg', 'vegetarian', 'nonveg', 'eggetarian', 'diet', 'dietary',
])
const NEVER_AS_FIELD = new Set([...NEVER, 'community'])

const tokens = (id: string) =>
  id
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
const offending = (ids: string[], banned: Set<string>) => [...new Set(ids)].filter((id) => tokens(id).some((t) => banned.has(t)))
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/.*$/gm, '')
const keysOf = (src: string) => [...strip(src).matchAll(/([A-Za-z_$][\w$]*)\??\s*:/g)].map((m) => m[1])
const literalsOf = (src: string) => [...strip(src).matchAll(/["'`]([A-Za-z_][\w-]*)["'`]/g)].map((m) => m[1])

const ROOT = join(__dirname, '..')
function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry !== 'node_modules') sources(full, acc)
    } else if (/\.tsx?$/.test(entry)) acc.push(full)
  }
  return acc
}

describe('never build: caste, kundli, veg and their kin (MV-G01, client)', () => {
  it('sees what it guards (control)', () => {
    expect(offending(keysOf('const body = { nonVeg: true, diet: "x" }'), NEVER_AS_FIELD)).toEqual(['nonVeg', 'diet'])
    expect(offending(literalsOf("pick('non_veg')"), NEVER)).toEqual(['non_veg'])
    expect(keysOf('// a caste: never\nconst a = 1')).toEqual([])
  })

  it('no such field anywhere in the app', () => {
    const files = ['app', 'components', 'lib'].flatMap((d) => sources(join(ROOT, d)))
    expect(files.length).toBeGreaterThan(100)
    const found = files.flatMap((f) => {
      const src = readFileSync(f, 'utf8')
      return [...offending(keysOf(src), NEVER_AS_FIELD), ...offending(literalsOf(src), NEVER)].map((id) => `${relative(ROOT, f)} -> ${id}`)
    })
    expect(found).toEqual([])
  })
})
