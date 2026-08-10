import assert from "node:assert/strict"
import test from "node:test"

import { enclosure, escape, parse, separator } from "../dist/index.js"

function rows(source, ...options) {
	return [...parse(source, ...options)].map((row) => [...row])
}

async function asyncRows(source) {
	const result = []

	for await (const row of parse(source)) {
		result.push([...row])
	}

	return result
}

test("parses a string", () => {
	assert.deepEqual(rows("name,age\nAda,36\nGrace,85"), [
		["name", "age"],
		["Ada", "36"],
		["Grace", "85"]
	])
})

test("parses quoted columns", () => {
	assert.deepEqual(rows('"last, first","said ""hi"""'), [
		["last, first", 'said "hi"']
	])
})

test("configures fgetcsv-style controls", () => {
	assert.deepEqual(rows("'last; first';'said ''hi'''", separator(";"), enclosure("'")), [
		["last; first", "said 'hi'"]
	])

	assert.deepEqual(rows('"c\\"d"', escape("\\")), [['c\\"d']])
})

test("parses chunks from an async stream", async () => {
	async function* stream() {
		yield 'a,"b'
		yield '""c"\r'
		yield "\n1,2"
	}

	assert.deepEqual(await asyncRows(stream()), [
		["a", 'b"c'],
		["1", "2"]
	])
})

test("parses a browser-style readable stream", async () => {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("one,two\n1,2"))
			controller.close()
		}
	})

	assert.deepEqual(await asyncRows(stream), [
		["one", "two"],
		["1", "2"]
	])
})

test("decodes byte chunks", async () => {
	const bytes = new TextEncoder().encode("name\nJosé")

	assert.deepEqual(await asyncRows([bytes.subarray(0, 7), bytes.subarray(7)]), [
		["name"],
		["José"]
	])
})
