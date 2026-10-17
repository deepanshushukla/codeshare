import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test-setup.ts',
    // Vitest's default excludes don't cover .claude/ -- a Claude Code
    // worktree nested there (e.g. .claude/worktrees/<name>/) has its own
    // full src/ tree, and without this it gets double-discovered and
    // double-run alongside the real one.
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
