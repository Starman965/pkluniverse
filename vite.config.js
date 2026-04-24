import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const localAppData = process.env.LOCALAPPDATA?.replaceAll('\\', '/');

export default defineConfig({
  base: './',
  cacheDir: localAppData
    ? `${localAppData}/PXL-League-Platform/vite-cache`
    : 'node_modules/.vite',
  plugins: [react()],
});
