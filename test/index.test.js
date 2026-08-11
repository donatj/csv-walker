import assert from "node:assert/strict";
import { File } from "node:buffer";
import { createReadStream } from "node:fs";
import test from "node:test";

import {
	encoding,
	enclosure,
	escape,
	parse,
	separator,
} from "../dist/index.js";

function rows(source, ...options) {
	const result = [];

	for (const row of parse(source, ...options)) {
		result.push([...row]);
	}

	return result;
}

async function asyncRows(source, ...options) {
	const result = [];

	for await (const row of parse(source, ...options)) {
		const values = [];

		for await (const value of row) {
			values.push(value);
		}

		result.push(values);
	}

	return result;
}

test("parses a string", () => {
	assert.deepEqual(rows("name,age\nAda,36\nGrace,85"), [
		["name", "age"],
		["Ada", "36"],
		["Grace", "85"],
	]);
});

test("parses quoted columns", () => {
	assert.deepEqual(rows('"last, first","said ""hi"""'), [
		["last, first", 'said "hi"'],
	]);
});

test("parses blank fields and blank rows", () => {
	assert.deepEqual(rows(""), []);
	assert.deepEqual(rows("\n"), [[""]]);
	assert.deepEqual(rows("a,b,\n,,"), [
		["a", "b", ""],
		["", "", ""],
	]);
});

test("parses every common line ending", () => {
	assert.deepEqual(rows("a,b\r1,2\r\n3,4\n"), [
		["a", "b"],
		["1", "2"],
		["3", "4"],
	]);
});

test("parses newlines and unterminated enclosures", () => {
	assert.deepEqual(rows('"a\nb",c'), [["a\nb", "c"]]);
	assert.deepEqual(rows('"a,b'), [["a,b"]]);
});

test("configures fgetcsv-style controls", () => {
	assert.deepEqual(
		rows("'last; first';'said ''hi'''", separator(";"), enclosure("'")),
		[["last; first", "said 'hi'"]],
	);

	assert.deepEqual(rows('"c\\"d"', escape("\\")), [['c\\"d']]);
	assert.deepEqual(rows('"said ""hello"""', escape("")), [['said "hello"']]);

	assert.throws(() => separator(""), TypeError);
	assert.throws(() => enclosure("''"), TypeError);
	assert.throws(() => escape("\\\\"), TypeError);
	assert.throws(() => encoding("not-an-encoding"), TypeError);
});

test("skips unread columns before the next row", () => {
	const reader = parse("a,b\n1,2");

	reader.next();
	assert.deepEqual([...reader.next().value], ["1", "2"]);
});

test("skips unread columns in every row", () => {
	const values = [];

	for (const row of parse("a,b,c\nd,e,f\ng,h,i")) {
		values.push(row.next().value);
	}

	assert.deepEqual(values, ["a", "d", "g"]);
});

test("skips unread async columns before the next row", async () => {
	async function* stream() {
		yield "a,b\n1,2";
	}

	const reader = parse(stream());

	await reader.next();
	const { value: row } = await reader.next();
	const values = [];

	for await (const value of row) {
		values.push(value);
	}

	assert.deepEqual(values, ["1", "2"]);
});

test("parses a browser File", async () => {
	const file = new File(["name,age\nAda,36"], "people.csv", {
		type: "text/csv",
	});

	assert.deepEqual(await asyncRows(file), [
		["name", "age"],
		["Ada", "36"],
	]);
});

test("parses a browser Blob", async () => {
	const blob = new Blob(["name,age\nGrace,85"], { type: "text/csv" });

	assert.deepEqual(await asyncRows(blob), [
		["name", "age"],
		["Grace", "85"],
	]);
});

test("parses chunks from an async stream", async () => {
	async function* stream() {
		yield 'a,"b';
		yield '""c"\r';
		yield "\n1,2";
	}

	assert.deepEqual(await asyncRows(stream()), [
		["a", 'b"c'],
		["1", "2"],
	]);
});

test("parses a browser-style readable stream", async () => {
	const stream = new ReadableStream({
		start(controller) {
			controller.enqueue(new TextEncoder().encode("one,two\n1,2"));
			controller.close();
		},
	});

	assert.deepEqual(await asyncRows(stream), [
		["one", "two"],
		["1", "2"],
	]);
});

test("parses a readable stream without async iteration", async () => {
	const chunks = ["name,age\n", "Ada,36"];
	let released = false;
	const stream = {
		getReader() {
			return {
				async read() {
					const value = chunks.shift();

					return value === undefined
						? { done: true, value: undefined }
						: { done: false, value };
				},
				releaseLock() {
					released = true;
				},
			};
		},
	};

	assert.deepEqual(await asyncRows(stream), [
		["name", "age"],
		["Ada", "36"],
	]);
	assert.equal(released, true);
});

test("parses a Node file stream", async () => {
	const file = new URL("./fixtures/people.csv", import.meta.url);

	assert.deepEqual(await asyncRows(createReadStream(file)), [
		["name", "quote"],
		["Ada", "hello, world"],
		["Grace", "line one\nline two"],
	]);
});

test("parses a Node TSV file stream", async () => {
	const file = new URL("./fixtures/people.tsv", import.meta.url);

	assert.deepEqual(await asyncRows(createReadStream(file), separator("\t")), [
		["name", "quote"],
		["Ada", "hello\tworld"],
		["Grace", "line one\nline two"],
	]);
});

test("decodes byte chunks", async () => {
	const bytes = new TextEncoder().encode("name\nJosé");

	assert.deepEqual(await asyncRows([bytes.subarray(0, 7), bytes.subarray(7)]), [
		["name"],
		["José"],
	]);
});

test("parses byte chunks followed by strings", async () => {
	const bytes = new TextEncoder().encode("name\n");

	assert.deepEqual(await asyncRows([bytes, "Ada"]), [["name"], ["Ada"]]);
});

test("replaces incomplete byte sequences at the end of input", async () => {
	const bytes = new Uint8Array([0x6e, 0x61, 0x6d, 0x65, 0x0a, 0xc3]);

	assert.deepEqual(await asyncRows([bytes]), [["name"], ["�"]]);
});

test("decodes Windows-1252 byte chunks", async () => {
	const bytes = new Uint8Array([
		0x6e, 0x61, 0x6d, 0x65, 0x0a, 0x63, 0x61, 0x66, 0xe9, 0x2c, 0x80,
	]);

	assert.deepEqual(await asyncRows([bytes], encoding("windows-1252")), [
		["name"],
		["café", "€"],
	]);
});
