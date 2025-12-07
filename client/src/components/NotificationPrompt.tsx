import { useState, useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { usePushNotifications } from "@/hooks/usePushNotifications";

const DM_NOTIFICATION_PROMPT_KEY = "colab-dm-notification-prompt";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface NotificationPromptProps {
  /** Show the dialog immediately (e.g., when clicking bell icon) */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Type of notification prompt */
  type?: "dm" | "topic";
  /** Topic name for topic notifications */
  topicName?: string;
}

/**
 * Get the last time the DM notification prompt was shown
 */
function getLastDmPromptTime(): number {
  try {
    const stored = localStorage.getItem(DM_NOTIFICATION_PROMPT_KEY);
    if (stored) {
      return parseInt(stored, 10);
    }
  } catch {
    // Ignore
  }
  return 0;
}

/**
 * Set the last time the DM notification prompt was shown
 */
function setLastDmPromptTime() {
  try {
    localStorage.setItem(DM_NOTIFICATION_PROMPT_KEY, Date.now().toString());
  } catch {
    // Ignore
  }
}

/**
 * Check if we should show the DM notification prompt (once per week)
 */
export function shouldShowDmNotificationPrompt(): boolean {
  const lastPrompt = getLastDmPromptTime();
  const now = Date.now();
  return now - lastPrompt > ONE_WEEK_MS;
}

/**
 * Mark that the DM notification prompt was shown
 */
export function markDmNotificationPromptShown() {
  setLastDmPromptTime();
}

/**
 * A dialog that prompts users to enable push notifications
 */
export function NotificationPrompt({
  open: controlledOpen,
  onOpenChange,
  type = "dm",
  topicName,
}: NotificationPromptProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
  } = usePushNotifications();

  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setIsOpen = onOpenChange || setInternalOpen;

  const handleEnable = async () => {
    const success = await subscribe();
    if (success) {
      setIsOpen(false);
    }
  };

  const handleDismiss = () => {
    setIsOpen(false);
  };

  // Don't render anything if notifications aren't supported or permission denied
  if (!isSupported || permission === "denied" || isSubscribed) {
    return null;
  }

  const title = type === "dm"
    ? "Enable DM Notifications"
    : `Enable Notifications for #${topicName || "this channel"}`;

  const description = type === "dm"
    ? "Get notified instantly when you receive a direct message, even when the app is closed."
    : `Get notified when new messages are posted in #${topicName || "this channel"}.`;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button
            onClick={handleEnable}
            disabled={isLoading}
            className="w-full"
          >
            {isLoading ? "Enabling..." : "Enable Notifications"}
          </Button>
          <Button
            variant="ghost"
            onClick={handleDismiss}
            className="w-full text-muted-foreground"
          >
            Not Now
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A compact inline button for enabling notifications in chat headers
 */
interface NotificationEnableButtonProps {
  type: "dm" | "topic";
  topicName?: string;
  className?: string;
}

export function NotificationEnableButton({
  type,
  topicName,
  className = "",
}: NotificationEnableButtonProps) {
  const [showPrompt, setShowPrompt] = useState(false);
  const {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
  } = usePushNotifications();

  // Don't show if already subscribed or not supported
  if (!isSupported || permission === "denied" || isSubscribed) {
    return null;
  }

  return (
    <>
      <button
        onClick={() => setShowPrompt(true)}
        disabled={isLoading}
        className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-medium transition-all whitespace-nowrap shrink-0 bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 ${className}`}
        title="Enable notifications"
      >
        <Bell className="h-4 w-4" />
        <span className="hidden sm:inline">Enable Notifications</span>
      </button>
      <NotificationPrompt
        open={showPrompt}
        onOpenChange={setShowPrompt}
        type={type}
        topicName={topicName}
      />
    </>
  );
}

/**
 * Hook to trigger DM notification prompt when receiving a DM
 */
export function useDmNotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const { isSubscribed, isSupported, permission } = usePushNotifications();

  const triggerPrompt = () => {
    // Only show if notifications are supported but not enabled
    if (!isSupported || permission === "denied" || isSubscribed) {
      return;
    }

    // Only show once per week
    if (!shouldShowDmNotificationPrompt()) {
      return;
    }

    // Mark as shown and show the prompt
    markDmNotificationPromptShown();
    setShowPrompt(true);
  };

  return {
    showPrompt,
    setShowPrompt,
    triggerPrompt,
  };
}
