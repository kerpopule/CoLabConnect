import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { supabase } from "@/lib/supabase";
import { User } from "@supabase/supabase-js";
import { Loader2, CheckCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

// Helper function to ensure a profile exists for the user
// Returns true if this is a new profile (first sign-in)
async function ensureProfileExists(user: User): Promise<boolean> {
  // Log user metadata to debug what Google provides
  console.log("User metadata:", user.user_metadata);
  console.log("User identities:", user.identities);

  // Google provides avatar in different fields depending on the flow
  const googleAvatar =
    user.user_metadata?.avatar_url ||
    user.user_metadata?.picture ||
    user.identities?.[0]?.identity_data?.avatar_url ||
    user.identities?.[0]?.identity_data?.picture ||
    null;

  const googleName =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.identities?.[0]?.identity_data?.full_name ||
    user.identities?.[0]?.identity_data?.name ||
    null;

  console.log("Extracted avatar:", googleAvatar);
  console.log("Extracted name:", googleName);

  // Check if profile already exists
  const { data: existingProfile, error: fetchError } = await supabase
    .from("profiles")
    .select("id, avatar_url, name")
    .eq("id", user.id)
    .maybeSingle(); // Use maybeSingle instead of single to avoid error when no rows

  if (fetchError) {
    console.error("Error checking profile:", fetchError);
  }

  if (existingProfile) {
    // Profile exists - update avatar/name if missing and we have data from Google
    const updates: any = {};

    if (!existingProfile.avatar_url && googleAvatar) {
      updates.avatar_url = googleAvatar;
    }
    if ((!existingProfile.name || existingProfile.name === "New Member") && googleName) {
      updates.name = googleName;
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from("profiles")
        .update(updates)
        .eq("id", user.id);

      if (updateError) {
        console.error("Error updating profile:", updateError);
      }
    }
    return false; // Not a new profile
  }

  // Create profile for the user with Google data
  const { error: insertError } = await supabase.from("profiles").insert({
    id: user.id,
    email: user.email || "",
    name: googleName || user.email?.split("@")[0] || "New Member",
    avatar_url: googleAvatar,
    role: null,
    bio: null,
    tags: [],
    social_links: {},
  } as any);

  if (insertError) {
    console.error("Error creating profile:", insertError);
    return false;
  }

  return true; // This is a new profile
}

export default function AuthCallback() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const queryClient = useQueryClient();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        // Check for errors in query params first
        const queryParams = new URLSearchParams(window.location.search);
        const error = queryParams.get("error");
        const errorDescription = queryParams.get("error_description");

        if (error) {
          setStatus("error");
          setErrorMessage(errorDescription || error);
          return;
        }

        // For OAuth (like Google), Supabase automatically exchanges the code
        // We just need to wait for the session to be available
        // First, let Supabase handle the OAuth callback automatically
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
          setStatus("error");
          setErrorMessage(sessionError.message);
          return;
        }

        if (session) {
          // Ensure profile exists for this user
          const isNewUser = await ensureProfileExists(session.user);

          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["profiles"] });

          setStatus("success");
          setTimeout(() => {
            // Redirect new users to edit profile to complete their setup
            setLocation(isNewUser ? "/profile/edit" : "/directory");
          }, 1500);
          return;
        }

        // If no session yet, check for tokens in hash (email verification flow)
        const hashParams = new URLSearchParams(window.location.hash.substring(1));
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");

        if (accessToken && refreshToken) {
          const { data: sessionData, error: setSessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (setSessionError) {
            setStatus("error");
            setErrorMessage(setSessionError.message);
            return;
          }

          let isNewUser = false;
          if (sessionData.user) {
            isNewUser = await ensureProfileExists(sessionData.user);
          }

          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["profiles"] });

          setStatus("success");
          setTimeout(() => {
            setLocation(isNewUser ? "/profile/edit" : "/directory");
          }, 1500);
          return;
        }

        // Check for OAuth code in URL (Supabase PKCE flow)
        const code = queryParams.get("code");
        if (code) {
          // Exchange the code for a session
          const { data, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

          if (exchangeError) {
            setStatus("error");
            setErrorMessage(exchangeError.message);
            return;
          }

          let isNewUser = false;
          if (data.user) {
            isNewUser = await ensureProfileExists(data.user);
          }

          // Invalidate queries to refresh data
          queryClient.invalidateQueries({ queryKey: ["profiles"] });

          setStatus("success");
          setTimeout(() => {
            setLocation(isNewUser ? "/profile/edit" : "/directory");
          }, 1500);
          return;
        }

        // No valid auth data found
        setStatus("error");
        setErrorMessage("No authentication tokens found. Please try signing in again.");
      } catch (err) {
        console.error("Auth callback error:", err);
        setStatus("error");
        setErrorMessage("An unexpected error occurred. Please try again.");
      }
    };

    handleAuthCallback();
  }, [setLocation]);

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        {status === "loading" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
              <Loader2 className="h-10 w-10 text-primary animate-spin" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Verifying your account...
            </h1>
            <p className="text-muted-foreground">Please wait a moment</p>
          </>
        )}

        {status === "success" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 mb-4">
              <CheckCircle className="h-10 w-10 text-green-600 dark:text-green-400" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Welcome to Co:Lab!
            </h1>
            <p className="text-muted-foreground">
              Your account is verified. Redirecting you to the community...
            </p>
          </>
        )}

        {status === "error" && (
          <>
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 mb-4">
              <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
            </div>
            <h1 className="text-2xl font-display font-bold text-foreground">
              Verification Failed
            </h1>
            <p className="text-muted-foreground">{errorMessage}</p>
            <div className="pt-4 space-x-3">
              <Button variant="outline" onClick={() => setLocation("/login")}>
                Sign In
              </Button>
              <Button onClick={() => setLocation("/create-card")}>
                Create Account
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
