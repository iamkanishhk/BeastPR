import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import { COLORS } from "../constants/theme";
import { onboardingDraft } from "../lib/onboarding-draft";

type GoalKey = "Strength" | "Aesthetic" | "Endurance";

const GOALS: {
  key: GoalKey;
  img: string;
  title: string;
  description: string;
}[] = [
  {
    key: "Strength",
    img: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=600&q=80",
    title: "Strength",
    description: "Build maximum raw strength and explosive power.",
  },
  {
    key: "Aesthetic",
    img: "https://images.unsplash.com/photo-1583454110551-21f2fa2afe61?auto=format&fit=crop&w=600&q=80",
    title: "Aesthetic",
    description: "Maximize hypertrophy and body composition definition.",
  },
  {
    key: "Endurance",
    img: "https://images.unsplash.com/photo-1517963879433-6ad2b056d712?auto=format&fit=crop&w=600&q=80",
    title: "Endurance",
    description: "Enhance stamina, athletic conditioning, and cardio resilience.",
  },
];

export default function GoalsScreen() {
  const [selectedGoal, setSelectedGoal] = useState<GoalKey>("Strength");
  const router = useRouter();

  const handleNext = () => {
    onboardingDraft.set({ goal: selectedGoal });
    router.push("/onboarding");
  };

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
        <View style={styles.navHeader}>
          <Pressable style={styles.backButton} aria-label="Go back">
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
        </View>

        <View style={styles.headerSection}>
          <Text style={styles.title}>
            Set Primary{"\n"}
            <Text style={styles.titleAccent}>Goal</Text>
          </Text>
          <Text style={styles.subtitle}>Choose what you want to optimize for.</Text>
        </View>

        <ScrollView
          style={styles.contentArea}
          contentContainerStyle={styles.contentAreaContent}
          showsVerticalScrollIndicator={false}
        >
          {GOALS.map((goal) => {
            const selected = selectedGoal === goal.key;
            return (
              <Pressable
                key={goal.key}
                style={styles.goalBlock}
                onPress={() => setSelectedGoal(goal.key)}
              >
                <View style={[styles.goalCard, selected && styles.goalCardSelected]}>
                  <Image
                    source={{ uri: goal.img }}
                    style={[styles.goalImg, selected && styles.goalImgSelected]}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={[
                      "rgba(11,10,10,0.2)",
                      "rgba(11,10,10,0.88)",
                    ]}
                    style={styles.goalGradient}
                  />
                  <Text style={styles.cardTitle}>{goal.title}</Text>
                  <View
                    style={[
                      styles.checkmarkIcon,
                      selected && styles.checkmarkIconVisible,
                    ]}
                  >
                    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                      <Polyline
                        points="20 6 9 17 4 12"
                        stroke={COLORS.dark}
                        strokeWidth={3.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </Svg>
                  </View>
                </View>
                <Text
                  style={[
                    styles.goalDescription,
                    selected && styles.goalDescriptionSelected,
                  ]}
                >
                  {goal.description}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <View style={styles.footerSection}>
          <Pressable style={styles.btnNext} onPress={handleNext}>
            <Text style={styles.btnNextText}>Next</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bgPitch,
    overflow: "hidden",
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingBottom: 24,
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
    left: -30,
    width: 230,
    height: 230,
    borderRadius: 115,
    backgroundColor: COLORS.accentGlow,
    opacity: 0.35,
  },
  navHeader: {
    paddingVertical: 8,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.cardPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerSection: {
    marginTop: 8,
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    letterSpacing: -0.5,
    textTransform: "uppercase",
    color: COLORS.white,
    marginBottom: 6,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 4 },
    textShadowRadius: 14,
  },
  titleAccent: {
    color: COLORS.accent,
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.muted,
    letterSpacing: 0.2,
  },
  contentArea: {
    flex: 1,
  },
  contentAreaContent: {
    gap: 16,
    paddingBottom: 8,
  },
  goalBlock: {
    gap: 8,
  },
  goalCard: {
    height: 105,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardPrimary,
    padding: 16,
    justifyContent: "flex-end",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 24,
    elevation: 4,
  },
  goalCardSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.cardSecondary,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
  },
  goalImg: {
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    height: "100%",
    opacity: 0.45,
  },
  goalImgSelected: {
    opacity: 0.75,
  },
  goalGradient: {
    position: "absolute",
    inset: 0,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: -0.2,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    zIndex: 3,
  },
  checkmarkIcon: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
    transform: [{ scale: 0.6 }],
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 1,
    zIndex: 4,
  },
  checkmarkIconVisible: {
    opacity: 1,
    transform: [{ scale: 1 }],
  },
  goalDescription: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    paddingLeft: 2,
    fontWeight: "600",
  },
  goalDescriptionSelected: {
    color: COLORS.white,
  },
  footerSection: {
    marginTop: 16,
  },
  btnNext: {
    height: 52,
    borderRadius: 30,
    backgroundColor: COLORS.accent,
    alignItems: "center",
    justifyContent: "center",
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