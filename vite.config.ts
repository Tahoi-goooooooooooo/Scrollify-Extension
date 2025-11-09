import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        copyFileSync(
          resolve(__dirname, 'manifest.json'),
          resolve(__dirname, 'dist/manifest.json')
        );
        // Copy popup HTML to correct location and fix asset paths
        const popupPath = resolve(__dirname, 'dist/src/popup/index.html');
        const targetPath = resolve(__dirname, 'dist/popup/index.html');
        try {
          let content = readFileSync(popupPath, 'utf-8');
          // Fix absolute paths to relative paths
          content = content.replace(/src="\/assets\//g, 'src="../assets/');
          content = content.replace(/href="\/assets\//g, 'href="../assets/');
          mkdirSync(resolve(__dirname, 'dist/popup'), { recursive: true });
          writeFileSync(targetPath, content);
        } catch (error) {
          console.warn('Could not copy popup HTML:', error);
        }
      },
    },
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        background: resolve(__dirname, 'src/background.ts'),
        popup: resolve(__dirname, 'src/popup/index.html'),
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'background') {
            return 'background.js';
          }
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'index.html') {
            return 'popup/index.html';
          }
          return 'assets/[name]-[hash].[ext]';
        },
      },
    },
  },
});

