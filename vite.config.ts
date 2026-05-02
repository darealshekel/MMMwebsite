import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const liveWebsiteApiTarget = process.env.VITE_API_PROXY_TARGET ?? "https://www.mmmaniacs.com";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: liveWebsiteApiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
    hmr: {
      overlay: false,
    },
  },
  preview: {
    proxy: {
      "/api": {
        target: liveWebsiteApiTarget,
        changeOrigin: true,
        secure: false,
      },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  build: {
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return undefined;
          }

          if (id.includes("@tanstack/react-query")) {
            return "query";
          }

          if (id.includes("skinview3d") || id.includes("three")) {
            return "minecraft-viewer";
          }

          if (id.includes("framer-motion")) {
            return "motion";
          }

          if (id.includes("recharts")) {
            return "charts";
          }

          return "vendor";
        },
      },
    },
  },
}));
