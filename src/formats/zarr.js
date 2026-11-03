// Zarr v2 and v3 stores, through zarrita. A store only needs `get(key)`, so a dropped folder, a
// URL and a test folder on disk all work the same way. The tree comes from the list of files when
// there is one, or from consolidated metadata for a URL.
import * as zarr from "zarrita";
import { FormatError, dataset, group, join } from "./tree.js";

/** The keys of every group and array, from a list of files in the store. */
export function nodesFromKeys(keys) {
  const nodes = new Map([["", "group"]]);
  for (const key of keys) {
    const m = /^(?:(.*)\/)?(\.zgroup|\.zarray|zarr\.json)$/.exec(key);
    if (!m) continue;
    const at = m[1] ?? "";
    nodes.set(at, m[2] === ".zarray" ? "array" : nodes.get(at) === "array" ? "array" : m[2] === ".zgroup" ? "group" : "v3");
  }
  return nodes;
}

/** Reads consolidated metadata (v2 .zmetadata, or v3 consolidated_metadata) into the same map. */
export async function nodesFromConsolidated(store) {
  const decode = (b) => (b ? JSON.parse(new TextDecoder().decode(b)) : null);
  const v2 = decode(await store.get("/.zmetadata"));
  if (v2?.metadata) return nodesFromKeys(Object.keys(v2.metadata));
  const v3 = decode(await store.get("/zarr.json"));
  const nested = v3?.consolidated_metadata?.metadata;
  if (nested) {
    const nodes = new Map([["", "group"]]);
    for (const [key, meta] of Object.entries(nested)) nodes.set(key, meta.node_type === "array" ? "array" : "group");
    return nodes;
  }
  throw new FormatError("This Zarr store has no consolidated metadata, so its contents can't be listed from a web address. Drop the folder instead.");
}

function dtypeOf(name) {
  const m = /^(int|uint|float)(\d+)$/.exec(name);
  if (m) return { class: m[1], size: Number(m[2]) / 8 };
  if (name === "bool") return { class: "bool", size: 1 };
  if (/string|^v2:[US]|^v2:O/.test(name)) return { class: "string", size: 0 };
  throw new FormatError(`Zarr data type ${name} isn't supported yet.`);
}

/** Builds the tree for a store. `nodes` maps paths ("" for the root) to "group", "array" or "v3". */
export async function zarrTree(name, store, nodes) {
  const root = zarr.root(store);
  const kinds = new Map();
  for (const [key, kind] of nodes) {
    if (kind !== "v3") {
      kinds.set(key, kind);
      continue;
    }
    // A v3 zarr.json says itself whether it's a group or an array.
    const meta = JSON.parse(new TextDecoder().decode(await store.get(`/${key ? `${key}/` : ""}zarr.json`)));
    kinds.set(key, meta.node_type === "array" ? "array" : "group");
  }
  const build = async (key) => {
    const path = key ? `/${key}` : "/";
    const label = key ? key.split("/").pop() : name;
    const location = key ? root.resolve(key) : root;
    if (kinds.get(key) === "array") {
      const arr = await zarr.open(location, { kind: "array" });
      const dtype = dtypeOf(String(arr.dtype));
      const shape = arr.shape;
      return dataset(label, path, {
        shape,
        dtype,
        attrs: { ...arr.attrs, chunks: arr.chunks.join(" × ") },
        read: async (selection) => {
          const picks = shape.map((_, i) => (selection?.[i] === null || selection?.[i] === undefined ? null : selection[i]));
          const out = await zarr.get(arr, picks);
          const data = typeof out === "object" && "data" in out ? out.data : out;
          const outShape = typeof out === "object" && "shape" in out ? out.shape : [];
          return { shape: outShape, values: ArrayBuffer.isView(data) ? data : Array.isArray(data) ? data : Array.from(data) };
        },
      });
    }
    let attrs = {};
    try {
      attrs = (await zarr.open(location, { kind: "group" })).attrs;
    } catch {
      // Implicit groups (v3, or v2 folders without .zgroup) have no attributes.
    }
    const childKeys = [...kinds.keys()].filter((k) => k && k !== key && (key ? k.startsWith(`${key}/`) : true) && !k.slice(key ? key.length + 1 : 0).includes("/"));
    // Folders that only hold deeper nodes still show up as groups.
    for (const k of kinds.keys()) {
      const rest = key ? (k.startsWith(`${key}/`) ? k.slice(key.length + 1) : null) : k;
      if (rest && rest.includes("/")) {
        const child = key ? `${key}/${rest.split("/")[0]}` : rest.split("/")[0];
        if (!kinds.has(child)) kinds.set(child, "group");
        if (!childKeys.includes(child)) childKeys.push(child);
      }
    }
    childKeys.sort();
    const children = [];
    for (const k of childKeys) children.push(await build(k));
    return group(label, path, children, key ? attrs : { format: "Zarr", ...attrs });
  };
  return build("");
}

export { join };
