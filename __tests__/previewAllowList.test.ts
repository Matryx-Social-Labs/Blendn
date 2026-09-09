import { existsSync, readFileSync } from "fs"
import { join } from "path"

/**
 * The signed-out allow-list names a route prefix that actually exists.
 *
 * It named `/__preview` and the routes are `app/preview/*`. Every preview
 * screen therefore failed the allow-list and was replaced with `/` on the next
 * tick, so the design harness was unreachable in the one state it exists for —
 * signed out, in dev. Nothing failed: the symptom is a screen that appears and
 * vanishes, which reads as a render bug.
 *
 * The comment above it cited `app/__preview.tsx`, a file that has never
 * existed, so the prose agreed with the bug rather than the routes. That is the
 * class of defect this repo's sibling has counted twenty times.
 */
const root = join(__dirname, "..")
const layout = readFileSync(join(root, "app", "_layout.tsx"), "utf8")

// Comments first: a prefix quoted in prose must not satisfy an assertion about
// what the code does. This has produced a vacuous guard three times next door.
const code = layout.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "")

describe("the signed-out preview allow-list", () => {
  it("guards a prefix that exists on disk", () => {
    const match = code.match(/__DEV__\s*&&\s*pathname\.startsWith\('([^']+)'\)/)
    expect(match).not.toBeNull()

    const prefix = (match as RegExpMatchArray)[1].replace(/^\//, "")
    const asDirectory = join(root, "app", prefix)
    const asFile = join(root, "app", `${prefix}.tsx`)

    expect(existsSync(asDirectory) || existsSync(asFile)).toBe(true)
  })

  it("still admits the two signed-out screens that are not the index", () => {
    // Narrowing the allow-list is how `/sign-in` became unreachable once.
    expect(code).toContain("'/sign-in'")
    expect(code).toContain("'/forgot-password'")
  })
})
