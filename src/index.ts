/*!
 * csv-walker
 * Copyright (c) 2026 Jesse G. Donat
 * Released under the MIT License.
 *
 * This notice may not be removed or altered from any source distribution.
 */

export type Chunk = string | Uint8Array;

export type Source =
	| Blob
	| Iterable<Chunk>
	| AsyncIterable<Chunk>
	| ReadableStream<Chunk>;

export type Row = Generator<string>;

export type Rows = Generator<Row>;

export type AsyncRow = AsyncGenerator<string>;

export type AsyncRows = AsyncGenerator<AsyncRow>;

type Settings = {
	encoding: string;
	separator: string;
	enclosure: string;
	escape: string;
};

export type Option = (settings: Settings) => void;

function option(
	name: "separator" | "enclosure" | "escape",
	value: string,
	empty = false,
): Option {
	if ((empty && value === "") || [...value].length === 1) {
		return (settings) => {
			settings[name] = value;
		};
	}

	throw new TypeError(
		`${name} must be one character${empty ? " or empty" : ""}`,
	);
}

/** Sets the field separator. */
export function separator(value: string): Option {
	return option("separator", value);
}

/** Sets the quoted-field enclosure. */
export function enclosure(value: string): Option {
	return option("enclosure", value);
}

/**
 * Sets the character that keeps a following enclosure literal in a quoted
 * field. Pass an empty string to disable escaping.
 */
export function escape(value: string): Option {
	return option("escape", value, true);
}

/** Sets the encoding used to decode byte input. */
export function encoding(value: string): Option {
	try {
		const decoder = new TextDecoder(value);
		decoder.decode();
	} catch {
		throw new TypeError(`Unknown encoding: ${value}`);
	}

	return (settings) => {
		settings.encoding = value;
	};
}

type Cell = {
	last: boolean;
	value: string;
};

type CSV = {
	finish: () => Cell | undefined;
	push: (character: string) => Cell | undefined;
};

type State = (character: string) => State;

function csv(settings: Settings): CSV {
	let column = "";
	let record = false;
	let state: State = readColumn;

	function push(character: string): Cell | undefined {
		let cell: Cell | undefined;

		state = state(character);
		cell = output;
		output = undefined;

		return cell;
	}

	function finish(): Cell | undefined {
		if (!record) {
			return undefined;
		}

		const cell = { last: true, value: column };
		column = "";
		record = false;

		return cell;
	}

	let output: Cell | undefined;

	function readColumn(character: string): State {
		if (character === settings.separator) {
			record = true;
			columnDone(false);
			return readColumn;
		}

		if (character === "\n") {
			columnDone(true);
			return readColumn;
		}

		if (character === "\r") {
			columnDone(true);
			return readLineFeed;
		}

		if (character === settings.enclosure && column === "") {
			record = true;
			return readQuotedColumn;
		}

		record = true;
		column += character;
		return readColumn;
	}

	function readQuotedColumn(character: string): State {
		if (character === settings.enclosure) {
			return readQuote;
		}

		if (settings.escape !== "" && character === settings.escape) {
			column += character;
			return readEscapedEnclosure;
		}

		column += character;
		return readQuotedColumn;
	}

	function readQuote(character: string): State {
		if (character === settings.enclosure) {
			column += character;
			return readQuotedColumn;
		}

		return readColumn(character);
	}

	function readEscapedEnclosure(character: string): State {
		column += character;
		return readQuotedColumn;
	}

	function readLineFeed(character: string): State {
		if (character === "\n") {
			return readColumn;
		}

		return readColumn(character);
	}

	function columnDone(last: boolean) {
		output = { last, value: column };
		column = "";

		if (last) {
			record = false;
		}
	}

	return { finish, push };
}

function nextCell(reader: CSV, input: Iterator<string>): Cell | undefined {
	while (true) {
		const character = input.next();

		if (character.done) {
			return reader.finish();
		}

		const cell = reader.push(character.value);

		if (cell) {
			return cell;
		}
	}
}

async function nextAsyncCell(
	reader: CSV,
	input: AsyncIterator<string>,
): Promise<Cell | undefined> {
	while (true) {
		const character = await input.next();

		if (character.done) {
			return reader.finish();
		}

		const cell = reader.push(character.value);

		if (cell) {
			return cell;
		}
	}
}

function skipRow(reader: CSV, input: Iterator<string>) {
	while (true) {
		const cell = nextCell(reader, input);

		if (!cell || cell.last) {
			return;
		}
	}
}

async function skipAsyncRow(reader: CSV, input: AsyncIterator<string>) {
	while (true) {
		const cell = await nextAsyncCell(reader, input);

		if (!cell || cell.last) {
			return;
		}
	}
}

function* columns(
	first: Cell,
	reader: CSV,
	input: Iterator<string>,
	complete: { value: boolean },
): Row {
	let cell = first;

	while (true) {
		if (cell.last) {
			complete.value = true;
		}

		yield cell.value;

		if (cell.last) {
			return;
		}

		const next = nextCell(reader, input);

		if (!next) {
			throw new Error("CSV ended before the record did");
		}

		cell = next;
	}
}

async function* asyncColumns(
	first: Cell,
	reader: CSV,
	input: AsyncIterator<string>,
	complete: { value: boolean },
): AsyncRow {
	let cell = first;

	while (true) {
		if (cell.last) {
			complete.value = true;
		}

		yield cell.value;

		if (cell.last) {
			return;
		}

		const next = await nextAsyncCell(reader, input);

		if (!next) {
			throw new Error("CSV ended before the record did");
		}

		cell = next;
	}
}

function configure(options: Option[]): Settings {
	const value: Settings = {
		encoding: "utf-8",
		enclosure: '"',
		escape: "\\",
		separator: ",",
	};

	for (const apply of options) {
		apply(value);
	}

	return value;
}

function* parseString(text: string, options: Settings): Rows {
	const reader = csv(options);
	const input = text[Symbol.iterator]();

	while (true) {
		const first = nextCell(reader, input);

		if (!first) {
			return;
		}

		const complete = { value: first.last };
		yield columns(first, reader, input, complete);

		if (!complete.value) {
			skipRow(reader, input);
		}
	}
}

function isBlob(source: Source): source is Blob {
	return typeof Blob !== "undefined" && source instanceof Blob;
}

async function* chunks(source: Source): AsyncGenerator<Chunk> {
	if (isBlob(source)) {
		yield* chunks(source.stream());
		return;
	}

	if (Symbol.asyncIterator in source) {
		yield* source as AsyncIterable<Chunk>;
		return;
	}

	if (Symbol.iterator in source) {
		yield* source as Iterable<Chunk>;
		return;
	}

	const reader = (source as ReadableStream<Chunk>).getReader();

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) {
				return;
			}

			yield value;
		}
	} finally {
		reader.releaseLock();
	}
}

async function* characters(
	source: Source,
	label: string,
): AsyncGenerator<string> {
	let decoder: TextDecoder | undefined;

	for await (const chunk of chunks(source)) {
		const text =
			typeof chunk === "string"
				? `${decoder?.decode() ?? ""}${chunk}`
				: (decoder ??= new TextDecoder(label)).decode(chunk, {
						stream: true,
					});

		if (typeof chunk === "string") {
			decoder = undefined;
		}

		for (const character of text) {
			yield character;
		}
	}

	if (decoder) {
		for (const character of decoder.decode()) {
			yield character;
		}
	}
}

async function* parseSource(source: Source, options: Settings): AsyncRows {
	const reader = csv(options);
	const input = characters(source, options.encoding)[Symbol.asyncIterator]();

	try {
		while (true) {
			const first = await nextAsyncCell(reader, input);

			if (!first) {
				return;
			}

			const complete = { value: first.last };
			yield asyncColumns(first, reader, input, complete);

			if (!complete.value) {
				await skipAsyncRow(reader, input);
			}
		}
	} finally {
		if (input.return) {
			await input.return(undefined);
		}
	}
}

/**
 * Parses CSV input into rows and columns.
 *
 * With a string, returns `Rows`: a synchronous generator of `Row` values.
 * With a Blob, stream, or iterable of string or Uint8Array chunks, returns
 * `AsyncRows`: an asynchronous generator of `AsyncRow` values. Rows yield
 * column strings.
 *
 * Pass options such as separator(), enclosure(), escape(), or encoding() after
 * the input to configure parsing.
 *
 * Stream input is consumed. If you stop parsing early, do not assume it can
 * be reused. Manage cancellation or destruction at the call site when that
 * matters.
 */
export function parse(source: string, ...options: Option[]): Rows;
export function parse(source: Source, ...options: Option[]): AsyncRows;
export function parse(
	source: string | Source,
	...options: Option[]
): Rows | AsyncRows {
	const value = configure(options);

	return typeof source === "string"
		? parseString(source, value)
		: parseSource(source, value);
}

/**
 * Collects every column from one synchronous row.
 *
 * Reads the complete row into memory.
 */
export function allValues(values: Row): string[];

/**
 * Collects every column from one asynchronous row.
 *
 * Reads the complete row into memory.
 */
export function allValues(values: AsyncRow): Promise<string[]>;

/**
 * Collects every row and column from a synchronous parser.
 *
 * Reads the complete input into memory. Avoid it for large data sets.
 */
export function allValues(values: Rows): string[][];

/**
 * Collects every row and column from an asynchronous parser.
 *
 * Reads the complete input into memory. Avoid it for large data sets.
 */
export function allValues(values: AsyncRows): Promise<string[][]>;
export function allValues(
	values: Row | AsyncRow | Rows | AsyncRows,
): string[] | string[][] | Promise<string[] | string[][]> {
	const result: Array<string | string[]> = [];

	if (Symbol.asyncIterator in values) {
		return (async () => {
			for await (const value of values as AsyncIterable<string | AsyncRow>) {
				result.push(typeof value === "string" ? value : await allValues(value));
			}

			return result as string[] | string[][];
		})();
	}

	for (const value of values as Iterable<string | Row>) {
		result.push(typeof value === "string" ? value : [...value]);
	}

	return result as string[] | string[][];
}
