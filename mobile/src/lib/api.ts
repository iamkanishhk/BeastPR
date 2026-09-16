import Constants from "expo-constants";
import type { Goal } from "./onboarding-draft";

const envUrl = (process.env.EXPO_PUBLIC_API_URL ?? "")
  .toString()
  .trim()
  .replace(/\/+$/, "");

// The machine running `expo start` (from the Expo dev server address), so
// requests reach the backend on a physical device / emulator instead of the
// device's own localhost.
function devServerHost(): string | null {
  try {
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) {
      const host = hostUri.split(":")[0];
      if (host) return host;
    }
  } catch {
    // Fall through.
  }
  try {
    const go = (
      Constants as unknown as {
        expoGoConfig?: { debuggerHost?: string };
      }
    ).expoGoConfig;
    const host = go?.debuggerHost?.split(":")[0];
    if (host) return host;
  } catch {
    // Fall through.
  }
  return null;
}

function resolveApiUrl(): string {
  // An explicit, non-local override always wins.
  if (envUrl && !/localhost|127\.0\.0\.1/.test(envUrl)) return envUrl;

  const host = devServerHost();
  if (host) {
    let port = "3000";
    if (envUrl) {
      try {
        const parsed = new URL(envUrl);
        if (parsed.port) port = parsed.port;
      } catch {
        // Ignore malformed env value.
      }
    }
    return `http://${host}:${port}`;
  }

  return envUrl || "http://localhost:3000";
}

const API_URL = resolveApiUrl();

export type Profile = {
  id: string;
  clerk_id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  preferred_unit: "kg" | "lb";
  timezone: string;
  primary_goal: Goal | null;
  workout_routine: {
    days: string[];
    schedule: Record<string, string[]>;
  } | null;
  onboarding_completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SyncUserResponse = {
  profile: Profile;
};

export async function getProfile(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<SyncUserResponse> {
  const res = await fetch(`${API_URL}/api/profile`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get-profile failed (${res.status}): ${body}`);
  }

  return (await res.json()) as SyncUserResponse;
}

export async function syncUser(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<SyncUserResponse> {
  const res = await fetch(`${API_URL}/api/sync-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`sync-user failed (${res.status}): ${body}`);
  }

  return (await res.json()) as SyncUserResponse;
}

export type OnboardingPayload = {
  goal: Goal;
  days: string[];
  schedule: Record<string, string[]>;
  bodyweightKg: number | null;
  bodyweightUnit: "kg" | "lb";
  reminderDays: number | null;
  timezone: string;
};

export async function completeOnboarding(
  sessionToken: string,
  payload: OnboardingPayload,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${API_URL}/api/onboarding-complete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`onboarding-complete failed (${res.status}): ${body}`);
  }
}

export type MuscleGroup = {
  id: number;
  slug: string;
  name: string;
  display_order: number;
  is_primary_goal: boolean;
};

export async function getMuscleGroups(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<MuscleGroup[]> {
  const res = await fetch(`${API_URL}/api/muscle-groups`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get-muscle-groups failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { muscleGroups: MuscleGroup[] };
  return data.muscleGroups;
}

export async function updateRoutine(
  sessionToken: string,
  schedule: Record<string, string[]>,
  signal?: AbortSignal,
): Promise<{ days: string[]; schedule: Record<string, string[]> }> {
  const res = await fetch(`${API_URL}/api/profile/routine`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ schedule }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`update-routine failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    workout_routine: { days: string[]; schedule: Record<string, string[]> };
  };
  return data.workout_routine;
}

export type Exercise = {
  id: string;
  name: string;
  slug: string | null;
  is_compound: boolean;
  equipment: string;
  primary_muscle_group_id: number;
  muscle_name: string;
  best_1rm: number | null;
  pr_count: number;
  last_performed_at: string | null;
  relative_strength: number | null;
  pr_weight: number | null;
  pr_unit: "kg" | "lb" | null;
  pr_reps: number | null;
  pr_achieved_at: string | null;
};

export async function getExercises(
  sessionToken: string,
  muscles: string[],
  signal?: AbortSignal,
  ids: string[] = [],
): Promise<Exercise[]> {
  const params = new URLSearchParams();
  if (muscles.length) params.set("muscles", muscles.join(","));
  if (ids.length) params.set("ids", ids.join(","));
  const qs = params.size ? `?${params.toString()}` : "";
  const res = await fetch(`${API_URL}/api/exercises${qs}`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get-exercises failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { exercises: Exercise[] };
  return data.exercises;
}

export type ExerciseHistoryPoint = {
  performed_at: string;
  weight_kg: number;
  reps: number;
  estimated_1rm: number;
  is_new_best: boolean;
};

export async function getExerciseHistory(
  sessionToken: string,
  exerciseId: string,
  signal?: AbortSignal,
): Promise<ExerciseHistoryPoint[]> {
  const res = await fetch(
    `${API_URL}/api/exercises/${encodeURIComponent(exerciseId)}/history`,
    {
      headers: {
        Authorization: `Bearer ${sessionToken}`,
      },
      signal,
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get-exercise-history failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { history: ExerciseHistoryPoint[] };
  return data.history;
}

export type ComparisonResult =
  | "first_record"
  | "new_record"
  | "matched_record"
  | "no_record";

export type LogSetResponse = {
  set: {
    set_id: string;
    comparison: ComparisonResult;
    is_new_best: boolean;
    attempt_1rm: number | null;
    relative_strength: number | null;
    weight: number | null;
    unit: "kg" | "lb" | null;
    reps: number | null;
    achieved_at: string | null;
  };
  metric: {
    best_1rm: number | null;
    pr_count: number;
    last_performed_at: string | null;
    relative_strength: number | null;
  } | null;
};

export async function logTopSet(
  sessionToken: string,
  payload: {
    exerciseId: string;
    weight: number;
    reps: number;
    unit: "kg" | "lb";
  },
  signal?: AbortSignal,
): Promise<LogSetResponse> {
  const res = await fetch(`${API_URL}/api/pr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify(payload),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`log-set failed (${res.status}): ${body}`);
  }

  return (await res.json()) as LogSetResponse;
}

export type PrFeedRecord = {
  exercise_id: string;
  exercise_name: string;
  muscle_group_id: number;
  muscle_name: string;
  best_1rm: number | null;
  pr_count: number;
  relative_strength: number | null;
  last_performed_at: string | null;
  is_primary_goal: boolean;
  pr_weight: number | null;
  pr_unit: "kg" | "lb" | null;
  pr_reps: number | null;
};

export async function getLatestPrs(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<PrFeedRecord[]> {
  const res = await fetch(`${API_URL}/api/prs/latest`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get-latest-prs failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { records: PrFeedRecord[] };
  return data.records;
}

export type MuscleProgression = {
  muscle_group_id: number;
  muscle_name: string;
  slug: string;
  total_xp: number;
  display_level: number;
  current_xp: number;
  next_level_xp: number;
  progress_pct: number;
  starting_level: number;
  starting_weight_kg: number | null;
  best_weight_kg: number | null;
  best_reps: number | null;
  best_estimated_1rm: number | null;
};

export async function getProgression(
  sessionToken: string,
  signal?: AbortSignal,
): Promise<MuscleProgression[]> {
  const res = await fetch(`${API_URL}/api/progression`, {
    headers: {
      Authorization: `Bearer ${sessionToken}`,
    },
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`get-progression failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as { progression: MuscleProgression[] };
  return data.progression;
}

