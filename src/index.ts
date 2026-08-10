export type Chunk = string | Uint8Array

export type Source = Blob | Iterable<Chunk> | AsyncIterable<Chunk> | ReadableStream<Chunk>

export type Row = Generator<string>

type Settings = {
	separator: string
	enclosure: string
	escape: string
}

export type Option = (settings: Settings) => void

function option(name: keyof Settings, value: string, empty = false): Option {
	if ((empty && value === "") || [...value].length === 1) {
		return (settings) => {
			settings[name] = value
		}
	}

	throw new TypeError(`${name} must be one character${empty ? " or empty" : ""}`)
}

export function separator(value: string): Option {
	return option("separator", value)
}

export function enclosure(value: string): Option {
	return option("enclosure", value)
}

export function escape(value: string): Option {
	return option("escape", value, true)
}

type State = (character: string, rows: string[][]) => State

function csv(settings: Settings) {
	let row: string[] = []
	let column = ""
	let state: State = readColumn

	function push(text: string): string[][] {
		const rows: string[][] = []

		for (const character of text) {
			state = state(character, rows)
		}

		return rows
	}

	function finish(): string[] | undefined {
		if (row.length === 0 && column === "" && state !== readQuotedColumn && state !== readQuote) {
			return undefined
		}

		return rowDone()
	}

	function readColumn(character: string, rows: string[][]): State {
		if (character === settings.separator) {
			columnDone()
			return readColumn
		}

		if (character === "\n") {
			rows.push(rowDone())
			return readColumn
		}

		if (character === "\r") {
			rows.push(rowDone())
			return readLineFeed
		}

		if (character === settings.enclosure && column === "") {
			return readQuotedColumn
		}

		column += character
		return readColumn
	}

	function readQuotedColumn(character: string): State {
		if (character === settings.enclosure) {
			return readQuote
		}

		if (settings.escape !== "" && character === settings.escape) {
			column += character
			return readEscapedEnclosure
		}

		column += character
		return readQuotedColumn
	}

	function readQuote(character: string, rows: string[][]): State {
		if (character === settings.enclosure) {
			column += character
			return readQuotedColumn
		}

		return readColumn(character, rows)
	}

	function readEscapedEnclosure(character: string): State {
		column += character
		return readQuotedColumn
	}

	function readLineFeed(character: string, rows: string[][]): State {
		if (character === "\n") {
			return readColumn
		}

		return readColumn(character, rows)
	}

	function columnDone() {
		row.push(column)
		column = ""
	}

	function rowDone(): string[] {
		columnDone()

		const value = row
		row = []

		return value
	}

	return { finish, push }
}

function* columns(values: string[]): Row {
	yield* values
}

function settings(options: Option[]): Settings {
	const value = { enclosure: '"', escape: "\\", separator: "," }

	for (const option of options) {
		option(value)
	}

	return value
}

function* parseString(text: string, options: Settings): Generator<Row> {
	const reader = csv(options)

	for (const values of reader.push(text)) {
		yield columns(values)
	}

	const values = reader.finish()

	if (values) {
		yield columns(values)
	}
}

function isBlob(source: Source): source is Blob {
	return typeof Blob !== "undefined" && source instanceof Blob
}

async function* chunks(source: Source): AsyncGenerator<Chunk> {
	if (isBlob(source)) {
		yield* chunks(source.stream())
		return
	}

	if (Symbol.asyncIterator in source) {
		yield* source as AsyncIterable<Chunk>
		return
	}

	if (Symbol.iterator in source) {
		yield* source as Iterable<Chunk>
		return
	}

	const reader = (source as ReadableStream<Chunk>).getReader()

	try {
		while (true) {
			const { done, value } = await reader.read()

			if (done) {
				return
			}

			yield value
		}
	} finally {
		reader.releaseLock()
	}
}

async function* parseSource(source: Source, options: Settings): AsyncGenerator<Row> {
	const reader = csv(options)
	let decoder: TextDecoder | undefined

	for await (const chunk of chunks(source)) {
		const text = typeof chunk === "string"
			? `${decoder?.decode() ?? ""}${chunk}`
			: (decoder ??= new TextDecoder()).decode(chunk, { stream: true })

		if (typeof chunk === "string") {
			decoder = undefined
		}

		for (const values of reader.push(text)) {
			yield columns(values)
		}
	}

	if (decoder) {
		for (const values of reader.push(decoder.decode())) {
			yield columns(values)
		}
	}

	const values = reader.finish()

	if (values) {
		yield columns(values)
	}
}

export function parse(source: string, ...options: Option[]): Generator<Row>
export function parse(source: Source, ...options: Option[]): AsyncGenerator<Row>
export function parse(source: string | Source, ...options: Option[]): Generator<Row> | AsyncGenerator<Row> {
	const value = settings(options)

	return typeof source === "string" ? parseString(source, value) : parseSource(source, value)
}
