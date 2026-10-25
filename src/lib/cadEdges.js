// Use CAD face boundaries, not the diagonals used to triangulate a curved face.
export function buildCadEdges(position, index, faces) {
  if (!faces?.length) throw new Error('CAD面の境界情報がありません。')
  const vertexIds = new Uint32Array(position.length / 3)
  const points = [], pointIds = new Map()
  for (let i = 0; i < vertexIds.length; i++) {
    const p = [position[i * 3], position[i * 3 + 1], position[i * 3 + 2]]
    const key = p.join(',')
    let id = pointIds.get(key)
    if (id === undefined) { id = points.length; pointIds.set(key, id); points.push(p) }
    vertexIds[i] = id
  }
  // Integer pairs avoid allocating a string for every triangle edge.
  // Fall back to strings only if a mesh exceeds exact JS integer packing.
  const base = points.length
  const packNumbers = Number.isSafeInteger(base * base)
  const boundaries = new Set()
  for (const face of faces) {
    if (face.last < face.first) continue
    if (face.first < 0 || (face.last + 1) * 3 > index.length) throw new Error('CAD面の範囲が不正です。')
    const edges = new Map()
    for (let t = face.first; t <= face.last; t++) {
      const ids = [vertexIds[index[t * 3]], vertexIds[index[t * 3 + 1]], vertexIds[index[t * 3 + 2]]]
      for (let e = 0; e < 3; e++) {
        const a = ids[e], b = ids[(e + 1) % 3]
        if (a === b) continue
        const low = Math.min(a, b), high = Math.max(a, b)
        const key = packNumbers ? low * base + high : low + ',' + high
        edges.set(key, (edges.get(key) || 0) + 1)
      }
    }
    for (const [key, count] of edges) if (count !== 2) boundaries.add(key)
  }
  const output = new Float32Array(boundaries.size * 6)
  let offset = 0
  for (const key of boundaries) {
    const [a, b] = packNumbers ? [Math.floor(key / base), key % base] : key.split(',').map(Number)
    output.set(points[a], offset); output.set(points[b], offset + 3); offset += 6
  }
  return output
}
