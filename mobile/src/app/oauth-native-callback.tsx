import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { COLORS } from "../constants/theme";
import { persistUserAfterSignIn } from "../lib/post-login";

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { isLoaded, isSignedIn, getToken } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return;

    // The deep link lands here before the session is active. Once it is,
    // finish persistence (profile + onboarding answers) and move on.
    void persistUserAfterSignIn(getToken)
      .catch((err) => {
        // Non-fatal: the app still works locally if sync fails.
        console.error("post-login sync failed:", err);
      })
      .then(() => router.replace("/dashboard"));
  }, [isLoaded, isSignedIn, getToken, router]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={COLORS.accent} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.bgPitch,
  },
});