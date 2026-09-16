import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "@clerk/expo";
import { COLORS } from "../constants/theme";
import Svg, { Line } from "react-native-svg";
import {
  getExercises,
  getProfile,
  logTopSet,
  type Exercise,
  type Profile,
} from "../lib/api";
import { continueSelection } from "../lib/continue-selection";
import { muscleColor } from "../lib/muscle-colors";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatWeight(kg: number, unit: "kg" | "lb"): string {
  const value = unit === "lb" ? kg * 2.20462 : kg;
  return `${Math.round(value)} ${unit}`;
}

function formatHitTime(iso: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export default function ContinueScreen() {
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [routine, setRoutine] = useState<Profile["workout_routine"]>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [active, setActive] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);

  const [addVisible, setAddVisible] = useState(false);
  const [prTarget, setPrTarget] = useState<Exercise | null>(null);
  const [prWeight, setPrWeight] = useState("");
  const [prReps, setPrReps] = useState("");
  const [prSaving, setPrSaving] = useState(false);
  const [prFeedback, setPrFeedback] = useState<string | null>(null);

  const todayName = DAY_NAMES[new Date().getDay()];
  const todayMuscles = routine?.schedule?.[todayName] ?? [];

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Persist the current working set whenever it changes, once the user id is
  // known (profile loads below). savePr also persists; this catches adds.
  const profileIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!profileIdRef.current) return;
    void continueSelection.save(
      profileIdRef.current,
      active.map((e) => e.id),
    );
  }, [active]);

  useEffect(() => {
    let activeFlag = true;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        const { profile } = await getProfile(token);
        if (!activeFlag) return;
        setRoutine(profile.workout_routine);
        setUnit(profile.preferred_unit);
        profileIdRef.current = profile.id;

        const muscles =
          profile.workout_routine?.schedule?.[DAY_NAMES[new Date().getDay()]] ??
          [];
        if (!activeFlag) return;
        setLibrary([]);

        const exercises = await getExercises(token, muscles);
        if (!activeFlag) return;
        setLibrary(exercises);

        const saved = await continueSelection.load(profile.id);
        if (saved.length) {
          const savedExercises = await getExercises(token, [], undefined, saved);
          if (!activeFlag) return;
          setActive(savedExercises);
        }
      } catch (err) {
        console.warn("continue load skipped:", err);
      } finally {
        if (activeFlag) setLoading(false);
      }
    })();
    return () => {
      activeFlag = false;
    };
    // Load once on mount; getToken identity is unstable across renders.
  }, []);

  const customExercises = useMemo(
    () =>
      library.filter(
        (ex) => !active.some((a) => a.id === ex.id),
      ),
    [library, active],
  );

  const onAddExercise = useCallback((exercise: Exercise) => {
    setActive((prev) =>
      prev.some((a) => a.id === exercise.id) ? prev : [...prev, exercise],
    );
    setAddVisible(false);
  }, []);

  const openPrModal = useCallback((exercise: Exercise) => {
    setPrTarget(exercise);
    setPrWeight("");
    setPrReps("8");
    setPrFeedback(null);
  }, []);

  const savePr = useCallback(async () => {
    if (!prTarget) return;

    const weight = Number(prWeight);
    const reps = Number(prReps);
    if (!Number.isFinite(weight) || weight <= 0) {
      setPrFeedback("Enter a weight above 0");
      return;
    }
    if (!Number.isInteger(reps) || reps <= 0) {
      setPrFeedback("Enter a positive whole number of reps");
      return;
    }

    setPrSaving(true);
    setPrFeedback(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not signed in");

      const result = await logTopSet(token, {
        exerciseId: prTarget.id,
        weight,
        reps,
        unit,
      });

      setActive((prev) =>
        prev.map((ex) => {
          if (ex.id !== prTarget.id) return ex;
          const metric = result.metric;
          const hit = result.set.is_new_best;
          return {
            ...ex,
            best_1rm: metric?.best_1rm ?? result.set.attempt_1rm ?? ex.best_1rm,
            pr_count: metric?.pr_count ?? ex.pr_count,
            last_performed_at: metric?.last_performed_at ?? ex.last_performed_at,
            pr_weight: hit ? result.set.weight ?? weight : ex.pr_weight,
            pr_unit: hit ? result.set.unit ?? unit : ex.pr_unit,
            pr_reps: hit ? result.set.reps ?? reps : ex.pr_reps,
            pr_achieved_at: hit
              ? result.set.achieved_at ?? new Date().toISOString()
              : ex.pr_achieved_at,
          };
        }),
      );

      setPrFeedback(
        result.set.is_new_best
          ? result.set.comparison === "first_record"
            ? "First PR logged! 🔥"
            : "New PR! 🎉"
          : "Logged — matched or below current PR",
      );
      setTimeout(() => {
        setPrTarget(null);
        setPrFeedback(null);
      }, 1400);
    } catch (err) {
      console.warn("set-pr failed:", err);
      setPrFeedback(err instanceof Error ? err.message : String(err));
    } finally {
      setPrSaving(false);
    }
  }, [getToken, prTarget, prWeight, prReps, unit]);

  const hasFocus = todayMuscles.length > 0;
  const heading = hasFocus
    ? todayMuscles.join(" & ")
    : "Rest & Recover";

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&h=1200&q=80",
        }}
        style={styles.bgImage}
        resizeMode="contain"
      />
      <LinearGradient
        colors={[
          "rgba(8,8,8,0.55)",
          "rgba(8,8,8,0.35)",
          "rgba(8,8,8,0.95)",
        ]}
        style={styles.bgOverlay}
      />
      <View style={styles.ambientGlow} />

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          style={styles.scroll}
        >
          <View style={styles.headerBar}>
            <Text style={styles.headerText}>Continue</Text>
            <Pressable
              style={styles.addBtn}
              aria-label="Add Exercise"
              onPress={() => setAddVisible(true)}
            >
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                <Line
                  x1={12}
                  y1={5}
                  x2={12}
                  y2={19}
                  stroke={COLORS.white}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                <Line
                  x1={5}
                  y1={12}
                  x2={19}
                  y2={12}
                  stroke={COLORS.white}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          </View>

          <View style={styles.dayBanner}>
            <Text style={styles.dayBannerLabel}>TODAY</Text>
            <Text style={styles.dayBannerTitle}>{heading}</Text>
            <Text style={styles.dayBannerSub}>
              {hasFocus
                ? "Your target muscles for today"
                : "No training scheduled — add an exercise anytime"}
            </Text>
          </View>

          {loading ? (
            <View style={styles.centerBox}>
              <ActivityIndicator color={COLORS.accent} size="large" />
            </View>
          ) : active.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>No exercises yet</Text>
              <Text style={styles.emptySub}>
                Tap the + button to add an exercise and start logging PRs.
              </Text>
            </View>
          ) : (
            <View style={styles.list}>
              {active.map((exercise) => {
                const hasPr = exercise.pr_weight != null && exercise.pr_reps != null;
                return (
                  <Pressable
                    key={exercise.id}
                    style={styles.exerciseCard}
                    onPress={() => openPrModal(exercise)}
                  >
                    <View>
                      <View style={styles.cardBadgeRow}>
                        <Text
                          style={[
                            styles.badge,
                            {
                              borderColor: muscleColor(exercise.muscle_name),
                              color: muscleColor(exercise.muscle_name),
                            },
                          ]}
                        >
                          {exercise.muscle_name}
                        </Text>
                        {exercise.is_compound ? (
                          <Text style={styles.compoundBadge}>Compound</Text>
                        ) : null}
                      </View>
                      <Text style={styles.exerciseName}>{exercise.name}</Text>
                      <Text style={styles.setData}>
                        {hasPr
                          ? `${formatWeight(exercise.pr_weight!, exercise.pr_unit ?? unit)} × ${exercise.pr_reps}`
                          : exercise.best_1rm != null
                            ? `${formatWeight(exercise.best_1rm, unit)} e1RM`
                            : "No PR yet"}
                      </Text>
                      <Text style={styles.prCount}>
                        {exercise.pr_count > 0 && exercise.pr_achieved_at
                          ? `${exercise.pr_count} PR${exercise.pr_count === 1 ? "" : "s"} • hit ${formatHitTime(exercise.pr_achieved_at)}`
                          : exercise.pr_count > 0
                            ? `${exercise.pr_count} PR${exercise.pr_count === 1 ? "" : "s"} logged`
                            : "Log your first top set"}
                      </Text>
                    </View>
                    <View style={styles.prContainer}>
                      <Text style={styles.prLabel}>Set PR</Text>
                      <View style={styles.prPill}>
                        <Text style={styles.prValue}>Log Top Set</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      {/* Add-exercise modal: suggestions from today's muscle groups */}
      <Modal
        visible={addVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalBackdropTouch}
            onPress={() => setAddVisible(false)}
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {hasFocus ? `Add for ${heading}` : "Add Exercise"}
            </Text>
            {library.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>No exercises found</Text>
                <Text style={styles.emptySub}>
                  {hasFocus
                    ? `Nothing in the library for ${heading} yet.`
                    : "No training is scheduled for today."}
                </Text>
              </View>
            ) : customExercises.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyTitle}>All added</Text>
                <Text style={styles.emptySub}>
                  Every {heading || "exercise"} is already on your list.
                </Text>
              </View>
            ) : (
              <ScrollView
                style={styles.modalList}
                showsVerticalScrollIndicator={false}
              >
                {customExercises.map((exercise) => (
                  <Pressable
                    key={exercise.id}
                    style={styles.modalRow}
                    onPress={() => onAddExercise(exercise)}
                  >
                    <View style={styles.modalRowInfo}>
                      <Text style={styles.modalRowName}>{exercise.name}</Text>
                      <Text style={styles.modalRowMeta}>
                        {exercise.muscle_name}
                        {exercise.is_compound
                          ? "  •  Compound"
                          : ""}
                      </Text>
                    </View>
                    <View style={styles.modalRowPlus}>
                      <Text style={styles.modalRowPlusText}>+</Text>
                    </View>
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Set-PR modal: weight + reps, then log a top set */}
      <Modal
        visible={prTarget != null}
        transparent
        animationType="slide"
        onRequestClose={() => setPrTarget(null)}
      >
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <Pressable
            style={styles.modalBackdropTouch}
            onPress={() => setPrTarget(null)}
          />
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>
              {prTarget ? prTarget.name : ""}
            </Text>
            <Text style={styles.modalSub}>
              Log your best set of the day
            </Text>

            <View style={styles.inputRow}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Weight ({unit})</Text>
                <TextInput
                  style={styles.input}
                  value={prWeight}
                  onChangeText={setPrWeight}
                  keyboardType="decimal-pad"
                  placeholder="e.g. 100"
                  placeholderTextColor={COLORS.muted}
                />
              </View>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Reps</Text>
                <TextInput
                  style={styles.input}
                  value={prReps}
                  onChangeText={setPrReps}
                  keyboardType="number-pad"
                  placeholder="e.g. 8"
                  placeholderTextColor={COLORS.muted}
                />
              </View>
            </View>

            {prFeedback ? (
              <Text style={styles.prFeedback}>{prFeedback}</Text>
            ) : null}

            <Pressable
              style={[styles.saveBtn, prSaving && styles.saveBtnDisabled]}
              onPress={savePr}
              disabled={prSaving}
            >
              {prSaving ? (
                <ActivityIndicator color={COLORS.dark} />
              ) : (
                <Text style={styles.saveBtnText}>Save PR</Text>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPitch,
    overflow: "hidden",
  },
  bgImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0.45,
  },
  bgOverlay: {
    position: "absolute",
    inset: 0,
  },
  ambientGlow: {
    position: "absolute",
    top: -50,
    right: -50,
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: COLORS.accentGlow,
    opacity: 0.35,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  headerBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 20,
  },
  headerText: {
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    textTransform: "uppercase",
    color: COLORS.white,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 14,
  },
  addBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardPrimary,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBanner: {
    backgroundColor: COLORS.cardPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 20,
  },
  dayBannerLabel: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.accent,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  dayBannerTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.white,
    letterSpacing: -0.3,
    textTransform: "uppercase",
  },
  dayBannerSub: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: "600",
    marginTop: 4,
  },
  centerBox: {
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyCard: {
    backgroundColor: COLORS.cardPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.white,
    marginBottom: 6,
  },
  emptySub: {
    fontSize: 13,
    color: COLORS.muted,
    textAlign: "center",
    lineHeight: 19,
  },
  list: {
    gap: 14,
  },
  exerciseCard: {
    backgroundColor: COLORS.cardPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 18,
    padding: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 4,
  },
  cardBadgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 8,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.cardSecondary,
    borderColor: COLORS.border,
    borderWidth: 1,
    color: COLORS.muted,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  compoundBadge: {
    alignSelf: "flex-start",
    backgroundColor: COLORS.accentGlow,
    color: COLORS.white,
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  exerciseName: {
    fontSize: 24,
    fontWeight: "800",
    color: COLORS.white,
    letterSpacing: -0.3,
    marginBottom: 6,
  },
  setData: {
    fontSize: 28,
    fontWeight: "900",
    color: COLORS.accent,
    letterSpacing: -0.5,
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  prCount: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 4,
  },
  prContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    backgroundColor: COLORS.black07,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  prLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  prPill: {
    backgroundColor: COLORS.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  prValue: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.dark,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  modalBackdropTouch: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalSheet: {
    backgroundColor: COLORS.cardPrimary,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 40,
    maxHeight: "75%",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  modalSub: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: "600",
    marginTop: 2,
    marginBottom: 16,
  },
  modalList: {
    marginTop: 8,
  },
  modalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(255,255,255,0.08)",
  },
  modalRowInfo: {
    flexShrink: 1,
    paddingRight: 12,
  },
  modalRowName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.white,
  },
  modalRowMeta: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 2,
  },
  modalRowPlus: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  modalRowPlusText: {
    fontSize: 18,
    fontWeight: "900",
    color: COLORS.dark,
    lineHeight: 22,
  },
  inputRow: {
    flexDirection: "row",
    gap: 12,
  },
  inputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    backgroundColor: COLORS.cardSecondary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "700",
  },
  prFeedback: {
    fontSize: 13,
    fontWeight: "700",
    color: COLORS.trendGreen,
    marginTop: 12,
  },
  saveBtn: {
    marginTop: 20,
    height: 52,
    borderRadius: 26,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
  },
  saveBtnDisabled: {
    opacity: 0.6,
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: "900",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    color: COLORS.dark,
  },
});