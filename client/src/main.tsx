import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Block camera/microphone access by default in PWA
// Only file inputs (for photo uploads) should trigger the OS camera picker
// This prevents any accidental or unwanted camera activation
if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);

  // Track if camera access was explicitly allowed (e.g., from user clicking upload button)
  (window as any).__cameraAccessAllowed = false;

  navigator.mediaDevices.getUserMedia = async (constraints) => {
    // Block all getUserMedia calls - we only use file inputs for camera access
    // File inputs trigger the native OS camera picker, not getUserMedia
    console.warn('[Security] Blocked unexpected camera/microphone access request');
    throw new DOMException('Camera access is not allowed', 'NotAllowedError');
  };

  console.log('[Security] Camera/microphone access blocked by default');
}

// Also revoke any existing camera permissions on app start
if (navigator.permissions && navigator.permissions.query) {
  navigator.permissions.query({ name: 'camera' as PermissionName }).then((result) => {
    if (result.state === 'granted') {
      console.log('[Security] Camera permission was previously granted, access will still be blocked by app');
    }
  }).catch(() => {
    // Permissions API not fully supported, that's okay
  });
}

// Register service worker early to ensure cache clearing happens for ALL users
// This fixes Android PWA caching issues
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then((registration) => {
    console.log("[App] Service worker registered");

    // Check for updates immediately
    registration.update();

    // Listen for service worker updates
    registration.addEventListener("updatefound", () => {
      const newWorker = registration.installing;
      if (newWorker) {
        newWorker.addEventListener("statechange", () => {
          if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
            console.log("[App] New service worker installed, will activate on next load");
          }
        });
      }
    });
  }).catch((error) => {
    console.error("[App] Service worker registration failed:", error);
  });

  // Handle messages from service worker
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED") {
      console.log("[App] Service worker updated, reloading...");
      window.location.reload();
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
