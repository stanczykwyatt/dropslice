// The format readers, against small files written by numpy, scipy, h5py and zarr
// (scripts/make-fixtures.py). Every value is a formula of its index.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { inflateSync, inflateRawSync, deflateRawSync } from "node:zlib";
import path from "node:path";
import { npyGroup, npzGroup, parseNpyHeader, parseDescr } from "../src/formats/npy.js";
import { parseMat5 } from "../src/formats/mat5.js";
import { zarrTree, nodesFromKeys, nodesFromConsolidated } from "../src/formats/zarr.js";
import { sniff, hdf5Offset } from "../src/formats/detect.js";
import { select, toRowMajor, parseSelection, find, FormatError } from "../src/formats/tree.js";
import { readZip } from "../src/formats/zip.js";

const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url).pathname;
const bytes = (name) => new Uint8Array(readFileSync(fixture(name)));
const inflate = async (b) => new Uint8Array(inflateSync(b));
const inflateRaw = async (b) => new Uint8Array(inflateRawSync(b));
const all = async (node, selection) => (await node.read(selection)).values;
const grid = Array.from({ length: 24 }, (_, i) => i / 4);

test("file types are told apart by their bytes", () => {
  assert.equal(sniff(bytes("grid.npy")), "npy");
  assert.equal(sniff(bytes("bundle.npz")), "npz");
  assert.equal(sniff(bytes("session.mat")), "mat5");
  assert.equal(sniff(bytes("v73.mat").subarray(0, 4096)), "hdf5");
  assert.equal(hdf5Offset(bytes("v73.mat").subarray(0, 4096)), 512);
  assert.equal(sniff(new TextEncoder().encode("hello, not a data file at all")), "unknown");
});

test(".npy: shapes, dtypes, both memory orders and byte orders", async () => {
  const g = npyGroup("grid.npy", bytes("grid.npy"));
  const d = g.children[0];
  assert.equal(d.name, "grid");
  assert.deepEqual(d.shape, [2, 3, 4]);
  assert.deepEqual(d.dtype, { class: "float", size: 8, littleEndian: true });
  assert.deepEqual(Array.from(await all(d)), grid);
  // Fixing the first dimension leaves a 3 × 4 slice.
  const slice = await d.read([1, null, null]);
  assert.deepEqual(slice.shape, [3, 4]);
  assert.deepEqual(Array.from(slice.values), grid.slice(12));
  assert.deepEqual(Array.from(await all(npyGroup("f.npy", bytes("fortran.npy")).children[0])), Array.from({ length: 12 }, (_, i) => i));
  assert.deepEqual(Array.from(await all(npyGroup("b.npy", bytes("big-endian.npy")).children[0])), [0, 1, 2, 3, 4]);
  assert.deepEqual(Array.from(await all(npyGroup("b.npy", bytes("bools.npy")).children[0])), [1, 0, 1]);
  const scalar = npyGroup("s.npy", bytes("scalar.npy")).children[0];
  assert.deepEqual(scalar.shape, []);
  assert.deepEqual(Array.from(await all(scalar)), [2.5]);
  assert.deepEqual(await all(npyGroup("s.npy", bytes("strings.npy")).children[0]), ["ab", "µV", "c"]);
  assert.deepEqual(Array.from(await all(npyGroup("i.npy", bytes("int64.npy")).children[0])), [-1n, 2n ** 53n + 1n]);
});

test(".npy: pickled objects are refused, never loaded", () => {
  assert.throws(() => npyGroup("o.npy", bytes("objects.npy")), /never loads those/);
  assert.throws(() => parseDescr("|O"), /never loads/);
  assert.throws(() => parseNpyHeader(new Uint8Array(20)), /isn't a \.npy file/);
});

test(".npy: a cut-short file says so instead of reading past its end", async () => {
  const short = bytes("grid.npy").subarray(0, 140);
  await assert.rejects(npyGroup("g.npy", short).children[0].read(), FormatError);
});

test(".npz: stored and compressed archives", async () => {
  for (const name of ["bundle.npz", "bundle-compressed.npz"]) {
    const g = await npzGroup(name, bytes(name), inflateRaw);
    assert.deepEqual(g.children.map((c) => c.name), ["grid", "labels"]);
    assert.deepEqual(Array.from(await all(find(g, "/grid"))), grid);
    assert.deepEqual(Array.from(await all(find(g, "/labels"))), [1, 2, 3]);
  }
});

test("ZIP entries that don't unpack to their stated size are refused", async () => {
  const entries = readZip(bytes("bundle-compressed.npz"));
  await assert.rejects(entries[0].read(async () => new Uint8Array(5)), /didn't unpack to its stated size/);
  assert.throws(() => readZip(new Uint8Array(100)), /isn't a ZIP archive/);
  assert.ok(deflateRawSync);
});

for (const name of ["session.mat", "session-compressed.mat"]) {
  test(`MATLAB v5 (${name}): numbers in MATLAB's dimensions, row by row`, async () => {
    const g = await parseMat5(name, bytes(name), inflate);
    assert.deepEqual(g.children.map((c) => c.name).sort(), ["counts", "cube", "flags", "grid", "info", "name", "trials", "z"]);
    const m = find(g, "/grid");
    assert.deepEqual(m.shape, [3, 4]);
    assert.equal(m.attrs.matlab_class, "double");
    // numpy's arange(12).reshape(3, 4): row r, column c holds 4r + c.
    assert.deepEqual(Array.from(await all(m)), Array.from({ length: 12 }, (_, i) => i));
    assert.deepEqual(Array.from(await all(m, [2, null])), [8, 9, 10, 11]);
    assert.deepEqual(Array.from(await all(m, [null, 1])), [1, 5, 9]);
    const cube = find(g, "/cube");
    assert.deepEqual(cube.shape, [2, 3, 4]);
    assert.equal(cube.attrs.matlab_class, "uint8");
    assert.deepEqual(Array.from(await all(cube)), Array.from({ length: 24 }, (_, i) => i));
    assert.deepEqual(Array.from(await all(find(g, "/counts"))), [1, 2, 3]);
    assert.equal(find(g, "/counts").attrs.matlab_class, "int16");
  });

  test(`MATLAB v5 (${name}): text, logicals, structs, cells and complex numbers`, async () => {
    const g = await parseMat5(name, bytes(name), inflate);
    assert.deepEqual(await all(find(g, "/name")), ["session one"]);
    const flags = find(g, "/flags");
    assert.deepEqual(flags.dtype, { class: "bool", size: 1 });
    assert.deepEqual(Array.from(await all(flags)), [1, 0]);
    const info = find(g, "/info");
    assert.equal(info.attrs.matlab_class, "struct");
    assert.deepEqual(Array.from(await all(find(g, "/info/rate"))), [30000]);
    assert.deepEqual(await all(find(g, "/info/unit")), ["uV"]);
    const trials = find(g, "/trials");
    assert.equal(trials.attrs.matlab_class, "cell");
    assert.deepEqual(trials.children.map((c) => c.name), ["{1}", "{2}"]);
    assert.deepEqual(Array.from(await all(find(g, "/trials/{1}"))), [0, 1, 2]);
    assert.deepEqual(await all(find(g, "/trials/{2}")), ["go"]);
    assert.deepEqual(await all(find(g, "/z")), [
      [1, 2],
      [3, -4],
    ]);
    assert.match(g.attrs.header, /^MATLAB 5\.0 MAT-file/);
  });
}

test("MATLAB v5: damaged files give an error", async () => {
  const good = bytes("session.mat");
  await assert.rejects(parseMat5("x.mat", good.subarray(0, 100), inflate), /cut short/);
  const broken = Uint8Array.from(good);
  broken[126] = 0;
  await assert.rejects(parseMat5("x.mat", broken, inflate), /header is damaged/);
  let failures = 0;
  for (let at = 136; at < good.length; at += 37) {
    const b = Uint8Array.from(good);
    b.fill(0xee, at, at + 6);
    try {
      const g = await parseMat5("x.mat", b, inflate);
      for (const c of g.children) if (c.read) await c.read();
    } catch (e) {
      assert.ok(e instanceof FormatError || e instanceof RangeError, `at ${at}: ${e.stack}`);
      failures++;
    }
  }
  assert.ok(failures > 0);
});

test("Zarr: groups, arrays, attributes and chunked slices", async () => {
  const root = fixture("recording.zarr");
  const keys = [];
  const walk = (dir) => {
    for (const n of readdirSync(dir)) {
      const p = path.join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else keys.push(path.relative(root, p));
    }
  };
  walk(root);
  const store = { get: async (key) => (keys.includes(key.slice(1)) ? new Uint8Array(readFileSync(path.join(root, key))) : undefined) };
  for (const nodes of [nodesFromKeys(keys), await nodesFromConsolidated(store)]) {
    const g = await zarrTree("recording.zarr", store, nodes);
    assert.equal(g.attrs.description, "made-up recording");
    assert.deepEqual(g.children.map((c) => c.name), ["data", "meta"]);
    const data = find(g, "/data");
    assert.deepEqual(data.shape, [200, 3]);
    assert.deepEqual(data.dtype, { class: "int", size: 2 });
    assert.equal(data.attrs.unit, "volts");
    const row = await data.read([65, null]);
    assert.deepEqual(row.shape, [3]);
    assert.deepEqual(Array.from(row.values), [0, 1, 2].map((c) => (65 * 3 + c) % 97));
    const column = await data.read([null, 2]);
    assert.deepEqual(Array.from(column.values), Array.from({ length: 200 }, (_, r) => (r * 3 + 2) % 97));
    assert.deepEqual(Array.from(await all(find(g, "/meta/times"))), [0, 0.5, 1, 1.5, 2]);
  }
  await assert.rejects(nodesFromConsolidated({ get: async () => undefined }), /no consolidated metadata/);
});

test("selections and reordering", () => {
  const values = Int32Array.from({ length: 24 }, (_, i) => i);
  assert.deepEqual(Array.from(select(values, [2, 3, 4], [1, 2, null]).values), [20, 21, 22, 23]);
  assert.deepEqual(Array.from(select(values, [2, 3, 4], [null, 0, 0]).values), [0, 12]);
  assert.deepEqual(select(values, [2, 3, 4], [1, 2, 3]).shape, []);
  assert.throws(() => select(values, [2, 3, 4], [2, 0, 0]), /outside dimension 0/);
  assert.throws(() => select(values, [2, 3, 4], [0, 0]), /3 dimensions/);
  // Column-major [[0, 2, 4], [1, 3, 5]] read back row by row.
  assert.deepEqual(toRowMajor([0, 1, 2, 3, 4, 5], [2, 3]), [0, 2, 4, 1, 3, 5]);
  assert.deepEqual(parseSelection("0,:,:", 3), [0, null, null]);
  assert.deepEqual(parseSelection(undefined, 2), [null, null]);
});

test("MATLAB v5: a size that disagrees with the data is refused, not padded", async () => {
  const b = Uint8Array.from(bytes("session.mat"));
  const at = Buffer.from(b).indexOf("counts");
  // The two dimensions sit just before the name: [1, 3] becomes [1, 20000].
  new DataView(b.buffer).setInt32(at - 12, 20000, true);
  await assert.rejects(parseMat5("x.mat", b, inflate), /holds 3 values but its size says 20000/);
});

test("MATLAB v5: struct field names of length 0 are refused instead of looping", async () => {
  const b = Uint8Array.from(bytes("session.mat"));
  const at = Buffer.from(b).indexOf("rate");
  new DataView(b.buffer).setInt32(at - 12, 0, true);
  await assert.rejects(parseMat5("x.mat", b, inflate), /damaged field names/);
});

const npyWith = (header, data = new Uint8Array(0)) => {
  let text = header;
  while ((10 + text.length + 1) % 64) text += " ";
  text += "\n";
  const out = new Uint8Array(10 + text.length + data.length);
  out.set([0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59, 1, 0]);
  new DataView(out.buffer).setUint16(8, text.length, true);
  out.set(new TextEncoder().encode(text), 10);
  out.set(data, 10 + text.length);
  return out;
};

test(".npy: zero-size strings and cut-short text are refused; Python 2 shapes read", async () => {
  assert.throws(() => npyGroup("x.npy", npyWith("{'descr': '|S0', 'fortran_order': False, 'shape': (30000000,), }")), /has no size/);
  await assert.rejects(npyGroup("x.npy", npyWith("{'descr': '<U4', 'fortran_order': False, 'shape': (5,), }", new Uint8Array(8))).children[0].read(), /cut short/);
  const old = npyGroup("x.npy", npyWith("{'descr': '<i2', 'fortran_order': False, 'shape': (3L,), }", new Uint8Array([1, 0, 2, 0, 3, 0])));
  assert.deepEqual(Array.from(await all(old.children[0])), [1, 2, 3]);
});
