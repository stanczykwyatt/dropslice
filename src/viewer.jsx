// The viewer: h5web for everything, with h5wasm reading HDF5 straight from the file.
import React, { useEffect } from "react";
import { App, DataProvider } from "@h5web/app";
import { H5WasmLocalFileProvider, H5WasmBufferProvider } from "@h5web/h5wasm";
import "@h5web/app/styles.css";

// Compression plugins for HDF5 (Blosc, Zstandard, LZ4, LZF and others), fetched only when a file needs one.
const plugins = import.meta.glob("../node_modules/h5wasm-plugins/plugins/*.so", { query: "?url", import: "default", eager: true });
async function getPlugin(name) {
  const key = Object.keys(plugins).find((k) => k.endsWith(`/libH5Z${name}.so`));
  return key ? (await fetch(plugins[key])).arrayBuffer() : undefined;
}

export default function Viewer({ opened, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && e.target === document.body && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  let body;
  if (opened.kind === "hdf5")
    body = (
      <H5WasmLocalFileProvider file={opened.file} getPlugin={getPlugin}>
        <App sidebarOpen initialPath={opened.initialPath} />
      </H5WasmLocalFileProvider>
    );
  else if (opened.kind === "hdf5-buffer")
    body = (
      <H5WasmBufferProvider filename={opened.name} buffer={opened.buffer} getPlugin={getPlugin}>
        <App sidebarOpen initialPath={opened.initialPath} />
      </H5WasmBufferProvider>
    );
  else
    body = (
      <DataProvider api={opened.api}>
        <App sidebarOpen initialPath={opened.initialPath} />
      </DataProvider>
    );
  return (
    <div className="viewer">
      <header className="viewer-bar">
        <span className="viewer-name" title={opened.name}>
          {opened.name}
        </span>
        <span className="viewer-kind">{opened.label} · read in your browser, nothing uploaded</span>
        <button type="button" onClick={onClose}>
          Open another file
        </button>
      </header>
      <div className="viewer-body">{body}</div>
    </div>
  );
}

