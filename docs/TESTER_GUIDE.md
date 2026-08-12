# Testing Blend'n — a guide for testers

Thank you for doing this. You are looking at an app that has been built quickly,
and the parts that are wrong are wrong in ways we cannot see from the inside.

**You are not expected to break it.** You are expected to use it and tell us what
happened. If something confuses you, that is a finding — probably a more valuable
one than a crash, because we can find crashes ourselves.

## Three things before you start

**"I could not tell" is a real answer, and we want it.** If you cannot work out
whether something worked, the screen is unclear. That is our problem, not a
failure on your part. Please say so rather than guessing.

**Nothing here is real.** The accounts are fake, the event is invented, the other
"people" in the room are test accounts. Say anything you like in the chat.

**You cannot break anything permanently.** There is no real data and no real
money. Tap things.

---

## Getting set up

You will be sent:

- an invite to **TestFlight** (iPhone) or **Google Play** (Android)
- an **email address and password** to sign in with

Install the app from that invite, sign in with the details you were given, and
allow **location** when it asks. The app is about who is physically at an event,
so almost nothing works without it.

> **Android only:** you must tap the *opt-in link* in your invite before the app
> will appear for you. If you cannot find the app, that is nearly always why.

---

## How to tell us what happened

**If something looks wrong, broken, ugly or confusing — send a screenshot from
inside the app.**

| | |
|---|---|
| **iPhone** | Take a screenshot as normal, then open **TestFlight** → the app → **Send Feedback**. You can draw on the picture |
| **Android** | Play Store → the app → **Write a review**. Only we see it, not the public |

Doing it this way rather than texting us matters: it automatically attaches which
version you have and which phone you are on, which are the two things we always
need and would otherwise have to ask you for.

**For the checklist below, use the form we sent you** — one question per item, so
we know what was actually tried rather than only what went wrong.

---

## The checklist

Work through these in order. For each: do the steps, then say whether you saw
what is described.

### 1. The app opens

1. Tap the app icon.
2. **You should see:** a sign-in screen within a few seconds.
3. **Tell us if:** it closes immediately, hangs on a blank or black screen, or the
   icon itself looks wrong.

### 2. Signing in

1. Enter the email and password you were given.
2. **You should see:** the main screen, with a list of events.
3. **Tell us if:** nothing happens when you tap the button, or you are returned to
   the sign-in screen without any message.

### 3. Finding the event and checking in

1. Find the event called **The Long Room**.
2. Open it and check in.
3. **You should see:** confirmation that you are checked in.
4. **Tell us if:** it says you are too far away — and please say roughly where you
   are, since that is the interesting part.

### 4. The room

1. Go to the **Matches** tab.
2. **You should see:** a set of cards for other people at the event. Most have a
   made-up name like "Wandering Kestrel" and a blurred photo; a few show a real
   name and a clear photo.
3. **Tell us if:** you see a spinner that never stops, or a message saying you are
   not checked in when you know you just did.

> Both of those are old bugs we believe are fixed. If you see either, that is the
> single most useful thing you can report today.

### 5. Liking someone

1. Like a few people on the cards.
2. **You should see:** nothing dramatic. Liking is private — the other person is
   never told unless they like you back.
3. **Tell us if:** anything on screen suggests the other person can see that you
   liked them.

### 6. A conversation

1. Open **Messages** and find a conversation.
2. Send a message.
3. **You should see:** your message appear, and the other person shown by their
   made-up name, not a real one.
4. **Tell us if:** a real name appears anywhere before you have chosen to show
   yours — including while someone is typing.

### 7. Showing who you are

1. In a conversation, find the option to show the other person who you are.
2. Read what it says **before** you tap to confirm.
3. **You should see:** a clear warning that this cannot be undone.
4. Confirm it.
5. **You should see:** your real name and photo become visible to them. Yours
   still shows their made-up name until they do the same.
6. **Tell us if:** the warning was not clear, or you felt unsure what would happen
   before you tapped.

> This is the one we most want your honest reaction to. If it felt like a bigger
> step than you expected, or a smaller one, say so.

### 8. Leaving a conversation

1. In a conversation, open the options and look at the ways to leave.
2. **You should see:** separate choices — unmatch, unmatch and report, block and
   report — and text explaining what each one does.
3. **Do not actually leave** unless you want to; the conversation will not come
   back.
4. **Tell us if:** the difference between the options was not obvious.

### 9. Notifications

1. Lock your phone.
2. Ask us to trigger a notification for you.
3. **You should see:** a notification with **no name in it** — something like
   "You have a new match".
4. **Tell us if:** any name, real or made-up, appears on your lock screen.

> A locked phone can be seen by anyone holding it. A name there would be a
> serious problem, so this is worth checking carefully.

### 10. Anything else

Use the app for ten minutes as though it were real. Look at profiles, browse
events, change your settings.

**Tell us about anything that:** looked broken or unfinished, took longer than
you expected, made you unsure what would happen next, or that you simply did not
like.

---

## Two questions at the end

Worth more to us than the rest of the list:

1. **Was there any moment you felt uncomfortable** about what other people could
   see about you?
2. **Would you use this at a real event?** Please be honest — "no" is a useful
   answer and will not offend anyone.

---

## If you get stuck

Message us. A tester stuck on step 3 for twenty minutes is a bug report, not a
delay — please tell us early rather than pushing through.
