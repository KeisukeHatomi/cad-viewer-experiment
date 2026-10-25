import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCadEdges } from '../src/lib/cadEdges.js'
import { prepareCadEdges } from '../src/lib/prepareCadEdges.js'
const p = new Float32Array([0,0,0, 1,0,0, 1,1,0.5, 0,1,0])
const ix = new Uint32Array([0,1,2,0,2,3])
test('a curved CAD face has four boundary edges and no triangulation diagonal', () => {
  assert.equal(buildCadEdges(p, ix, [{first:0,last:1}]).length, 24)
})
test('a real CAD boundary between two faces is kept once', () => {
  assert.equal(buildCadEdges(p, ix, [{first:0,last:0},{first:1,last:1}]).length, 30)
})
test('duplicate seam vertices are matched by position, without moving geometry', () => {
  const positions = new Float32Array([...p, 0,0,0, 1,1,0.5])
  const indices = new Uint32Array([0,1,2,4,5,3])
  assert.equal(buildCadEdges(positions, indices, [{first:0,last:1}]).length,24)
})
test('missing faces are skipped; invalid ranges fail explicitly', () => {
  assert.equal(buildCadEdges(p,ix,[{first:0,last:-1}]).length,0)
  assert.throws(()=>buildCadEdges(p,ix,[{first:0,last:3}]))
})
test('one bounded batch is in flight, progress is actual, render buffers stay owned', async () => {
  let inFlight=0,maxFlight=0,terminated=0
  const events=[], outputs=[]
  const meshes=[0,1].map(()=>({attributes:{position:{array:p}},index:{array:ix},brep_faces:[{first:0,last:1}]}))
  const createWorker=()=>({
    postMessage(data) { maxFlight=Math.max(maxFlight,++inFlight); queueMicrotask(()=>{inFlight--;this.onmessage({data:{positions:data.meshes.map(mesh=>buildCadEdges(mesh.position,mesh.index,mesh.faces))}})}) },
    terminate(){terminated++},
  })
  await prepareCadEdges(meshes,{signal:new AbortController().signal,onProgress:(n,t)=>events.push([n,t]),onMesh:x=>outputs.push(x),createWorker})
  assert.equal(maxFlight,1);assert.equal(terminated,1);assert.equal(outputs.length,2)
  assert.deepEqual(events,[[0,2],[1,2],[2,2]]);assert.equal(p.byteLength,48)
})
test('cancel terminates a pending edge job', async () => {
  const controller=new AbortController()
  let terminated=0
  const job=prepareCadEdges([{attributes:{position:{array:p}},index:{array:ix},brep_faces:[]}],{
    signal:controller.signal,onProgress(){},onMesh(){assert.fail('Cancelled result')},
    createWorker:()=>({postMessage(){},terminate(){terminated++}})
  })
  controller.abort()
  await assert.rejects(job,{name:'AbortError'});assert(terminated>=1)
})

test('batches bound clone size and preserve output order across many small parts', async () => {
  const meshes=Array.from({length:67},()=>({attributes:{position:{array:p}},index:{array:ix},brep_faces:[{first:0,last:1}]}))
  const sizes=[],order=[]
  const createWorker=()=>({
    postMessage(data, transfers) {
      assert.equal(transfers,undefined,'Display buffers must not be detached')
      sizes.push(data.meshes.length)
      queueMicrotask(()=>this.onmessage({data:{positions:data.meshes.map(()=>new Float32Array(6))}}))
    },terminate(){},
  })
  await prepareCadEdges(meshes,{signal:new AbortController().signal,onProgress(){},onMesh:(_,i)=>order.push(i),createWorker})
  assert.deepEqual(sizes,[32,32,3]);assert.deepEqual(order,Array.from({length:67},(_,i)=>i))
  sizes.length=0
  const big=new Float32Array(700002)
  await prepareCadEdges(Array.from({length:6},()=>({attributes:{position:{array:big}},index:{array:ix},brep_faces:[{first:0,last:1}]})),{signal:new AbortController().signal,onProgress(){},onMesh(){},createWorker})
  assert.deepEqual(sizes,[2,2,2])
  assert.equal(big.byteLength,2800008)
})
