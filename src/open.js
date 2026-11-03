// Turns what was dropped or picked into something the viewer can show. Files are read in the
// browser and never sent anywhere. HDF5 (NWB, .h5, MATLAB v7.3) goes to h5web's own reader; the
// other formats become a tree through src/formats.
import { FetchStore } from "@zarrita/storage";
import { sniff, LABELS } from "./formats/detect.js";
import { npyGroup, npzGroup } from "./formats/npy.js";
import { parseMat5 } from "./formats/mat5.js";
import { zarrTree, nodesFromKeys, nodesFromConsolidated } from "./formats/zarr.js";
import { FormatError } from "./formats/tree.js";
import { TreeProvider } from "./provider.js";

export { FormatError };

// Formats other than HDF5 are read whole into memory, which browsers cap at a few gigabytes.
const IN_MEMORY_LIMIT = 2 * 1024 ** 3;
// The most a web address may send for a whole-file format.
const URL_LIMIT = 1024 ** 3;

async function inflateWith(format, bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
const inflate = (b) => inflateWith("deflate", b);
const inflateRaw = (b) => inflateWith("deflate-raw", b);

async function fromBytes(name, bytes, kind) {
  if (kind === "npy") return npyGroup(name, bytes);
  if (kind === "npz") return npzGroup(name, bytes, inflateRaw);
  if (kind === "mat5") return parseMat5(name, bytes, inflate);
  throw new FormatError(`${name} isn't a file dropslice knows. It opens NWB, HDF5 (.h5, .hdf5), MATLAB (.mat), NumPy (.npy, .npz) and Zarr folders.`);
}

/** Opens one local file. */
export async function openFile(file) {
  const head = new Uint8Array(await file.slice(0, 4096).arrayBuffer());
  const kind = sniff(head);
  // h5web reads HDF5 straight from the file, lazily, so size doesn't matter.
  if (kind === "hdf5") return { kind: "hdf5", file, name: file.name, label: file.name.toLowerCase().endsWith(".nwb") ? "NWB (HDF5)" : file.name.toLowerCase().endsWith(".mat") ? "MATLAB v7.3 (HDF5)" : "HDF5" };
  if (file.size > IN_MEMORY_LIMIT) throw new FormatError(`${file.name} is ${Math.round(file.size / 1e9)} GB; browsers can't hold more than about 2 GB of a ${LABELS[kind] ?? "file"} at once.`);
  const root = await fromBytes(file.name, new Uint8Array(await file.arrayBuffer()), kind);
  // A single array opens straight onto itself.
  const initialPath = kind === "npy" ? root.children[0].path : undefined;
  return { kind: "tree", api: new TreeProvider(file.name, root), name: file.name, label: LABELS[kind], initialPath };
}

/** Opens a dropped or picked folder: a Zarr store. `files` are [relativePath, File] pairs. */
export async function openFolder(name, files) {
  const byKey = new Map(files.map(([p, f]) => [p.replace(/\\/g, "/"), f]));
  const store = { get: async (key) => (byKey.has(key.slice(1)) ? new Uint8Array(await byKey.get(key.slice(1)).arrayBuffer()) : undefined) };
  const nodes = nodesFromKeys([...byKey.keys()]);
  if (nodes.size <= 1 && !byKey.has(".zgroup") && !byKey.has("zarr.json")) throw new FormatError(`${name} doesn't look like a Zarr store (no .zgroup, .zarray or zarr.json inside).`);
  const root = await zarrTree(name, store, nodes);
  return { kind: "tree", api: new TreeProvider(name, root), name, label: LABELS.zarr };
}

/** Opens a web address: a Zarr store with consolidated metadata, or a whole HDF5, NumPy or MATLAB file. */
export async function openUrl(address, onProgress) {
  let url;
  try {
    url = new URL(address);
  } catch {
    throw new FormatError("That isn't a web address.");
  }
  if (url.protocol !== "https:") throw new FormatError("Only https addresses can be opened.");
  const name = decodeURIComponent(url.pathname.split("/").filter(Boolean).pop() ?? url.host);
  if (/\.zarr\/?$/i.test(url.pathname) || url.pathname.endsWith("/")) {
    const store = new FetchStore(url.href.replace(/\/$/, ""));
    const root = await zarrTree(name, store, await nodesFromConsolidated(store));
    return { kind: "tree", api: new TreeProvider(name, root), name, label: LABELS.zarr };
  }
  const response = await fetch(url.href, { credentials: "omit" });
  if (!response.ok) throw new FormatError(`${url.host} answered ${response.status}.`);
  const total = Number(response.headers.get("content-length")) || 0;
  if (total > URL_LIMIT) throw new FormatError(`That file is ${Math.round(total / 1e9)} GB. Download it and drop it here instead; dropslice reads local files lazily.`);
  const reader = response.body.getReader();
  const parts = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    received += value.length;
    if (received > URL_LIMIT) {
      reader.cancel();
      throw new FormatError("That file is over 1 GB. Download it and drop it here instead.");
    }
    parts.push(value);
    onProgress?.(received, total);
  }
  const bytes = new Uint8Array(received);
  let at = 0;
  for (const p of parts) bytes.set(p, (at += p.length) - p.length);
  const kind = sniff(bytes.subarray(0, 4096));
  if (kind === "hdf5") return { kind: "hdf5-buffer", buffer: bytes.buffer, name, label: "HDF5" };
  const root = await fromBytes(name, bytes, kind);
  return { kind: "tree", api: new TreeProvider(name, root), name, label: LABELS[kind] };
}

/** Collects every file under a dropped folder, with paths relative to that folder. */
export async function filesFromEntry(entry, prefix = "") {
  if (entry.isFile) return [[prefix + entry.name, await new Promise((resolve, reject) => entry.file(resolve, reject))]];
  const reader = entry.createReader();
  const out = [];
  // readEntries hands back folders in batches until it returns an empty one.
  for (;;) {
    const batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) break;
    for (const child of batch) out.push(...(await filesFromEntry(child, child.isDirectory ? `${prefix}${child.name}/` : prefix)));
  }
  return out;
}
