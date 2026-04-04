/**
 * DXF Viewer — dxf-parser + Three.js (OrthographicCamera)
 * - 対応エンティティ: LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, SPLINE, INSERT, TEXT, MTEXT
 * - レイヤーカラー対応 (DXF カラーインデックス → RGB)
 * - 複数レイアウト（Model + Paper Space）タブ切り替え
 * - OrbitControls (enableRotate: false) による 2D パン・ズーム
 * - CSS2DObject によるテキストラベル表示
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import DxfParser from 'dxf-parser'
import ACI from 'dxf-parser/dist/AutoCadColorIndex.js'

// ─────────────────────────────────────────────────────────────
// DXF カラーインデックス (ACI) → Three.js Color 変換
// インデックス 7 (白) は背景が白なので黒に変換する
// ─────────────────────────────────────────────────────────────
function aciToColor(colorIndex) {
  // カラーインデックスが未定義または 0（BYBLOCK）/ 256（BYLAYER）の場合はデフォルト黒
  if (colorIndex == null || colorIndex === 0 || colorIndex === 256) return 0x111111
  // 7 番 = 白 → 背景が白なので黒に変換
  if (colorIndex === 7) return 0x111111
  const rgb = ACI[colorIndex]
  if (rgb == null) return 0x111111
  return rgb
}

// レイヤー名からカラーを解決する
function resolveLayerColor(entity, layers) {
  // エンティティに直接色が指定されている場合（colorIndex が 0 や 256 以外）
  if (entity.colorIndex != null && entity.colorIndex !== 0 && entity.colorIndex !== 256) {
    return aciToColor(entity.colorIndex)
  }
  // レイヤーの色を使用
  const layer = layers?.[entity.layer]
  if (layer?.colorIndex != null) {
    return aciToColor(layer.colorIndex)
  }
  return 0x111111
}

// ─────────────────────────────────────────────────────────────
// MTEXT リッチテキスト書式コードを除去してプレーンテキストを返す
// 例: {\fBIZ UDGothic|b0;品番} → 品番
//     \pi3.00694;{\fBIZ...} → プレーンテキスト
// ─────────────────────────────────────────────────────────────
function stripMtext(raw) {
  if (!raw) return ''
  let s = raw
  // \P → 改行
  s = s.replace(/\\P/g, '\n')
  // \~ → 非改行スペース
  s = s.replace(/\\~/g, ' ')
  // \pi...; \pl...; \pr...; \pq...; → 段落設定を除去
  s = s.replace(/\\p[ilrqxt][^;]*;/gi, '')
  // \A...; → 揃え設定を除去
  s = s.replace(/\\A\d;/g, '')
  // \H...;  \W...;  \Q...;  \T...; → テキスト高さ・幅等を除去
  s = s.replace(/\\[HWQTx][^;]*;/g, '')
  // \f...; または \F...; → フォント指定を除去
  s = s.replace(/\\[fF][^;]*;/g, '')
  // \C...; → カラー指定を除去
  s = s.replace(/\\C\d+;/g, '')
  // \L \l \O \o \K \k → 装飾タグを除去
  s = s.replace(/\\[LlOoKk]/g, '')
  // \S...^...; または \S.../...; → 分数/上付き下付きを除去してテキスト部分だけ残す
  s = s.replace(/\\S([^^/;]+)[^^/;]*;/g, '$1')
  // { } → グループ括弧を除去
  s = s.replace(/[{}]/g, '')
  // \\ → バックスラッシュ
  s = s.replace(/\\\\/g, '\\')
  return s.trim()
}

// ─────────────────────────────────────────────────────────────
// エンティティ → Three.js ジオメトリ変換ユーティリティ
// ─────────────────────────────────────────────────────────────

// LINE エンティティから点列を返す
function lineToPoints(entity) {
  const { vertices } = entity
  if (!vertices || vertices.length < 2) return null
  return [
    new THREE.Vector3(vertices[0].x, vertices[0].y, 0),
    new THREE.Vector3(vertices[1].x, vertices[1].y, 0),
  ]
}

// LWPOLYLINE エンティティから点列を返す（bulge は未対応で直線補間）
function lwpolylineToPoints(entity) {
  const { vertices, shape } = entity
  if (!vertices || vertices.length < 2) return null
  const pts = vertices.map(v => new THREE.Vector3(v.x, v.y, 0))
  if (shape) pts.push(pts[0].clone()) // 閉じた場合は最初の点に戻る
  return pts
}

// POLYLINE エンティティから点列を返す
function polylineToPoints(entity) {
  const { vertices, shape } = entity
  if (!vertices || vertices.length < 2) return null
  const pts = vertices.map(v => new THREE.Vector3(v.x, v.y, 0))
  if (shape) pts.push(pts[0].clone())
  return pts
}

// CIRCLE エンティティから点列（32 分割近似）を返す
function circleToPoints(entity) {
  const { center, radius } = entity
  if (radius == null || radius <= 0) return null
  const segments = 64
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const angle = (i / segments) * Math.PI * 2
    pts.push(new THREE.Vector3(
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle),
      0
    ))
  }
  return pts
}

// ARC エンティティから点列を返す
function arcToPoints(entity) {
  const { center, radius, startAngle, endAngle } = entity
  if (radius == null || radius <= 0) return null
  const startRad = THREE.MathUtils.degToRad(startAngle)
  let endRad = THREE.MathUtils.degToRad(endAngle)
  // endAngle < startAngle の場合 (反時計回りで 0° をまたぐ)
  if (endRad <= startRad) endRad += Math.PI * 2
  const segments = Math.max(32, Math.ceil(((endRad - startRad) / (Math.PI * 2)) * 64))
  const pts = []
  for (let i = 0; i <= segments; i++) {
    const angle = startRad + (i / segments) * (endRad - startRad)
    pts.push(new THREE.Vector3(
      center.x + radius * Math.cos(angle),
      center.y + radius * Math.sin(angle),
      0
    ))
  }
  return pts
}

// SPLINE エンティティから点列（制御点を折れ線で近似）を返す
function splineToPoints(entity) {
  // fitPoints がある場合は fitPoints、なければ controlPoints を使用
  const pts = (entity.fitPoints && entity.fitPoints.length >= 2)
    ? entity.fitPoints
    : entity.controlPoints
  if (!pts || pts.length < 2) return null
  return pts.map(p => new THREE.Vector3(p.x, p.y, 0))
}

// ─────────────────────────────────────────────────────────────
// エンティティリストから Three.js オブジェクト群を生成
// 返り値: { lines: THREE.Object3D[], labels: { pos, text }[] }
// ─────────────────────────────────────────────────────────────
function buildSceneObjects(entities, blocks, layers, visibleLayers) {
  const lines = []
  const labels = []

  function processEntity(entity, offsetX = 0, offsetY = 0, scaleX = 1, scaleY = 1, rotation = 0) {
    // 非表示レイヤーはスキップ
    if (visibleLayers && !visibleLayers.has(entity.layer)) return

    const color = resolveLayerColor(entity, layers)

    // ── INSERT (ブロック参照) ──
    if (entity.type === 'INSERT') {
      const block = blocks?.[entity.name]
      if (!block || !block.entities) return
      const bx = (entity.position?.x ?? 0) * scaleX + offsetX
      const by = (entity.position?.y ?? 0) * scaleY + offsetY
      const bRot = (entity.rotation ?? 0)
      const bsx = (entity.xScale ?? 1) * scaleX
      const bsy = (entity.yScale ?? 1) * scaleY
      // ブロック内エンティティを再帰処理
      for (const be of block.entities) {
        processEntity(be, bx, by, bsx, bsy, bRot)
      }
      return
    }

    // ── TEXT / MTEXT ──
    if (entity.type === 'TEXT' || entity.type === 'MTEXT') {
      const pos = entity.position || entity.insertionPoint || { x: 0, y: 0 }
      labels.push({
        x: pos.x * scaleX + offsetX,
        y: pos.y * scaleY + offsetY,
        text: entity.type === 'MTEXT'
        ? stripMtext(entity.text || entity.string || '')
        : (entity.text || entity.string || ''),
        color,
        height: entity.textHeight ?? 1,
      })
      return
    }

    // ── ジオメトリ系エンティティ ──
    let pts = null
    switch (entity.type) {
      case 'LINE':        pts = lineToPoints(entity);        break
      case 'LWPOLYLINE':  pts = lwpolylineToPoints(entity);  break
      case 'POLYLINE':    pts = polylineToPoints(entity);    break
      case 'CIRCLE':      pts = circleToPoints(entity);      break
      case 'ARC':         pts = arcToPoints(entity);         break
      case 'SPLINE':      pts = splineToPoints(entity);      break
      default: return
    }
    if (!pts || pts.length < 2) return

    // オフセット・スケール適用
    const finalPts = pts.map(p => new THREE.Vector3(
      p.x * scaleX + offsetX,
      p.y * scaleY + offsetY,
      0
    ))

    const geo = new THREE.BufferGeometry().setFromPoints(finalPts)
    const mat = new THREE.LineBasicMaterial({ color })
    const line = new THREE.Line(geo, mat)
    lines.push(line)
  }

  for (const entity of entities) {
    processEntity(entity)
  }

  return { lines, labels }
}

// ─────────────────────────────────────────────────────────────
// dxf-parser の解析結果からレイアウト一覧を取得
// dxf-parser は Layout をサポートしないため blocks の paperSpace フラグを利用
// Model Space: entities 直下のエンティティ
// Paper Space: blocks の中で paperSpace === true のもの
// ─────────────────────────────────────────────────────────────
function extractLayouts(dxf) {
  const layouts = [{ name: 'Model', entities: dxf.entities || [] }]
  if (dxf.blocks) {
    for (const [blockName, block] of Object.entries(dxf.blocks)) {
      if (block.paperSpace && block.entities && block.entities.length > 0) {
        // ブロック名が '*Paper_Space' 系の場合に表示名を整形
        let displayName = blockName
        if (blockName === '*Paper_Space') displayName = 'Layout1'
        else if (blockName.startsWith('*Paper_Space')) {
          displayName = 'Layout' + (parseInt(blockName.replace('*Paper_Space', '')) + 2)
        }
        layouts.push({ name: displayName, entities: block.entities })
      }
    }
  }
  return layouts
}

// ─────────────────────────────────────────────────────────────
// ツールバーアイコン
// ─────────────────────────────────────────────────────────────
const FitIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4"
      stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const LayerIcon = () => (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
    <path d="M10 3L17 7l-7 4-7-4 7-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    <path d="M3 11l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 15l7 4 7-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

// ─────────────────────────────────────────────────────────────
// DxfViewer コンポーネント本体
// ─────────────────────────────────────────────────────────────
export default function DxfViewer({ file }) {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('idle') // 'idle' | 'loading' | 'ok' | 'error'
  const [errorMsg, setErrorMsg] = useState('')

  // パース済み DXF データ
  const [dxfData, setDxfData] = useState(null)
  // レイアウト一覧
  const [layouts, setLayouts] = useState([])
  // 現在選択中のレイアウトインデックス
  const [layoutIndex, setLayoutIndex] = useState(0)
  // レイヤー一覧（名前 → 表示状態）
  const [layerVisibility, setLayerVisibility] = useState({})
  // レイヤーパネル表示状態
  const [layerPanelOpen, setLayerPanelOpen] = useState(false)

  // Three.js リソース管理用 ref
  const sceneRef       = useRef(null)
  const cameraRef      = useRef(null)
  const rendererRef    = useRef(null)
  const labelRendererRef = useRef(null)
  const controlsRef    = useRef(null)
  const animFrameRef   = useRef(null)
  const contentGroupRef = useRef(null) // 現在表示中のエンティティグループ
  const labelObjectsRef = useRef([])   // CSS2DObject 参照リスト（dispose 用）

  // ─────────────────────────────────────
  // Three.js シーン初期化（マウント時に1回）
  // ─────────────────────────────────────
  useEffect(() => {
    const container = mountRef.current
    if (!container) return

    // シーン
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xffffff)
    sceneRef.current = scene

    // OrthographicCamera（後で fitToContent で調整）
    const w = container.clientWidth
    const h = container.clientHeight
    const aspect = w / h
    const camera = new THREE.OrthographicCamera(
      -aspect * 100, aspect * 100, 100, -100, -1000, 1000
    )
    camera.position.set(0, 0, 100)
    camera.lookAt(0, 0, 0)
    cameraRef.current = camera

    // WebGL レンダラー
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(w, h)
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // CSS2D レンダラー（テキストラベル用）
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(w, h)
    labelRenderer.domElement.style.position = 'absolute'
    labelRenderer.domElement.style.top = '0'
    labelRenderer.domElement.style.left = '0'
    labelRenderer.domElement.style.pointerEvents = 'none'
    container.appendChild(labelRenderer.domElement)
    labelRendererRef.current = labelRenderer

    // OrbitControls（2D 専用: rotate 無効、右クリック/中ボタンでパン）
    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableRotate = false
    controls.mouseButtons = {
      LEFT:   null,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT:  THREE.MOUSE.PAN,
    }
    controls.touches = {
      ONE:  THREE.TOUCH.PAN,
      TWO:  THREE.TOUCH.DOLLY_PAN,
    }
    controls.screenSpacePanning = true
    controlsRef.current = controls

    // アニメーションループ
    function animate() {
      animFrameRef.current = requestAnimationFrame(animate)
      controls.update()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    }
    animate()

    // リサイズハンドラ
    function onResize() {
      const w = container.clientWidth
      const h = container.clientHeight
      const aspect = w / h
      const halfH = (camera.top - camera.bottom) / 2
      camera.left   = -halfH * aspect
      camera.right  =  halfH * aspect
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
      labelRenderer.setSize(w, h)
    }
    const ro = new ResizeObserver(onResize)
    ro.observe(container)

    // ダブルクリックで全体フィット
    function onDblClick() {
      fitToContent()
    }
    renderer.domElement.addEventListener('dblclick', onDblClick)

    // クリーンアップ
    return () => {
      ro.disconnect()
      cancelAnimationFrame(animFrameRef.current)
      renderer.domElement.removeEventListener('dblclick', onDblClick)
      controls.dispose()
      renderer.dispose()
      container.removeChild(renderer.domElement)
      container.removeChild(labelRenderer.domElement)
      sceneRef.current       = null
      cameraRef.current      = null
      rendererRef.current    = null
      labelRendererRef.current = null
      controlsRef.current    = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────
  // ファイル変更時: DXF パース
  // ─────────────────────────────────────
  useEffect(() => {
    if (!file) return
    setStatus('loading')
    setDxfData(null)
    setLayouts([])
    setLayoutIndex(0)
    setLayerVisibility({})

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parser = new DxfParser()
        const dxf = parser.parseSync(e.target.result)
        if (!dxf) throw new Error('DXF のパースに失敗しました')

        // レイアウト抽出
        const extracted = extractLayouts(dxf)
        setLayouts(extracted)

        // レイヤー一覧を初期化（すべて表示状態）
        const layerNames = Object.keys(dxf.tables?.layer?.layers ?? {})
        // エンティティ中にあるがテーブルにないレイヤーも収集
        const entityLayers = new Set(
          (dxf.entities ?? []).map(e => e.layer).filter(Boolean)
        )
        if (dxf.blocks) {
          for (const block of Object.values(dxf.blocks)) {
            (block.entities ?? []).forEach(e => { if (e.layer) entityLayers.add(e.layer) })
          }
        }
        const allLayers = new Set([...layerNames, ...entityLayers])
        const initVisibility = {}
        for (const name of allLayers) {
          // DXF テーブルの visible フラグを考慮
          const tableLayer = dxf.tables?.layer?.layers?.[name]
          initVisibility[name] = tableLayer?.visible !== false
        }
        setLayerVisibility(initVisibility)
        setDxfData(dxf)
        setStatus('ok')
      } catch (err) {
        console.error('[DxfViewer] パースエラー:', err)
        setErrorMsg(err.message || 'DXF のパースに失敗しました')
        setStatus('error')
      }
    }
    reader.onerror = () => {
      setErrorMsg('ファイルの読み込みに失敗しました')
      setStatus('error')
    }
    reader.readAsText(file, 'utf-8')
  }, [file])

  // ─────────────────────────────────────
  // シーン描画: dxfData / layoutIndex / layerVisibility 変更時
  // ─────────────────────────────────────
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene || !dxfData || layouts.length === 0) return

    // 既存コンテンツを削除・dispose
    if (contentGroupRef.current) {
      scene.remove(contentGroupRef.current)
      contentGroupRef.current.traverse(obj => {
        if (obj.geometry) obj.geometry.dispose()
        if (obj.material) obj.material.dispose()
      })
      contentGroupRef.current = null
    }
    // 既存ラベルを削除
    for (const labelObj of labelObjectsRef.current) {
      scene.remove(labelObj)
      // CSS2DObject は domElement を持つ
      if (labelObj.element?.parentNode) {
        labelObj.element.parentNode.removeChild(labelObj.element)
      }
    }
    labelObjectsRef.current = []

    const currentLayout = layouts[layoutIndex]
    if (!currentLayout) return

    const visibleSet = new Set(
      Object.entries(layerVisibility)
        .filter(([, v]) => v)
        .map(([k]) => k)
    )

    const layers  = dxfData.tables?.layer?.layers ?? {}
    const blocks  = dxfData.blocks ?? {}
    const { lines, labels } = buildSceneObjects(
      currentLayout.entities,
      blocks,
      layers,
      visibleSet
    )

    // グループにまとめてシーンへ追加
    const group = new THREE.Group()
    for (const line of lines) group.add(line)
    scene.add(group)
    contentGroupRef.current = group

    // CSS2D テキストラベル追加
    const newLabelObjects = []
    for (const lb of labels) {
      if (!lb.text) continue
      const div = document.createElement('div')
      div.style.fontFamily = "'JetBrains Mono', monospace"
      div.style.fontSize   = '11px'
      div.style.color      = '#' + lb.color.toString(16).padStart(6, '0')
      div.style.pointerEvents = 'none'
      div.style.userSelect   = 'none'
      div.style.whiteSpace   = 'nowrap'
      div.textContent = lb.text
      const labelObj = new CSS2DObject(div)
      labelObj.position.set(lb.x, lb.y, 0)
      scene.add(labelObj)
      newLabelObjects.push(labelObj)
    }
    labelObjectsRef.current = newLabelObjects

    // 初回表示: 全体フィット
    fitToContent()
  }, [dxfData, layoutIndex, layerVisibility, layouts]) // eslint-disable-line react-hooks/exhaustive-deps

  // ─────────────────────────────────────
  // 全体フィット（コンテンツが収まるようカメラを調整）
  // ─────────────────────────────────────
  const fitToContent = useCallback(() => {
    const camera   = cameraRef.current
    const controls = controlsRef.current
    const group    = contentGroupRef.current
    const container = mountRef.current
    if (!camera || !group || !container) return

    // バウンディングボックスを計算
    const box = new THREE.Box3().setFromObject(group)
    if (box.isEmpty()) return

    const center = new THREE.Vector3()
    const size   = new THREE.Vector3()
    box.getCenter(center)
    box.getSize(size)

    const w = container.clientWidth
    const h = container.clientHeight
    const aspect = w / h
    const padding = 1.1 // 10% 余白

    // カメラのフラスタムサイズを設定
    const halfH = Math.max(size.y, size.x / aspect) / 2 * padding
    const halfW = halfH * aspect

    camera.left   = -halfW
    camera.right  =  halfW
    camera.top    =  halfH
    camera.bottom = -halfH
    camera.updateProjectionMatrix()

    // カメラとコントロールのターゲットをコンテンツ中心に
    camera.position.set(center.x, center.y, 100)
    camera.lookAt(center.x, center.y, 0)
    if (controls) {
      controls.target.set(center.x, center.y, 0)
      controls.update()
    }
  }, [])

  // ─────────────────────────────────────
  // レイヤー表示トグル
  // ─────────────────────────────────────
  function toggleLayer(name) {
    setLayerVisibility(prev => ({ ...prev, [name]: !prev[name] }))
  }

  function toggleAllLayers(visible) {
    setLayerVisibility(prev => {
      const next = {}
      for (const k of Object.keys(prev)) next[k] = visible
      return next
    })
  }

  const layerNames = Object.keys(layerVisibility)
  const visibleCount = layerNames.filter(n => layerVisibility[n]).length

  // ─────────────────────────────────────
  // レンダリング
  // ─────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Three.js マウントポイント */}
      <div ref={mountRef} style={{ width: '100%', height: '100%' }} />

      {/* ローディング表示 */}
      {status === 'loading' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.85)',
          fontFamily: "'JetBrains Mono', monospace",
          fontSize: 13, color: '#6b7280', letterSpacing: '0.08em',
        }}>
          DXF を読み込み中…
        </div>
      )}

      {/* エラー表示 */}
      {status === 'error' && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 8,
          fontFamily: "'Noto Sans JP', sans-serif",
        }}>
          <span style={{ color: '#ef4444', fontSize: 14, fontWeight: 500 }}>
            DXF の読み込みに失敗しました
          </span>
          <span style={{ color: '#9ca3af', fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            {errorMsg}
          </span>
        </div>
      )}

      {/* レイアウトタブ（複数レイアウトの場合のみ表示）*/}
      {status === 'ok' && layouts.length > 1 && (
        <div style={{
          position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', gap: 2,
          background: 'rgba(255,255,255,0.92)',
          border: '1px solid #e5e7eb',
          borderRadius: 8,
          padding: '3px 4px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          zIndex: 10,
        }}>
          {layouts.map((layout, i) => (
            <button
              key={layout.name}
              onClick={() => setLayoutIndex(i)}
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                fontWeight: i === layoutIndex ? 600 : 400,
                color: i === layoutIndex ? '#111827' : '#6b7280',
                background: i === layoutIndex ? '#f3f4f6' : 'transparent',
                border: 'none',
                borderRadius: 5,
                padding: '4px 12px',
                cursor: 'pointer',
                transition: 'all 150ms',
                whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => {
                if (i !== layoutIndex) e.currentTarget.style.background = '#f9fafb'
              }}
              onMouseLeave={e => {
                if (i !== layoutIndex) e.currentTarget.style.background = 'transparent'
              }}
            >
              {layout.name}
            </button>
          ))}
        </div>
      )}

      {/* ツールバー */}
      {status === 'ok' && (
        <div style={{
          position: 'absolute', top: 12, right: 12,
          display: 'flex', flexDirection: 'column', gap: 4,
          zIndex: 10,
        }}>
          {/* ツールバーコンテナ */}
          <div style={{
            display: 'flex', flexDirection: 'column', gap: 1,
            background: 'rgba(255,255,255,0.92)',
            border: '1px solid #e5e7eb',
            borderRadius: 9,
            padding: '4px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.08)',
          }}>
            {/* フィットボタン */}
            <ToolbarButton
              title="全体フィット (ダブルクリックでも可)"
              onClick={fitToContent}
            >
              <FitIcon />
            </ToolbarButton>

            {/* セパレータ */}
            <div style={{ height: 1, background: '#e5e7eb', margin: '2px 4px' }} />

            {/* レイヤーパネルトグルボタン */}
            <ToolbarButton
              title={`レイヤー (${visibleCount}/${layerNames.length})`}
              onClick={() => setLayerPanelOpen(v => !v)}
              active={layerPanelOpen}
            >
              <LayerIcon />
            </ToolbarButton>
          </div>
        </div>
      )}

      {/* レイヤーパネル */}
      {layerPanelOpen && status === 'ok' && (
        <div style={{
          position: 'absolute', top: 12, right: 60,
          width: 200,
          background: 'rgba(255,255,255,0.97)',
          border: '1px solid #e5e7eb',
          borderRadius: 9,
          padding: '10px 12px',
          boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
          zIndex: 10,
          maxHeight: 'calc(100% - 80px)',
          overflowY: 'auto',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {/* ヘッダー */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 9, letterSpacing: '0.18em',
              color: '#6b7280', textTransform: 'uppercase',
            }}>
              Layers
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <SmallTextButton onClick={() => toggleAllLayers(true)}>全表示</SmallTextButton>
              <SmallTextButton onClick={() => toggleAllLayers(false)}>全非表示</SmallTextButton>
            </div>
          </div>
          <div style={{ height: 1, background: '#e5e7eb' }} />
          {/* レイヤーリスト */}
          {layerNames.length === 0 && (
            <span style={{ fontSize: 12, color: '#9ca3af', fontFamily: "'Noto Sans JP', sans-serif" }}>
              レイヤーなし
            </span>
          )}
          {layerNames.map(name => {
            const tableLayer = dxfData?.tables?.layer?.layers?.[name]
            const colorIndex = tableLayer?.colorIndex
            const colorHex = '#' + aciToColor(colorIndex).toString(16).padStart(6, '0')
            const visible = layerVisibility[name]
            return (
              <LayerRow
                key={name}
                name={name}
                color={colorHex}
                visible={visible}
                onToggle={() => toggleLayer(name)}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// ツールバーボタン（StepViewer スタイル準拠）
// ─────────────────────────────────────────────────────────────
function ToolbarButton({ children, onClick, title, active }) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        width: 34, height: 34,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: active ? '#f3f4f6' : 'transparent',
        border: 'none',
        borderRadius: 6,
        color: active ? '#111827' : '#374151',
        cursor: 'pointer',
        transition: 'background 150ms, color 150ms',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = '#f3f4f6'
        e.currentTarget.style.color = '#111827'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = active ? '#f3f4f6' : 'transparent'
        e.currentTarget.style.color = active ? '#111827' : '#374151'
      }}
    >
      {children}
    </button>
  )
}

// レイヤー行
function LayerRow({ name, color, visible, onToggle }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        cursor: 'pointer', padding: '2px 0',
        opacity: visible ? 1 : 0.4,
        transition: 'opacity 150ms',
      }}
      onClick={onToggle}
    >
      {/* カラースウォッチ */}
      <div style={{
        width: 12, height: 12,
        borderRadius: 3,
        background: color === '#111111' || color === '#111827' ? '#111827' : color,
        border: '1px solid #d1d5db',
        flexShrink: 0,
      }} />
      {/* レイヤー名 */}
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11, color: '#374151',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        flex: 1,
      }}>
        {name}
      </span>
      {/* 表示/非表示アイコン */}
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none"
        style={{ flexShrink: 0, color: visible ? '#6b7280' : '#d1d5db' }}>
        {visible ? (
          <>
            <path d="M1 8C2.5 4.5 5 3 8 3s5.5 1.5 7 5c-1.5 3.5-4 5-7 5S2.5 11.5 1 8z"
              stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <circle cx="8" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.3"/>
          </>
        ) : (
          <>
            <path d="M1 8C2.5 4.5 5 3 8 3s5.5 1.5 7 5c-1.5 3.5-4 5-7 5S2.5 11.5 1 8z"
              stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <line x1="2" y1="2" x2="14" y2="14" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </>
        )}
      </svg>
    </div>
  )
}

// 小テキストボタン
function SmallTextButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 9, color: '#6b7280',
        background: '#f9fafb', border: '1px solid #e5e7eb',
        borderRadius: 4, padding: '2px 6px',
        cursor: 'pointer',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#f3f4f6' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#f9fafb' }}
    >
      {children}
    </button>
  )
}
