import express, { type Express } from "express";
import fs from "fs";
import path from "path";

export function serveStatic(app: Express) {
  const distPath = path.resolve(__dirname, "public");
  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  // Serve service worker with no-cache headers to ensure updates are always fetched
  app.get("/sw.js", (_req, res) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("Content-Type", "application/javascript");
    res.sendFile(path.resolve(distPath, "sw.js"));
  });

  // Serve manifest.json with short cache to pick up updates
  app.get("/manifest.json", (_req, res) => {
    res.setHeader("Cache-Control", "max-age=0, must-revalidate");
    res.setHeader("Content-Type", "application/json");
    res.sendFile(path.resolve(distPath, "manifest.json"));
  });

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
