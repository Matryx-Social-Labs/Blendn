import { ScreenProfiler } from "../../lib/perf";
import { useEffect, useState } from "react";
import { BackHandler, StyleSheet, View } from "react-native";

import { Button } from "../../components/ds/Button";
import { ChipSet } from "../../components/ds/ChipSet";
import { DateField, type DateParts } from "../../components/ds/DateField";
import { Sheet } from "../../components/ds/Sheet";
import { TextField } from "../../components/ds/TextField";
import { OnboardingScreen } from "../../components/onboarding/OnboardingScreen";
import { useRefusedPulse } from "../../components/onboarding/useRefusedPulse";
import {
  ADULTS_ONLY,
  canContinue,
  DOB_TOO_OLD,
  isCompleteDateOfBirth,
  isOverAccountAge,
  isUnderAccountAge,
  joinDateOfBirth,
  NAME_LENGTH_SENTENCE,
  nameTooShort,
  splitDateOfBirth,
  type OnboardingGender,
} from "../../lib/onboarding";
import { SPACE } from "../../lib/design/tokens";
import { useOnboarding } from "../../lib/useOnboarding";
import { signOut, useAuth } from "../../lib/useAuth";
import {
  counterLimit,
  overCapMessage,
  PROFILE_LIMITS,
  serverLength,
} from "../../lib/profileLimits";

/**
 * Step one: a name, a gender, a birth date, as two screens inside the one step (direction A, one question per screen): the name,
 * then the birthday with the gender. Stored as one step, so resume and the five segments are unchanged.
 *
 * The only step that cannot be skipped. The birth date is why: every age rule
 * on the server derives from it, and an account without one is refused dating
 * and every event with a minimum age, permanently and silently.
 */

/**
 * The four options the API stores, each labelled as what it stores.
 *
 * The frames offer Woman, Man, Non-binary, **Other**, and the fourth chip was
 * labelled "Other" while it saved `prefer_not_to_say`. Someone choosing
 * "Other" is saying none of the three fit; we recorded that they declined to
 * answer, a different statement. The API's enum is
 * `woman | man | non_binary | prefer_not_to_say`, so the label now says what
 * is stored. An `other` value is still a question for the API
 * (`docs/ONBOARDING.md`).
 */
const GENDERS: { label: string; value: OnboardingGender }[] = [
  { label: "Woman", value: "woman" },
  { label: "Man", value: "man" },
  { label: "Non-binary", value: "non_binary" },
  { label: "Prefer not to say", value: "prefer_not_to_say" },
];

/** Under the birthday question. Profiles show the age (`/profiles/:id`), never the date. */
const DOB_SUBTITLE =
  "Blend’n is 18+. People see your age, never your birthday.";
/** Under the name question: what rooms show of it (SCRUM-493). */
const NAME_SUBTITLE =
  "In rooms you’re a made-up name until you choose to show yours. People you match or talk with see your name.";
const NOT_A_DATE = "That is not a date we recognise.";

function BasicsScreenInner() {
  const { draft, loaded, saving, commit, update } = useOnboarding("basics");

  const [name, setName] = useState("");
  // The length sentence waits for the person to leave the field: one letter typed is not yet a mistake.
  const [nameLeft, setNameLeft] = useState(false);
  const { refused, refuse } = useRefusedPulse();
  const [gender, setGender] = useState<OnboardingGender | undefined>();
  const [dob, setDob] = useState({ day: "", month: "", year: "" });
  const [page, setPage] = useState<"name" | "birthday">("name");
  // Android's back on the birthday screen goes to the name, as the header's back does, not out of the flow.
  useEffect(() => {
    if (page !== "birthday") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      setPage("name");
      return true;
    });
    return () => sub.remove();
  }, [page]);

  // Prefilled once storage has answered, not on every render — otherwise a
  // rehydrate landing mid-edit would overwrite what is being typed. Done during
  // the render that first sees `loaded`, so the fields never paint empty first.
  /*
   * The draft first, then the account.
   *
   * Sign-up creates the account WITH a name — `User.name` and `profiles.name`
   * both hold it — and this screen rendered the field empty, showing the
   * placeholder "e.g. Julian Ember". So somebody typed their name, tapped
   * Create account, and was asked for it again, blank, seconds later.
   *
   * The order matters and is not the obvious one: the draft wins, because a
   * draft value is something this person typed HERE and may be a correction of
   * the account name. The account is the seed for the first visit only, when
   * there is no draft to prefer.
   */
  const { user } = useAuth();

  const [prefilled, setPrefilled] = useState(false);
  if (loaded && !prefilled) {
    setPrefilled(true);
    setName(draft.name ?? user?.name ?? "");
    // A name already there (a resume, the account's) has been left: its sentence, if it needs one, shows at once.
    setNameLeft(!!(draft.name ?? user?.name));
    setGender(draft.gender);
    setDob(splitDateOfBirth(draft.dateOfBirth));
  }

  /*
   * The way out, on the one step with no back.
   *
   * Somebody who signed in with the wrong Google account, or who is under 18
   * and cannot continue, had no exit: no back button here, swipe-back off at
   * the root, and Settings is behind the flow. Confirmed first because it
   * ends the session; what they have typed stays on this phone (the draft is
   * keyed by account, and `leave` writes it first: the fields alone are screen
   * state, SCRUM-658), so signing back in resumes here.
   */
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const leave = async () => {
    setSigningOut(true);
    update(patch);
    // The root layout routes to the entry screen when the user clears.
    await signOut();
    setSigningOut(false);
    setConfirmSignOut(false);
  };

  const dateOfBirth = joinDateOfBirth(dob.day, dob.month, dob.year);
  const patch = { name: name.trim(), gender, dateOfBirth };
  // Never cut for the person: a paste past the server's cap stays on screen, says by how much, and Continue waits.
  const nameOverCap = serverLength(name) > PROFILE_LIMITS.name;
  const nameReady = !nameTooShort(name) && !nameOverCap;
  const ready = canContinue("basics", patch) && !nameOverCap;
  // Continue commits only when it could, and `commit` refuses a second save while one is running.
  const submit = () => {
    if (ready && !saving) void commit(patch);
  };
  // The name screen saves nothing to the server: the name goes in the draft, so a sign-out or a kill keeps it.
  const toBirthday = () => {
    if (!nameReady) return;
    update({ name: patch.name });
    setPage("birthday");
  };
  const onName = page === "name";

  /*
   * Why Continue is off, shown only once all three boxes are full
   * (`joinDateOfBirth` is undefined until then) — complaining while
   * someone is halfway through typing 1998 is nagging, not helping.
   *
   * Under 18 first: Blend'n is 18+ (SCRUM-330), and every Google and
   * Apple account passes this screen before it can finish onboarding.
   * Anything else that is not a usable birth date — 30 February, the
   * future — is "not a date". That branch used to test `!dateOfBirth`,
   * which is never true once the boxes are full, so it never showed.
   */
  const underAge = isUnderAccountAge(dateOfBirth);
  const tooOld = isOverAccountAge(dateOfBirth);
  const notADate =
    !underAge &&
    !tooOld &&
    !!dateOfBirth &&
    !isCompleteDateOfBirth(dateOfBirth);
  const dateError = underAge
    ? ADULTS_ONLY
    : tooOld
      ? DOB_TOO_OLD
      : notADate
        ? NOT_A_DATE
        : undefined;

  return (
    <OnboardingScreen
      step="basics"
      title={onName ? "What should we " : "When’s your "}
      titleAccent={onName ? "call you?" : "birthday?"}
      subtitle={onName ? NAME_SUBTITLE : DOB_SUBTITLE}
      ctaLabel="Continue"
      ctaDisabled={onName ? !nameReady : !ready}
      // Tapping the dead button says why, when why is the name: the sentence under it, and the primary's refusal.
      onCtaDisabledPress={() => {
        setNameLeft(true);
        refuse();
      }}
      ctaRefused={refused}
      ctaBusy={saving}
      onContinue={onName ? toBirthday : submit}
      onBack={onName ? undefined : () => setPage("name")}
      // Top-right, not under Continue: a way out beside the primary invited a mis-tap (Flow 2 walk).
      headerAction={{
        label: "Not you?",
        accessibilityLabel: "Not you? Sign out",
        onPress: () => setConfirmSignOut(true),
      }}
    >
      <>
        {/*
      Full name; a made-up name in rooms until the person shows theirs, and
      then the first word of it (`roomIdentity` + `firstName`, admin, SCRUM-493).

      `User.name` is one field and holds whatever signup wrote, so collecting
      the whole thing costs nothing and the room is protected by the pseudonym
      regardless — a full name is only ever seen by someone who has matched,
      opened a conversation, or been revealed to.
    */}
        {onName ? (
          <TextField
            label="Your name"
            placeholder="First and last name"
            value={name}
            onChangeText={setName}
            error={
              nameOverCap
                ? overCapMessage(PROFILE_LIMITS.name)
                : nameLeft && nameTooShort(name)
                  ? NAME_LENGTH_SENTENCE
                  : undefined
            }
            onBlur={() => setNameLeft(true)}
            limit={counterLimit(name, PROFILE_LIMITS.name)}
            measure={serverLength}
            autoCapitalize="words"
            // A name is not a word to correct.
            autoCorrect={false}
            autoComplete="name"
            textContentType="name"
            // The birth date is three boxes of its own, which the keyboard cannot walk to: done puts it away.
            returnKeyType="done"
            testID="onboarding-name"
          />
        ) : (
          <>
            <View style={styles.date}>
              <DateField
                label="Date of birth"
                value={[dob.day, dob.month, dob.year] as DateParts}
                onChange={([day, month, year]) => setDob({ day, month, year })}
                error={dateError}
                testID="onboarding-dob"
              />
              {/* Under 18 is a dead end on this account, so the exit sits beside the sentence. */}
              {underAge ? (
                <Button
                  label="Sign out"
                  kind="tertiary"
                  size="sm"
                  onPress={() => setConfirmSignOut(true)}
                  testID="onboarding-under-age-sign-out"
                />
              ) : null}
            </View>

            <ChipSet
              label="I am"
              items={GENDERS.map((option) => ({
                key: option.value,
                label: option.label,
              }))}
              selection="single"
              selected={gender ? [gender] : []}
              // Tapping the chosen one again clears it. Gender is optional and
              // there is otherwise no way back to "unanswered" once tapped.
              onToggle={(value) =>
                setGender(
                  gender === value ? undefined : (value as typeof gender),
                )
              }
              testID="onboarding-gender"
            />
          </>
        )}

        <Sheet
          visible={confirmSignOut}
          onClose={() => setConfirmSignOut(false)}
          icon="log-out"
          title="Sign out?"
          body="What you’ve filled in stays on this phone, so you can pick up here when you sign back in."
          actions={[
            {
              label: "Cancel",
              kind: "secondary",
              onPress: () => setConfirmSignOut(false),
              disabled: signingOut,
            },
            {
              label: "Sign out",
              kind: "primary",
              onPress: () => void leave(),
              loading: signingOut,
            },
          ]}
          testID="sign-out-sheet"
        />
      </>
    </OnboardingScreen>
  );
}

const styles = StyleSheet.create({
  date: { gap: SPACE.sm },
});

/*
 * Wrapped so `lib/perf.tsx` can report what this screen costs to render.
 * `ScreenProfiler` is the children untouched in production — see its header.
 */
export default function BasicsScreen() {
  return (
    <ScreenProfiler id="onboard-basics">
      <BasicsScreenInner />
    </ScreenProfiler>
  );
}
