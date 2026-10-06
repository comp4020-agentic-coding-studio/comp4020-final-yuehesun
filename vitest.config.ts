import { defineConfig } from "vitest/config";

// Every test in spec/ runs against the running app, which spec/global-setup.ts
// finds. Only spec/ runs: a test anywhere else needs adding to `include`.
export default defineConfig({
  test: {
    include: ["spec/**/*.test.ts"],
    globalSetup: ["./spec/global-setup.ts"],
    // Every file mutates shared state in the one running app (reservations,
    // room numbers), so files run one at a time — parallel workers each got
    // their own uniqueRoom() counter, and two files could mint the same
    // room number against the same live app.
    fileParallelism: false,
  },
});
