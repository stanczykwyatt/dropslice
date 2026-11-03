# Security

dropslice opens files people may not want to share, so it's built to keep them on their computer.

## Reporting a vulnerability

Please report security problems privately through **Security → Report a vulnerability** on this repository, not in a public issue. You'll get a reply within a few days.

## How it keeps files private

- **No server.** The page is static files on GitHub Pages. Files you drop or pick are read by your browser from your disk and never sent anywhere.
- **No cookies, storage, analytics or tracking.** CI scans the code for the usual ways of sending data (POST requests, beacons, sockets), for browser storage and for analytics. It's a simple scan, so reviews still matter.
- **It fetches only its own files** (the viewer, the compression plugins and the example), plus the one https address you give with `?url=` (and, for a Zarr store, the files inside it). That request carries no cookies. The page's policy allows connections to any https address for that reason.
- **A Content Security Policy** in the page allows scripts only from the page itself, no plugins, no forms and no `<base>` changes. It allows `unsafe-eval` because h5web's array library (ndarray-ops) builds small functions at run time, and `wasm-unsafe-eval` for the HDF5 reader, which is WebAssembly.

## Hostile files

- **NumPy object arrays are refused.** They're stored as Python pickles, which can run code when loaded; dropslice never unpickles anything.
- **The format readers only parse.** Damaged files stop with a message. Sizes inside a file are checked against the data actually stored before anything is built from them, and compressed data stops unpacking as soon as it passes its stated size or about 2 GB.
- **HDF5 is read by h5wasm,** the HDF Group's own library compiled to WebAssembly, in a web worker.
- **Memory:** NumPy, MATLAB v5 and `.npz` files are read whole, so a huge or hostile file can use a lot of the tab's memory. The browser stops the tab before it affects anything else.

## Dependencies

h5web, h5wasm, h5wasm-plugins, zarrita, numcodecs and React, all permissively licensed; CI checks that. Their licenses are in `public/THIRD_PARTY_NOTICES.txt`.
