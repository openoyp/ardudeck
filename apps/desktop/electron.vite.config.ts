import { resolve } from 'path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// electron-store must be bundled: it depends on conf -> env-paths@3 + 10 other
// ESM-only transitive deps that fail with ERR_MODULE_NOT_FOUND in packaged apps.
// Everything else (workspace packages, native modules) is handled correctly by
// externalizeDepsPlugin + electron-builder.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@ardudeck/dataflash-parser', '@ardudeck/module-sdk'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
          // Log parsing runs in a worker thread: a 200 MB dataflash file takes
          // many seconds to decode, and on the main thread that stalls IPC,
          // every window AND the MAVLink link.
          'log-worker': resolve(__dirname, 'src/main/log-worker.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['electron-store', '@ardudeck/module-sdk'] })],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/preload.ts'),
        },
      },
    },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      target: 'esnext',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
    },
    optimizeDeps: {
      esbuildOptions: {
        target: 'esnext',
      },
    },
    plugins: [react()],
  },
});
