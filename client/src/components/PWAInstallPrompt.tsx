import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Smartphone, Share, Plus, MoreVertical, Download, X } from "lucide-react";

const STORAGE_KEY = "colab-pwa-prompt";
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

interface PWAPromptData {
  lastShown: number;
  installed: boolean;
  dismissedPermanently: boolean;
}

type Platform = "ios" | "android" | "desktop" | "unknown";

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();

  // iOS detection
  if (/iphone|ipad|ipod/.test(ua)) {
    return "ios";
  }

  // Android detection
  if (/android/.test(ua)) {
    return "android";
  }

  // Desktop
  if (!/mobile|tablet/.test(ua)) {
    return "desktop";
  }

  return "unknown";
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

  // Check if running from home screen on Android
  if (window.matchMedia("(display-mode: fullscreen)").matches) {
    return true;
  }

  return false;
}

function getStoredData(): PWAPromptData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error reading PWA prompt data:", e);
  }
  return { lastShown: 0, installed: false, dismissedPermanently: false };
}

function setStoredData(data: Partial<PWAPromptData>) {
  try {
    const current = getStoredData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...current, ...data }));
  } catch (e) {
    console.error("Error saving PWA prompt data:", e);
  }
}

function shouldShowPrompt(): boolean {
  // Don't show if already running as PWA
  if (isRunningAsPWA()) {
    return false;
  }

  const data = getStoredData();

  // Don't show if permanently dismissed
  if (data.dismissedPermanently) {
    return false;
  }

  // Don't show if marked as installed
  if (data.installed) {
    return false;
  }

  const now = Date.now();

  // Show if never shown before (first login)
  if (data.lastShown === 0) {
    return true;
  }

  // Show if it's been more than a week
  if (now - data.lastShown > ONE_WEEK_MS) {
    return true;
  }

  return false;
}

interface PWAInstallPromptProps {
  isLoggedIn: boolean;
}

export function PWAInstallPrompt({ isLoggedIn }: PWAInstallPromptProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [platform, setPlatform] = useState<Platform>("unknown");
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    // Detect platform on mount
    setPlatform(detectPlatform());

    // Listen for the beforeinstallprompt event (Chrome/Edge on Android)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    // Only show when logged in and conditions are met
    if (isLoggedIn && shouldShowPrompt()) {
      // Small delay to let the user settle in
      const timer = setTimeout(() => {
        setIsOpen(true);
        setStoredData({ lastShown: Date.now() });
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [isLoggedIn]);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      // Use the native install prompt for Chrome/Edge
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setStoredData({ installed: true });
      }
      setDeferredPrompt(null);
    }
    setIsOpen(false);
  };

  const handleDismiss = () => {
    setIsOpen(false);
  };

  const handleDontShowAgain = () => {
    setStoredData({ dismissedPermanently: true });
    setIsOpen(false);
  };

  const handleMarkAsInstalled = () => {
    setStoredData({ installed: true });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Smartphone className="h-6 w-6 text-primary" />
            Install Co:Lab Connect
          </DialogTitle>
          <DialogDescription>
            Add Co:Lab Connect to your home screen for quick access and a better experience.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {platform === "ios" && <IOSInstructions />}
          {platform === "android" && (
            <AndroidInstructions
              deferredPrompt={deferredPrompt}
              onInstall={handleInstallClick}
            />
          )}
          {platform === "desktop" && <DesktopInstructions />}
          {platform === "unknown" && <GenericInstructions />}
        </div>

        <div className="flex flex-col gap-2 pt-2">
          {deferredPrompt && (
            <Button onClick={handleInstallClick} className="w-full">
              <Download className="h-4 w-4 mr-2" />
              Install Now
            </Button>
          )}

          <Button variant="outline" onClick={handleMarkAsInstalled} className="w-full">
            I've Already Installed It
          </Button>

          <div className="flex gap-2">
            <Button variant="ghost" onClick={handleDismiss} className="flex-1">
              Remind Me Later
            </Button>
            <Button
              variant="ghost"
              onClick={handleDontShowAgain}
              className="text-muted-foreground text-sm"
            >
              <X className="h-4 w-4 mr-1" />
              Don't Show Again
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function IOSInstructions() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        How to Install on iPhone/iPad
      </h3>

      <div className="space-y-3">
        <Step number={1}>
          <div className="flex items-center gap-2">
            <span>Tap the</span>
            <Share className="h-5 w-5 text-primary" />
            <span className="font-medium">Share</span>
            <span>button in Safari</span>
          </div>
        </Step>

        <Step number={2}>
          <div className="flex items-center gap-2">
            <span>Scroll down and tap</span>
            <span className="font-medium flex items-center gap-1">
              <Plus className="h-4 w-4" />
              Add to Home Screen
            </span>
          </div>
        </Step>

        <Step number={3}>
          <span>Tap <span className="font-medium">Add</span> in the top right corner</span>
        </Step>
      </div>

      <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
        Note: You must use Safari for this to work. Other browsers don't support adding to home screen on iOS.
      </p>
    </div>
  );
}

interface AndroidInstructionsProps {
  deferredPrompt: any;
  onInstall: () => void;
}

function AndroidInstructions({ deferredPrompt, onInstall }: AndroidInstructionsProps) {
  if (deferredPrompt) {
    return (
      <div className="space-y-4">
        <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
          Install on Android
        </h3>
        <p className="text-sm">
          Click the <span className="font-medium">Install Now</span> button below to add Co:Lab Connect to your home screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        How to Install on Android
      </h3>

      <div className="space-y-3">
        <Step number={1}>
          <div className="flex items-center gap-2">
            <span>Tap the</span>
            <MoreVertical className="h-5 w-5 text-primary" />
            <span className="font-medium">menu</span>
            <span>(three dots) in Chrome</span>
          </div>
        </Step>

        <Step number={2}>
          <div className="flex items-center gap-2">
            <span>Tap</span>
            <span className="font-medium flex items-center gap-1">
              <Download className="h-4 w-4" />
              Install app
            </span>
            <span>or</span>
            <span className="font-medium">Add to Home screen</span>
          </div>
        </Step>

        <Step number={3}>
          <span>Tap <span className="font-medium">Install</span> to confirm</span>
        </Step>
      </div>
    </div>
  );
}

function DesktopInstructions() {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
        How to Install on Desktop
      </h3>

      <div className="space-y-3">
        <Step number={1}>
          <span>Look for the <span className="font-medium">install icon</span> in the address bar (right side)</span>
        </Step>

        <Step number={2}>
          <span>Click it and select <span className="font-medium">Install</span></span>
        </Step>
      </div>

      <p className="text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
        Available in Chrome, Edge, and other Chromium-based browsers.
      </p>
    </div>
  );
}

function GenericInstructions() {
  return (
    <div className="space-y-4">
      <p className="text-sm">
        You can add Co:Lab Connect to your home screen for quick access. Look for an "Add to Home Screen" or "Install" option in your browser's menu.
      </p>
    </div>
  );
}

interface StepProps {
  number: number;
  children: React.ReactNode;
}

function Step({ number, children }: StepProps) {
  return (
    <div className="flex gap-3 items-start">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
        {number}
      </div>
      <div className="text-sm pt-0.5">{children}</div>
    </div>
  );
}
