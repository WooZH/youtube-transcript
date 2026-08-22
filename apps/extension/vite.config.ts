import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "copy-manifest",
      closeBundle() {
        const distDir = resolve(__dirname, "dist");
        const manifestSrc = resolve(__dirname, "manifest.json");
        const manifestDest = resolve(distDir, "manifest.json");
        
        if (existsSync(manifestSrc)) {
          copyFileSync(manifestSrc, manifestDest);
        }

        const iconsDir = resolve(distDir, "icons");
        if (!existsSync(iconsDir)) {
          mkdirSync(iconsDir, { recursive: true });
        }

        const iconSizes = [16, 48, 128];
        for (const size of iconSizes) {
          const iconSrc = resolve(__dirname, `public/icons/icon${size}.png`);
          const iconDest = resolve(distDir, `icons/icon${size}.png`);
          if (existsSync(iconSrc)) {
            copyFileSync(iconSrc, iconDest);
          }
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, "popup.html"),
        content: resolve(__dirname, "src/content/index.ts"),
        background: resolve(__dirname, "src/background/index.ts"),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === "content") {
            return "content.js";
          }
          if (chunkInfo.name === "background") {
            return "background.js";
          }
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
});
