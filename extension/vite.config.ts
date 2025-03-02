import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

/** Ensures `host_permissions` includes the API origin from `VITE_API_BASE_URL` (MV3 requires host permission for fetch). */
function patchManifestForApiOrigin(mode: string) {
  return {
    name: 'patch-manifest-api-origin',
    closeBundle() {
      const env = loadEnv(mode, process.cwd(), '');
      const baseUrl =
        env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
      let origin: string;
      try {
        origin = new URL(baseUrl).origin;
      } catch {
        origin = 'http://localhost:3000';
      }
      const hostPerm = `${origin}/*`;
      const manifestPath = resolve(__dirname, 'dist/manifest.json');
      const raw = readFileSync(manifestPath, 'utf8');
      const m = JSON.parse(raw) as { host_permissions?: string[] };
      const existing = m.host_permissions ?? [];
      const merged = [hostPerm, ...existing.filter((p) => p !== hostPerm)];
      m.host_permissions = [...new Set(merged)];
      writeFileSync(manifestPath, JSON.stringify(m, null, 2));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const baseUrl = env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';
  const apiKey = env.VITE_API_KEY || '';

  return {
    plugins: [react(), patchManifestForApiOrigin(mode)],
    build: {
      outDir: 'dist',
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        input: {
          popup: resolve(__dirname, 'popup.html'),
          background: resolve(__dirname, 'src/background/index.ts'),
          content: resolve(__dirname, 'src/content/index.ts'),
        },
        output: {
          entryFileNames: (chunk) => {
            if (chunk.name === 'background') return 'background.js';
            if (chunk.name === 'content') return 'content.js';
            return 'assets/[name]-[hash].js';
          },
          chunkFileNames: 'assets/[name]-[hash].js',
          assetFileNames: 'assets/[name]-[hash].[ext]',
          manualChunks: (id) => {
            if (id.includes('node_modules/recharts')) {
              return 'recharts';
            }
            if (id.includes('node_modules/react')) {
              return 'react-vendor';
            }
          },
        },
      },
      emptyOutDir: true,
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, '../shared'),
      },
    },
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(baseUrl),
      'import.meta.env.VITE_API_KEY': JSON.stringify(apiKey),
    },
  };
});
