import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("ag-studio")) return "ag-studio";
          if (id.includes("ag-charts")) return "ag-charts";
          if (id.includes("ag-grid")) return "ag-grid";
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8787",
      "/healthz": "http://localhost:8787",
    },
  },
});
