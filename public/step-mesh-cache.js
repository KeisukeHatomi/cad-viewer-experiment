/* Last successful conversion only. Raw STEP bytes are never persisted. */
self.StepMeshCache = (() => {
  const DB = 'step-viewer-mesh-cache'
  const STORE = 'last-model'
  const SCHEMA = 1
  // Change this whenever the distributed conversion engine changes.
  const ENGINE = '61e13b7219d8ce6d03408373833dd021741260462736204fc055abd8e5ca3db4'
  const MAX_BYTES = 256 * 1024 * 1024
  const options = params => {
    const normalized = {
      linearDeflectionType: params?.linearDeflectionType ?? 'bounding_box_ratio',
      linearDeflection: params?.linearDeflection ?? 0.001,
      angularDeflection: params?.angularDeflection ?? 0.5,
      retryMissingFaces: params?.retryMissingFaces !== false,
      readFaceColors: params?.readFaceColors !== false,
      meshByPart: true,
    }
    for (const name of Object.keys(params || {}).sort()) {
      if (!Object.hasOwn(normalized, name)) normalized[name] = params[name]
    }
    return normalized
  }
  async function key(input, params) {
    if (!self.indexedDB || !self.crypto?.subtle) return null
    const hash = await self.crypto.subtle.digest('SHA-256', input)
    return JSON.stringify([SCHEMA, ENGINE, Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, '0')).join(''), options(params)])
  }
  function transaction(mode, action) {
    return new Promise((resolve, reject) => {
      let db, tx, settled = false, output
      const finish = (error, value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        db?.close()
        if (error) reject(error)
        else resolve(value)
      }
      const timer = setTimeout(() => {
        try { tx?.abort() } catch { /* Already finished. */ }
        finish(new Error('Local cache timed out'))
      }, mode === 'readwrite' ? 60000 : 15000)
      let request
      try { request = self.indexedDB.open(DB, 1) } catch (error) { finish(error); return }
      request.onupgradeneeded = () => request.result.createObjectStore(STORE)
      request.onerror = () => finish(request.error)
      request.onblocked = () => finish(new Error('Local cache is busy'))
      request.onsuccess = () => {
        db = request.result
        if (settled) { db.close(); return }
        db.onversionchange = () => db.close()
        try {
          tx = db.transaction(STORE, mode)
          tx.oncomplete = () => finish(null, output)
          tx.onabort = () => finish(tx.error || new Error('Local cache aborted'))
          tx.onerror = () => finish(tx.error || new Error('Local cache failed'))
          const operation = action(tx.objectStore(STORE))
          if (operation) operation.onsuccess = () => { output = operation.result }
        } catch (error) { finish(error) }
      }
    })
  }
  function valid(result) {
    if (!result || !Array.isArray(result.meshes) || !result.meshes.length || !Number.isInteger(result.emptyMeshes) || !Number.isInteger(result.emptyFaces) || !Array.isArray(result.missingParts)) return false
    let triangles = 0
    for (const mesh of result.meshes) {
      const positions = mesh.attributes?.position?.array, indices = mesh.index?.array, normals = mesh.attributes?.normal?.array
      if (!(positions instanceof Float32Array) || !positions.length || positions.length % 3 || !positions.every(Number.isFinite)) return false
      if (!(indices instanceof Uint32Array) || !indices.length || indices.length % 3 || !indices.every(index => index < positions.length / 3)) return false
      if (normals && (!(normals instanceof Float32Array) || normals.length !== positions.length || !normals.every(Number.isFinite))) return false
      if (mesh.brep_faces && (!Array.isArray(mesh.brep_faces) || !mesh.brep_faces.every(face => Number.isInteger(face.first) && Number.isInteger(face.last) && face.first >= 0 && face.first <= indices.length / 3 && face.last >= -1 && face.last < indices.length / 3))) return false
      triangles += indices.length / 3
    }
    return triangles === result.triangles && triangles > 0
  }
  async function read(cacheKey) {
    if (!cacheKey) return null
    try {
      const entry = await transaction('readonly', store => store.get('latest'))
      return entry?.key === cacheKey && valid(entry.result) ? entry.result : null
    } catch { return null }
  }
  async function write(cacheKey, result) {
    if (!cacheKey) return false
    let size = 0
    for (const mesh of result.meshes) {
      size += mesh.attributes.position.array.byteLength + mesh.index.array.byteLength + (mesh.attributes.normal?.array.byteLength || 0) + (mesh.brep_faces?.length || 0) * 128
    }
    if (size > MAX_BYTES) return false
    try {
      // One key replaces the previous result atomically; a failed write retains it.
      await transaction('readwrite', store => store.put({ key: cacheKey, result }, 'latest'))
      return true
    } catch { return false }
  }
  async function clear() {
    if (!self.indexedDB) return
    await transaction('readwrite', store => store.clear())
  }
  return { key, read, write, clear, valid, options, engine: ENGINE }
})()
