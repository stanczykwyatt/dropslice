# Makes the small test files in test/fixtures. They're committed, so the tests don't need Python;
# run this only to change them: python3 scripts/make-fixtures.py (needs numpy, scipy, h5py and zarr 2).
#
# Every value is a formula of its index, so the tests can check any slice without a copy of the data.
import os
import io
import zipfile
import numpy as np
import scipy.io
import h5py
import zarr

here = os.path.join(os.path.dirname(__file__), "..", "test", "fixtures")
os.makedirs(here, exist_ok=True)
p = lambda name: os.path.join(here, name)

grid = np.arange(24, dtype=np.float64).reshape(2, 3, 4) / 4

# NumPy: several dtypes, both memory orders, and big-endian.
np.save(p("grid.npy"), grid)
np.save(p("fortran.npy"), np.asfortranarray(np.arange(12, dtype=np.int32).reshape(3, 4)))
np.save(p("big-endian.npy"), np.arange(5, dtype=">u2"))
np.save(p("bools.npy"), np.array([True, False, True]))
np.save(p("scalar.npy"), np.float32(2.5))
np.save(p("strings.npy"), np.array(["ab", "µV", "c"]))
np.save(p("int64.npy"), np.array([-1, 2**53 + 1], dtype=np.int64))
np.savez(p("bundle.npz"), grid=grid, labels=np.array([1, 2, 3], dtype=np.uint8))
np.savez_compressed(p("bundle-compressed.npz"), grid=grid, labels=np.array([1, 2, 3], dtype=np.uint8))
np.save(p("objects.npy"), np.array([{"a": 1}], dtype=object), allow_pickle=True)

# MATLAB v5: numbers, text, logicals, a struct, a cell array and complex numbers, compressed and not.
mat = {
    "grid": np.arange(12, dtype=np.float64).reshape(3, 4),
    "counts": np.array([[1, 2, 3]], dtype=np.int16),
    "name": "session one",
    "flags": np.array([[True, False]]),
    "info": {"rate": 30000.0, "unit": "uV"},
    "trials": np.array([np.arange(3.0), "go"], dtype=object),
    "z": np.array([[1 + 2j, 3 - 4j]]),
    "cube": np.arange(24, dtype=np.uint8).reshape(2, 3, 4),
}
scipy.io.savemat(p("session.mat"), mat, do_compression=False)
scipy.io.savemat(p("session-compressed.mat"), mat, do_compression=True)

# MATLAB v7.3 is HDF5 behind a 512-byte header.
with h5py.File(p("v73.mat"), "w", userblock_size=512) as f:
    f.create_dataset("x", data=np.arange(6.0).reshape(2, 3))
with open(p("v73.mat"), "r+b") as f:
    f.write(b"MATLAB 7.3 MAT-file, Platform: GLNXA64, Created on: Mon Jan  1 00:00:00 2026 HDF5 schema 1.00 .")

# Zarr v2: a group with a chunked, compressed array, a 1-D array and attributes, plus consolidated metadata.
root = zarr.open_group(p("recording.zarr"), mode="w")
root.attrs["description"] = "made-up recording"
data = root.create_dataset("data", data=(np.arange(200 * 3).reshape(200, 3) % 97).astype(np.int16), chunks=(64, 2))
data.attrs["unit"] = "volts"
root.create_group("meta").create_dataset("times", data=np.arange(5, dtype=np.float32) / 2)
zarr.consolidate_metadata(p("recording.zarr"))

print("wrote", sorted(os.listdir(here)))

# The example behind the site's "Try an example" button: a made-up recording, nothing real.
example = os.path.join(os.path.dirname(__file__), "..", "public", "example.h5")
t = np.arange(6000) / 1000.0
with h5py.File(example, "w") as f:
    f.attrs["description"] = "A made-up example recording for trying dropslice. None of it is real data."
    lfp = f.create_dataset(
        "acquisition/lfp",
        data=np.stack([np.sin(2 * np.pi * (6 + k) * t) * np.exp(-((t - 1.5 * (k + 1)) ** 2)) + 0.3 * np.sin(2 * np.pi * 40 * t + k) for k in range(4)], axis=1).astype(np.float32),
        chunks=(1000, 4),
        compression="gzip",
    )
    lfp.attrs["unit"] = "mV"
    lfp.attrs["rate_hz"] = 1000.0
    y, x = np.mgrid[0:128, 0:128]
    blobs = sum(np.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * s**2)) for cx, cy, s in [(40, 50, 12), (90, 80, 18), (70, 30, 7)])
    f.create_dataset("imaging/mean_frame", data=blobs.astype(np.float32), compression="gzip").attrs["description"] = "made-up blobs standing in for cells"
    f.create_dataset("imaging/frames", data=np.stack([np.roll(blobs, i, axis=1) for i in range(0, 40, 4)]).astype(np.float32), chunks=(1, 128, 128), compression="gzip")
    f.create_dataset("units/spike_times", data=np.sort(np.concatenate([np.arange(0, 6, 0.37), np.arange(0.1, 6, 0.53)])))
    f.create_dataset("trials/start_time", data=np.arange(0, 6, 1.0))
