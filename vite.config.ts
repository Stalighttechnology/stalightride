import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

export default defineConfig({
  // The router plugin must come before react(): it generates src/routeTree.gen.ts.
  plugins: [tanstackRouter({ target: "react", autoCodeSplitting: true }), react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 8080,
    strictPort: true,
    // One origin for the browser: API calls and the live feed go to Django.
    proxy: {
      "/api": { target: backend },
      "/ws": { target: backend, ws: true },
    },
  },
});
