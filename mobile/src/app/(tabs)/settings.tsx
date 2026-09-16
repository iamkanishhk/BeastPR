import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { useAuth, useClerk, useUser } from "@clerk/expo";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Polyline } from "react-native-svg";
import { COLORS } from "../../constants/theme";
import {
  getMuscleGroups,
  getProfile,
  updateRoutine,
  type MuscleGroup,
} from "../../lib/api";
import { MUSCLE_COLORS } from "../../lib/muscle-colors";

const INTERVALS = ["Every 1 Month", "Every 2 Months", "Every 4 Months"] as const;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export default function SettingsScreen() {
  const router = useRouter();
  const { user } = useUser();
  const { signOut } = useClerk();
  const { getToken } = useAuth();
  const getTokenRef = useRef(getToken);
  const [reminderStatus, setReminderStatus] = useState("Every 1 Month");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedInterval, setSelectedInterval] = useState("Every 1 Month");
  const [signingOut, setSigningOut] = useState(false);

  const [routineOpen, setRoutineOpen] = useState(false);
  const [savingRoutine, setSavingRoutine] = useState(false);
  const [muscleGroups, setMuscleGroups] = useState<MuscleGroup[]>([]);
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});
  const [loadedRoutine, setLoadedRoutine] = useState(false);

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  // Load the saved routine + muscle groups once for the editor.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;
        const [{ profile }, groups] = await Promise.all([
          getProfile(token),
          getMuscleGroups(token),
        ]);
        if (!active) return;
        setSchedule(profile.workout_routine?.schedule ?? {});
        setMuscleGroups(groups);
        setLoadedRoutine(true);
      } catch (err) {
        console.warn("settings routine load skipped:", err);
      }
    })();
    return () => {
      active = false;
    };
    // Load once on mount; getToken identity is unstable across renders.
  }, []);

  const firstName = user?.firstName?.trim() ?? "";
  const lastName = user?.lastName?.trim() ?? "";
  const displayName =
    [firstName, lastName].filter(Boolean).join(" ") ||
    user?.username ||
    user?.primaryEmailAddress?.emailAddress?.split("@")[0] ||
    "Beast";
  const email = user?.primaryEmailAddress?.emailAddress ?? null;
  const initials = [firstName, lastName]
    .filter(Boolean)
    .map((n) => n[0]?.toUpperCase())
    .join("") || "B";

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err) {
      console.error("sign out error:", err);
      Alert.alert("Sign out failed", "Something went wrong. Please try again.");
    } finally {
      setSigningOut(false);
    }
  };

  const toggleMuscleForDay = (day: string, muscle: string) => {
    setSchedule((prev) => {
      const current = prev[day] ?? [];
      const has = current.includes(muscle);
      const next = has
        ? current.filter((m) => m !== muscle)
        : [...current, muscle];
      const copy = { ...prev };
      if (next.length === 0) {
        delete copy[day];
      } else {
        copy[day] = next;
      }
      return copy;
    });
  };

  const saveRoutine = async () => {
    if (savingRoutine) return;
    setSavingRoutine(true);
    try {
      const token = await getTokenRef.current();
      if (!token) throw new Error("Not signed in");
      const response = await updateRoutine(token, schedule);
      setSchedule(response.schedule);
      Alert.alert(
        "Routine saved",
        "Your weekly routine is updated.",
      );
      setRoutineOpen(false);
    } catch (err) {
      console.error("save routine error:", err);
      Alert.alert(
        "Couldn't save routine",
        err instanceof Error ? err.message : String(err),
      );
    } finally {
      setSavingRoutine(false);
    }
  };

  const trainingDayCount = Object.values(schedule).filter(
    (muscles) => muscles.length > 0,
  ).length;

  return (
    <View style={styles.container}>
      <View style={styles.ambientGlow} />

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <Text style={styles.headerTitle}>
          App{"\n"}
          <Text style={styles.headerAccent}>Settings</Text>
        </Text>

        <ScrollView
          style={styles.settingsList}
          contentContainerStyle={styles.settingsContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.profileCard}>
            <View style={styles.avatarWrap}>
              {user?.imageUrl ? (
                <Image
                  source={{ uri: user.imageUrl }}
                  style={styles.avatar}
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{initials}</Text>
                </View>
              )}
            </View>
            <View style={styles.profileInfo}>
              <Text style={styles.profileName}>{displayName}</Text>
              <Text style={styles.profileEmail} numberOfLines={1}>
                {email ?? "No email associated"}
              </Text>
              {user?.username ? (
                <Text style={styles.profileUsername}>@{user.username}</Text>
              ) : null}
            </View>
          </View>

          <Text style={styles.settingsSectionTitle}>Reminders & Tracking</Text>

          <Pressable
            style={styles.settingCard}
            onPress={() => setDrawerOpen(true)}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                    stroke={COLORS.accent}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Bodyweight Reminders</Text>
                <Text style={styles.settingSubtitle}>{reminderStatus}</Text>
              </View>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Polyline
                points="9 18 15 12 9 6"
                stroke={COLORS.mutedAlt}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>

          <Text style={styles.settingsSectionTitle}>Workout Routines</Text>

          <Pressable
            style={styles.settingCard}
            onPress={() => setRoutineOpen(true)}
            disabled={!loadedRoutine}
          >
            <View style={styles.settingInfo}>
              <View style={styles.settingIcon}>
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M18.36 6.64a9 9 0 1 1-12.73 0"
                    stroke={COLORS.accent}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                  <Path
                    d="M12 2v10"
                    stroke={COLORS.accent}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </Svg>
              </View>
              <View style={styles.settingText}>
                <Text style={styles.settingTitle}>Weekly Routine</Text>
                <Text style={styles.settingSubtitle}>
                  {loadedRoutine
                    ? trainingDayCount
                      ? `${trainingDayCount} training day${trainingDayCount === 1 ? "" : "s"} scheduled`
                      : "No training days scheduled yet"
                    : "Loading…"}
                </Text>
              </View>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Polyline
                points="9 18 15 12 9 6"
                stroke={COLORS.mutedAlt}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Pressable>

          <Pressable
            style={styles.btnSignOut}
            onPress={handleSignOut}
            disabled={signingOut}
          >
            {signingOut ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <>
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M16 17l5-5-5-5M21 12H9M17 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"
                    stroke={COLORS.white}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
                <Text style={styles.btnSignOutText}>Sign Out</Text>
              </>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>

      {/* Drawer overlay */}
      {drawerOpen && (
        <View style={styles.overlayContainer} pointerEvents="box-none">
          <Pressable
            style={styles.drawerOverlay}
            onPress={() => setDrawerOpen(false)}
          />
          <View style={styles.drawer}>
            <View style={styles.drawerHandle} />
            <Text style={styles.drawerHeader}>
              Weight{"\n"}
              <Text style={styles.drawerHeaderAccent}>Reminders</Text>
            </Text>

            <Text style={styles.drawerDescription}>
              Select how often you want to log your bodyweight:
            </Text>

            <View style={styles.intervalOptions}>
              {INTERVALS.map((interval) => {
                const selected = selectedInterval === interval;
                return (
                  <Pressable
                    key={interval}
                    style={[
                      styles.intervalCard,
                      selected && styles.intervalCardSelected,
                    ]}
                    onPress={() => setSelectedInterval(interval)}
                  >
                    <Text style={styles.intervalLabel}>
                      {interval.replace("Every ", "")}
                    </Text>
                    <View
                      style={[
                        styles.radioCircle,
                        selected && styles.radioCircleSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.radioDot,
                          selected && styles.radioDotSelected,
                        ]}
                      />
                    </View>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              style={styles.btnAction}
              onPress={() => {
                setReminderStatus(selectedInterval);
                setDrawerOpen(false);
              }}
            >
              <Text style={styles.btnActionText}>Save Interval</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Weekly routine editor */}
      {routineOpen && (
        <View style={styles.overlayContainer}>
          <Pressable
            style={styles.modalOverlay}
            onPress={() => setRoutineOpen(false)}
          />
          <View style={styles.routineModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Weekly{"\n"}
                <Text style={styles.modalTitleAccent}>Routine</Text>
              </Text>
              <Pressable
                onPress={() => setRoutineOpen(false)}
                aria-label="Close"
              >
                <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                  <Path
                    d="M18 6L6 18M6 6l12 12"
                    stroke={COLORS.mutedAlt}
                    strokeWidth={2.5}
                    strokeLinecap="round"
                  />
                </Svg>
              </Pressable>
            </View>

            <Text style={styles.modalDescription}>
              Assign which muscle groups you train on each day. These feed the
              dashboard and your daily suggestions.
            </Text>

            <ScrollView
              style={styles.routineScroll}
              showsVerticalScrollIndicator={false}
            >
              {DAY_NAMES.map((day) => {
                const dayMuscles = schedule[day] ?? [];
                return (
                  <View key={day} style={styles.dayBlock}>
                    <Text style={styles.dayName}>{day}</Text>
                    <View style={styles.dayMuscleRow}>
                      {muscleGroups.length === 0 ? (
                        <Text style={styles.dayEmpty}>
                          {dayMuscles.length
                            ? dayMuscles.join(" / ")
                            : "Rest day"}
                        </Text>
                      ) : (
                        <>
                          {dayMuscles.map((muscle) => (
                            <Pressable
                              key={muscle}
                              style={[
                                styles.muscleChipOn,
                                {
                                  borderColor:
                                    MUSCLE_COLORS[muscle] ?? COLORS.accent,
                                },
                              ]}
                              onPress={() => toggleMuscleForDay(day, muscle)}
                              aria-label={`Remove ${muscle} on ${day}`}
                            >
                              <Text
                                style={[
                                  styles.muscleChipTextOn,
                                  {
                                    color:
                                      MUSCLE_COLORS[muscle] ?? COLORS.accent,
                                  },
                                ]}
                              >
                                {muscle} ✕
                              </Text>
                            </Pressable>
                          ))}
                          {muscleGroups
                            .filter((mg) => !dayMuscles.includes(mg.name))
                            .map((mg) => (
                              <Pressable
                                key={mg.id}
                                style={styles.muscleChipOff}
                                onPress={() =>
                                  toggleMuscleForDay(day, mg.name)
                                }
                                aria-label={`Add ${mg.name} on ${day}`}
                              >
                                <Text style={styles.muscleChipTextOff}>
                                  + {mg.name}
                                </Text>
                              </Pressable>
                            ))}
                        </>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <Pressable
              style={[styles.btnAction, savingRoutine && styles.btnActionDisabled]}
              onPress={saveRoutine}
              disabled={savingRoutine}
            >
              {savingRoutine ? (
                <ActivityIndicator color={COLORS.dark} />
              ) : (
                <Text style={styles.btnActionText}>Save Routine</Text>
              )}
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

const fill = {
  position: "absolute" as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPitchAlt,
    overflow: "hidden",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  ambientGlow: {
    position: "absolute",
    top: -60,
    right: -40,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: COLORS.accentFaint,
    opacity: 0.35,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    letterSpacing: -0.5,
    textTransform: "uppercase",
    color: COLORS.white,
    marginTop: 16,
    marginBottom: 24,
  },
  headerAccent: {
    color: COLORS.accent,
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  profileCard: {
    backgroundColor: COLORS.cardSolid,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: "hidden",
    backgroundColor: COLORS.accentFaint,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: "100%",
    height: "100%",
  },
  avatarFallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarFallbackText: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.accent,
  },
  profileInfo: {
    flex: 1,
    gap: 2,
  },
  profileName: {
    fontSize: 17,
    fontWeight: "900",
    color: COLORS.white,
    letterSpacing: -0.3,
  },
  profileEmail: {
    fontSize: 12.5,
    fontWeight: "500",
    color: COLORS.mutedAlt,
  },
  profileUsername: {
    fontSize: 12,
    fontWeight: "700",
    color: COLORS.accent,
  },
  btnSignOut: {
    height: 50,
    borderRadius: 25,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.cardSolid,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginTop: 8,
  },
  btnSignOutText: {
    fontSize: 14,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.white,
  },
  settingsList: {
    flex: 1,
  },
  settingsContent: {
    gap: 16,
    paddingBottom: 24,
  },
  settingsSectionTitle: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    color: COLORS.muted,
    letterSpacing: 1.2,
    marginTop: 8,
    marginBottom: -4,
  },
  settingCard: {
    backgroundColor: COLORS.cardSolid,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 18,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  settingIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.cardSolidSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  settingText: {
    gap: 2,
  },
  settingTitle: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.white,
  },
  settingSubtitle: {
    fontSize: 12,
    color: COLORS.mutedAlt,
    fontWeight: "500",
  },
  overlayContainer: {
    ...fill,
    justifyContent: "flex-end",
  },
  drawerOverlay: {
    ...fill,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  drawer: {
    backgroundColor: COLORS.cardSolid,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 10,
  },
  drawerHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  drawerHeader: {
    fontSize: 20,
    fontWeight: "900",
    textTransform: "uppercase",
    color: COLORS.white,
    marginBottom: 4,
  },
  drawerHeaderAccent: {
    color: COLORS.accent,
  },
  drawerDescription: {
    fontSize: 13,
    color: COLORS.mutedAlt,
    marginTop: 12,
    marginBottom: 16,
  },
  intervalOptions: {
    gap: 10,
    marginBottom: 20,
  },
  intervalCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.cardSolidSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  intervalCardSelected: {
    borderColor: COLORS.accent,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 1,
  },
  intervalLabel: {
    fontSize: 15,
    fontWeight: "800",
    color: COLORS.white,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  radioCircleSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.accent,
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.dark,
    display: "none",
  },
  radioDotSelected: {
    display: "flex",
  },
  modalOverlay: {
    ...fill,
    position: "absolute",
    backgroundColor: "rgba(0,0,0,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  routineModal: {
    width: "100%",
    maxHeight: "85%",
    padding: 20,
    backgroundColor: COLORS.cardSolid,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.8,
    shadowRadius: 40,
    elevation: 12,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "900",
    textTransform: "uppercase",
    color: COLORS.white,
  },
  modalTitleAccent: {
    color: COLORS.accent,
  },
  modalDescription: {
    fontSize: 12,
    color: COLORS.mutedAlt,
    marginBottom: 14,
  },
  routineScroll: {
    flexGrow: 0,
    marginBottom: 12,
  },
  dayBlock: {
    marginBottom: 14,
  },
  dayName: {
    fontSize: 13,
    fontWeight: "800",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  dayMuscleRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  dayEmpty: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: "600",
  },
  muscleChipOn: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: COLORS.cardSolidSecondary,
  },
  muscleChipTextOn: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  muscleChipOff: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "transparent",
  },
  muscleChipTextOff: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.mutedAlt,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  btnAction: {
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    shadowOpacity: 1,
  },
  btnActionDisabled: {
    opacity: 0.6,
  },
  btnActionText: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    color: COLORS.dark,
  },
});