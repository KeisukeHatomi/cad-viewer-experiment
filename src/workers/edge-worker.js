import { buildCadEdges } from '../lib/cadEdges.js'
self.onmessage = ({ data }) => {
  try {
    const positions = data.meshes.map(mesh => buildCadEdges(mesh.position, mesh.index, mesh.faces))
    self.postMessage({ positions }, positions.map(array => array.buffer))
  } catch (error) { self.postMessage({ error: error.message }) }
}
