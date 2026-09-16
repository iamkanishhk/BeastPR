import * as SecureStore from "expo-secure-store";

export type Goal = "Strength" | "Aesthetic" | "Endurance";

export type OnboardingDraft = {
  goal: Goal;
  days: string[];
  schedule: Record<string, string[]>;
  bodyweightKg: number | null;
  bodyweightUnit: "kg" | "lb";
  reminderDays: 30 | 60 | null;
};

const STORAGE_KEY = "beastpr.onboarding.draft";

// The draft is persisted to SecureStore so it survives the app restart that
// commonly happens when OAuth bounces back to Expo Go through a deep link.
let draft: OnboardingDraft | null = null;

const persist = () => {
  if (!draft) return;
  void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(draft)).catch(
    () => {},
  );
};

export const onboardingDraft = {
  get(): OnboardingDraft | null {
    return draft;
  },
  set(patch: Partial<OnboardingDraft>) {
    draft = { ...(draft ?? ({} as OnboardingDraft)), ...patch };
    persist();
  },
  // Rehydrates from SecureStore when the in-memory copy was lost.
  async load(): Promise<OnboardingDraft | null> {
    if (draft) return draft;
    try {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY);
      if (raw) {
        draft = JSON.parse(raw) as OnboardingDraft;
        return draft;
      }
    } catch {
      // Ignore corrupt/missing entries.
    }
    return null;
  },
  async clear() {
    draft = null;
    try {
      await SecureStore.deleteItemAsync(STORAGE_KEY);
    } catch {
      // Ignore storage failures.
    }
  },
};