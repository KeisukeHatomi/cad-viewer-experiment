// Keep one bounded batch in flight; displayed geometry remains owned by the main thread.
export async function prepareCadEdges(meshes, { signal, onProgress, onMesh, createWorker = () => new Worker(new URL('../workers/edge-worker.js', import.meta.url), { type: 'module' }) }) {
  const worker = createWorker()
  let pendingReject = null
  const abort = () => {
    worker.terminate()
    pendingReject?.(new DOMException('処理を中止しました', 'AbortError'))
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    onProgress(0, meshes.length)
    for (let i = 0; i < meshes.length;) {
      if (signal.aborted) throw new DOMException('処理を中止しました', 'AbortError')
      const batch = []
      let bytes = 0
      while (i + batch.length < meshes.length && batch.length < 32) {
        const mesh = meshes[i + batch.length]
        const size = mesh.attributes.position.array.byteLength + mesh.index.array.byteLength + (mesh.brep_faces?.length || 0) * 32
        if (batch.length && bytes + size > 8 * 1024 * 1024) break
        batch.push({ position: mesh.attributes.position.array, index: mesh.index.array, faces: mesh.brep_faces })
        bytes += size
      }
      const positions = await new Promise((resolve, reject) => {
        pendingReject = reject
        worker.onerror = event => reject(new Error(event.message || 'エッジ生成に失敗しました。'))
        worker.onmessageerror = () => reject(new Error('エッジ生成結果を受信できませんでした。'))
        worker.onmessage = ({ data }) => {
          if (data.error) reject(new Error(data.error))
          else if (!Array.isArray(data.positions) || data.positions.length !== batch.length) reject(new Error('エッジ生成結果の件数が一致しません。'))
          else resolve(data.positions)
        }
        worker.postMessage({ meshes: batch })
      })
      pendingReject = null
      if (signal.aborted) throw new DOMException('処理を中止しました', 'AbortError')
      for (const meshPositions of positions) {
        if (signal.aborted) throw new DOMException('処理を中止しました', 'AbortError')
        onMesh(meshPositions, i)
        onProgress(++i, meshes.length)
      }
    }
  } finally {
    signal.removeEventListener('abort', abort)
    worker.terminate()
  }
}
