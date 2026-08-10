# csv-walker

Tiny CSV parser for browsers and Node.js. It has no dependencies and reads one
row at a time. Each row is a generator of column strings.

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
escape option for RFC 4180-style CSV.

```ts
import { enclosure, escape, parse, separator } from "csv-walker"

for (const row of parse(input, separator(";"), enclosure("'"), escape(""))) {
	console.log([...row])
}
```

For a browser `File`/`Blob`, `ReadableStream`, or a Node stream, use `for await`:

```ts
for await (const row of parse(file)) {
	console.log([...row])
}
```

`parse()` handles quoted columns, doubled enclosures, PHP-style escapes, and Unix,
Windows, or classic Mac line endings. In Node, pass an `fs.createReadStream()`
result. In a browser, pass a `File`, `Blob`, or `ReadableStream`.
