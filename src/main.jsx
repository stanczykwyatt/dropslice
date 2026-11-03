// The page: a drop zone that opens a file in place, with h5web's viewer taking over the screen.
// The viewer and the format readers are big, so they load only when a file is opened.
import React, { Suspense, lazy, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";

const Viewer = lazy(() => import("./viewer.jsx"));
const formats = () => import("./open.js");
const say = (e) => (e?.name === "FormatError" ? e.message : `That file couldn't be opened: ${e?.message ?? e}`);

function Main() {
  const [opened, setOpened] = useState(null);
  const [status, setStatus] = useState("");

  const run = async (job) => {
    setStatus("Opening…");
    try {
      setOpened(await job());
      setStatus("");
    } catch (e) {
      setStatus(say(e));
    }
  };

  useEffect(() => {
    const zone = document.getElementById("drop");
    const file = document.getElementById("pick-file");
    const folder = document.getElementById("pick-folder");
    const example = document.getElementById("try-example");
    const onDrop = (e) => {
      e.preventDefault();
      zone.classList.remove("over");
      const item = e.dataTransfer.items?.[0]?.webkitGetAsEntry?.();
      if (item?.isDirectory) run(async () => {
        const { openFolder, filesFromEntry } = await formats();
        return openFolder(item.name, await filesFromEntry(item));
      });
      else if (e.dataTransfer.files[0]) run(async () => (await formats()).openFile(e.dataTransfer.files[0]));
    };
    const onOver = (e) => {
      e.preventDefault();
      zone.classList.add("over");
    };
    const onLeave = () => zone.classList.remove("over");
    const onFile = () => file.files[0] && run(async () => (await formats()).openFile(file.files[0]));
    const onFolder = () => {
      const list = [...folder.files];
      if (!list.length) return;
      const top = list[0].webkitRelativePath.split("/")[0];
      run(async () => (await formats()).openFolder(top, list.map((f) => [f.webkitRelativePath.slice(top.length + 1), f])));
    };
    const onExample = () =>
      run(async () => {
        const blob = await (await fetch("example.h5")).blob();
        return { ...(await (await formats()).openFile(new File([blob], "example.h5"))), initialPath: "/imaging/frames" };
      });
    zone.addEventListener("drop", onDrop);
    zone.addEventListener("dragover", onOver);
    zone.addEventListener("dragleave", onLeave);
    file.addEventListener("change", onFile);
    folder.addEventListener("change", onFolder);
    example.addEventListener("click", onExample);
    // ?url=https://… opens a web address straight away, for links into public data.
    const url = new URLSearchParams(location.search).get("url");
    if (url) run(async () => (await formats()).openUrl(url, (got, total) => setStatus(`Downloading… ${Math.round(got / 1e6)}${total ? ` of ${Math.round(total / 1e6)}` : ""} MB`)));
    return () => {
      zone.removeEventListener("drop", onDrop);
      zone.removeEventListener("dragover", onOver);
      zone.removeEventListener("dragleave", onLeave);
      file.removeEventListener("change", onFile);
      folder.removeEventListener("change", onFolder);
      example.removeEventListener("click", onExample);
    };
  }, []);

  useEffect(() => {
    document.getElementById("status").textContent = status;
    document.body.classList.toggle("viewing", Boolean(opened));
  }, [status, opened]);

  return opened ? (
    <Suspense fallback={null}>
      <Viewer opened={opened} onClose={() => setOpened(null)} />
    </Suspense>
  ) : null;
}

createRoot(document.getElementById("viewer")).render(<Main />);
