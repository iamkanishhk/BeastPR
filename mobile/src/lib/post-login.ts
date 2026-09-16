import { completeOnboarding, syncUser } from "./api";
import { onboardingDraft } from "./onboarding-draft";

const deviceTimezone =
  (typeof Intl !== "undefined" &&
    Intl.DateTimeFormat().resolvedOptions().timeZone) ||
  "UTC";

// Serializes post-sign-in persistence so the login handler and the OAuth
// callback screen can both run it without duplicating rows.
let syncInFlight: Promise<void> | null = null;

async function doPersistUserAfterSignIn(
  getToken: () => Promise<string | null>,
): Promise<void> {
  let token: string | null = null;
  for (let i = 0; i < 40; i += 1) {
    try {
      token = await getToken();
    } catch {
      token = null;
    }
    if (token) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  if (!token) {
    throw new Error("No session token became available after sign-in");
  }

  await syncUser(token);

  const draft = (await onboardingDraft.load()) ?? onboardingDraft.get();
  if (draft) {
    await completeOnboarding(token, {
      goal: draft.goal,
      days: draft.days,
      schedule: draft.schedule,
      bodyweightKg: draft.bodyweightKg,
      bodyweightUnit: draft.bodyweightUnit,
      reminderDays: draft.reminderDays,
      timezone: deviceTimezone,
    });
    await onboardingDraft.clear();
  }
}

export function persistUserAfterSignIn(
  getToken: () => Promise<string | null>,
): Promise<void> {
  if (!syncInFlight) {
    syncInFlight = doPersistUserAfterSignIn(getToken).finally(() => {
      syncInFlight = null;
    });
  }
  return syncInFlight;
}