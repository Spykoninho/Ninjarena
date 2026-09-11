import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts'],
  format: ['esm'],
  target: 'node22',
  // Workspace packages ship TypeScript sources, so they must be bundled in.
  noExternal: [/^@ninjarena\//],
  clean: true,
});
