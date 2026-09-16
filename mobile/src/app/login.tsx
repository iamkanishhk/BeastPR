import { useEffect, useState } from "react";
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
import { useRouter, Redirect } from "expo-router";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { useAuth, useClerk, useSSO } from "@clerk/expo";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { COLORS } from "../constants/theme";
import { persistUserAfterSignIn } from "../lib/post-login";

// Warm the in-app browser so the OAuth redirect feels instant.
function useWarmUpBrowser() {
  useEffect(() => {
    void WebBrowser.warmUpAsync();
    return () => {
      void WebBrowser.coolDownAsync();
    };
  }, []);
}

export default function LoginScreen() {
  useWarmUpBrowser();
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { setActive } = useClerk();
  const { startSSOFlow } = useSSO();
  const [submitting, setSubmitting] = useState<"oauth_google" | "oauth_apple" | null>(null);

  // Already signed in (e.g. flow finished on the callback screen): move on.
  if (isLoaded && isSignedIn) {
    return <Redirect href="/dashboard" />;
  }

  const handleSSO = async (strategy: "oauth_google" | "oauth_apple") => {
    if (!isLoaded) return;
    setSubmitting(strategy);
    try {
      const { createdSessionId } = await startSSOFlow({
        strategy,
        redirectUrl: AuthSession.makeRedirectUri({
          path: "oauth-native-callback",
        }),
      });

      if (!createdSessionId) {
        Alert.alert(
          "Sign in incomplete",
          "The sign-in didn't complete. Please try again.",
        );
        return;
      }

      await setActive({ session: createdSessionId });

      // Persist the profile + pre-login onboarding answers to the database.
      try {
        await persistUserAfterSignIn(getToken);
      } catch (err) {
        // Non-fatal: the app still works locally if sync fails.
        console.error("post-login sync failed:", err);
      }

      router.replace("/dashboard");
    } catch (err) {
      const code =
        (err as { code?: string } | undefined)?.code ??
        (err as { errors?: { code?: string }[] } | undefined)?.errors?.[0]?.code;
      if (code === "SIGN_IN_CANCELLED" || code === "-5") return;
      console.error(JSON.stringify(err, null, 2));
      Alert.alert(
        "Sign in failed",
        "Couldn't complete sign in. Make sure social sign-in is enabled in your Clerk dashboard.",
      );
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Background image with bottom fade */}
      <View style={styles.bgImageContainer}>
        <Image
          source={{
            uri: "https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=800&q=80",
          }}
          style={styles.bgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            "rgba(11,10,10,0.2)",
            "rgba(11,10,10,0.6)",
            "rgba(11,10,10,0.95)",
            COLORS.bgPitchAlt,
          ]}
          style={styles.bgFadeOverlay}
        />
      </View>

      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.brandingSection}>
            <Text style={styles.appTagline}>BeastPR</Text>
            <Text style={styles.appTitle}>
              Level Up{"\n"}
              <Text style={styles.appTitleAccent}>Your Routine.</Text>
            </Text>
            <Text style={styles.appDescription}>
              Sign in to sync your customized split routines and bodyweight
              tracking.
            </Text>
          </View>

          <View style={styles.loginActions}>
            <Pressable
              style={[styles.btnLogin, styles.btnGoogle]}
              onPress={() => handleSSO("oauth_google")}
              disabled={submitting !== null}
            >
              <Svg width={20} height={20} viewBox="0 0 24 24">
                <Path
                  d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z"
                  fill={COLORS.dark}
                />
              </Svg>
              {submitting === "oauth_google" ? (
                <ActivityIndicator color={COLORS.dark} />
              ) : (
                <Text style={styles.googleText}>Continue with Google</Text>
              )}
            </Pressable>

            <Pressable
              style={[styles.btnLogin, styles.btnApple]}
              onPress={() => handleSSO("oauth_apple")}
              disabled={submitting !== null}
            >
              <Svg width={20} height={20} viewBox="0 0 170 170">
                <Path
                  d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.34.13-9.22-1.92-14.63-6.15-3.33-2.61-7.23-7.2-11.7-13.78-6.61-9.74-11.66-20.32-15.15-31.75-3.49-11.43-5.24-22.18-5.24-32.25 0-14.28 3.59-25.92 10.77-34.92 7.18-9 16.42-13.59 27.71-13.77 4.11 0 8.92 1.05 14.42 3.15 5.5 2.1 9.4 3.16 11.7 3.16 2.01 0 5.92-1.06 11.73-3.16 5.81-2.1 10.37-3.15 13.68-3.15 10.4 0 19.33 3.82 26.79 11.46 2.39 2.47 4.48 5.2 6.27 8.18-9.82 5.96-14.67 14.2-14.55 24.71.13 8.35 3.29 15.6 9.49 21.75 6.2 6.15 13.63 9.47 22.28 9.96-2.09 6.22-4.66 12.28-7.71 18.18zM119.22 31.87c0-6.79 2.51-13.38 7.53-19.78 5.02-6.4 11.37-10.42 19.06-12.09 1.01 7.21-1.39 14.07-7.2 20.58-5.81 6.51-12.7 10.15-20.67 10.92-.37-.87-.56-1.74-.56-2.63z"
                  fill={COLORS.white}
                />
              </Svg>
              {submitting === "oauth_apple" ? (
                <ActivityIndicator color={COLORS.white} />
              ) : (
                <Text style={styles.appleText}>Continue with Apple</Text>
              )}
            </Pressable>
          </View>

          <Text style={styles.termsText}>
            By continuing, you agree to our{" "}
            <Text style={styles.termsLink}>Terms of Service</Text> and{" "}
            <Text style={styles.termsLink}>Privacy Policy</Text>.
          </Text>
        </ScrollView>
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
    paddingHorizontal: 24,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 36,
  },
  bgImageContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "65%",
  },
  bgImage: {
    width: "100%",
    height: "100%",
  },
  bgFadeOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  brandingSection: {
    marginTop: "auto",
    marginBottom: 28,
    zIndex: 2,
  },
  appTagline: {
    fontSize: 12,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 2,
    color: COLORS.accent,
    marginBottom: 8,
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  appTitle: {
    fontSize: 38,
    fontWeight: "900",
    lineHeight: 40,
    letterSpacing: -1,
    textTransform: "uppercase",
    color: COLORS.white,
  },
  appTitleAccent: {
    color: COLORS.accent,
    textShadowColor: COLORS.accentGlow,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
  },
  appDescription: {
    fontSize: 14,
    color: COLORS.mutedAlt,
    marginTop: 10,
    lineHeight: 20,
    fontWeight: "500",
  },
  loginActions: {
    gap: 14,
    zIndex: 2,
  },
  btnLogin: {
    height: 56,
    borderRadius: 28,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  btnGoogle: {
    backgroundColor: COLORS.accent,
    shadowColor: COLORS.accentGlow,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 20,
    shadowOpacity: 1,
  },
  googleText: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.dark,
  },
  btnApple: {
    backgroundColor: COLORS.appleBtn,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 4,
  },
  appleText: {
    fontSize: 15,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: COLORS.white,
  },
  termsText: {
    textAlign: "center",
    fontSize: 11,
    color: COLORS.mutedAlt,
    marginTop: 18,
    lineHeight: 16,
    zIndex: 2,
  },
  termsLink: {
    color: COLORS.white,
    textDecorationLine: "underline",
  },
});