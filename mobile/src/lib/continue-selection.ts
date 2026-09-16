import * as SecureStore from "expo-secure-store";

// Persists the exercises a user has added on the Continue screen so they
// reappear (with their logged PR + time) the next time the screen opens,
// even across days and app restarts.
const KEY_PREFIX = "beastpr.continue.selection";

const keyFor = (profileId: string) => `${KEY_PREFIX}.${profileId}`;

async function read(profileId: string): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(keyFor(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === "string")
      : [];
  } catch {
    return [];
  }
}

async function write(profileId: string, ids: string[]): Promise<void> {
  try {
    await SecureStore.setItemAsync(keyFor(profileId), JSON.stringify(ids));
  } catch {
    // Ignore storage failures; the in-memory list still works for this session.
  }
}

export const continueSelection = {
  load(profileId: string): Promise<string[]> {
    return read(profileId);
  },
  save(profileId: string, ids: string[]): Promise<void> {
    return write(profileId, ids);
  },
};