import { readFileSync } from "node:fs";
import { marked } from "marked";

// README.md is rendered in full at /readme/ (spec/invariants.test.ts checks
// its headings appear, in order) — marked handles markdown correctly rather
// than hand-rolling a parser for a handful of edge cases.
export function renderReadme(): string {
  const markdown = readFileSync("README.md", "utf8");
  return marked.parse(markdown, { async: false });
}
