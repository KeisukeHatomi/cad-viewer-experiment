/* A fresh worker per import releases the complete WASM heap on completion/cancel. */
importScripts('/step-mesh-cache.js')
self.onmessage = async ({ data: { type, file, buffer, params, requestId } }) => {
  const progress = (phase, detail = {}) => self.postMessage({ type: 'progress', requestId, phase, ...detail })
  try {
    if (type === 'clear-cache') {
      await self.StepMeshCache.clear()
      self.postMessage({ type: 'result', requestId, result: { cleared: true } })
      return
    }
    let input = buffer
    if (!input) {
      progress('reading', { loaded: 0, total: file.size })
      input = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onprogress = e => progress('reading', { loaded: e.loaded, total: e.total })
        reader.onload = () => resolve(reader.result)
        reader.onerror = () => reject(reader.error)
        reader.readAsArrayBuffer(file)
      })
    }
    // The viewer uses a single model material, so per-face color searches are unnecessary.
    const effectiveParams = { ...params, meshByPart: true, retryMissingFaces: params?.retryMissingFaces !== false, readFaceColors: false }
    progress('cache-check')
    const cache = self.StepMeshCache
    let cacheKey = null
    try { cacheKey = await cache?.key(input, effectiveParams) } catch { /* Continue if local storage is unavailable. */ }
    const cached = cacheKey ? await cache.read(cacheKey) : null
    if (cached) {
      const transfer = cached.meshes.flatMap(mesh => [mesh.attributes.position.array.buffer, mesh.index.array.buffer, ...(mesh.attributes.normal ? [mesh.attributes.normal.array.buffer] : [])])
      self.postMessage({ type: 'result', requestId, result: { ...cached, wasmBytes: 0, cacheHit: true, cacheStored: true } }, transfer)
      return
    }
    progress('engine')
    importScripts('/occt-import-js.js')
    const occt = await self.occtimportjs({ onProgress: data => progress(data.phase, data), locateFile: name => `/${name}` })
    progress('converting')
    const result = occt.ReadStepFile(new Uint8Array(input), effectiveParams)
    input = null
    buffer = null
    file = null
    if (!result.success && result.triangleCount !== 0) throw new Error('STEP ファイルの解析に失敗しました。')
    const transfer = []
    const meshes = []
    const missingParts = []
    let emptyMeshes = 0, emptyFaces = 0, triangles = 0
    for (const [meshIndex, mesh] of (result.meshes ?? []).entries()) {
      const missingFaces = (mesh.brep_faces ?? []).filter(face => face.last < face.first).length
      emptyFaces += missingFaces
      if (missingFaces || !mesh.index?.array?.length) missingParts.push({ meshIndex, name: mesh.name, faces: mesh.brep_faces?.length ?? 0, missingFaces, triangles: (mesh.index?.array?.length ?? 0) / 3 })
      const positions = mesh.attributes?.position?.array
      const indices = mesh.index?.array
      if (!positions?.length || !indices?.length) { emptyMeshes++; continue }
      if (positions.length % 3 || indices.length % 3) throw new Error('変換結果の配列が不正です。')
      const position = Float32Array.from(positions)
      if (!position.every(Number.isFinite)) throw new Error('変換結果に不正な座標が含まれています。')
      if (!indices.every(i => Number.isInteger(i) && i >= 0 && i < position.length / 3)) throw new Error('変換結果の頂点参照が不正です。')
      const index = Uint32Array.from(indices)
      mesh.attributes.position.array = position
      mesh.index.array = index
      transfer.push(position.buffer, index.buffer)
      if (mesh.attributes.normal) {
        const normal = Float32Array.from(mesh.attributes.normal.array)
        if (normal.length === position.length && normal.every(Number.isFinite)) {
          mesh.attributes.normal.array = normal
          transfer.push(normal.buffer)
        } else delete mesh.attributes.normal
      }
      triangles += index.length / 3
      meshes.push(mesh)
    }
    if (!triangles) throw new Error(`形状を生成できませんでした（三角形 0）。変換エンジンのメモリ不足または未対応の形状が考えられます。使用領域: ${Math.round(occt.HEAPU8.byteLength / 1048576)} MiB`)
    const converted = { meshes, triangles, emptyMeshes, emptyFaces, missingParts, wasmBytes: occt.HEAPU8.byteLength }
    if (cacheKey) progress('cache-save')
    const cacheStored = cacheKey ? await cache.write(cacheKey, converted) : false
    self.postMessage({ type: 'result', requestId, result: { ...converted, cacheHit: false, cacheStored } }, transfer)
  } catch (error) {
    self.postMessage({ type: 'error', requestId, message: error.message || String(error) })
  }
}