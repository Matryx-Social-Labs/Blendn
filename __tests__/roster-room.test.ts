import { readFileSync } from "fs"
import { join } from "path"

/**
 * The pseudonym comes from the room you are in, not the room anyone can watch.
 *
 * `event:{id}` is joinable by any authenticated user for any public event — the
 * client subscribes as soon as an event detail modal opens, to drive the live
 * counter. `event:checkin` carried `{ real userId, pseudonym }` into it, so
 * anyone could sit in every public room on the platform and harvest the
 * pseudonym-to-account mapping. That is the cross-event correlation the
 * pseudonyms exist to prevent, plus a record of which accounts attended which
 * events.
 *
 * The REST twin already answers this: `GET /events/:id/checkins` returns 403
 * with *"Check in to see who else is here"*. The socket side did not.
 */

const ROOT = join(__dirname, "..")

const code = (rel: string) =>
  readFileSync(join(ROOT, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")

describe("the roster arrives on its own room", () => {
  it("keeps identity off the event:checkin payload type", () => {
    const src = code("lib/socketClient.ts")
    const open = /"event:checkin": \(data: \{[^}]*\}/.exec(src)
    expect(open).not.toBeNull()
    expect(open![0]).not.toContain("userName")
    expect(open![0]).not.toContain("userImage")
  })

  it("declares a roster event that does carry it", () => {
    const src = code("lib/socketClient.ts")
    const roster = /"event:room:checkin": \(data: \{[^}]*\}/.exec(src)
    expect(roster).not.toBeNull()
    expect(roster![0]).toContain("userName")
  })

  it("joins the roster room separately, and rejoins it after a reconnect", () => {
    /*
     * A separate join because it has a separate gate. Missing it from the
     * rejoin path would be the quiet version of this bug: the roster works
     * until the first reconnect and then silently stops, which reads as "nobody
     * else is here".
     */
    const src = code("lib/socketClient.ts")
    expect(src).toMatch(/socket\.emit\("join:event:room", eventId\)/)
    expect(src).toMatch(/eventRoomCheckInSubscriptions\.forEach[\s\S]{0,80}?"join:event:room"/)
  })

  it("has the room read the name from the roster room", () => {
    /*
     * The room is the only consumer that wants the name — it builds the
     * attendee list live. `useRoom` subscribes only once it has a room, i.e.
     * once you are checked in, which is exactly the gate the roster room
     * applies, so nothing is lost.
     */
    const src = code("lib/useRoom.ts")
    expect(src).toMatch(/subscribeToEventRoomCheckIn\(eventId, /)
    expect(src).not.toMatch(/subscribeToEventCheckIn\(/)
    expect(src).toContain("if (!userId || !eventId) return")
  })

  it("leaves EventDetailScreen on the counter room", () => {
    /*
     * It never wanted the name. It compares `data.userId` to its own to notice
     * its own check-in, then refetches — both of which still work, and it must
     * keep working for somebody browsing an event they have not joined.
     */
    const src = code("components/screens/EventDetailScreen.tsx")
    expect(src).toMatch(/subscribeToEventCheckIn\(/)
    expect(src).not.toMatch(/subscribeToEventRoomCheckIn\(/)
  })
})
