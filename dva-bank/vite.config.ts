/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt", // never reload mid-session; the app shows an "update available" toast
      includeAssets: ["favicon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "CertPrep — AWS Developer Associate",
        short_name: "CertPrep",
        description: "Spaced-repetition practice for the AWS Certified Developer – Associate exam.",
        theme_color: "#0b0f19",
        background_color: "#0b0f19",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Content is bundled into JS chunks, so precaching the build makes the whole bank available offline.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        // fonts for scripts the content never uses are fetched on demand (unicode-range), not precached
        globIgnores: ["**/*-{cyrillic,cyrillic-ext,greek,greek-ext,vietnamese}-*.woff2"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/auth\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
  // ~290 kB gzip of core libraries (react-dom, supabase-js, react-router, zod, motion); routes and charts are split
  build: { chunkSizeWarningLimit: 1100 },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
