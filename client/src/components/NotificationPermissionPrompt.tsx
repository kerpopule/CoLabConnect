import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Bell, BellOff, X } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const STORAGE_KEY = "colab-notification-prompt";

interface NotificationPromptData {
  prompted: boolean;
  dismissedAt: number | null;
}

function isRunningAsPWA(): boolean {
  // Check if running in standalone mode (installed PWA)
  if (window.matchMedia("(display-mode: standalone)").matches) {
    return true;
  }

  // iOS Safari specific check
  if ((navigator as any).standalone === true) {
    return true;
  }

  // Check if running from home screen on Android (fullscreen mode)
  if (window.matchMedia("(display-mode: fullscreen)").matches) {
    return true;
  }

  return false;
}

function getStoredData(): NotificationPromptData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error reading notification prompt data:", e);
  }
  return { prompted: false, dismissedAt: null };
}

function setStoredData(data: Partial<NotificationPromptData>) {
  try {
    const current = getStoredData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch (e) {
    console.error("Error saving notification prompt data:", e);
  }
}

interface NotificationPermissionPromptProps {
  isLoggedIn: boolean;
}

export function NotificationPermissionPrompt({ isLoggedIn }: NotificationPermissionPromptProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const { isSupported, permission, isSubscribed, subscribe, isLoading } = usePushNotifications();

  useEffect(() => {
    // Only proceed if user is logged in
    if (!isLoggedIn) return;

    // Don't show if notifications aren't supported
    if (!isSupported) return;

    // Don't show if already subscribed
    if (isSubscribed) return;

    // Don't show if permission was already denied by browser
    if (permission === "denied") return;

    const isPWA = isRunningAsPWA();
    const storedData = getStoredData();

    // For PWA users: always show on first open (even if dismissed before on web)
    // Check if they've been prompted while IN the PWA
    const pwaPromptKey = "colab-notification-prompt-pwa";
    const pwaPrompted = localStorage.getItem(pwaPromptKey);

    if (isPWA) {
      // First time opening as PWA - show immediately
      if (!pwaPrompted) {
        const timer = setTimeout(() => {
          setIsOpen(true);
          localStorage.setItem(pwaPromptKey, "true");
        }, 1000); // Short delay to let app load
        return () => clearTimeout(timer);
      }
    } else {
      // Web browser - show if never prompted before
      if (!storedData.prompted) {
        const timer = setTimeout(() => {
          setIsOpen(true);
          setStoredData({ prompted: true });
        }, 2000);
        return () => clearTimeout(timer);
      }
    }
  }, [isLoggedIn, isSupported, isSubscribed, permission]);

  const handleEnable = async () => {
    setIsEnabling(true);
    const success = await subscribe();
    setIsEnabling(false);

    if (success) {
      setIsOpen(false);
    }
    // If not successful (user denied), dialog will close anyway
    setIsOpen(false);
  };

  const handleDismiss = () => {
    setStoredData({ dismissedAt: Date.now() });
    setIsOpen(false);
  };

  // Don't render if not supported or already subscribed
  if (!isSupported || isSubscribed) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Bell className="h-6 w-6 text-primary" />
            Enable Notifications
          </DialogTitle>
          <DialogDescription>
            Get notified when you receive new messages, connection requests, and more.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Direct Messages</p>
                <p className="text-muted-foreground">Know instantly when someone messages you</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Connection Requests</p>
                <p className="text-muted-foreground">Never miss a new connection opportunity</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Bell className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="font-medium">Group & Topic Updates</p>
                <p className="text-muted-foreground">Stay in the loop with your communities</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleEnable}
            className="w-full"
            disabled={isEnabling || isLoading}
          >
            <Bell className="h-4 w-4 mr-2" />
            {isEnabling || isLoading ? "Enabling..." : "Enable Notifications"}
          </Button>

          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full text-muted-foreground"
          >
            <BellOff className="h-4 w-4 mr-2" />
            Not Now
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
