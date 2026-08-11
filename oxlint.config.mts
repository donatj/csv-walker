import { defineConfig } from "oxlint";

export default defineConfig({
	plugins: ["typescript"],
	env: {
		browser: true,
		node: true,
	},
	ignorePatterns: ["coverage/", "dist/"],
	categories: {
		correctness: "error",
		suspicious: "error",
	},
	rules: {
		// Examples write their result to the console.
		"no-console": "off",
	},
});
