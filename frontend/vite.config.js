import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Caminhos relativos para funcionar no Electron (file://)
  base: "./",
  plugins: [react()]
});
