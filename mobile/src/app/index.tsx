import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";

export default function Index() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) return null;

  // Signed-in users land on the dashboard; first-run users start the
  // goals -> onboarding -> bodyweight -> login flow.
  return <Redirect href={isSignedIn ? "/dashboard" : "/goals"} />;
}