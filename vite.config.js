import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is the app: it builds into docs/ for GitHub Pages, with relative paths so it works
// from any folder, including a copy saved to disk.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: { outDir: "docs", emptyOutDir: true, assetsInlineLimit: 0, chunkSizeWarningLimit: 4000 },
  worker: { format: "es" },
});
