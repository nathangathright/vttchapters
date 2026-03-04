import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    open: "/index.html",
  },
  build: {
    outDir: "../dist",
  },
  root: "src",
  base: "/vttchapters/"
});
