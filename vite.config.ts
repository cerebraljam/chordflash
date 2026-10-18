import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  plugins: [svelte()],
  // Relative asset paths, so the built app works from any sub-path (e.g. https://<user>.github.io/chordflash/).
  base: './',
  // Pre-bundle up front so the first page load isn't interrupted by a dependency reload.
  optimizeDeps: { include: ['pitchy'] },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
