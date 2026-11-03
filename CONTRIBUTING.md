# Contributing

Thanks for helping out! Bug reports, new formats and pull requests are all welcome.

## Reporting a file that won't open

Open a [bug report](https://github.com/stanczykwyatt/dropslice/issues/new?template=bug.yml) with the format, what wrote the file (h5py, MATLAB, numpy, zarr-python and their versions) and what you saw. A small file that shows the problem, with made-up data, helps most. Please don't share private data.

## Getting started

You need Node 20 or later.

```bash
npm ci
npm run dev                    # the page at localhost, with hot reload
npm test                       # the format readers, in Node, against test/fixtures
node scripts/check-rules.mjs   # nothing sent anywhere, no pickles, strict CSP
npm run build                  # the site, into docs/ (commit it; Pages serves it)
```

The test files in `test/fixtures` and the example in `public/example.h5` are written by `scripts/make-fixtures.py` (Python with numpy, scipy, h5py and zarr 2). Every value in them is made up, as a formula of its position. The icon, demo and preview image come from `swift scripts/make-art.swift`, and `node scripts/notices.mjs` rewrites the third-party licenses after dependencies change.

## How it's put together

- `src/formats/` reads each format into one shape: groups of children, and datasets that read a slice of themselves (`tree.js`). `npy.js` handles .npy and .npz (with `zip.js`), `mat5.js` MATLAB v5, `zarr.js` Zarr through zarrita, and `detect.js` tells them apart by their first bytes. These files don't touch the browser, so they run in Node and are shared with SciLook.
- `src/provider.js` shows any of those trees in h5web.
- `src/open.js` turns a dropped file, folder or address into something to show; HDF5 goes to h5web's own h5wasm reader.
- `src/main.jsx` is the page, and `src/viewer.jsx` the viewer, loaded only when a file is opened.

## Ground rules

- **Nothing leaves the computer.** No uploads, analytics, cookies or storage.
- **Never run code from a file.** No unpickling, no eval of file contents.
- **Permissive dependencies only,** listed in the notices.
- **Made-up data only** in test files and art.
- Run `npm test` and `node scripts/check-rules.mjs` before opening a pull request, add a test with your change, and commit the rebuilt `docs/`.

## Security issues

Please don't open public issues for vulnerabilities. See [SECURITY.md](SECURITY.md).
