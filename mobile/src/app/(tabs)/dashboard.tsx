import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuth, useUser } from "@clerk/expo";
import { COLORS } from "../../constants/theme";
import {
  getLatestPrs,
  getProfile,
  getProgression,
  syncUser,
  type MuscleProgression,
  type PrFeedRecord,
  type Profile,
} from "../../lib/api";
import { muscleColor } from "../../lib/muscle-colors";
import { onboardingDraft } from "../../lib/onboarding-draft";
import { persistUserAfterSignIn } from "../../lib/post-login";

const { width } = Dimensions.get("window");
const CARD_GAP = 12;
const CARD_WIDTH = (width - 40 - CARD_GAP) / 2;

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

function formatWeight(weight: number, from: "kg" | "lb", to: "kg" | "lb"): string {
  const value = from === to ? weight : to === "lb" ? weight * 2.20462 : weight / 2.20462;
  return `${Math.round(value)} ${to}`;
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

function formatXp(xp: number): string {
  return xp.toLocaleString("en-US");
}

export default function DashboardScreen() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const router = useRouter();
  const getTokenRef = useRef(getToken);
  const [routine, setRoutine] = useState<Profile["workout_routine"]>(null);
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [prs, setPrs] = useState<PrFeedRecord[] | null>(null);
  const [progression, setProgression] = useState<MuscleProgression[] | null>(null);
  const firstName = user?.firstName?.trim() || "Beast.";

  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await getTokenRef.current();
        if (!token) return;

        // Heal older sign-ins: a profile may not exist yet if the backend was
        // unreachable at sign-in time, and a pending pre-login draft may still
        // be sitting in SecureStore. Ensure the row + flush the draft first.
        await syncUser(token);
        const draft = (await onboardingDraft.load()) ?? onboardingDraft.get();
        if (draft) {
          await persistUserAfterSignIn(getTokenRef.current);
        }

        const { profile } = await getProfile(token);
        if (active) {
          setRoutine(profile.workout_routine);
          setUnit(profile.preferred_unit);
        }

        const records = await getLatestPrs(token);
        if (active) setPrs(records);

        const progress = await getProgression(token);
        if (active) setProgression(progress);
      } catch (err) {
        // Non-fatal: fall back to generic copy when the plan can't load.
        console.warn("dashboard routine fetch skipped:", err);
        if (active) {
          Alert.alert(
            "Couldn't load your plan",
            err instanceof Error ? err.message : String(err),
          );
        }
      }
    })();
    return () => {
      active = false;
    };
    // Load once on mount; getToken identity is unstable across renders.
  }, []);

  // Refresh XP progress + PR feed whenever the tab regains focus (e.g. after
  // logging a top set on the Continue screen) so the bars stay current.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      (async () => {
        try {
          const token = await getTokenRef.current();
          if (!token) return;

          const [progress, records] = await Promise.all([
            getProgression(token),
            getLatestPrs(token),
          ]);
          if (active) {
            setProgression(progress);
            setPrs(records);
          }
        } catch (err) {
          if (active) console.warn("dashboard refresh skipped:", err);
        }
      })();
      return () => {
        active = false;
      };
    }, []),
  );

  const todayName = DAY_NAMES[new Date().getDay()];
  const todayMuscles = routine?.schedule?.[todayName] ?? [];

const heroTitle = !routine
    ? "Let's Hit Gym"
    : todayMuscles.length
      ? `Let's Hit ${todayMuscles.join(" & ")}`
      : "Rest & Recover";

  return (
    <View style={styles.container}>
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&h=1200&q=80",
        }}
        style={styles.bgImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={[
          "rgba(8,8,8,0.75)",
          "rgba(8,8,8,0.50)",
          "rgba(8,8,8,0.98)",
        ]}
        style={styles.bgOverlay}
      />
      <View style={styles.ambientGlow} />

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.greetingHeader}>
            <Text style={styles.greetingSubHeader}>WELCOME BACK</Text>
            <Text style={styles.greetingText}>
              Good Morning,{"\n"}
              <Text style={styles.greetingAccent}>{firstName}</Text>
            </Text>
          </View>

          {/* Hero banner — today's muscle groups with level + XP progress */}
          <Pressable style={styles.heroCard} onPress={() => router.push("/continue")}>
            <Image
              source={{
                uri: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=600&q=80",
              }}
              style={styles.bgImg}
              resizeMode="cover"
            />
            <LinearGradient
              colors={["rgba(18,18,18,0.9)", "rgba(18,18,18,0.4)", "rgba(18,18,18,0.85)"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroContent}>
              <View style={styles.heroTextGroup}>
                <Text style={styles.heroBadge}>Today</Text>
                <Text style={styles.heroTitle}>{heroTitle}</Text>
              </View>
              <View style={styles.arrowBtn}>
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Path
                    d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"
                    fill={COLORS.dark}
                  />
                </Svg>
              </View>
            </View>

            <View style={styles.muscleProgressList}>
              {todayMuscles.map((name) => {
                const row = progression?.find((p) => p.muscle_name === name);
                const color = muscleColor(name);
                const pct = row ? Math.min(100, row.progress_pct) : 0;
                const nextXp = row?.next_level_xp ?? 500;
                const currentXp = row?.current_xp ?? 0;
                const level = row?.display_level ?? 0;
                return (
                  <View key={name} style={styles.muscleRow}>
                    <View style={styles.muscleRowHeader}>
                      <Text style={[styles.muscleName, { color }]}>{name}</Text>
                      <Text style={styles.muscleXp}>
                        {row
                          ? `Level ${level} · ${formatXp(currentXp)} / ${formatXp(nextXp)} XP`
                          : "Level 0"}
                      </Text>
                    </View>
                    <View style={styles.muscleTrack}>
                      <View
                        style={[
                          styles.muscleFill,
                          { width: `${pct}%`, backgroundColor: color },
                        ]}
                      />
                    </View>
                  </View>
                );
              })}
            </View>
          </Pressable>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>Latest Personal Records</Text>
          </View>

          {prs && prs.length === 0 ? (
            <View style={styles.emptyPrCard}>
              <Text style={styles.emptyPrTitle}>No PR found</Text>
              <Text style={styles.emptyPrSub}>
                Log your first top set to start tracking personal records here.
              </Text>
            </View>
          ) : (
            <View style={styles.prGrid}>
              {prs?.map((pr) => (
                <Pressable key={pr.exercise_id} style={styles.prCard}>
                  <LinearGradient
                    colors={["rgba(18,18,18,0.95)", "rgba(18,18,18,0.85)"]}
                    style={styles.prCardBg}
                  />
                  <View style={styles.prCardInfo}>
                    <Text style={styles.prMuscle}>{pr.muscle_name}</Text>
                    <Text style={styles.prExercise}>{pr.exercise_name}</Text>
                    <View style={styles.prStats}>
                      <View>
                        <Text style={styles.prWeight}>
                          {pr.pr_weight != null && pr.pr_unit && pr.pr_reps != null
                            ? `${formatWeight(pr.pr_weight, pr.pr_unit, unit)} × ${pr.pr_reps}`
                            : "—"}
                        </Text>
                        <Text style={styles.prHitTime}>{formatHitTime(pr.last_performed_at)}</Text>
                      </View>
                      <Text style={styles.prDelta}>
                        {pr.pr_count} PR{pr.pr_count === 1 ? "" : "s"}
                      </Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPitch,
  },
  bgImage: {
    ...StyleSheet.absoluteFill,
    opacity: 0.35,
  },
  bgOverlay: {
    ...StyleSheet.absoluteFill,
  },
  ambientGlow: {
    position: "absolute",
    top: -80,
    left: -60,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.accentGlow,
    opacity: 0.25,
  },
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  greetingHeader: {
    marginBottom: 24,
  },
  greetingSubHeader: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  greetingText: {
    fontSize: 32,
    fontWeight: "900",
    lineHeight: 38,
    textTransform: "uppercase",
    letterSpacing: -0.5,
    color: COLORS.white,
  },
  greetingAccent: {
    color: COLORS.accent,
  },
  heroCard: {
    minHeight: 140,
    backgroundColor: COLORS.cardPrimary,
    borderColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 18,
    justifyContent: "space-between",
    overflow: "hidden",
    marginBottom: 32,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
  },
  bgImg: {
    ...StyleSheet.absoluteFill,
  },
  heroContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 2,
  },
  heroTextGroup: {
    flexShrink: 1,
    paddingRight: 12,
  },
  heroBadge: {
    fontSize: 10,
    fontWeight: "800",
    color: COLORS.accent,
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.white,
    letterSpacing: -0.4,
    textTransform: "uppercase",
  },
  arrowBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 10,
    shadowOpacity: 0.3,
  },
  muscleProgressList: {
    zIndex: 2,
    marginTop: 16,
    gap: 12,
  },
  muscleRow: {
    gap: 6,
  },
  muscleRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  muscleName: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  muscleXp: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
  },
  muscleTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.15)",
    overflow: "hidden",
  },
  muscleFill: {
    height: "100%",
    borderRadius: 3,
  },
  sectionHeader: {
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.muted,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  prGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: CARD_GAP,
  },
  emptyPrCard: {
    backgroundColor: COLORS.cardPrimary,
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 28,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 4,
  },
  emptyPrTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  emptyPrSub: {
    fontSize: 12,
    fontWeight: "600",
    color: COLORS.muted,
    textAlign: "center",
    marginTop: 6,
    lineHeight: 18,
  },
  prCard: {
    width: CARD_WIDTH,
    height: 210,
    backgroundColor: COLORS.cardPrimary,
    borderColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderRadius: 20,
    padding: 10,
    justifyContent: "flex-end",
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  prCardBg: {
    ...StyleSheet.absoluteFill,
  },
  prCardInfo: {
    backgroundColor: "rgba(18, 18, 18, 0.85)",
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  prMuscle: {
    fontSize: 15,
    fontWeight: "900",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: -0.2,
  },
  prExercise: {
    fontSize: 11,
    fontWeight: "700",
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginTop: 1,
    marginBottom: 6,
  },
  prStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  prWeight: {
    fontSize: 12,
    fontWeight: "800",
    color: COLORS.white,
  },
  prHitTime: {
    fontSize: 10,
    fontWeight: "600",
    color: COLORS.muted,
    marginTop: 2,
  },
  prDelta: {
    fontSize: 11,
    fontWeight: "800",
    color: COLORS.trendGreen,
  },
});