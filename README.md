# csv-walker

[![Node.js CI](https://github.com/donatj/csv-walker/actions/workflows/ci.yml/badge.svg)](https://github.com/donatj/csv-walker/actions/workflows/ci.yml)
[![Coverage Status](https://coveralls.io/repos/github/donatj/csv-walker/badge.svg?branch=dev)](https://coveralls.io/github/donatj/csv-walker?branch=dev)

Small CSV parser for browsers and Node.js.

It has no runtime dependencies. It reads strings, files, and streams. It yields
rows and columns as it reads them.

## Install

```sh
npm install csv-walker
```

## Strings

Strings use synchronous generators. Each row yields column strings.

```ts
import { parse } from "csv-walker"

for (const row of parse("name,age\nAda,36\nGrace,85")) {
	console.log([...row])
}

// ["name", "age"]
// ["Ada", "36"]
// ["Grace", "85"]
```

## Node files and streams

Files and streams use async generators. Use `for await...of` for rows and
columns.

```ts
import { createReadStream } from "node:fs"
import { parse } from "csv-walker"

for await (const row of parse(createReadStream("people.csv"))) {
	const person = []

	for await (const column of row) {
		person.push(column)
	}

	console.log(person)
}
```

## Browser files

Pass a browser `File` to `parse()`.

```ts
input.addEventListener("change", async () => {
	const [file] = input.files

	for await (const row of parse(file)) {
		for await (const column of row) {
			console.log(column)
		}
	}
})
```

See [`examples/browser.html`](examples/browser.html) for a complete file-picker
example. Build first. Serve the project from a local web server. Browser modules
usually do not load from `file://` URLs.

## CSV controls

Controls use a Go-style option pattern. The defaults match PHP `fgetcsv`.

```ts
import { enclosure, escape, parse, separator } from "csv-walker"

for (const row of parse(input, separator(";"), enclosure("'"), escape(""))) {
	console.log([...row])
}
```

| Option | Default | Use |
| --- | --- | --- |
| `separator(value)` | `","` | Set the field separator. |
| `enclosure(value)` | `"\""` | Set the quoted-field character. |
| `escape(value)` | `"\\"` | Set the PHP-style escape. Pass `""` to turn it off. |

Separators and enclosures take one character. Escapes take one character or an
empty string. Doubled enclosures work. `"said ""hello"""` becomes
`said "hello"`.

With the default escape, a backslash before the enclosure stays in the value.
It also keeps that enclosure from closing the field. Use `escape("")` for RFC
4180 CSV.

## Text encoding

Byte input uses UTF-8 by default. Use `encoding()` for legacy files.

```ts
import { createReadStream } from "node:fs"
import { encoding, parse } from "csv-walker"

const rows = parse(createReadStream("legacy.csv"), encoding("windows-1252"))
```

This affects files, blobs, streams, and byte chunks. It does not affect strings.
The encoding name is passed to `TextDecoder`, so labels such as `"windows-1252"`
and `"cp1252"` work where the platform supports them.

## Streaming

`csv-walker` does not collect the whole input. It does not collect a whole row.
It holds the current column and moves forward as you read it.

Rows share one input cursor. Requesting the next row drops unread columns from
the current row.

```ts
for (const row of parse("id,name,role\n1,Ada,Engineer\n2,Grace,Admiral")) {
	console.log(row.next().value)
}

// id
// 1
// 2
```

| Input | Return value |
| --- | --- |
| String | `Generator<Generator<string>>` |
| `File`, `Blob`, `ReadableStream`, Node stream, or chunk iterable | `AsyncGenerator<AsyncGenerator<string>>` |

## Supported CSV

- Quoted fields. They may contain commas or newlines.
- Doubled enclosures such as `""`.
- Optional PHP-style escapes.
- Unix, Windows, and classic Mac line endings.
- Byte input in any `TextDecoder`-supported encoding; UTF-8 is the default.
  Characters may cross chunk boundaries.

## Examples

- [`examples/node.mjs`](examples/node.mjs): read a file with Node.
  Run `node examples/node.mjs examples/example.csv` after building.
- [`examples/browser.html`](examples/browser.html): read a selected browser
  file.

## Development

```sh
npm test
```

## License

[MIT](LICENSE.md)
