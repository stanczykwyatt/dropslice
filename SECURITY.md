# Security

dropslice opens files people may not want to share, so it's built to keep them on their computer.

## Reporting a vulnerability

Please report security problems privately through **Security → Report a vulnerability** on this repository, not in a public issue. You'll get a reply within a few days.

## How it keeps files private

- **No server.** The page is static files on GitHub Pages. Files you drop or pick are read by your browser from your disk and never sent anywhere.
- **No cookies, storage, analytics or tracking.** CI checks the code for any way of sending data (POST, beacons, sockets), for browser storage, and for analytics.
- **It fetches only its own files** (the viewer, the compression plugins and the example), plus the one https address you give with `?url=`. That request carries no cookies.
- **A Content Security Policy** in the page allows scripts only from the page itself, no plugins, no forms and no `<base>` changes. It allows `unsafe-eval` because h5web's array library (ndarray-ops) builds small functions at run time, and `wasm-unsafe-eval` for the HDF5 reader, which is WebAssembly.

## Hostile files

- **NumPy object arrays are refused.** They're stored as Python pickles, which can run code when loaded; dropslice never unpickles anything.
- **The format readers only parse.** Damaged files stop with a message. Sizes inside a file are checked against the file's real length before they're used, and ZIP entries must unpack to their stated size.
- **HDF5 is read by h5wasm,** the HDF Group's own library compiled to WebAssembly, in a web worker.
- **Memory:** NumPy, MATLAB v5 and `.npz` files are read whole, so a huge or hostile file can use a lot of the tab's memory. The browser stops the tab before it affects anything else.

## Dependencies

h5web, h5wasm, h5wasm-plugins, zarrita, numcodecs and React, all permissively licensed; CI checks that. Their licenses are in `public/THIRD_PARTY_NOTICES.txt`.
