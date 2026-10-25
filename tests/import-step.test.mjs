
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import vm from 'node:vm'
import { importStep } from '../src/lib/importStep.js'

const workerSource = fs.readFileSync(new URL('../public/step-import-worker.js', import.meta.url), 'utf8')
const triangle = () => ({ attributes: { position: { array: [0, 0, 0, 1, 0, 0, 0, 1, 0] } }, index: { array: [0, 1, 2] } })
async function runWorker(result, params, onRead = () => {}) {
  const messages = []
  const self = {
    occtimportjs: async () => ({ HEAPU8: { byteLength: 2147483648 }, ReadStepFile: (bytes, options) => { onRead(options); return result } }),
    postMessage: (data, transfers) => messages.push({ data, transfers }),
  }
  vm.runInNewContext(workerSource, { self, importScripts() {}, Float32Array, Uint32Array, Number })
  await self.onmessage({ data: { buffer: new ArrayBuffer(4), params, requestId: 'active' } })
  return messages.at(-1)
}
test('rejects success=true with only empty meshes', async () => {
  const last = await runWorker({ success: true, meshes: [{ attributes: { position: { array: [] } }, index: { array: [] } }] })
  assert.equal(last.data.type, 'error')
  assert.match(last.data.message, /三角形 0/)
})
test('valid geometry transfers owned typed buffers and warns about omitted parts', async () => {
  const last = await runWorker({ success: true, meshes: [triangle(), { attributes: {} }] })
  assert.equal(last.data.type, 'result')
  assert.equal(last.data.result.triangles, 1)
  assert.equal(last.data.result.emptyMeshes, 1)
  assert.equal(last.transfers.length, 2)
  assert(last.data.result.meshes[0].attributes.position.array instanceof Float32Array)
})
test('rejects non-finite coordinates and invalid indices', async () => {
  for (const mutation of [m => { m.attributes.position.array[0] = Infinity }, m => { m.index.array[0] = 99 }]) {
    const mesh = triangle(); mutation(mesh)
    assert.equal((await runWorker({ success: true, meshes: [mesh] })).data.type, 'error')
  }
})
test('terminates on cancellation and ignores another request result', async () => {
  let worker
  class FakeWorker {
    constructor() { worker = this; this.terminated = false }
    postMessage(message) { this.sent = message }
    terminate() { this.terminated = true }
  }
  const old = globalThis.Worker
  globalThis.Worker = FakeWorker
  try {
    const controller = new AbortController()
    const promise = importStep({ buffer: new ArrayBuffer(1) }, null, { signal: controller.signal, onProgress() {} })
    worker.onmessage({ data: { type: 'result', requestId: 'stale', result: {} } })
    assert.equal(worker.terminated, false)
    controller.abort()
    await assert.rejects(promise, { name: 'AbortError' })
    assert.equal(worker.terminated, true)
  } finally { globalThis.Worker = old }
})
test('terminates after successful result and worker errors', async () => {
  const old = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() { worker = this }
    postMessage(message) { this.sent = message }
    terminate() { this.terminated = true }
  }
  try {
    let promise = importStep({}, null, { signal: new AbortController().signal, onProgress() {} })
    worker.onmessage({ data: { type: 'result', requestId: worker.sent.requestId, result: { triangles: 1 } } })
    assert.equal((await promise).triangles, 1)
    assert.equal(worker.terminated, true)
    promise = importStep({}, null, { signal: new AbortController().signal, onProgress() {} })
    worker.onerror({ message: 'WASM failure' })
    await assert.rejects(promise, /WASM failure/)
    assert.equal(worker.terminated, true)
  } finally { globalThis.Worker = old }
})

test('reports missing faces even inside a nonempty mesh', async () => {
  const mesh = triangle()
  mesh.brep_faces = [{ first: 0, last: 0 }, { first: 1, last: 0 }]
  const last = await runWorker({ success: true, meshes: [mesh] })
  assert.equal(last.data.result.emptyFaces, 1)
  assert.equal(last.data.result.emptyMeshes, 0)
})
test('diagnostic zero-triangle failure retains an actionable error', async () => {
  const last = await runWorker({ success: false, triangleCount: 0, meshes: [] })
  assert.equal(last.data.type, 'error')
  assert.match(last.data.message, /三角形 0/)
})
test('terminates if transferring the input fails', async () => {
  const old = globalThis.Worker
  let worker
  globalThis.Worker = class {
    constructor() { worker = this }
    postMessage() { throw new DOMException('Detached buffer', 'DataCloneError') }
    terminate() { this.terminated = true }
  }
  try {
    await assert.rejects(importStep({ buffer: new ArrayBuffer(1) }, null, {
      signal: new AbortController().signal, onProgress() {},
    }), { name: 'DataCloneError' })
    assert.equal(worker.terminated, true)
  } finally { globalThis.Worker = old }
})

test('high precision can skip expensive missing-face retries while standard retains them', async () => {
  for (const retryMissingFaces of [undefined, false]) {
    await runWorker({ success: true, meshes: [triangle()] }, { retryMissingFaces }, options => {
      assert.equal(options.meshByPart, true)
      assert.equal(options.retryMissingFaces, retryMissingFaces !== false)
    })
  }
})
