import { useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import { COLORS } from "../constants/theme";
import { onboardingDraft } from "../lib/onboarding-draft";

const DAY_ORDER = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_LABELS: Record<string, string> = {
  Monday: "MON",
  Tuesday: "TUE",
  Wednesday: "WED",
  Thursday: "THU",
  Friday: "FRI",
  Saturday: "SAT",
};

const DAY_IMAGES: Record<string, string> = {
  Monday:
    "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=400&q=80",
  Tuesday:
    "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=400&q=80",
  Wednesday:
    "https://images.unsplash.com/photo-1526506118085-60ce8714f8c5?auto=format&fit=crop&w=400&q=80",
  Thursday:
    "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=400&q=80",
  Friday:
    "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=400&q=80",
  Saturday:
    "https://images.unsplash.com/photo-1574680096145-d05b474e2155?auto=format&fit=crop&w=400&q=80",
};

const MUSCLES: { name: string; img: string }[] = [
  {
    name: "Chest",
    img: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&w=150&q=80",
  },
  {
    name: "Back",
    img: "https://images.unsplash.com/photo-1605296867304-46d5465a13f1?auto=format&fit=crop&w=150&q=80",
  },
  {
    name: "Shoulders",
    img: "https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?auto=format&fit=crop&w=150&q=80",
  },
  {
    name: "Biceps",
    img: "https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?auto=format&fit=crop&w=150&q=80",
  },
  {
    name: "Triceps",
    img: "https://images.unsplash.com/photo-1530822847156-5df684618728?auto=format&fit=crop&w=150&q=80",
  },
  {
    name: "Legs",
    img: "https://images.unsplash.com/photo-1434608519344-49d77a699e1d?auto=format&fit=crop&w=150&q=80",
  },
];

type Step = "days" | "muscles" | "summary";

export default function OnboardingScreen() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("days");
  const [selectedDays, setSelectedDays] = useState<string[]>(["Monday"]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [schedule, setSchedule] = useState<Record<string, string[]>>({});

  const toggleDay = (day: string) => {
    setSelectedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const toggleMuscle = (muscle: string) => {
    const currentDay = sortedSelectedDays[activeDayIndex];
    setSchedule((prev) => {
      const current = prev[currentDay] ?? [];
      const next = current.includes(muscle)
        ? current.filter((m) => m !== muscle)
        : [...current, muscle];
      return { ...prev, [currentDay]: next };
    });
  };

  const sortedSelectedDays = DAY_ORDER.filter((d) =>
    selectedDays.includes(d)
  ) as string[];
  const currentDay = sortedSelectedDays[activeDayIndex];

  const startMuscleSelection = () => {
    if (selectedDays.length === 0) {
      Alert.alert("Select a day", "Please select at least one training day.");
      return;
    }
    setActiveDayIndex(0);
    setStep("muscles");
  };

  const nextDay = () => {
    if (activeDayIndex < sortedSelectedDays.length - 1) {
      setActiveDayIndex((i) => i + 1);
    } else {
      setStep("summary");
    }
  };

  const prevDay = () => {
    if (activeDayIndex > 0) {
      setActiveDayIndex((i) => i - 1);
    } else {
      setStep("days");
    }
  };

  const resetFlow = () => {
    onboardingDraft.set({ days: sortedSelectedDays, schedule });
    setSchedule({});
    setSelectedDays(["Monday"]);
    setStep("days");
    router.push("/bw");
  };

  return (
    <View style={styles.container}>
      <View style={styles.ambientGlow} />

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        {step === "days" && (
          <View style={styles.step}>
            <Text style={styles.headerTitle}>
              Training{"\n"}
              <Text style={styles.headerAccent}>Days?</Text>
            </Text>

            <ScrollView
              style={styles.daysScroll}
              contentContainerStyle={styles.daysGrid}
              showsVerticalScrollIndicator={false}
            >
              {DAY_ORDER.map((day) => {
                const selected = selectedDays.includes(day);
                return (
                  <Pressable
                    key={day}
                    style={[styles.dayCard, selected && styles.dayCardSelected]}
                    onPress={() => toggleDay(day)}
                  >
                    <Image
                      source={{ uri: DAY_IMAGES[day] }}
                      style={[
                        styles.dayCardImg,
                        selected && styles.dayCardImgSelected,
                      ]}
                      resizeMode="cover"
                    />
                    <View style={styles.dayCardOverlay} />
                    <View
                      style={[
                        styles.radioIndicator,
                        selected && styles.radioIndicatorSelected,
                      ]}
                    >
                      <View
                        style={[
                          styles.radioDot,
                          selected && styles.radioDotSelected,
                        ]}
                      />
                    </View>
                    <Text
                      style={[
                        styles.dayLabel,
                        selected && styles.dayLabelSelected,
                      ]}
                    >
                      {DAY_LABELS[day]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.footerAction}>
              <Pressable
                style={[styles.btnNext, { flex: 1 }]}
                onPress={startMuscleSelection}
              >
                <Text style={styles.btnNextText}>Next</Text>
              </Pressable>
            </View>
          </View>
        )}

      {step === "muscles" && (
        <View style={styles.step}>
          <Text style={styles.headerTitle}>
            What do you train on{"\n"}
            <Text style={styles.headerAccent}>{currentDay}?</Text>
          </Text>

          <ScrollView
            style={styles.muscleList}
            contentContainerStyle={styles.muscleListContent}
            showsVerticalScrollIndicator={false}
          >
            {MUSCLES.map((muscle) => {
              const selected = (schedule[currentDay] ?? []).includes(muscle.name);
              return (
                <Pressable
                  key={muscle.name}
                  style={[styles.muscleCard, selected && styles.muscleCardSelected]}
                  onPress={() => toggleMuscle(muscle.name)}
                >
                  <View style={styles.muscleInfo}>
                    <View style={styles.muscleImgWrapper}>
                      <View style={styles.muscleFallback} />
                      <Image
                        source={{ uri: muscle.img }}
                        style={styles.muscleImg}
                        resizeMode="cover"
                      />
                    </View>
                    <Text style={styles.muscleName}>{muscle.name}</Text>
                  </View>
                  <View
                    style={[
                      styles.checkboxCircle,
                      selected && styles.checkboxCircleSelected,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkboxDot,
                        selected && styles.checkboxDotSelected,
                      ]}
                    />
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.footerAction}>
            <Pressable style={styles.backBtn} onPress={prevDay} aria-label="Go back">
              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Polyline
                  points="15 18 9 12 15 6"
                  stroke={COLORS.white}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </Svg>
            </Pressable>
            <Pressable style={[styles.btnNext, { flex: 1 }]} onPress={nextDay}>
              <Text style={styles.btnNextText}>
                {activeDayIndex < sortedSelectedDays.length - 1
                  ? "Next"
                  : "Confirm Routine"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {step === "summary" && (
        <View style={styles.step}>
          <Text style={styles.headerTitle}>
            Routine{"\n"}
            <Text style={styles.headerAccent}>Summary</Text>
          </Text>

          <ScrollView
            style={styles.summaryScroll}
            contentContainerStyle={styles.summaryContent}
            showsVerticalScrollIndicator={false}
          >
            {sortedSelectedDays.map((day) => {
              const exercises = schedule[day];
              const hasExercises = exercises && exercises.length > 0;
              return (
                <View key={day} style={styles.summaryCard}>
                  <Text style={styles.summaryDay}>{day}</Text>
                  <Text style={styles.summaryExercises}>
                    {hasExercises ? exercises.join(", ") : "Rest / Active Recovery"}
                  </Text>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.footerAction}>
            <Pressable
              style={[styles.btnNext, { flex: 1 }]}
              onPress={resetFlow}
            >
              <Text style={styles.btnNextText}>Confirm Routine</Text>
            </Pressable>
          </View>
        </View>
        )}
      </SafeAreaView>
    </View>
  );
}

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
  step: {
    flex: 1,
    marginTop: 4,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    letterSpacing: -0.5,
    textTransform: "uppercase",
    color: COLORS.white,
    marginBottom: 24,
  },
  headerAccent: {
    color: COLORS.accent,
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  daysScroll: {
    flex: 1,
  },
  daysGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    paddingBottom: 8,
  },
  dayCard: {
    width: "48.3%",
    height: 110,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSolid,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  dayCardSelected: {
    borderColor: COLORS.accent,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
  },
  dayCardImg: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
  },
  dayCardImgSelected: {
    opacity: 0.8,
  },
  dayCardOverlay: {
    position: "absolute",
    inset: 0,
    backgroundColor: "rgba(11,10,10,0.55)",
  },
  radioIndicator: {
    position: "absolute",
    top: 12,
    left: 12,
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: COLORS.border,
    backgroundColor: COLORS.black06,
    alignItems: "center",
    justifyContent: "center",
  },
  radioIndicatorSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
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
  dayLabel: {
    fontSize: 22,
    fontWeight: "900",
    color: COLORS.muted,
    letterSpacing: 1,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  dayLabelSelected: {
    color: COLORS.white,
  },
  muscleList: {
    flex: 1,
    marginBottom: 16,
  },
  muscleListContent: {
    gap: 12,
    paddingBottom: 8,
  },
  muscleCard: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: COLORS.cardSolid,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  muscleCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.cardSolidSecondary,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    shadowOpacity: 1,
  },
  muscleInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  muscleImgWrapper: {
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: COLORS.cardSolidSecondary,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  muscleFallback: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: COLORS.accentFaint,
  },
  muscleImg: {
    width: "100%",
    height: "100%",
  },
  muscleName: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: 0.2,
  },
  checkboxCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: COLORS.border,
    alignItems: "center",
    justifyContent: "center",
  },
  checkboxCircleSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  checkboxDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.dark,
    display: "none",
  },
  checkboxDotSelected: {
    display: "flex",
  },
  summaryScroll: {
    flex: 1,
    marginBottom: 16,
  },
  summaryContent: {
    gap: 12,
  },
  summaryCard: {
    backgroundColor: COLORS.cardSolid,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  summaryDay: {
    fontSize: 13,
    fontWeight: "900",
    color: COLORS.accent,
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  summaryExercises: {
    fontSize: 15,
    color: COLORS.white,
    fontWeight: "700",
  },
  footerAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingTop: 16,
  },
  backBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardSolid,
    alignItems: "center",
    justifyContent: "center",
  },
  btnNext: {
    height: 52,
    borderRadius: 30,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
  },
  btnNextText: {
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.dark,
  },
});