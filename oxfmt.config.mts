import { defineConfig } from "oxfmt";

export default defineConfig({
	printWidth: 80,
	semi: true,
	useTabs: true,
	ignorePatterns: ["AGENTS.md", "coverage/", "dist/"],
});
