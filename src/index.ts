export type Chunk = string | Uint8Array

export type Source = Blob | Iterable<Chunk> | AsyncIterable<Chunk> | ReadableStream<Chunk>

export type Row = Generator<string>

export type AsyncRow = AsyncGenerator<string>

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

type Cell = {
	last: boolean
	value: string
}

type CSV = {
	finish: () => Cell | undefined
	push: (character: string) => Cell | undefined
}

type State = (character: string) => State

function csv(settings: Settings): CSV {
	let column = ""
	let record = false
	let state: State = readColumn

	function push(character: string): Cell | undefined {
		let cell: Cell | undefined

		state = state(character)
		cell = output
		output = undefined

		return cell
	}

	function finish(): Cell | undefined {
		if (!record) {
			return undefined
		}

		const cell = { last: true, value: column }
		column = ""
		record = false

		return cell
	}

	let output: Cell | undefined

	function readColumn(character: string): State {
		if (character === settings.separator) {
			record = true
			columnDone(false)
			return readColumn
		}

		if (character === "\n") {
			columnDone(true)
			return readColumn
		}

		if (character === "\r") {
			columnDone(true)
			return readLineFeed
		}

		if (character === settings.enclosure && column === "") {
			record = true
			return readQuotedColumn
		}

		record = true
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

	function readQuote(character: string): State {
		if (character === settings.enclosure) {
			column += character
			return readQuotedColumn
		}

		return readColumn(character)
	}

	function readEscapedEnclosure(character: string): State {
		column += character
		return readQuotedColumn
	}

	function readLineFeed(character: string): State {
		if (character === "\n") {
			return readColumn
		}

		return readColumn(character)
	}

	function columnDone(last: boolean) {
		output = { last, value: column }
		column = ""

		if (last) {
			record = false
		}
	}

	return { finish, push }
}

function nextCell(reader: CSV, characters: Iterator<string>): Cell | undefined {
	while (true) {
		const character = characters.next()

		if (character.done) {
			return reader.finish()
		}

		const cell = reader.push(character.value)

		if (cell) {
			return cell
		}
	}
}

async function nextAsyncCell(reader: CSV, characters: AsyncIterator<string>): Promise<Cell | undefined> {
	while (true) {
		const character = await characters.next()

		if (character.done) {
			return reader.finish()
		}

		const cell = reader.push(character.value)

		if (cell) {
			return cell
		}
	}
}

function skipRow(reader: CSV, characters: Iterator<string>) {
	while (true) {
		const cell = nextCell(reader, characters)

		if (!cell || cell.last) {
			return
		}
	}
}

async function skipAsyncRow(reader: CSV, characters: AsyncIterator<string>) {
	while (true) {
		const cell = await nextAsyncCell(reader, characters)

		if (!cell || cell.last) {
			return
		}
	}
}

function* columns(first: Cell, reader: CSV, characters: Iterator<string>, complete: { value: boolean }): Row {
	let cell = first

	while (true) {
		if (cell.last) {
			complete.value = true
		}

		yield cell.value

		if (cell.last) {
			return
		}

		const next = nextCell(reader, characters)

		if (!next) {
			throw new Error("CSV ended before the record did")
		}

		cell = next
	}
}

async function* asyncColumns(first: Cell, reader: CSV, characters: AsyncIterator<string>, complete: { value: boolean }): AsyncRow {
	let cell = first

	while (true) {
		if (cell.last) {
			complete.value = true
		}

		yield cell.value

		if (cell.last) {
			return
		}

		const next = await nextAsyncCell(reader, characters)

		if (!next) {
			throw new Error("CSV ended before the record did")
		}

		cell = next
	}
}

function settings(options: Option[]): Settings {
	const value: Settings = { enclosure: '"', escape: "\\", separator: "," }

	for (const option of options) {
		option(value)
	}

	return value
}

function* parseString(text: string, options: Settings): Generator<Row> {
	const reader = csv(options)
	const characters = text[Symbol.iterator]()

	while (true) {
		const first = nextCell(reader, characters)

		if (!first) {
			return
		}

		const complete = { value: first.last }
		yield columns(first, reader, characters, complete)

		if (!complete.value) {
			skipRow(reader, characters)
		}
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

async function* characters(source: Source): AsyncGenerator<string> {
	let decoder: TextDecoder | undefined

	for await (const chunk of chunks(source)) {
		const text = typeof chunk === "string"
			? `${decoder?.decode() ?? ""}${chunk}`
			: (decoder ??= new TextDecoder()).decode(chunk, { stream: true })

		if (typeof chunk === "string") {
			decoder = undefined
		}

		for (const character of text) {
			yield character
		}
	}

	if (decoder) {
		for (const character of decoder.decode()) {
			yield character
		}
	}
}

async function* parseSource(source: Source, options: Settings): AsyncGenerator<AsyncRow> {
	const reader = csv(options)
	const input = characters(source)[Symbol.asyncIterator]()

	try {
		while (true) {
			const first = await nextAsyncCell(reader, input)

			if (!first) {
				return
			}

			const complete = { value: first.last }
			yield asyncColumns(first, reader, input, complete)

			if (!complete.value) {
				await skipAsyncRow(reader, input)
			}
		}
	} finally {
		if (input.return) {
			await input.return(undefined)
		}
	}
}

export function parse(source: string, ...options: Option[]): Generator<Row>
export function parse(source: Source, ...options: Option[]): AsyncGenerator<AsyncRow>
export function parse(source: string | Source, ...options: Option[]): Generator<Row> | AsyncGenerator<AsyncRow> {
	const value = settings(options)

	return typeof source === "string" ? parseString(source, value) : parseSource(source, value)
}
