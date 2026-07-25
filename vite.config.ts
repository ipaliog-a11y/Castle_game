import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    // Capacitor wraps dist/ as-is for the Android build, so keep paths relative.
    assetsDir: 'assets',
  },
});
