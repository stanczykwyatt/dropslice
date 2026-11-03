// Shows any format tree (src/formats/tree.js) in h5web's viewer. h5web asks for entities by path
// and for values by selection; this answers from the tree.
import { DataProviderApi, DTypeClass, EntityKind, ShapeClass } from "@h5web/app";
import { find, parseSelection } from "./formats/tree.js";

const ENDIAN = "little-endian";

export function toH5webType(dtype) {
  switch (dtype.class) {
    case "int":
    case "uint":
      return { class: DTypeClass.Integer, signed: dtype.class === "int", size: dtype.size * 8, endianness: ENDIAN };
    case "float":
    case "float16":
      return { class: DTypeClass.Float, size: dtype.class === "float16" ? 32 : dtype.size * 8, endianness: ENDIAN };
    case "bool":
      return { class: DTypeClass.Bool, base: { class: DTypeClass.Integer, signed: false, size: 8, endianness: ENDIAN } };
    case "complex": {
      const part = { class: DTypeClass.Float, size: (dtype.size / 2) * 8, endianness: ENDIAN };
      return { class: DTypeClass.Complex, realType: part, imagType: part };
    }
    case "string":
      return { class: DTypeClass.String, charSet: "UTF-8", strPad: "null-terminated" };
    default:
      return { class: DTypeClass.Unknown };
  }
}

function attrType(value) {
  if (typeof value === "string") return { class: DTypeClass.String, charSet: "UTF-8", strPad: "null-terminated" };
  if (typeof value === "boolean") return { class: DTypeClass.Bool, base: { class: DTypeClass.Integer, signed: false, size: 8, endianness: ENDIAN } };
  if (typeof value === "number") return Number.isInteger(value) ? { class: DTypeClass.Integer, signed: true, size: 64, endianness: ENDIAN } : { class: DTypeClass.Float, size: 64, endianness: ENDIAN };
  return { class: DTypeClass.String, charSet: "UTF-8", strPad: "null-terminated" };
}

// Attribute values h5web can show: strings, numbers and booleans, with anything else as JSON text.
const attrValue = (v) => (["string", "number", "boolean"].includes(typeof v) ? v : JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));

function shapeOf(node) {
  return node.shape.length === 0 ? { class: ShapeClass.Scalar, dims: [] } : { class: ShapeClass.Array, dims: node.shape };
}

function entity(node, withChildren) {
  const attributes = Object.entries(node.attrs ?? {}).map(([name, v]) => ({ name, shape: { class: ShapeClass.Scalar, dims: [] }, type: attrType(attrValue(v)) }));
  const base = { name: node.name, path: node.path, attributes };
  if (node.kind === "group") return { ...base, kind: EntityKind.Group, ...(withChildren ? { children: node.children.map((c) => entity(c, false)) } : {}) };
  return { ...base, kind: EntityKind.Dataset, shape: shapeOf(node), type: toH5webType(node.dtype) };
}

export class TreeProvider extends DataProviderApi {
  constructor(filepath, root) {
    super(filepath);
    this.root = root;
  }

  async getEntity(path) {
    const node = find(this.root, path);
    if (!node) throw new Error(`Nothing at ${path}`);
    return entity(node, true);
  }

  async getValue(dataset, selection) {
    const node = find(this.root, dataset.path);
    const { values } = await node.read(selection ? parseSelection(selection, node.shape.length) : null);
    return node.shape.length === 0 ? values[0] : values;
  }

  async getAttrValues(e) {
    const node = find(this.root, e.path);
    return Object.fromEntries(Object.entries(node?.attrs ?? {}).map(([k, v]) => [k, attrValue(v)]));
  }

  async getSearchablePaths(path) {
    const out = [];
    const walk = (node) => {
      out.push(node.path);
      if (node.kind === "group") node.children.forEach(walk);
    };
    walk(find(this.root, path) ?? this.root);
    return out;
  }
}
