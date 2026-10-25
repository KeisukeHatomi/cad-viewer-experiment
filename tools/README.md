# Local STEP engine validation (2026-10-25)

The locally installed engine preserves the accepted high-quality geometry while reducing conversion overhead. The 286,348,284-byte sample produces 5,426,807 triangles with absolute deflection 0.3, angular deflection 0.2, and missing-face retries disabled. It retains 30 empty meshes and 79 missing faces; this is not complete geometry recovery. Detailed local evidence is in ../../investigation/load-performance-verification.md.

## Reproducible engine

- Private build-only repository: https://github.com/KeisukeHatomi/step-viewer-occt-build
- Build recipe commit: 7bbc24b2951bb34e14ea3ca27e2177485c7d3809
- Successful run: https://github.com/KeisukeHatomi/step-viewer-occt-build/actions/runs/40164623935
- occt-import-js 0.0.23: c2148e54b456b571238d35cac037d304053d64b2
- OCCT 7.6.1: d2abb6d844231cb8f29be6894440874a4700e4a5
- Emscripten 3.1.69; compiled 4 GiB maximum memory.
- JS SHA256: D4FF6F11CEC44D000C54955019A4D9C36B6518B33E100A4465D40AE321BE4672
- WASM SHA256: 61E13B7219D8CE6D03408373833DD021741260462736204FC055ABD8E5CA3DB4
- Matching source archive SHA256: 8C8DA1A28B34E12D4FCF053B7590639A081E8CFAADE8789C0F61071BEC459568

The downloaded artifact includes the exact modified source archive and checksums. Rebuild with build-occt.ps1 and all adjacent helper files, including optimize-export.ps1 and buffered-array-writer.hpp. The workflow draft also runs test-array-writer.cpp to check bounded export across chunk boundaries. License notices are in public/licenses/. The matching library sources and build recipe are distributed at /source/occt-engine-source.tar.gz with /licenses/README.txt. Upstream sample data and prebuilt binaries are omitted from that source-only archive; compiled library sources are unchanged.

## Changes

The engine releases its native input vector after STEP transfer, reports conversion stages, rejects zero-triangle output, and supports part-by-part meshing. The original whole-assembly mode remains available for comparison. Shared parts retain their original placements, tolerances and mesh settings. Optional missing-face retries do not repair or change shape tolerances; the high-quality viewer disables them because they did not improve this sample.

Numeric output crosses the WASM boundary in bounded 3,072-double buffers, retaining original precision and ordinary JavaScript arrays. No heap view survives a WASM growth. Root children are cached so counting and exporting do not repeat meshing. Optional readFaceColors defaults to true in the engine API. The viewer passes false because its material is monochrome; mesh colors remain available. If per-face display colors are introduced later, re-enable this option and benchmark again.

The import worker uses identical effective options for conversion and the local cache key. It validates geometry, transfers owned typed buffers and terminates on completion or cancellation. The last successful converted model is cached locally, keyed by input content, engine hash and options; raw STEP bytes are never persisted. Cache failure falls back to conversion. Changing the engine hash invalidates prior results.

CAD boundary edges preserve the exact previous endpoints and ordering, using numeric pair keys and bounded worker batches instead of one round trip per part. Seven loading stages and optional edge/hole operations use native HTML progress bars in a consistent panel with the application colors and rounded controls. Unknown fractions are shown as processing, never fabricated percentages.

## Evidence and limits

- Large-model Node conversion: old 474.234 seconds, new 374.214 seconds (21.1% lower in this run). Export including the redundant traversal: about 159.6 seconds to 10.6 seconds.
- All 4,565 numeric mesh hashes, face-color-inclusive mesh hashes, hierarchy/color structure hash, omissions and bounds match the previous high-quality engine.
- WASM allocated heap: 4,168,744,960 to 4,168,220,672 bytes. Node peak RSS: 5,708,062,720 to 5,711,151,104 bytes. Memory is essentially unchanged; WASM size is not total browser/GPU memory.
- Exact fixture comparisons passed for 7 fixtures in 3 modes, with default colors and optional color-free geometry. Upstream 22 tests passed, including STEP, IGES, BREP, units and deflection.
- All 4,535 valid meshes have identical CAD edge endpoints/order (2,112,469 segments). Browser results and final application checks are recorded in the local investigation report.
- Fully hidden internal components are not automatically removed: names, bounding boxes and a finite set of views cannot establish complete occlusion through holes and gaps.
- The initial iframe startup stall remains a separate local integration issue; the restart control recovers it. Native file selection is not yet automated under the browser extension's permission limits.

Only build code was uploaded to the private build repository. All user CAD inputs, extracted geometry and comparison images remain local. Windows application control blocked the official local clang executable; no protection settings were changed.
