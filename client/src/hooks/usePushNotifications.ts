import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// Convert URL-safe base64 to Uint8Array
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type NotificationPermissionState = "default" | "granted" | "denied" | "unsupported";

export function usePushNotifications() {
  const { user } = useAuth();
  const [permission, setPermission] = useState<NotificationPermissionState>("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);

  // Check if push notifications are supported
  const isSupported = "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC_KEY;

  // Initialize service worker and check permission
  useEffect(() => {
    if (!isSupported) {
      setPermission("unsupported");
      return;
    }

    // Check current permission
    setPermission(Notification.permission as NotificationPermissionState);

    // Register service worker
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        console.log("Service Worker registered:", registration);
        setSwRegistration(registration);

        // Check if already subscribed
        return registration.pushManager.getSubscription();
      })
      .then((subscription) => {
        setIsSubscribed(!!subscription);
      })
      .catch((error) => {
        console.error("Service Worker registration failed:", error);
      });
  }, [isSupported]);

  // Handle messages from service worker (navigation and updates)
  useEffect(() => {
    if (!isSupported) return;

    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "NAVIGATE" && event.data?.url) {
        const url = event.data.url;
        // Use History API for smoother navigation within the SPA
        // This avoids full page reload and works better with React state
        if (url.startsWith('/')) {
          // Store in sessionStorage as backup for page reload scenarios
          sessionStorage.setItem('pendingNavigation', url);

          // Try to use the global navigate function if available (set by Layout.tsx)
          // This is the most reliable way to navigate within wouter
          if (typeof (window as any).__colabNavigate === 'function') {
            console.log('[Push] Navigating via global function to:', url);
            (window as any).__colabNavigate(url);
          } else {
            // Fallback: Use history.pushState + dispatch popstate
            console.log('[Push] Navigating via pushState to:', url);
            window.history.pushState({}, '', url);
            // Also dispatch popstate to trigger useSearch/useLocation updates
            window.dispatchEvent(new PopStateEvent('popstate'));
          }

          // Dispatch a custom event that components can listen to for tab changes etc.
          window.dispatchEvent(new CustomEvent('pushnotification-navigate', { detail: { url } }));
        } else {
          window.location.href = url;
        }
      } else if (event.data?.type === "SW_UPDATED") {
        console.log("[PWA] Service worker updated to version:", event.data.version);
        // Reload the page to get the new version
        window.location.reload();
      }
    };

    navigator.serviceWorker.addEventListener("message", handleMessage);
    return () => {
      navigator.serviceWorker.removeEventListener("message", handleMessage);
    };
  }, [isSupported]);

  // Request permission and subscribe
  const subscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user || !swRegistration) {
      console.error("Push notifications not available");
      return false;
    }

    setIsLoading(true);

    try {
      // Request notification permission
      const result = await Notification.requestPermission();
      setPermission(result as NotificationPermissionState);

      if (result !== "granted") {
        console.log("Notification permission denied");
        setIsLoading(false);
        return false;
      }

      // Subscribe to push notifications
      const subscription = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Send subscription to server
      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          subscription: subscription.toJSON(),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save subscription");
      }

      setIsSubscribed(true);
      console.log("Push notification subscription successful");
      return true;
    } catch (error) {
      console.error("Failed to subscribe to push notifications:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, swRegistration]);

  // Unsubscribe
  const unsubscribe = useCallback(async (): Promise<boolean> => {
    if (!isSupported || !user || !swRegistration) {
      return false;
    }

    setIsLoading(true);

    try {
      const subscription = await swRegistration.pushManager.getSubscription();

      if (subscription) {
        await subscription.unsubscribe();

        // Remove from server
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            endpoint: subscription.endpoint,
          }),
        });
      }

      setIsSubscribed(false);
      console.log("Push notification unsubscription successful");
      return true;
    } catch (error) {
      console.error("Failed to unsubscribe from push notifications:", error);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [isSupported, user, swRegistration]);

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  };
}

// Hook for following/unfollowing chat topics
export function useTopicFollow(topicId: string | null) {
  const { user } = useAuth();
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Check follow status on mount
  useEffect(() => {
    if (!user || !topicId) return;

    fetch(`/api/topics/${topicId}/following?userId=${user.id}`)
      .then((res) => res.json())
      .then((data) => setIsFollowing(data.following))
      .catch(console.error);
  }, [user, topicId]);

  const toggleFollow = useCallback(async () => {
    if (!user || !topicId) return;

    setIsLoading(true);
    try {
      const method = isFollowing ? "DELETE" : "POST";
      const response = await fetch(`/api/topics/${topicId}/follow`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id }),
      });

      if (response.ok) {
        const data = await response.json();
        setIsFollowing(data.following);
      }
    } catch (error) {
      console.error("Failed to toggle topic follow:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user, topicId, isFollowing]);

  return {
    isFollowing,
    isLoading,
    toggleFollow,
  };
}
