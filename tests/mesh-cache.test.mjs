import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { webcrypto, createHash } from 'node:crypto'

const cacheSource = fs.readFileSync(new URL('../public/step-mesh-cache.js', import.meta.url), 'utf8')
const workerSource = fs.readFileSync(new URL('../public/step-import-worker.js', import.meta.url), 'utf8')
const result = () => ({ meshes: [{ attributes: { position: { array: new Float32Array([0,0,0,1,0,0,0,1,0]) } }, index: { array: new Uint32Array([0,1,2]) }, brep_faces: [{ first: 0, last: 0 }, { first: 1, last: 0 }] }], triangles: 1, emptyMeshes: 2, emptyFaces: 1, missingParts: [{ meshIndex: 1, missingFaces: 1 }], wasmBytes: 4096 })
function loadCache(indexedDB = {}) {
  const self = { crypto: webcrypto, indexedDB }
  vm.runInNewContext(cacheSource, { self, Float32Array, Uint32Array, Uint8Array, Number, setTimeout, clearTimeout })
  return self.StepMeshCache
}

test('cache uses file content and normalized quality, independently of object key order', async () => {
  const cache = loadCache()
  const input = new Uint8Array([1,2,3]).buffer
  const key = await cache.key(input, { linearDeflection: 0.3, angularDeflection: 0.2 })
  assert.equal(key, await cache.key(input, { angularDeflection: 0.2, linearDeflection: 0.3 }))
  assert.notEqual(key, await cache.key(new Uint8Array([1,2,4]).buffer, { linearDeflection: 0.3, angularDeflection: 0.2 }))
  assert.notEqual(key, await cache.key(input, { linearDeflection: 0.3, angularDeflection: 0.2, linearUnit: 'meter' }))
  assert.notEqual(key, await cache.key(input, { linearDeflection: 0.1, angularDeflection: 0.2 }))
  assert.notEqual(key, await cache.key(input, { linearDeflection: 0.3, angularDeflection: 0.2, retryMissingFaces: false }))
  assert.notEqual(key, await cache.key(input, { linearDeflection: 0.3, angularDeflection: 0.2, readFaceColors: false }))
})

test('cache engine key matches distributed WASM so engine changes cannot silently reuse old meshes', () => {
  const hash = createHash('sha256').update(fs.readFileSync(new URL('../public/occt-import-js.wasm', import.meta.url))).digest('hex')
  assert.equal(loadCache().engine, hash)
})

test('cache validation retains omissions and rejects malformed geometry', () => {
  const cache = loadCache()
  assert(cache.valid(result()))
  for (const mutate of [r => r.meshes[0].index.array[0] = 3, r => r.meshes[0].attributes.position.array[0] = NaN, r => r.triangles = 2, r => r.meshes[0].brep_faces[0].last = 5]) {
    const r = result(); mutate(r); assert.equal(cache.valid(r), false)
  }
})

test('unavailable or denied local storage falls back without failing conversion', async () => {
  assert.equal(await loadCache(null).key(new ArrayBuffer(1), null), null)
  const cache = loadCache({ open() { throw new Error('Quota denied') } })
  assert.equal(await cache.read('key'), null)
  assert.equal(await cache.write('key', result()), false)
})

test('cache hit returns transferable geometry and omissions without loading the engine', async () => {
  const messages = [], imports = []
  const cached = result()
  const self = { StepMeshCache: { key: async () => 'key', read: async () => cached }, postMessage: (data, transfers) => messages.push({ data, transfers }) }
  vm.runInNewContext(workerSource, { self, importScripts: name => imports.push(name), Float32Array, Uint32Array, Number })
  await self.onmessage({ data: { buffer: new ArrayBuffer(1), requestId: 'cache-hit' } })
  assert.deepEqual(imports, ['/step-mesh-cache.js'])
  const last = messages.at(-1)
  assert.equal(last.data.result.cacheHit, true)
  assert.equal(last.data.result.wasmBytes, 0)
  assert.equal(last.data.result.emptyFaces, 1)
  assert.equal(last.data.result.emptyMeshes, 2)
  assert.equal(last.data.result.meshes, cached.meshes)
  assert.equal(last.transfers.length, 2)
})

test('cache clear requires neither STEP nor engine initialization', async () => {
  let cleared = false
  const messages = [], imports = []
  const self = { StepMeshCache: { clear: async () => { cleared = true } }, postMessage: data => messages.push(data) }
  vm.runInNewContext(workerSource, { self, importScripts: name => imports.push(name) })
  await self.onmessage({ data: { type: 'clear-cache', requestId: 'clear' } })
  assert(cleared)
  assert.deepEqual(imports, ['/step-mesh-cache.js'])
  assert.equal(messages.at(-1).result.cleared, true)
})

test('cache key and engine receive the same effective monochrome quality options', async () => {
  let keyedOptions, importedOptions
  const messages = []
  const mesh = result().meshes[0]
  const self = {
    StepMeshCache: { key: async (_input, options) => { keyedOptions = options; return 'key' }, read: async () => null, write: async () => false },
    occtimportjs: async () => ({ HEAPU8: { byteLength: 4096 }, ReadStepFile: (_bytes, options) => { importedOptions = options; return { success: true, meshes: [mesh] } } }),
    postMessage: data => messages.push(data),
  }
  vm.runInNewContext(workerSource, { self, importScripts() {}, Float32Array, Uint32Array, Number })
  await self.onmessage({ data: { buffer: new ArrayBuffer(1), params: { linearDeflectionType: 'absolute_value', linearDeflection: 0.3, angularDeflection: 0.2, retryMissingFaces: false, readFaceColors: true }, requestId: 'effective-options' } })
  assert.equal(messages.at(-1).type, 'result')
  assert.equal(keyedOptions, importedOptions)
  assert.equal(importedOptions.readFaceColors, false)
  assert.equal(importedOptions.meshByPart, true)
  assert.equal(importedOptions.retryMissingFaces, false)
  assert.equal(importedOptions.linearDeflection, 0.3)
  assert.equal(importedOptions.angularDeflection, 0.2)
})
