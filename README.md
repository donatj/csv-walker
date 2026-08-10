# csv-walker

Tiny CSV parser for browsers and Node.js. It has no dependencies and reads one
column at a time. String input returns `Generator<Generator<string>>`; streams,
files, and blobs return `AsyncGenerator<AsyncGenerator<string>>`.

```ts
import { parse } from "csv-walker"

for (const row of parse("name,age\nAda,36")) {
	for (const column of row) {
		console.log(column)
	}
}
```

Controls use a Go-style option pattern. They match PHP `fgetcsv`'s defaults:
comma separator, double-quote enclosure, and backslash escape. Pass an empty
escape option for RFC 4180-style CSV. Separators and enclosures must be one
character; escapes must be one character or empty.

```ts
import { enclosure, escape, parse, separator } from "csv-walker"

for (const row of parse(input, separator(";"), enclosure("'"), escape(""))) {
	console.log([...row])
}
```

For a browser `File`/`Blob`, `ReadableStream`, or a Node stream, use `for await`:

```ts
for await (const row of parse(file)) {
	for await (const column of row) {
		console.log(column)
	}
}
```

Rows share the input cursor. Requesting the next row discards any unread columns
from the current row, and skipped columns are never yielded.

`parse()` handles quoted columns, doubled enclosures, PHP-style escapes, and Unix,
Windows, or classic Mac line endings. In Node, pass an `fs.createReadStream()`
result. In a browser, pass a `File`, `Blob`, or `ReadableStream`.
