import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/e2e/**",
      // Copies de travail des sessions Claude Code (worktrees) : pas le projet.
      "**/.claude/**",
    ],
  },
});
