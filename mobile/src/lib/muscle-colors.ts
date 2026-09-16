/**
 * Centralized muscle-group color map used across the app for consistent
 * per-muscle visual identity (dashboard, settings, continue, etc.).
 */
export const MUSCLE_COLORS: Record<string, string> = {
  Chest: "#f5b342",
  Back: "#7c5cff",
  Shoulders: "#ff6b6b",
  Biceps: "#42c6f5",
  Triceps: "#f5f542",
  Forearms: "#b342f5",
  Legs: "#42f5a7",
};

/** Fallback for unknown muscle names. */
export const DEFAULT_MUSCLE_COLOR = "#A0AAAA";

export function muscleColor(name: string): string {
  return MUSCLE_COLORS[name] ?? DEFAULT_MUSCLE_COLOR;
}
