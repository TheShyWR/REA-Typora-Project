import { defineConfig } from 'vite';
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 5000, rollupOptions: { output: { inlineDynamicImports: true, format: "iife" } } } });
