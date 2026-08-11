import { createReadStream } from "node:fs"

import { parse } from "../dist/index.js"

const [path] = process.argv.slice(2)

if (!path) {
	console.error("Usage: node examples/node.mjs <file.csv>")
	process.exitCode = 1
} else {
	for await (const row of parse(createReadStream(path))) {
		const columns = []

		for await (const column of row) {
			columns.push(column)
		}

		console.log(JSON.stringify(columns))
	}
}
