import { useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Polyline } from "react-native-svg";
import { COLORS } from "../constants/theme";
import { onboardingDraft } from "../lib/onboarding-draft";

const REMINDER_OPTIONS = ["30 days", "60 days", "Off"];

export default function BwScreen() {
  const router = useRouter();
  const [weight, setWeight] = useState("70");
  const [unit, setUnit] = useState<"kg" | "lb">("kg");
  const [reminder, setReminder] = useState("30 days");

  const switchUnit = (next: "kg" | "lb") => {
    if (next === unit) return;
    const val = parseFloat(weight) || 0;
    setUnit(next);
    setWeight(
      next === "kg"
        ? String(Math.round(val / 2.20462))
        : String(Math.round(val * 2.20462))
    );
  };

  const handleContinue = () => {
    const value = parseFloat(weight) || 0;
    const bodyweightKg = unit === "kg" ? value : value / 2.20462;
    const reminderDays = reminder === "Off" ? null : (parseInt(reminder, 10) as 30 | 60);
    onboardingDraft.set({
      bodyweightKg: bodyweightKg > 0 ? Math.round(bodyweightKg * 100) / 100 : null,
      bodyweightUnit: unit,
      reminderDays,
    });
    router.push("/login");
  };

  return (
    <View style={styles.container}>
      {/* Background silhouette + overlay layers */}
      <Image
        source={{
          uri: "https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&w=600&h=1200&q=80",
        }}
        style={styles.bgImage}
        resizeMode="contain"
      />
      <LinearGradient
        colors={[
          "rgba(8,8,8,0.50)",
          "rgba(8,8,8,0.30)",
          "rgba(8,8,8,0.95)",
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
          <View style={styles.headerSection}>
            <Text style={styles.title}>
              Current{"\n"}
              <Text style={styles.titleAccent}>Bodyweight</Text>
            </Text>
          </View>

          {/* Bodyweight input card */}
          <View style={styles.weightCard}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.weightInput}
                value={weight}
                onChangeText={(text) => setWeight(text)}
                keyboardType="numeric"
                maxLength={5}
                placeholder="0"
                placeholderTextColor={COLORS.muted}
              />
              <Text style={styles.unitText}>{unit}</Text>
            </View>

            <View style={styles.unitToggle}>
              <Pressable
                style={[styles.toggleBtn, unit === "kg" && styles.toggleBtnActive]}
                onPress={() => switchUnit("kg")}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    unit === "kg" && styles.toggleBtnTextActive,
                  ]}
                >
                  kg
                </Text>
              </Pressable>
              <Pressable
                style={[styles.toggleBtn, unit === "lb" && styles.toggleBtnActive]}
                onPress={() => switchUnit("lb")}
              >
                <Text
                  style={[
                    styles.toggleBtnText,
                    unit === "lb" && styles.toggleBtnTextActive,
                  ]}
                >
                  lb
                </Text>
              </Pressable>
            </View>
          </View>

          {/* Reminder options */}
          <View style={styles.reminderSection}>
            <Text style={styles.reminderText}>
              Remind me every 30 to 60 days to update weight for relative-strength
              recalculations.
            </Text>

            <View style={styles.reminderOptions}>
              {REMINDER_OPTIONS.map((option) => (
                <Pressable
                  key={option}
                  style={[
                    styles.reminderOption,
                    reminder === option && styles.reminderOptionSelected,
                  ]}
                  onPress={() => setReminder(option)}
                >
                  <View
                    style={[
                      styles.radioCircle,
                      reminder === option && styles.radioCircleSelected,
                    ]}
                  >
                    {reminder === option && (
                      <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
                        <Polyline
                          points="20 6 9 17 4 12"
                          stroke={COLORS.dark}
                          strokeWidth={3.5}
                        />
                      </Svg>
                    )}
                  </View>
                  <Text style={styles.optionText}>{option}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        </ScrollView>

        {/* Footer CTA */}
        <View style={styles.footerSection}>
          <Pressable style={styles.btnContinue} onPress={handleContinue}>
            <Text style={styles.btnContinueText}>Continue</Text>
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
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 24,
    paddingBottom: 12,
  },
  bgImage: {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    opacity: 0.5,
  },
  bgOverlay: {
    position: "absolute",
    inset: 0,
  },
  ambientGlow: {
    position: "absolute",
    top: -40,
    right: -40,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: COLORS.accentGlow,
    opacity: 0.35,
  },
  headerSection: {
    marginBottom: 20,
  },
  title: {
    fontSize: 28,
    fontWeight: "900",
    lineHeight: 34,
    letterSpacing: -0.5,
    textTransform: "uppercase",
    color: COLORS.white,
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
  weightCard: {
    backgroundColor: COLORS.cardPrimary,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 32,
    elevation: 6,
  },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    paddingBottom: 8,
  },
  weightInput: {
    flex: 1,
    fontSize: 48,
    fontWeight: "900",
    color: COLORS.white,
    letterSpacing: -1,
    padding: 0,
  },
  unitText: {
    fontSize: 22,
    fontWeight: "800",
    color: COLORS.accent,
    textTransform: "uppercase",
  },
  unitToggle: {
    flexDirection: "row",
    backgroundColor: COLORS.black8,
    borderColor: COLORS.border,
    borderWidth: 1,
    borderRadius: 30,
    padding: 3,
    marginTop: 16,
  },
  toggleBtn: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 25,
  },
  toggleBtnActive: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 1,
  },
  toggleBtnText: {
    fontSize: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    color: COLORS.muted,
  },
  toggleBtnTextActive: {
    color: COLORS.dark,
  },
  reminderSection: {
    gap: 14,
  },
  reminderText: {
    fontSize: 13,
    lineHeight: 18,
    color: COLORS.muted,
    fontWeight: "600",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  reminderOptions: {
    gap: 10,
  },
  reminderOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingLeft: 18,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardPrimary,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 3,
  },
  reminderOptionSelected: {
    borderColor: COLORS.accent,
    backgroundColor: COLORS.cardSecondary,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 15,
    shadowOpacity: 1,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: COLORS.border,
    justifyContent: "center",
    alignItems: "center",
  },
  radioCircleSelected: {
    backgroundColor: COLORS.accent,
    borderColor: COLORS.accent,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 1,
  },
  optionText: {
    fontSize: 14,
    fontWeight: "700",
    color: COLORS.white,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  footerSection: {
    paddingTop: 20,
  },
  btnContinue: {
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
  btnContinueText: {
    fontSize: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.dark,
  },
});