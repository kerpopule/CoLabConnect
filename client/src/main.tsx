import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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
