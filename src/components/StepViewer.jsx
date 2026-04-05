/**
 * STEP Viewer — occt-import-js + Three.js
 * - TrackballControls: CAD ライクな自由回転（ジンバルロックなし）
 * - 寸法測定: 2点クリックで距離を計測・表示
 * - コメント挿入: クリックした点に 3D ピンコメントを配置
 */
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { TrackballControls } from 'three/addons/controls/TrackballControls.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js'

// ツールバーアイコン (Shapr3D スタイル — 18×18 inline SVG)
const ICONS = {
  navigate: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4.5 2L4.5 15.5L7.8 12L10 17.5L12.2 16.5L10 11.5L14.5 11.5Z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  ),
  measure: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <line x1="3" y1="10" x2="17" y2="10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="3"  y1="7"  x2="3"  y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="17" y1="7"  x2="17" y2="13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  comment: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M4 3.5h12a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H8l-4 3.5V4.5a1 1 0 0 1 1-1z"
        stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  ),
  shaded: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor"/>
    </svg>
  ),
  'shaded-edges': (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor" opacity="0.22"/>
      <rect x="4" y="4" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.75"/>
    </svg>
  ),
  hiddenline: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="4.5" y1="10" x2="15.5" y2="10" stroke="currentColor" strokeWidth="1" strokeDasharray="2.5 2"/>
      <line x1="10"  y1="4.5" x2="10" y2="15.5" stroke="currentColor" strokeWidth="1" strokeDasharray="2.5 2"/>
    </svg>
  ),
  wireframe: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <rect x="4" y="4" width="12" height="12" rx="2.5" stroke="currentColor" strokeWidth="1.5"/>
      <line x1="8"  y1="4"  x2="8"  y2="16" stroke="currentColor" strokeWidth="1"/>
      <line x1="12" y1="4"  x2="12" y2="16" stroke="currentColor" strokeWidth="1"/>
      <line x1="4"  y1="8"  x2="16" y2="8"  stroke="currentColor" strokeWidth="1"/>
      <line x1="4"  y1="12" x2="16" y2="12" stroke="currentColor" strokeWidth="1"/>
    </svg>
  ),
  holeInfo: (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
}

// ViewCube 面定義 (Z-up CAD 座標系)
// cssTransform: CSS 3D での面の向き  dirArr: スナップ時のカメラ方向  upArr: スナップ時の up ベクトル
const CUBE_H = 18  // 36px キューブの半サイズ
// cssTransform の CSS ローカル法線 → Three.js ワールド方向 の対応:
//   translateZ        → CSS +Z → Three.js +Z (上)
//   rotateY(180)translateZ → CSS -Z → Three.js -Z (下)
//   rotateY(-90)translateZ → CSS +X → Three.js +X (右)
//   rotateY(90) translateZ → CSS -X → Three.js -X (左)
//   rotateX(-90)translateZ → CSS +Y → Three.js +Y (正面)
//   rotateX(90) translateZ → CSS -Y → Three.js -Y (背面)
const CUBE_FACES = [
  { key: 'top',    label: '上面', cssTransform: `translateZ(${CUBE_H}px)`,                dirArr: [ 0,  0,  1], upArr: [0, 1, 0] },
  { key: 'bottom', label: '下面', cssTransform: `rotateY(180deg) translateZ(${CUBE_H}px)`, dirArr: [ 0,  0, -1], upArr: [0, 1, 0] },
  { key: 'right',  label: '右面', cssTransform: `rotateY(-90deg) translateZ(${CUBE_H}px)`, dirArr: [-1,  0,  0], upArr: [0, 0, 1] },
  { key: 'left',   label: '左面', cssTransform: `rotateY(90deg) translateZ(${CUBE_H}px)`,  dirArr: [ 1,  0,  0], upArr: [0, 0, 1] },
  { key: 'front',  label: '正面', cssTransform: `rotateX(-90deg) translateZ(${CUBE_H}px)`, dirArr: [ 0, -1,  0], upArr: [0, 0, 1] },
  { key: 'back',   label: '背面', cssTransform: `rotateX(90deg) translateZ(${CUBE_H}px)`,  dirArr: [ 0,  1,  0], upArr: [0, 0, 1] },
]

export default function StepViewer({ file, colors, lights }) {
  const mountRef = useRef(null)
  const [status, setStatus] = useState('idle') // 'idle'|'loading'|'ok'|'error'
  const [errorMsg, setErrorMsg] = useState('')

  // モード: navigate / measure / comment
  const [mode, setMode] = useState('navigate')
  const modeRef = useRef('navigate')

  // 表示モード: shaded / shaded-edges / hiddenline / wireframe
  const [displayMode, setDisplayMode] = useState('shaded-edges')
  const displayModeRef = useRef('shaded-edges')

  // Three.js オブジェクト（ref で保持してイベントハンドラから参照）
  const sceneRef = useRef(null)
  const cameraRef = useRef(null)
  const controlsRef = useRef(null)
  const rendererRef = useRef(null)
  const labelRendererRef = useRef(null)
  const meshesRef = useRef([])
  const modelSizeRef = useRef(1)
  const solidGroupRef = useRef(null)      // シェード用メッシュ群
  const edgeGroupRef = useRef(null)       // エッジライン群（鋭角）
  const ridgeGroupRef = useRef(null)      // 稜線群（緩い角）
  const hlBaseGroupRef = useRef(null)     // 陰線用ベースメッシュ群（背景色）
  const silhouetteGroupRef = useRef(null) // シルエット（輪郭線・毎フレーム更新）
  const edgeMatRef = useRef(null)
  const ridgeMatRef = useRef(null)
  const silMatRef = useRef(null)
  // シルエット計算用: Float32Array [p0,p1,n1,n2] × edgeCount
  const silEdgeDataRef = useRef(null)
  // プリアロケーション済みシルエット用 BufferGeometry
  const silGeoRef = useRef(null)

  // 配置済み寸法
  const dimObjectsRef    = useRef(new Map()) // id → { group, labelObj, p1, p2, leader1, leader2 }
  const selectedDimIdRef = useRef(null)
  const dragDimRef       = useRef(null) // { id, labelObj, lastX, lastY } | null

  // ホバーハイライト & ゴムバンド（寸法モード）
  const hoverHighlightRef = useRef(null) // 面/エッジのハイライトオブジェクト
  const rubberBandRef     = useRef(null) // 1点目選択後のゴムバンド線
  const sel1HighlightRef  = useRef(null) // 1点目選択中のハイライト（確定まで維持）

  // B-rep面情報: mesh → brep_faces 配列のマップ（面ハイライト用）
  const brepFacesMapRef = useRef(new Map()) // THREE.Mesh → [{ first, last }, ...]

  // モデル面マテリアル（ロード後に色変更できるようref管理）
  const solidMatRef = useRef(null)

  // ライト ref（リアルタイム強度変更用）
  const hemLightRef  = useRef(null)
  const keyLightRef  = useRef(null)
  const fillLightRef = useRef(null)

  // colors props 変更 → Three.js マテリアル・背景をリアルタイム反映
  useEffect(() => {
    if (!colors) return
    if (solidMatRef.current) solidMatRef.current.color.set(colors.model)
    if (edgeMatRef.current)  edgeMatRef.current.color.set(colors.sharpEdge)
    if (ridgeMatRef.current) ridgeMatRef.current.color.set(colors.ridge)
    if (silMatRef.current)   silMatRef.current.color.set(colors.silhouette)
    if (sceneRef.current)    sceneRef.current.background.set(colors.background)
    // 陰線消去メッシュの色も背景に合わせる
    if (hlBaseGroupRef.current) {
      hlBaseGroupRef.current.traverse(obj => {
        if (obj.isMesh) obj.material.color.set(colors.background)
      })
    }
  }, [colors])

  // lights props 変更 → ライト強度をリアルタイム反映
  useEffect(() => {
    if (!lights) return
    if (hemLightRef.current)  hemLightRef.current.intensity  = lights.hem
    if (keyLightRef.current)  keyLightRef.current.intensity  = lights.key
    if (fillLightRef.current) fillLightRef.current.intensity = lights.fill
  }, [lights])

  // 寸法測定 — 1点目選択状態
  const [measureSel1, setMeasureSel1] = useState(null)
  // null | { type: 'face'|'edge', point: THREE.Vector3, normal: THREE.Vector3|null }
  const measureSel1Ref = useRef(null)

  // 配置済み寸法 (React 側: 再レンダリングのトリガー用)
  const [_dimensions, setDimensions] = useState([])
  const [selectedDimId, setSelectedDimId] = useState(null)

  // コメント入力ポップアップ
  const [commentInput, setCommentInput] = useState(null) // { clientX, clientY, worldPos }
  const [commentText, setCommentText] = useState('')

  // 穴・円筒面の解析結果
  const [holeInfo, setHoleInfo] = useState(null) // [{ diameter, count, isHole, instances }] | null
  const [showHolePanel, setShowHolePanel] = useState(false)
  const holeAnnotationsRef = useRef(new Map()) // annotId → { labelObj, leader, arrow, overlay, anchor }

  // コメントオブジェクト
  const commentObjectsRef = useRef(new Map()) // id → { labelObj, leader, arrow, anchor }

  // ドラッグ判定
  const mouseDownRef = useRef(null)
  const viewCubeRef = useRef(null)

  // モード変更時: pending 状態のクリア
  useEffect(() => {
    modeRef.current = mode
    if (mode !== 'measure') {
      // ゴムバンド・ホバーハイライト・sel1ハイライトのクリア
      if (rubberBandRef.current && sceneRef.current) {
        sceneRef.current.remove(rubberBandRef.current)
        rubberBandRef.current.geometry.dispose()
        rubberBandRef.current.material.dispose()
        rubberBandRef.current = null
      }
      const disposeGroup = (grp) => {
        if (!grp || !sceneRef.current) return
        sceneRef.current.remove(grp)
        grp.traverse(child => {
          if (child.geometry && !child._sharedGeo) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
            else child.material.dispose()
          }
        })
      }
      disposeGroup(hoverHighlightRef.current); hoverHighlightRef.current = null
      disposeGroup(sel1HighlightRef.current);  sel1HighlightRef.current = null
      measureSel1Ref.current = null
      setMeasureSel1(null)
    }
    if (mode !== 'comment') {
      setCommentInput(null)
      setCommentText('')
    }
  }, [mode])

  // 表示モード適用（useEffect と モデルロード後の両方から呼ぶ）
  function applyDisplayMode(dm) {
    const solid    = solidGroupRef.current
    const edges    = edgeGroupRef.current
    const ridges   = ridgeGroupRef.current
    const hlBase   = hlBaseGroupRef.current
    const sil      = silhouetteGroupRef.current
    const edgeMat  = edgeMatRef.current
    const ridgeMat = ridgeMatRef.current
    const silMat   = silMatRef.current
    if (!solid) return

    if (edgeMat)  edgeMat.color.set(0x000000)
    if (ridgeMat) ridgeMat.color.set(0x000000)
    if (silMat)   silMat.color.set(0x000000)

    switch (dm) {
      case 'shaded':
        solid.visible  = true
        if (edges)  edges.visible  = false
        if (ridges) ridges.visible = false
        if (hlBase) hlBase.visible = false
        if (sil)    sil.visible    = false
        break
      case 'shaded-edges':
        solid.visible  = true
        if (edges)  edges.visible  = true
        if (ridges) ridges.visible = true
        if (hlBase) hlBase.visible = false
        if (sil)    sil.visible    = true
        break
      case 'wireframe':
        solid.visible  = false
        if (edges)  edges.visible  = true
        if (ridges) ridges.visible = true
        if (hlBase) hlBase.visible = false
        if (sil)    sil.visible    = true
        break
      case 'hiddenline':
        solid.visible  = false
        if (edges)  edges.visible  = true
        if (ridges) ridges.visible = true
        if (hlBase) hlBase.visible = true
        if (sil)    sil.visible    = true
        break
    }
  }

  // 表示モード切替
  useEffect(() => {
    displayModeRef.current = displayMode
    applyDisplayMode(displayMode)
  }, [displayMode])

  useEffect(() => {
    if (!file || !mountRef.current) return

    let cancelled = false
    let animId = null

    setMode('navigate')
    modeRef.current = 'navigate'
    setDisplayMode('shaded-edges')
    solidGroupRef.current      = null
    edgeGroupRef.current       = null
    ridgeGroupRef.current      = null
    hlBaseGroupRef.current     = null
    silhouetteGroupRef.current = null
    silEdgeDataRef.current     = null
    silGeoRef.current          = null
    measureSel1Ref.current = null
    setMeasureSel1(null)
    setDimensions([])
    dimObjectsRef.current.clear()
    setSelectedDimId(null)
    selectedDimIdRef.current = null
    hoverHighlightRef.current = null
    rubberBandRef.current = null
    setCommentInput(null)

    const container = mountRef.current
    const W = container.clientWidth || 800
    const H = container.clientHeight || 500

    // --- WebGL レンダラー ---
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(W, H)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    container.appendChild(renderer.domElement)
    rendererRef.current = renderer

    // --- CSS2D レンダラー（測定ラベル・コメントピン用）---
    const labelRenderer = new CSS2DRenderer()
    labelRenderer.setSize(W, H)
    Object.assign(labelRenderer.domElement.style, {
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none', zIndex: 10,
    })
    container.appendChild(labelRenderer.domElement)
    labelRendererRef.current = labelRenderer

    // --- シーン・カメラ ---
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(colors?.background ?? '#f0f0f0')
    sceneRef.current = scene

    // 等角投影（OrthographicCamera）— モデルロード後に視野を確定する
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1e6, 1e6)
    camera.userData.frustumHalf = 1
    cameraRef.current = camera

    // --- TrackballControls（ターゲット管理のみ。パン・ズーム・回転はすべて独自実装）---
    const controls = new TrackballControls(camera, renderer.domElement)
    controls.noRotate = true
    controls.noZoom = true
    controls.noPan = true     // パンも独自実装に切り替え
    controls.staticMoving = true
    controlsRef.current = controls

    // --- ライト（CAD 的: 形状が見えやすい均一照明）---
    const hemLight = new THREE.HemisphereLight(0xffffff, 0xffffff, lights?.hem ?? 1.0)
    scene.add(hemLight)
    hemLightRef.current = hemLight
    // キーライト（右上前）
    const keyLight = new THREE.DirectionalLight(0xffffff, lights?.key ?? 2.0)
    keyLight.position.set(1, 2, 1.5)
    scene.add(keyLight)
    keyLightRef.current = keyLight
    // フィルライト（左下後）
    const fillLight = new THREE.DirectionalLight(0xffffff, lights?.fill ?? 1.0)
    fillLight.position.set(-1, -0.5, -1)
    scene.add(fillLight)
    fillLightRef.current = fillLight

    // --- 回転ピボットマーカー用変数（animate より前に宣言が必要）---
    let rotatePivot = null
    let rotateLastX = 0, rotateLastY = 0
    let pivotMarker = null  // THREE.Group

    // --- シルエット更新（毎フレーム）---
    // silEdgeData: Float32Array で [p0x,p0y,p0z, p1x,p1y,p1z, n0x,n0y,n0z, n1x,n1y,n1z] × n
    const _camDir = new THREE.Vector3()
    function updateSilhouette() {
      const geo = silGeoRef.current
      const data = silEdgeDataRef.current
      const silGrp = silhouetteGroupRef.current
      if (!geo || !data || !silGrp || !silGrp.visible) return

      camera.getWorldDirection(_camDir)

      const pos = geo.attributes.position.array
      let w = 0
      const stride = 12  // 4 vec3 per edge
      const n = data.length / stride

      for (let i = 0; i < n; i++) {
        const b = i * stride
        // 2つの面法線とカメラ方向の内積
        const d0 = data[b+6]*_camDir.x + data[b+7]*_camDir.y + data[b+8]*_camDir.z
        const d1 = data[b+9]*_camDir.x + data[b+10]*_camDir.y + data[b+11]*_camDir.z
        // 符号が異なる辺 = シルエット
        if (d0 * d1 < 0) {
          pos[w++] = data[b];   pos[w++] = data[b+1]; pos[w++] = data[b+2]
          pos[w++] = data[b+3]; pos[w++] = data[b+4]; pos[w++] = data[b+5]
        }
      }
      geo.setDrawRange(0, w / 3)
      geo.attributes.position.needsUpdate = true
    }

    // --- アニメーションループ ---
    function animate() {
      animId = requestAnimationFrame(animate)
      controls.update()
      updatePivotScale()
      updateSilhouette()
      renderer.render(scene, camera)
      labelRenderer.render(scene, camera)
    }
    animate()

    // --- リサイズ対応（等角投影: アスペクト比に合わせて左右を調整）---
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight
      renderer.setSize(w, h)
      labelRenderer.setSize(w, h)
      const fh = camera.userData.frustumHalf
      const aspect = w / h
      camera.left   = -fh * aspect
      camera.right  =  fh * aspect
      camera.top    =  fh
      camera.bottom = -fh
      camera.updateProjectionMatrix()
      controls.handleResize()
      // パン感度をリサイズ後のキャンバス幅で再計算
      const ms = modelSizeRef.current
      if (ms > 0) controls.panSpeed = w / (ms * 1.5 * Math.sqrt(3))
    })
    ro.observe(container)

    // --- 独自回転（TrackballControls の noRotate=true で無効化済み）---
    // ピボット = mousedown 時のレイキャストヒット点（またはモデル中心）

    function createPivotMarker(pos) {
      // スケール 1 = 半径 1 のユニットサイズで作成
      // → animate ループで毎フレームスクリーン固定サイズにスケール更新
      const group = new THREE.Group()
      group.position.copy(pos)

      function makeCirclePts(segments = 96) {
        const pts = []
        for (let i = 0; i <= segments; i++) {
          const a = (i / segments) * Math.PI * 2
          pts.push(new THREE.Vector3(Math.cos(a), Math.sin(a), 0))
        }
        return new THREE.BufferGeometry().setFromPoints(pts)
      }

      // 平面円リング: 各軸に垂直な面（色は軸と対応: X=赤 Y=緑 Z=青）
      ;[
        { color: 0xff4444, rx: 0,           ry: Math.PI / 2 }, // YZ面（X軸周り）
        { color: 0x44dd66, rx: Math.PI / 2, ry: 0 },           // XZ面（Y軸周り）
        { color: 0x4488ff, rx: 0,           ry: 0 },           // XY面（Z軸周り）
      ].forEach(({ color, rx, ry }) => {
        const line = new THREE.Line(
          makeCirclePts(),
          new THREE.LineBasicMaterial({ color, opacity: 0.75, transparent: true, depthTest: false }),
        )
        line.rotation.set(rx, ry, 0)
        line.renderOrder = 998
        group.add(line)
      })

      // XYZ軸線（リング半径 1 に対して ±1.4 の長さ）
      ;[
        { color: 0xff4444, dir: new THREE.Vector3(1.4, 0, 0) }, // X 赤
        { color: 0x44dd66, dir: new THREE.Vector3(0, 1.4, 0) }, // Y 緑
        { color: 0x4488ff, dir: new THREE.Vector3(0, 0, 1.4) }, // Z 青
      ].forEach(({ color, dir }) => {
        const axis = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([dir.clone().negate(), dir.clone()]),
          new THREE.LineBasicMaterial({ color, opacity: 0.9, transparent: true, depthTest: false }),
        )
        axis.renderOrder = 999
        group.add(axis)
      })

      scene.add(group)
      return group
    }

    // スクリーン上で約 55px 相当になるようスケールを更新
    function updatePivotScale() {
      if (!pivotMarker) return
      const frustumH = (camera.top - camera.bottom)   // zoom=1 のワールド高さ
      const px = 55
      const worldR = px * frustumH / (camera.zoom * container.clientHeight)
      pivotMarker.scale.setScalar(worldR)
    }

    function removePivotMarker() {
      if (!pivotMarker) return
      scene.remove(pivotMarker)
      pivotMarker = null
    }

    function onRotateDown(e) {
      if (e.button !== 0) return
      if (dragDimRef.current) return  // 寸法ラベルドラッグが優先
      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const rc = new THREE.Raycaster()
      rc.setFromCamera(mouse, camera)
      const hits = rc.intersectObjects(meshesRef.current, false)
      rotatePivot = hits.length > 0 ? hits[0].point.clone() : controls.target.clone()
      rotateLastX = e.clientX
      rotateLastY = e.clientY

      // ランドマーク表示
      removePivotMarker()
      pivotMarker = createPivotMarker(rotatePivot)
    }

    function onRotateMove(e) {
      if (!(e.buttons & 1) || !rotatePivot) return
      if (dragDimRef.current) return  // 寸法ラベルドラッグ中は回転しない
      const dx = e.clientX - rotateLastX
      const dy = e.clientY - rotateLastY
      rotateLastX = e.clientX
      rotateLastY = e.clientY
      if (dx === 0 && dy === 0) return

      const W = renderer.domElement.clientWidth
      const H = renderer.domElement.clientHeight
      const speed = 3.0 * Math.PI  // rotateSpeed * π（TrackballControls と同等）

      // TrackballControls と同じアルゴリズム: マウス移動 → 3D 方向 → 回転軸
      const eye = camera.position.clone().sub(rotatePivot)
      const eyeDir = eye.clone().normalize()
      const upDir = camera.up.clone().normalize()
      const sideDir = new THREE.Vector3().crossVectors(upDir, eyeDir).normalize()

      const moveDir = new THREE.Vector3()
        .addScaledVector(upDir, -dy / H)
        .addScaledVector(sideDir, dx / W)

      const angle = moveDir.length() * speed
      if (angle < 1e-10) return

      const axis = new THREE.Vector3().crossVectors(moveDir.normalize(), eye).normalize()
      const q = new THREE.Quaternion().setFromAxisAngle(axis, angle)

      // カメラとターゲットを pivot 中心に同じ四元数で回転
      const camOff = camera.position.clone().sub(rotatePivot)
      camera.position.copy(rotatePivot).add(camOff.applyQuaternion(q))

      const tgtOff = controls.target.clone().sub(rotatePivot)
      controls.target.copy(rotatePivot).add(tgtOff.applyQuaternion(q))

      camera.up.applyQuaternion(q)
      camera.lookAt(controls.target)
    }

    function onRotateUp(e) {
      if (e.button !== 0) return
      rotatePivot = null
      removePivotMarker()
    }

    // --- 独自パン（右ボタンドラッグ: 完全1:1）---
    // 等角投影カメラで dx_pixel → world = dx_pixel * (right-left) / clientWidth / zoom
    let panLastX = 0, panLastY = 0

    let isPanning = false

    function onPanDown(e) {
      if (e.button !== 2) return
      isPanning = true
      panLastX = e.clientX
      panLastY = e.clientY
      // パン中はラベルレイヤーのポインターイベントを無効化（ラベルがイベントを奪うのを防止）
      labelRenderer.domElement.style.pointerEvents = 'none'
    }

    function onPanMove(e) {
      if (!isPanning) return
      if (!(e.buttons & 2)) { onPanUp(); return }
      const dx = e.clientX - panLastX
      const dy = e.clientY - panLastY
      panLastX = e.clientX
      panLastY = e.clientY
      if (dx === 0 && dy === 0) return

      const W = container.clientWidth
      const H = container.clientHeight

      // 1ピクセルあたりのワールド移動量（等角投影）
      const scaleX = (camera.right - camera.left) / camera.zoom / W
      const scaleY = (camera.top - camera.bottom) / camera.zoom / H

      // カメラのワールド空間でのローカル軸（スクリーン右・スクリーン上）
      camera.updateMatrixWorld()
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const up    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)

      const panVec = new THREE.Vector3()
      panVec.addScaledVector(right, -dx * scaleX)
      panVec.addScaledVector(up,     dy * scaleY)

      camera.position.add(panVec)
      controls.target.add(panVec)
    }

    function onPanUp() {
      if (!isPanning) return
      isPanning = false
      // ラベルレイヤーのポインターイベントを復元（レイヤー自体は none のまま、個別ラベルが auto）
      labelRenderer.domElement.style.pointerEvents = 'none'
    }

    function onContextMenu(e) { e.preventDefault() }
    renderer.domElement.addEventListener('contextmenu', onContextMenu)
    renderer.domElement.addEventListener('mousedown', onPanDown)
    document.addEventListener('mousemove', onPanMove)
    document.addEventListener('mouseup', onPanUp)

    // --- ズーム（キャプチャフェーズ: マウス位置を中心に拡縮）---
    function onWheelZoom(e) {
      e.preventDefault()
      e.stopPropagation()

      const rect = renderer.domElement.getBoundingClientRect()
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1
      const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1
      const mouseNDC = new THREE.Vector3(ndcX, ndcY, 0)

      // ズーム前のカーソル下のワールド座標
      const beforeWorld = mouseNDC.clone().unproject(camera)

      // ズーム適用（TrackballControls 相当: deltaY 方向に応じて拡縮）
      const factor = e.deltaY > 0 ? 1 / 0.95 : 0.95
      camera.zoom = Math.max(0.001, camera.zoom * factor)
      camera.updateProjectionMatrix()

      // ズーム後のカーソル下のワールド座標
      const afterWorld = mouseNDC.clone().unproject(camera)

      // 差分だけカメラ・ターゲットをパン（カーソル位置が静止して見える）
      const delta = beforeWorld.sub(afterWorld)
      camera.position.add(delta)
      controls.target.add(delta)
    }

    // --- ドラッグ（寸法矢印 / 寸法ラベル / 穴アノテーション / コメント 共通入口）---
    function onDimDragMove(e) {
      if (!dragDimRef.current) return

      // 穴アノテーション / コメント の場合は汎用リーダー線ドラッグ
      if (dragDimRef.current.type === 'holeAnnot' || dragDimRef.current.type === 'comment') {
        onLeaderLabelDrag(e)
        return
      }

      const { type, id, labelObj, lastX, lastY } = dragDimRef.current
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      dragDimRef.current.lastX = e.clientX
      dragDimRef.current.lastY = e.clientY
      if (dx === 0 && dy === 0) return
      const H = container.clientHeight
      const worldPerPixel = (camera.top - camera.bottom) / (camera.zoom * H)
      camera.updateMatrixWorld()
      const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const camUp    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)

      // マウス移動のワールドベクトル
      const moveVec = new THREE.Vector3()
        .addScaledVector(camRight, dx * worldPerPixel)
        .addScaledVector(camUp, -dy * worldPerPixel)

      const dimObj = dimObjectsRef.current.get(id)
      if (!dimObj) return

      const { perpCandidates, pA_proj, pB_proj } = dimObj

      if (type === 'dimArrow') {
        // --- 矢印ドラッグ: ドラッグ方向に近い軸をロックして移動 ---
        // ドラッグ開始後の初回移動で軸をロック
        if (!dragDimRef.current.lockedPerp) {
          const d0 = Math.abs(moveVec.dot(perpCandidates[0]))
          const d1 = Math.abs(moveVec.dot(perpCandidates[1]))
          dragDimRef.current.lockedPerp = d0 >= d1 ? perpCandidates[0] : perpCandidates[1]
        }
        const activePerp = dragDimRef.current.lockedPerp
        const perpAmount = moveVec.dot(activePerp)
        const perpMove = activePerp.clone().multiplyScalar(perpAmount)

        dimObj.group.position.add(perpMove)
        dimObj.offset.add(perpMove)
        dimObj.p1.copy(pA_proj).add(dimObj.offset)
        dimObj.p2.copy(pB_proj).add(dimObj.offset)

        // ラベルも perpDir 方向のみ移動（寸法線と一緒に動く）
        labelObj.position.add(perpMove)

        // 引き出し線を更新
        if (dimObj.ext1) {
          const a = dimObj.ext1.geometry.attributes.position.array
          a[0] = pA_proj.x; a[1] = pA_proj.y; a[2] = pA_proj.z
          a[3] = dimObj.p1.x; a[4] = dimObj.p1.y; a[5] = dimObj.p1.z
          dimObj.ext1.geometry.attributes.position.needsUpdate = true
        }
        if (dimObj.ext2) {
          const a = dimObj.ext2.geometry.attributes.position.array
          a[0] = pB_proj.x; a[1] = pB_proj.y; a[2] = pB_proj.z
          a[3] = dimObj.p2.x; a[4] = dimObj.p2.y; a[5] = dimObj.p2.z
          dimObj.ext2.geometry.attributes.position.needsUpdate = true
        }
      } else {
        // --- ラベルドラッグ (dimLabel): ラベルのみ自由移動 ---
        labelObj.position.add(moveVec)
      }

      // リーダー線: ラベルが寸法線中点から離れたら表示
      const dimMid = dimObj.p1.clone().add(dimObj.p2).multiplyScalar(0.5)
      const labelPos = labelObj.position
      const dist = labelPos.distanceTo(dimMid)
      const threshold = modelSizeRef.current * 0.01

      if (dimObj.leader) {
        if (dist > threshold) {
          dimObj.leader.visible = true
          const a = dimObj.leader.geometry.attributes.position.array
          a[0] = dimMid.x; a[1] = dimMid.y; a[2] = dimMid.z
          a[3] = labelPos.x; a[4] = labelPos.y; a[5] = labelPos.z
          dimObj.leader.geometry.attributes.position.needsUpdate = true
        } else {
          dimObj.leader.visible = false
        }
      }
    }
    // --- 穴アノテーションドラッグ ---
    // 穴アノテーション / コメント 共通のリーダー線ドラッグ
    function onLeaderLabelDrag(e) {
      const { type, id, labelObj, lastX, lastY } = dragDimRef.current
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      dragDimRef.current.lastX = e.clientX
      dragDimRef.current.lastY = e.clientY
      if (dx === 0 && dy === 0) return

      const H = container.clientHeight
      const worldPerPixel = (camera.top - camera.bottom) / (camera.zoom * H)
      camera.updateMatrixWorld()
      const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
      const camUp    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
      const moveVec = new THREE.Vector3()
        .addScaledVector(camRight, dx * worldPerPixel)
        .addScaledVector(camUp, -dy * worldPerPixel)

      // ラベルを自由移動
      labelObj.position.add(moveVec)

      // 引き出し線 + 矢印を更新
      const store = type === 'holeAnnot' ? holeAnnotationsRef : commentObjectsRef
      const obj = store.current.get(id)
      if (obj) {
        const a = obj.leader.geometry.attributes.position.array
        a[3] = labelObj.position.x; a[4] = labelObj.position.y; a[5] = labelObj.position.z
        obj.leader.geometry.attributes.position.needsUpdate = true
        updateLineArrow(obj.arrow, obj.anchor, labelObj.position, modelSizeRef.current)
      }
    }

    function onDimDragEnd() {
      dragDimRef.current = null
    }

    // --- クリック vs ドラッグ判定 ---
    function onMouseDown(e) {
      mouseDownRef.current = { x: e.clientX, y: e.clientY }

      // 左ボタン + 寸法モード: 矢印コーンをレイキャストして寸法ドラッグ開始
      if (e.button === 0 && !dragDimRef.current) {
        const rect = renderer.domElement.getBoundingClientRect()
        const mouse = new THREE.Vector2(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        )
        const rc = new THREE.Raycaster()
        rc.setFromCamera(mouse, camera)
        // 全寸法の矢印コーン + ヒットエリアを集めてレイキャスト
        const allCones = []
        for (const [, obj] of dimObjectsRef.current) {
          if (obj.cones) allCones.push(...obj.cones)
        }
        if (allCones.length) {
          const hits = rc.intersectObjects(allCones, false)
          if (hits.length) {
            const dimId = hits[0].object._dimId
            const dimObj = dimObjectsRef.current.get(dimId)
            if (dimObj) {
              e.stopPropagation()
              dragDimRef.current = {
                type: 'dimArrow', id: dimId, labelObj: dimObj.labelObj,
                lastX: e.clientX, lastY: e.clientY,
              }
              selectedDimIdRef.current = dimId
              setSelectedDimId(dimId)
              return
            }
          }
        }
      }

      // 寸法の選択解除（canvas クリック時）
      if (e.button === 0 && modeRef.current === 'measure' && !dragDimRef.current && selectedDimIdRef.current) {
        selectedDimIdRef.current = null
        setSelectedDimId(null)
      }
    }

    function onMouseUp(e) {
      const down = mouseDownRef.current
      mouseDownRef.current = null
      // ラベルドラッグ終了
      if (dragDimRef.current) { dragDimRef.current = null; return }
      if (!down) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
      if (modeRef.current === 'navigate') return

      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )

      if (modeRef.current === 'measure') {
        handleMeasureClick(mouse, scene, camera, container)
      } else if (modeRef.current === 'comment') {
        const rc = new THREE.Raycaster()
        rc.setFromCamera(mouse, camera)
        const hits = rc.intersectObjects(meshesRef.current, false)
        if (!hits.length) return
        setCommentInput({ clientX: e.clientX, clientY: e.clientY, worldPos: hits[0].point.clone() })
        setCommentText('')
      }
    }

    // --- ホバーハイライト & ゴムバンド（寸法モード）---
    function clearHoverHighlight() {
      if (!hoverHighlightRef.current) return
      scene.remove(hoverHighlightRef.current)
      // グループ内の子を再帰的に dispose（共有 geometry はスキップ）
      hoverHighlightRef.current.traverse(child => {
        if (child.geometry && !child._sharedGeo) child.geometry.dispose()
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
          else child.material.dispose()
        }
      })
      hoverHighlightRef.current = null
    }

    function updateHoverHighlight(hit) {
      clearHoverHighlight()
      if (!hit) return

      const grp = new THREE.Group()

      // スクリーン座標ベースのサイズ（ズーム不変）
      const H = container.clientHeight
      const worldPx = (camera.top - camera.bottom) / (camera.zoom * H)
      // Three.js では Group の renderOrder は子に伝播しないため、各 Line に直接設定する
      const mkLine = (pts, col = 0x2299ff) => {
        const ln = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(pts),
          new THREE.LineBasicMaterial({ color: col, depthTest: false, depthWrite: false }),
        )
        ln.renderOrder = 100
        return ln
      }

      if (hit.type === 'face' && hit.normal && hit.rawHit) {
        // B-rep 面ハイライト: faceIndex からどの brep_face に属するか特定し、その三角形だけをオーバーレイ
        const rawHit = hit.rawHit
        const meshObj = rawHit.object
        const brepFaces = brepFacesMapRef.current.get(meshObj)
        const hitTriIdx = rawHit.faceIndex  // ヒットした三角形番号

        if (brepFaces && hitTriIdx != null) {
          // hitTriIdx がどの brep_face に含まれるか検索（first/last は三角形番号）
          const bf = brepFaces.find(f => hitTriIdx >= f.first && hitTriIdx <= f.last)
          if (bf) {
            const srcGeo = meshObj.geometry
            const srcIndex = srcGeo.index
            const srcPos = srcGeo.attributes.position
            const srcNormal = srcGeo.attributes.normal

            // brep_face の三角形範囲からサブジオメトリを作成
            const triCount = bf.last - bf.first + 1
            const vertCount = triCount * 3
            const positions = new Float32Array(vertCount * 3)
            const normals = srcNormal ? new Float32Array(vertCount * 3) : null

            for (let t = 0; t < triCount; t++) {
              for (let v = 0; v < 3; v++) {
                const srcVert = srcIndex
                  ? srcIndex.array[(bf.first + t) * 3 + v]
                  : (bf.first + t) * 3 + v
                const dstIdx = t * 3 + v
                positions[dstIdx * 3]     = srcPos.array[srcVert * 3]
                positions[dstIdx * 3 + 1] = srcPos.array[srcVert * 3 + 1]
                positions[dstIdx * 3 + 2] = srcPos.array[srcVert * 3 + 2]
                if (normals) {
                  normals[dstIdx * 3]     = srcNormal.array[srcVert * 3]
                  normals[dstIdx * 3 + 1] = srcNormal.array[srcVert * 3 + 1]
                  normals[dstIdx * 3 + 2] = srcNormal.array[srcVert * 3 + 2]
                }
              }
            }

            const faceGeo = new THREE.BufferGeometry()
            faceGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
            if (normals) faceGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))

            const hlMesh = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
              color: 0x44aaff, transparent: true, opacity: 0.35,
              side: THREE.DoubleSide, depthTest: true,
              polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
            }))
            hlMesh.matrix.copy(meshObj.matrixWorld)
            hlMesh.matrixAutoUpdate = false
            hlMesh.renderOrder = 50
            grp.add(hlMesh)
          }
        }

        // 面法線マーカー（円 + 矢印）
        const n = hit.normal.clone().normalize()
        const offset = n.clone().multiplyScalar(worldPx * 2)
        const origin = hit.point.clone().add(offset)
        const r = worldPx * 10
        const tmp = Math.abs(n.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        const axis1 = new THREE.Vector3().crossVectors(tmp, n).normalize()
        const axis2 = new THREE.Vector3().crossVectors(n, axis1).normalize()

        const circPts = []
        for (let i = 0; i <= 24; i++) {
          const a = (i / 24) * Math.PI * 2
          circPts.push(origin.clone().addScaledVector(axis1, Math.cos(a) * r).addScaledVector(axis2, Math.sin(a) * r))
        }
        grp.add(mkLine(circPts))

        const arrowTip = origin.clone().addScaledVector(n, r * 1.2)
        grp.add(mkLine([origin.clone(), arrowTip]))
        const aw = r * 0.35
        const ah = r * 0.45
        const arBase = arrowTip.clone().addScaledVector(n, -ah)
        grp.add(mkLine([
          arBase.clone().addScaledVector(axis1, aw), arrowTip, arBase.clone().addScaledVector(axis1, -aw),
        ]))

      } else if (hit.type === 'edge' && hit.rawHit) {
        const rawHit = hit.rawHit
        const posArr = rawHit.object.geometry.attributes.position.array
        const idx = rawHit.index ?? 0
        const ep0 = new THREE.Vector3(posArr[idx * 3], posArr[idx * 3 + 1], posArr[idx * 3 + 2])
          .applyMatrix4(rawHit.object.matrixWorld)
        const ep1 = new THREE.Vector3(posArr[(idx + 1) * 3], posArr[(idx + 1) * 3 + 1], posArr[(idx + 1) * 3 + 2])
          .applyMatrix4(rawHit.object.matrixWorld)

        // ハイライトエッジライン
        grp.add(mkLine([ep0, ep1]))

        // ヒット点に X クロスヘア（カメラ平面向き、約 8px）
        const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
        const camUp    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
        const s = worldPx * 8
        const c = hit.point
        grp.add(mkLine([
          c.clone().addScaledVector(camRight,  s).addScaledVector(camUp,  s),
          c.clone().addScaledVector(camRight, -s).addScaledVector(camUp, -s),
        ]))
        grp.add(mkLine([
          c.clone().addScaledVector(camRight,  s).addScaledVector(camUp, -s),
          c.clone().addScaledVector(camRight, -s).addScaledVector(camUp,  s),
        ]))

      } else if (hit.type === 'vertex') {
        // 頂点 — カメラ平面向きのダイヤモンド形（オレンジ、約 8px）
        const camRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
        const camUp    = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
        const s = worldPx * 8
        const c = hit.point
        const dPts = [
          c.clone().addScaledVector(camUp,     s),
          c.clone().addScaledVector(camRight,  s),
          c.clone().addScaledVector(camUp,    -s),
          c.clone().addScaledVector(camRight, -s),
          c.clone().addScaledVector(camUp,     s),
        ]
        grp.add(mkLine(dPts, 0xff8800))
        grp.add(mkLine([
          c.clone().addScaledVector(camRight,  s * 0.5),
          c.clone().addScaledVector(camRight, -s * 0.5),
        ], 0xff8800))
        grp.add(mkLine([
          c.clone().addScaledVector(camUp,  s * 0.5),
          c.clone().addScaledVector(camUp, -s * 0.5),
        ], 0xff8800))
      }

      scene.add(grp)
      hoverHighlightRef.current = grp
    }

    function clearRubberBand() {
      if (!rubberBandRef.current) return
      scene.remove(rubberBandRef.current)
      rubberBandRef.current.geometry.dispose()
      rubberBandRef.current.material.dispose()
      rubberBandRef.current = null
    }

    function updateRubberBand(p1, p2) {
      if (!rubberBandRef.current) {
        const arr = new Float32Array(6)
        const geo = new THREE.BufferGeometry()
        geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
        const line = new THREE.Line(
          geo,
          new THREE.LineBasicMaterial({ color: 0xff6600, opacity: 0.55, transparent: true, depthTest: false }),
        )
        line.renderOrder = 98
        scene.add(line)
        rubberBandRef.current = line
      }
      const arr = rubberBandRef.current.geometry.attributes.position.array
      arr[0] = p1.x; arr[1] = p1.y; arr[2] = p1.z
      arr[3] = p2.x; arr[4] = p2.y; arr[5] = p2.z
      rubberBandRef.current.geometry.attributes.position.needsUpdate = true
    }

    function onHoverMove(e) {
      if (modeRef.current !== 'measure' || dragDimRef.current) {
        clearHoverHighlight()
        return
      }
      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const hit = getHitElement(mouse, camera, container)
      updateHoverHighlight(hit)
      // 1点目選択済みならゴムバンド線を更新
      const sel1 = measureSel1Ref.current
      if (sel1 && hit) {
        updateRubberBand(sel1.point, hit.point)
      } else {
        clearRubberBand()
      }
    }

    // onMouseDown を先に登録することで onRotateDown が dragDimRef を確認できる
    renderer.domElement.addEventListener('mousedown', onMouseDown)
    renderer.domElement.addEventListener('mousedown', onRotateDown)   // 独自回転: ピボット確定
    renderer.domElement.addEventListener('mousemove', onHoverMove)    // ホバーハイライト
    document.addEventListener('mousemove', onRotateMove)               // ドキュメント全体: 範囲外ドラッグ対応
    document.addEventListener('mouseup', onRotateUp)
    document.addEventListener('mousemove', onDimDragMove)
    document.addEventListener('mouseup', onDimDragEnd)
    renderer.domElement.addEventListener('mouseup', onMouseUp)
    renderer.domElement.addEventListener('wheel', onWheelZoom, { capture: true, passive: false })

    // --- STEP モデルロード（occt-import-js をスクリプトタグで動的ロード）---
    // Vite の ESM/WASM モジュール処理を完全に回避するため script タグで読み込む
    async function loadOcct() {
      if (window.occtimportjs) return window.occtimportjs
      return new Promise((resolve, reject) => {
        const s = document.createElement('script')
        s.src = '/occt-import-js.js'
        s.onload = () => resolve(window.occtimportjs)
        s.onerror = reject
        document.head.appendChild(s)
      })
    }

    async function run() {
      try {
        setStatus('loading')
        // 前回の解析結果・コメントをクリア
        brepFacesMapRef.current.clear()
        clearHoleAnnotations()
        clearAllComments()
        setHoleInfo(null)
        setShowHolePanel(false)

        const initOcct = await loadOcct()
        const occt = await initOcct({
          locateFile: (name) => `/${name}`,
        })

        if (cancelled) return

        const buffer = await file.arrayBuffer()
        const result = occt.ReadStepFile(new Uint8Array(buffer), null)

        if (!result.success) {
          throw new Error('STEP ファイルの解析に失敗しました')
        }

        // CAD 的な白系マテリアル（デフォルト）
        const material = new THREE.MeshPhongMaterial({
          color: colors?.model ?? 0xf5f5f5,
          shininess: 25,
          specular: 0x444444,
          side: THREE.DoubleSide,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        })

        const group       = new THREE.Group()
        const edgeGroup   = new THREE.Group()  // 鋭角エッジ（黒系）
        const ridgeGroup  = new THREE.Group()  // 緩い稜線（グレー系）
        const hlBaseGroup = new THREE.Group()  // 陰線消去用
        const meshes = []
        const geoList = []  // エッジ検出用にまとめる

        for (const mesh of result.meshes) {
          const geo = new THREE.BufferGeometry()

          geo.setAttribute('position',
            new THREE.BufferAttribute(new Float32Array(mesh.attributes.position.array), 3))

          if (mesh.attributes.normal) {
            geo.setAttribute('normal',
              new THREE.BufferAttribute(new Float32Array(mesh.attributes.normal.array), 3))
          }

          if (mesh.index) {
            geo.setIndex(new THREE.BufferAttribute(new Uint32Array(mesh.index.array), 1))
          }

          if (!mesh.attributes.normal) {
            geo.computeVertexNormals()
          }

          // シェード面（白系に統一）
          const m = new THREE.Mesh(geo, material)
          solidMatRef.current = material
          group.add(m)
          meshes.push(m)

          // B-rep面情報を保存（面ハイライト用）
          if (mesh.brep_faces && mesh.brep_faces.length > 0) {
            brepFacesMapRef.current.set(m, mesh.brep_faces)
          }

          // 陰線消去用ベースメッシュ
          hlBaseGroup.add(new THREE.Mesh(
            geo,
            new THREE.MeshBasicMaterial({
              color: colors?.background ?? '#f0f0f0',
              side: THREE.DoubleSide,
              polygonOffset: true,
              polygonOffsetFactor: 2,
              polygonOffsetUnits: 2,
            }),
          ))

          geoList.push(geo)
        }

        // エッジ検出:
        // - 異なるCAD面(mesh)をまたぐエッジ → 角度に関係なく常に表示（タンジェント接続も含む）
        // - 同一mesh内エッジ → 角度閾値で判定
        const edgeMat  = new THREE.LineBasicMaterial({ color: 0x111111, depthTest: true })
        const ridgeMat = new THREE.LineBasicMaterial({ color: 0x888888, depthTest: true })
        edgeMatRef.current  = edgeMat
        ridgeMatRef.current = ridgeMat

        if (geoList.length > 0) {
          // グループ付きでマージ → 頂点統合
          const merged = mergeGeometries(geoList, true)  // useGroups=true でメッシュ境界を保持
          const welded = mergeVertices(merged, 1e-4)
          welded.computeVertexNormals()

          const idxArr  = welded.index.array
          const posArr  = welded.attributes.position.array
          const groups  = welded.groups
          const triTotal = idxArr.length / 3

          // 各三角形がどのCAD面(mesh)に属するか記録
          const triToMesh = new Int32Array(triTotal)
          for (let g = 0; g < groups.length; g++) {
            const tStart = groups[g].start / 3
            const tCount = groups[g].count  / 3
            for (let t = 0; t < tCount; t++) triToMesh[tStart + t] = g
          }

          // 辺ごとに隣接する三角形を収集
          const edgeMap = new Map()
          for (let t = 0; t < triTotal; t++) {
            const a = idxArr[t * 3], b = idxArr[t * 3 + 1], c = idxArr[t * 3 + 2]
            for (const [u, v] of [[a, b], [b, c], [c, a]]) {
              const key = u < v ? `${u},${v}` : `${v},${u}`
              const rec = edgeMap.get(key)
              if (!rec) edgeMap.set(key, [t, -1])
              else rec[1] = t
            }
          }

          // 三角形の面法線を計算
          const _va = new THREE.Vector3(), _vb = new THREE.Vector3(), _vc = new THREE.Vector3()
          const _na = new THREE.Vector3(), _nb = new THREE.Vector3()
          function triNormal(ti, tgt) {
            const a = idxArr[ti*3], b = idxArr[ti*3+1], c = idxArr[ti*3+2]
            _va.fromArray(posArr, a*3)
            _vb.fromArray(posArr, b*3).sub(_va)
            _vc.fromArray(posArr, c*3).sub(_va)
            tgt.crossVectors(_vb, _vc).normalize()
          }

          const THRESH_SHARP = Math.cos(THREE.MathUtils.degToRad(40))
          const THRESH_RIDGE = Math.cos(THREE.MathUtils.degToRad(15))

          const sharpPts = [], ridgePts = []

          for (const [key, [t1, t2]] of edgeMap) {
            const [us, vs] = key.split(',')
            const u = +us, v = +vs
            const p0 = [posArr[u*3], posArr[u*3+1], posArr[u*3+2]]
            const p1 = [posArr[v*3], posArr[v*3+1], posArr[v*3+2]]

            if (t2 === -1) {
              // 境界辺（片面のみ）→ 常に稜線として表示
              ridgePts.push(...p0, ...p1)
              continue
            }

            const m1 = triToMesh[t1], m2 = triToMesh[t2]
            if (m1 !== m2) {
              // 異なるCAD面をまたぐ辺 → 角度に関係なく表示
              triNormal(t1, _na); triNormal(t2, _nb)
              const dot = _na.dot(_nb)
              if (dot < THRESH_SHARP) sharpPts.push(...p0, ...p1)
              else                    ridgePts.push(...p0, ...p1)
            } else {
              // 同一mesh内：角度で判定
              triNormal(t1, _na); triNormal(t2, _nb)
              const dot = _na.dot(_nb)
              if (dot < THRESH_SHARP)      sharpPts.push(...p0, ...p1)
              else if (dot < THRESH_RIDGE) ridgePts.push(...p0, ...p1)
            }
          }

          // LineSegments を生成
          function makeLines(pts, mat) {
            if (!pts.length) return null
            const geo = new THREE.BufferGeometry()
            geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pts), 3))
            return new THREE.LineSegments(geo, mat)
          }
          const sharpLines = makeLines(sharpPts, edgeMat)
          const ridgeLines = makeLines(ridgePts, ridgeMat)
          if (sharpLines) edgeGroup.add(sharpLines)
          if (ridgeLines) ridgeGroup.add(ridgeLines)

          // --- シルエット用データ構築 ---
          // 辺ごとに隣接2面の法線を保存（両面を持つ辺のみ対象）
          const silEdgeList = []
          for (const [key, [t1, t2]] of edgeMap) {
            if (t2 === -1) continue  // 境界辺はスキップ
            const [us, vs] = key.split(',')
            const u = +us, v = +vs
            triNormal(t1, _na); triNormal(t2, _nb)
            silEdgeList.push(
              posArr[u*3], posArr[u*3+1], posArr[u*3+2],
              posArr[v*3], posArr[v*3+1], posArr[v*3+2],
              _na.x, _na.y, _na.z,
              _nb.x, _nb.y, _nb.z,
            )
          }
          silEdgeDataRef.current = new Float32Array(silEdgeList)

          // プリアロケーション済みジオメトリ（最大辺数 × 2頂点）
          const silGeo = new THREE.BufferGeometry()
          const silPos = new Float32Array(silEdgeList.length / 2)  // 辺数 × 6 floats
          silGeo.setAttribute('position', new THREE.BufferAttribute(silPos, 3))
          silGeo.setDrawRange(0, 0)
          silGeoRef.current = silGeo

          const silMat = new THREE.LineBasicMaterial({ color: 0x888888, depthTest: true })
          silMatRef.current = silMat
          const silGroup = new THREE.Group()
          silGroup.add(new THREE.LineSegments(silGeo, silMat))
          silGroup.visible = false
          silhouetteGroupRef.current = silGroup

          merged.dispose()
          welded.dispose()
        }

        edgeGroup.visible   = false
        ridgeGroup.visible  = false
        hlBaseGroup.visible = false

        const silGroup = silhouetteGroupRef.current

        scene.add(group)
        scene.add(hlBaseGroup)
        scene.add(ridgeGroup)
        scene.add(edgeGroup)
        if (silGroup) scene.add(silGroup)
        meshesRef.current      = meshes
        solidGroupRef.current  = group
        edgeGroupRef.current   = edgeGroup
        ridgeGroupRef.current  = ridgeGroup
        hlBaseGroupRef.current = hlBaseGroup

        // カメラをモデルに合わせる（等角投影）
        const box = new THREE.Box3().setFromObject(group)
        const center = box.getCenter(new THREE.Vector3())
        const size = box.getSize(new THREE.Vector3()).length()
        modelSizeRef.current = size

        // 等角投影の視野をモデルサイズに合わせて設定
        const aspect = container.clientWidth / container.clientHeight
        const fh = size * 0.65
        camera.userData.frustumHalf = fh
        camera.left   = -fh * aspect
        camera.right  =  fh * aspect
        camera.top    =  fh
        camera.bottom = -fh
        camera.near   = -size * 10
        camera.far    =  size * 10
        camera.updateProjectionMatrix()

        // 等角投影方向 (1, 1, 1) からモデルを見る
        const d = size * 1.5
        camera.position.set(center.x + d, center.y + d, center.z + d)
        camera.lookAt(center)
        controls.target.copy(center)
        // _panCamera は (mouseNorm * scale * _eye.length * panSpeed) をパン量とする
        // scale = (right-left)/zoom/clientWidth, mouseNorm = pixelDelta/clientWidth
        // 1:1 にするには: panSpeed = clientWidth / _eye.length()
        controls.panSpeed = container.clientWidth / (size * 1.5 * Math.sqrt(3))
        controls.update()

        applyDisplayMode(displayModeRef.current)
        setStatus('ok')

        // 穴・円筒面の自動解析
        const cylResult = analyzeCylinders()
        if (cylResult.length > 0) {
          createHoleAnnotations(cylResult)
          setHoleInfo(cylResult)
        }
      } catch (e) {
        if (!cancelled) { setStatus('error'); setErrorMsg(e.message || String(e)) }
      }
    }

    run()

    return () => {
      cancelled = true
      ro.disconnect()
      cancelAnimationFrame(animId)
      renderer.domElement.removeEventListener('contextmenu', onContextMenu)
      renderer.domElement.removeEventListener('mousedown', onPanDown)
      document.removeEventListener('mousemove', onPanMove)
      document.removeEventListener('mouseup', onPanUp)
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      renderer.domElement.removeEventListener('mousedown', onRotateDown)
      renderer.domElement.removeEventListener('mousemove', onHoverMove)
      document.removeEventListener('mousemove', onRotateMove)
      document.removeEventListener('mouseup', onRotateUp)
      document.removeEventListener('mousemove', onDimDragMove)
      document.removeEventListener('mouseup', onDimDragEnd)
      renderer.domElement.removeEventListener('mouseup', onMouseUp)
      renderer.domElement.removeEventListener('wheel', onWheelZoom, true)
      // ホバー・ゴムバンドの破棄
      if (hoverHighlightRef.current) {
        scene.remove(hoverHighlightRef.current)
        hoverHighlightRef.current.traverse(child => {
          if (child.geometry && !child._sharedGeo) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
            else child.material.dispose()
          }
        })
        hoverHighlightRef.current = null
      }
      if (rubberBandRef.current) {
        scene.remove(rubberBandRef.current)
        rubberBandRef.current.geometry.dispose()
        rubberBandRef.current.material.dispose()
        rubberBandRef.current = null
      }
      // 配置済み寸法オブジェクトの破棄
      const dimObjects = dimObjectsRef.current
      dimObjects.forEach(obj => {
        scene.remove(obj.group)
        scene.remove(obj.labelObj)
        obj.group.traverse(child => {
          if (child.geometry) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
            else child.material.dispose()
          }
        })
      })
      dimObjects.clear()
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentNode === container) container.removeChild(renderer.domElement)
      if (labelRenderer.domElement.parentNode === container) container.removeChild(labelRenderer.domElement)
      rendererRef.current = null
      labelRendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      meshesRef.current = []
    }
  }, [file])

  // --- 寸法測定: ヒット検出（面 or エッジ）---
  function getHitElement(mouse, camera, container) {
    const H = container.clientHeight
    // OrthographicCamera: 1px あたりのワールド単位 = (top - bottom) / (zoom * H)
    const worldPx = (camera.top - camera.bottom) / (camera.zoom * H)
    const edgeThreshold = 15 * worldPx  // 15px 相当
    const vertexThreshold = 14 * worldPx // 頂点スナップ閾値

    const rc = new THREE.Raycaster()
    rc.params.Line = { threshold: edgeThreshold }
    rc.setFromCamera(mouse, camera)

    // エッジを優先（鋭角エッジ + 稜線）
    const edgeTargets = [
      ...(edgeGroupRef.current?.children ?? []),
      ...(ridgeGroupRef.current?.children ?? []),
    ]
    if (edgeTargets.length) {
      const hits = rc.intersectObjects(edgeTargets, false)
      if (hits.length) {
        const rawHit = hits[0]
        const posArr = rawHit.object.geometry.attributes.position.array
        const idx = rawHit.index ?? 0
        const vA = new THREE.Vector3(posArr[idx * 3], posArr[idx * 3 + 1], posArr[idx * 3 + 2])
          .applyMatrix4(rawHit.object.matrixWorld)
        const vB = new THREE.Vector3(posArr[(idx + 1) * 3], posArr[(idx + 1) * 3 + 1], posArr[(idx + 1) * 3 + 2])
          .applyMatrix4(rawHit.object.matrixWorld)
        // 背面の面法線を取得（寸法移動方向の決定用）
        const faceHits = rc.intersectObjects(meshesRef.current, false)
        const faceNormal = faceHits.length
          ? faceHits[0].face.normal.clone().transformDirection(faceHits[0].object.matrixWorld).normalize()
          : null
        // 端点に近ければ頂点ヒットとして返す
        const dA = rawHit.point.distanceTo(vA)
        const dB = rawHit.point.distanceTo(vB)
        if (dA < vertexThreshold || dB < vertexThreshold) {
          const vertexPos = dA <= dB ? vA : vB
          return { type: 'vertex', point: vertexPos, normal: null, faceNormal, object: rawHit.object, rawHit }
        }
        return { type: 'edge', point: rawHit.point.clone(), normal: null, faceNormal, object: rawHit.object, rawHit }
      }
    }

    // 面ヒット（法線・オブジェクト・生ヒット付き）
    const faceHits = rc.intersectObjects(meshesRef.current, false)
    if (faceHits.length) {
      const hit = faceHits[0]
      const worldNormal = hit.face.normal.clone()
        .transformDirection(hit.object.matrixWorld)
        .normalize()
      return { type: 'face', point: hit.point.clone(), normal: worldNormal, object: hit.object, rawHit: hit }
    }

    return null
  }

  // --- 円筒面解析（穴径検出）---
  function analyzeCylinders() {
    const cylinders = []

    for (const [meshObj, brepFaces] of brepFacesMapRef.current) {
      const geo = meshObj.geometry
      const posAttr = geo.attributes.position
      const normAttr = geo.attributes.normal
      const indexAttr = geo.index
      if (!posAttr || !normAttr) continue

      for (const face of brepFaces) {
        const triCount = face.last - face.first + 1
        if (triCount < 4) continue

        // この面の頂点・法線を収集（重複排除）
        const vertMap = new Map()
        for (let t = face.first; t <= face.last; t++) {
          for (let v = 0; v < 3; v++) {
            const idx = indexAttr ? indexAttr.getX(t * 3 + v) : t * 3 + v
            if (vertMap.has(idx)) continue
            vertMap.set(idx, {
              pos: new THREE.Vector3(posAttr.getX(idx), posAttr.getY(idx), posAttr.getZ(idx)),
              norm: new THREE.Vector3(normAttr.getX(idx), normAttr.getY(idx), normAttr.getZ(idx)).normalize(),
            })
          }
        }

        const verts = Array.from(vertMap.values())
        if (verts.length < 8) continue

        // 平面チェック: 法線のばらつきが小さい面はスキップ
        const n0 = verts[0].norm
        let maxAngle = 0
        for (const v of verts) {
          const dot = Math.min(1, Math.abs(v.norm.dot(n0)))
          const angle = Math.acos(dot)
          if (angle > maxAngle) maxAngle = angle
        }
        if (maxAngle < 0.08) continue // ほぼ平面（< ~5°）

        // 円筒軸を推定: 法線ペアの外積から軸方向候補を収集
        const axisCandidates = []
        const step = Math.max(1, Math.floor(verts.length / 15))
        for (let i = 0; i < verts.length && axisCandidates.length < 12; i += step) {
          for (let j = i + step; j < verts.length && axisCandidates.length < 12; j += step) {
            const cross = new THREE.Vector3().crossVectors(verts[i].norm, verts[j].norm)
            if (cross.length() < 0.05) continue
            cross.normalize()
            if (axisCandidates.length > 0 && cross.dot(axisCandidates[0]) < 0) cross.negate()
            axisCandidates.push(cross)
          }
        }
        if (axisCandidates.length < 3) continue

        // 軸候補を平均
        const axis = new THREE.Vector3()
        for (const c of axisCandidates) axis.add(c)
        axis.normalize()

        // 軸候補の一貫性チェック
        let axisConsistent = true
        for (const c of axisCandidates) {
          if (Math.abs(c.dot(axis)) < 0.92) { axisConsistent = false; break }
        }
        if (!axisConsistent) continue

        // 全法線が軸に垂直であることを確認
        let normalsPerpendicular = true
        for (const v of verts) {
          if (Math.abs(v.norm.dot(axis)) > 0.25) { normalsPerpendicular = false; break }
        }
        if (!normalsPerpendicular) continue

        // 頂点を軸に垂直な平面に投影 → 半径を計算
        // まず重心を計算
        const centroid = new THREE.Vector3()
        for (const v of verts) centroid.add(v.pos)
        centroid.divideScalar(verts.length)

        // 法線方向から円の中心を推定: 各頂点から法線の逆方向に進んだ先が中心
        // 2点の法線の交差から中心を求める（2D投影上）
        const axisX = new THREE.Vector3()
        const axisY = new THREE.Vector3()
        // 軸に垂直な2D座標系を構築
        const tmpUp = Math.abs(axis.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
        axisX.crossVectors(axis, tmpUp).normalize()
        axisY.crossVectors(axis, axisX).normalize()

        // 各頂点の2D投影と法線の2D投影
        const pts2d = verts.map(v => {
          const rel = v.pos.clone().sub(centroid)
          return {
            x: rel.dot(axisX), y: rel.dot(axisY),
            nx: v.norm.dot(axisX), ny: v.norm.dot(axisY),
          }
        })

        // 2点の法線線分の交差で円中心を推定（複数ペアの平均）
        let cx = 0, cy = 0, centerCount = 0
        const pairStep = Math.max(1, Math.floor(pts2d.length / 10))
        for (let i = 0; i < pts2d.length; i += pairStep) {
          for (let j = i + pairStep; j < pts2d.length; j += pairStep) {
            const a = pts2d[i], b = pts2d[j]
            // 法線線: a.pos + t * a.norm = b.pos + s * b.norm
            const det = a.nx * b.ny - a.ny * b.nx
            if (Math.abs(det) < 0.01) continue
            const t = ((b.x - a.x) * b.ny - (b.y - a.y) * b.nx) / det
            cx += a.x + t * a.nx
            cy += a.y + t * a.ny
            centerCount++
          }
        }
        if (centerCount < 2) continue
        cx /= centerCount
        cy /= centerCount

        // 各頂点から中心までの距離 → 半径
        const radii = pts2d.map(p => Math.hypot(p.x - cx, p.y - cy))
        const meanR = radii.reduce((s, r) => s + r, 0) / radii.length
        if (meanR < 0.01) continue

        // 半径のばらつきチェック（標準偏差 / 平均 < 5%）
        const variance = radii.reduce((s, r) => s + (r - meanR) ** 2, 0) / radii.length
        const stdDev = Math.sqrt(variance)
        if (stdDev / meanR > 0.05) continue

        // 360° カバー判定: 部分円筒（フィレット・面取り等）を除外
        const angles = pts2d.map(p => Math.atan2(p.y - cy, p.x - cx))
        angles.sort((a, b) => a - b)
        // 隣接角度の最大ギャップを算出 → 360° - maxGap = カバー角度
        let maxGap = 0
        for (let i = 1; i < angles.length; i++) {
          maxGap = Math.max(maxGap, angles[i] - angles[i - 1])
        }
        // 最初と最後の間のギャップ（2π を跨ぐ）
        maxGap = Math.max(maxGap, (angles[0] + 2 * Math.PI) - angles[angles.length - 1])
        const coverAngle = 2 * Math.PI - maxGap
        if (coverAngle < Math.PI * 1.9) continue // ~342° 未満は部分円筒として除外

        // 凹凸判定: 法線が中心に向かう → 穴、外向き → 外側円筒
        let inwardCount = 0
        for (const p of pts2d) {
          const toCenterX = cx - p.x, toCenterY = cy - p.y
          if (toCenterX * p.nx + toCenterY * p.ny > 0) inwardCount++
        }
        const isHole = inwardCount > pts2d.length * 0.5

        // 軸方向の高さ & 中間高さの代表頂点を選出
        let minH = Infinity, maxH = -Infinity
        for (const v of verts) {
          const h = v.pos.clone().sub(centroid).dot(axis)
          if (h < minH) minH = h
          if (h > maxH) maxH = h
        }
        const midH = (minH + maxH) / 2
        let bestVert = verts[0], bestDist = Infinity
        for (const v of verts) {
          const d = Math.abs(v.pos.clone().sub(centroid).dot(axis) - midH)
          if (d < bestDist) { bestDist = d; bestVert = v }
        }

        cylinders.push({
          diameter: meanR * 2,
          isHole,
          height: maxH - minH,
          anchorLocal: bestVert.pos.clone(),
          normalLocal: bestVert.norm.clone(),
          brepFace: { first: face.first, last: face.last },
          meshObj,
        })
      }
    }

    // 径で丸め（0.01mm 単位）してグルーピング
    const grouped = new Map()
    for (const c of cylinders) {
      const dRound = Math.round(c.diameter * 100) / 100
      const key = `${dRound}_${c.isHole ? 'hole' : 'cyl'}`
      if (!grouped.has(key)) {
        grouped.set(key, { diameter: dRound, isHole: c.isHole, count: 0, instances: [] })
      }
      const g = grouped.get(key)
      g.count++
      g.instances.push({
        anchorLocal: c.anchorLocal, normalLocal: c.normalLocal,
        brepFace: c.brepFace, meshObj: c.meshObj,
      })
    }

    // 径でソート
    const result = Array.from(grouped.values()).sort((a, b) => a.diameter - b.diameter)
    return result
  }

  // --- 穴・円筒アノテーション カラーパレット ---
  const HOLE_PALETTE = [
    { hex: 0xe08030, css: 'rgba(224,128,48,0.92)' },
    { hex: 0x3080e0, css: 'rgba(48,128,224,0.92)' },
    { hex: 0x40b060, css: 'rgba(64,176,96,0.92)' },
    { hex: 0xc050a0, css: 'rgba(192,80,160,0.92)' },
    { hex: 0xb0a030, css: 'rgba(176,160,48,0.92)' },
    { hex: 0x40b0b0, css: 'rgba(64,176,176,0.92)' },
  ]

  // --- 穴・円筒アノテーション作成 ---
  function createHoleAnnotations(holeData) {
    clearHoleAnnotations()
    const scene = sceneRef.current
    if (!scene) return
    const groupPos = solidGroupRef.current ? solidGroupRef.current.position : new THREE.Vector3()
    // 径グループごとに記号を割り当て（H1=全φ2.53, H2=全φ3.50, ...）
    let holeIdx = 1, cylIdx = 1
    for (let gi = 0; gi < holeData.length; gi++) {
      const group = holeData[gi]
      const symbol = group.isHole ? `H${holeIdx++}` : `C${cylIdx++}`
      group.symbol = symbol
      const palette = HOLE_PALETTE[gi % HOLE_PALETTE.length]

      for (let ii = 0; ii < group.instances.length; ii++) {
        const inst = group.instances[ii]
        const annotId = `${symbol}_${ii}`

        // ローカル座標 → ワールド座標
        const anchor = inst.anchorLocal.clone().add(groupPos)
        const dir = inst.normalLocal.clone()
        if (group.isHole) dir.negate()
        dir.normalize()
        const leaderLen = Math.min(group.diameter * 3, modelSizeRef.current * 0.15)
        const labelPos = anchor.clone().addScaledVector(dir, leaderLen)

        // CSS2D ラベル（pointerEvents: 'auto' でドラッグ確実化）
        const div = document.createElement('div')
        div._holeAnnotId = annotId
        div.textContent = `${symbol} φ${group.diameter.toFixed(2)}`
        Object.assign(div.style, {
          background: palette.css, color: '#fff',
          padding: '3px 10px', borderRadius: '4px',
          fontSize: '13px', fontWeight: 'normal', whiteSpace: 'nowrap',
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'grab', userSelect: 'none', pointerEvents: 'auto',
          transition: 'background 120ms, box-shadow 120ms',
        })
        div.addEventListener('mouseenter', () => { div.style.boxShadow = '0 0 0 2px rgba(255,255,255,0.6)' })
        div.addEventListener('mouseleave', () => { div.style.boxShadow = 'none' })
        // ラベル直接の mousedown でドラッグ開始（CSS2DRenderer の pointerEvents:none を回避）
        div.addEventListener('mousedown', (e) => {
          if (e.button !== 0) {
            // 右クリック等はパンのために下のcanvasへイベントを転送
            renderer.domElement.dispatchEvent(new MouseEvent('mousedown', e))
            return
          }
          e.stopPropagation()
          const labelObj = holeAnnotationsRef.current.get(annotId)?.labelObj
          if (labelObj) {
            dragDimRef.current = { type: 'holeAnnot', id: annotId, labelObj, lastX: e.clientX, lastY: e.clientY }
          }
        })
        const labelObj = new CSS2DObject(div)
        labelObj.position.copy(labelPos)
        labelObj.visible = false

        // 引き出し線
        const lnArr = new Float32Array([anchor.x, anchor.y, anchor.z, labelPos.x, labelPos.y, labelPos.z])
        const lnGeo = new THREE.BufferGeometry()
        lnGeo.setAttribute('position', new THREE.BufferAttribute(lnArr, 3))
        const leader = new THREE.Line(lnGeo, new THREE.LineBasicMaterial({
          color: palette.hex, depthTest: false, transparent: true, opacity: 0.7,
        }))
        leader.renderOrder = 99
        leader.visible = false

        // アンカーマーカー（線ベース矢印 — 4本の線で全方向から視認可能）
        const arrow = makeLineArrow(anchor, labelPos, palette.hex, modelSizeRef.current)
        arrow.visible = false

        // 面カラーオーバーレイ（brep_face の三角形を抽出して着色）
        let overlay = null
        if (inst.brepFace && inst.meshObj) {
          const bf = inst.brepFace
          const srcGeo = inst.meshObj.geometry
          const idxAttr = srcGeo.index
          const posAttr = srcGeo.attributes.position
          const normAttr = srcGeo.attributes.normal
          const triCount = bf.last - bf.first + 1
          const vertCount = triCount * 3
          const positions = new Float32Array(vertCount * 3)
          const normals = normAttr ? new Float32Array(vertCount * 3) : null
          for (let t = 0; t < triCount; t++) {
            for (let v = 0; v < 3; v++) {
              const srcIdx = idxAttr ? idxAttr.getX((bf.first + t) * 3 + v) : (bf.first + t) * 3 + v
              const dst = (t * 3 + v) * 3
              positions[dst]     = posAttr.getX(srcIdx)
              positions[dst + 1] = posAttr.getY(srcIdx)
              positions[dst + 2] = posAttr.getZ(srcIdx)
              if (normals) {
                normals[dst]     = normAttr.getX(srcIdx)
                normals[dst + 1] = normAttr.getY(srcIdx)
                normals[dst + 2] = normAttr.getZ(srcIdx)
              }
            }
          }
          const faceGeo = new THREE.BufferGeometry()
          faceGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
          if (normals) faceGeo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
          overlay = new THREE.Mesh(faceGeo, new THREE.MeshBasicMaterial({
            color: palette.hex, transparent: true, opacity: 0.35,
            side: THREE.DoubleSide, depthTest: true,
            polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
          }))
          overlay.matrix.copy(inst.meshObj.matrixWorld)
          overlay.matrixAutoUpdate = false
          overlay.renderOrder = 50
          overlay.visible = false
          scene.add(overlay)
        }

        scene.add(labelObj)
        scene.add(leader)
        scene.add(arrow)

        holeAnnotationsRef.current.set(annotId, { labelObj, leader, arrow, overlay, anchor: anchor.clone() })
      }
    }
  }

  // --- 穴・円筒アノテーション削除 ---
  function clearHoleAnnotations() {
    const scene = sceneRef.current
    if (!scene) return
    for (const [, obj] of holeAnnotationsRef.current) {
      scene.remove(obj.labelObj)
      scene.remove(obj.leader)
      scene.remove(obj.arrow)
      obj.leader.geometry.dispose()
      obj.leader.material.dispose()
      obj.arrow.geometry.dispose()
      obj.arrow.material.dispose()
      if (obj.overlay) {
        scene.remove(obj.overlay)
        obj.overlay.geometry.dispose()
        obj.overlay.material.dispose()
      }
    }
    holeAnnotationsRef.current.clear()
  }

  // --- 穴アノテーション表示切替 ---
  function setHoleAnnotationsVisible(visible) {
    for (const [, obj] of holeAnnotationsRef.current) {
      obj.labelObj.visible = visible
      obj.leader.visible = visible
      obj.arrow.visible = visible
      if (obj.overlay) obj.overlay.visible = visible
    }
  }

  // --- 2選択から計測値を算出 ---
  function computeMeasurement(sel1, sel2) {
    // 面法線を収集（寸法移動方向の決定に使用）
    const faceNormal = sel1.type === 'face' ? sel1.normal.clone()
                     : sel2.type === 'face' ? sel2.normal.clone()
                     : sel1.faceNormal ? sel1.faceNormal.clone()
                     : sel2.faceNormal ? sel2.faceNormal.clone()
                     : null
    if (sel1.type === 'face') {
      // 面法線方向への投影距離
      const n    = sel1.normal
      const diff = sel2.point.clone().sub(sel1.point)
      const proj = diff.dot(n)
      const p1   = sel1.point.clone()
      const p2   = sel1.point.clone().addScaledVector(n, proj)
      return { p1, p2, pA: sel1.point.clone(), pB: sel2.point.clone(), distance: Math.abs(proj), type: 'normal', faceNormal }
    }
    // エッジ/エッジ or エッジ/面 → 直線距離
    const p1 = sel1.point.clone()
    const p2 = sel2.point.clone()
    return { p1, p2, pA: p1.clone(), pB: p2.clone(), distance: p1.distanceTo(p2), type: 'linear', faceNormal }
  }

  // --- 寸法オブジェクトをシーンに追加 ---
  function createDimension(id, meas, scene) {
    const { p1, p2, pA, pB, distance } = meas
    const markerR = modelSizeRef.current * 0.008
    const COLOR   = 0xff6600

    // 寸法線方向
    const lineDirNorm = p2.clone().sub(p1).normalize()

    // 引き出し方向の候補を X/Y/Z 軸から2つ選択（dimDir に垂直度が高い順）
    const axes = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, 0, 1),
    ]
    const sorted = axes
      .map((a, i) => ({ axis: a, dot: Math.abs(lineDirNorm.dot(a)), i }))
      .sort((a, b) => a.dot - b.dot)
    // perpCandidates[0] = 最も垂直, perpCandidates[1] = 次に垂直
    const perpCandidates = [sorted[0].axis.clone(), sorted[1].axis.clone()]
    const perpDir = perpCandidates[0]

    // 第3方向（寸法平面の法線）= dimDir × perpDir（デフォルト perpDir で投影）
    const thirdDir = new THREE.Vector3().crossVectors(lineDirNorm, perpDir).normalize()

    // pA, pB を寸法平面に投影（平面は pA を通り、法線は thirdDir）
    const pA_proj = pA.clone()
    const pB_offPlane = pB.clone().sub(pA).dot(thirdDir)
    const pB_proj = pB.clone().addScaledVector(thirdDir, -pB_offPlane)

    // 寸法線グループ（矢印・寸法線本体 — ドラッグ時にグループごと移動）
    const group = new THREE.Group()

    const arrowH = markerR * 2.0
    const arrowR = markerR * 0.62
    const yAxis = new THREE.Vector3(0, 1, 0)

    // 矢印コーンにクリック判定用の拡大ヒットエリアを追加
    const cones = []
    function addArrow(tipPos, pointDir) {
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(arrowR, arrowH, 10),
        new THREE.MeshBasicMaterial({ color: COLOR, depthTest: false }),
      )
      cone.renderOrder = 101
      cone.position.copy(tipPos).addScaledVector(pointDir, -arrowH / 2)
      if (Math.abs(pointDir.dot(yAxis)) < 0.9999) {
        cone.quaternion.setFromUnitVectors(yAxis, pointDir)
      } else if (pointDir.y < 0) {
        cone.rotation.x = Math.PI
      }
      cone._dimId = id
      // クリックしやすいように透明な拡大ヒットエリアを追加
      const hitArea = new THREE.Mesh(
        new THREE.SphereGeometry(arrowH * 2.5, 8, 8),
        new THREE.MeshBasicMaterial({ visible: false }),
      )
      hitArea._dimId = id
      hitArea.position.copy(cone.position)
      group.add(cone)
      group.add(hitArea)
      cones.push(cone, hitArea)
    }

    // 投影後の寸法線方向
    const projDimVec = pB_proj.clone().sub(pA_proj)
    const projDist = projDimVec.length()
    const projDimDir = projDist > 0.0001 ? projDimVec.normalize() : lineDirNorm.clone()

    addArrow(pA_proj, projDimDir.clone())
    addArrow(pB_proj, projDimDir.clone().negate())

    // 寸法線本体（矢印の基部間）
    if (projDist > arrowH * 2.5) {
      const ls = pA_proj.clone().addScaledVector(projDimDir, arrowH)
      const le = pB_proj.clone().addScaledVector(projDimDir, -arrowH)
      const ln = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([ls, le]),
        new THREE.LineBasicMaterial({ color: COLOR, depthTest: false }),
      )
      ln.renderOrder = 100
      group.add(ln)
    }

    // CSS2D ラベル（寸法線の中点に配置）
    const mid = pA_proj.clone().add(pB_proj).multiplyScalar(0.5)
    const div = document.createElement('div')
    div._dimId = id
    div.textContent = `${distance.toFixed(2)} mm`
    Object.assign(div.style, {
      background: 'rgba(255,102,0,0.92)', color: '#fff',
      padding: '3px 10px', borderRadius: '4px',
      fontSize: '13px', fontWeight: 'normal',
      whiteSpace: 'nowrap', fontFamily: 'monospace',
      cursor: 'grab', userSelect: 'none', pointerEvents: 'auto',
      transition: 'background 120ms, box-shadow 120ms',
    })
    div.addEventListener('mouseenter', () => {
      div.style.background = 'rgba(220,80,0,0.97)'
      div.style.boxShadow = '0 0 0 2px rgba(255,153,68,0.7)'
    })
    div.addEventListener('mouseleave', () => {
      const sel = selectedDimIdRef.current
      const myId = div._dimId
      div.style.background = sel === myId ? 'rgba(200,70,0,0.97)' : 'rgba(255,102,0,0.92)'
      div.style.boxShadow = sel === myId ? '0 0 0 2px #ff9944' : 'none'
    })
    const labelObj = new CSS2DObject(div)
    labelObj.position.copy(mid)
    // ラベル直接 mousedown → ラベルのみ移動ドラッグ開始
    div.addEventListener('mousedown', (e) => {
      if (e.button !== 0) {
        // 右クリック等はパンのために下のcanvasへイベントを転送
        renderer.domElement.dispatchEvent(new MouseEvent('mousedown', e))
        return
      }
      e.stopPropagation()
      dragDimRef.current = { type: 'dimLabel', id, labelObj, lastX: e.clientX, lastY: e.clientY }
      selectedDimIdRef.current = id
      setSelectedDimId(id)
    })

    // 共通の線マテリアル
    const extMat = new THREE.LineBasicMaterial({ color: COLOR, opacity: 0.55, transparent: true, depthTest: false })
    function makeExtLine(from, to) {
      const arr = new Float32Array([from.x, from.y, from.z, to.x, to.y, to.z])
      const geo = new THREE.BufferGeometry()
      geo.setAttribute('position', new THREE.BufferAttribute(arr, 3))
      const ln = new THREE.Line(geo, extMat.clone())
      ln.renderOrder = 99
      return ln
    }

    // 引き出し線（投影点 → 寸法線端点 — ドラッグ時に動的更新、初期は長さ0）
    const ext1 = makeExtLine(pA_proj, pA_proj)
    const ext2 = makeExtLine(pB_proj, pB_proj)

    // サポート線（実ピックポイント → 投影点、平面外の場合のみ表示）
    const sup1 = makeExtLine(pA, pA_proj)
    const sup2 = makeExtLine(pB, pB_proj)
    const eps = modelSizeRef.current * 0.001
    sup1.visible = pA.distanceTo(pA_proj) > eps
    sup2.visible = pB.distanceTo(pB_proj) > eps

    // リーダー線（ラベルが寸法線中点から離れたときに表示）
    const leader = makeExtLine(mid, mid)
    leader.visible = false

    scene.add(group)
    scene.add(labelObj)
    scene.add(ext1)
    scene.add(ext2)
    scene.add(sup1)
    scene.add(sup2)
    scene.add(leader)

    dimObjectsRef.current.set(id, {
      group, labelObj, cones,            // cones: レイキャスト用の矢印メッシュ配列
      p1: pA_proj.clone(), p2: pB_proj.clone(), // 現在の寸法線端点位置（ドラッグで更新）
      pA: pA.clone(), pB: pB.clone(),            // 実ピックポイント（固定）
      pA_proj: pA_proj.clone(), pB_proj: pB_proj.clone(), // 平面投影点（固定、引き出し線の起点）
      ext1, ext2,                       // 引き出し線（投影点 → 寸法線端点）
      sup1, sup2,                       // サポート線（実ピックポイント → 投影点）
      leader,                           // リーダー線（ラベル⇔寸法線中点）
      dimDir: projDimDir.clone(),       // 寸法線方向（投影後）
      perpCandidates,                   // 引き出し方向の候補2軸（X/Y/Z軸）
      offset: new THREE.Vector3(),      // 垂直オフセット（累積）
    })
    setDimensions(prev => [...prev, { id, distance }])
  }

  // --- 寸法削除 ---
  function deleteDimension(id) {
    const scene = sceneRef.current
    if (!scene) return
    const obj = dimObjectsRef.current.get(id)
    if (!obj) return

    scene.remove(obj.group)
    scene.remove(obj.labelObj)
    const disposeLine = (ln) => { if (ln) { scene.remove(ln); ln.geometry.dispose(); ln.material.dispose() } }
    disposeLine(obj.ext1)
    disposeLine(obj.ext2)
    disposeLine(obj.sup1)
    disposeLine(obj.sup2)
    disposeLine(obj.leader)
    obj.group.traverse(child => {
      if (child.geometry) child.geometry.dispose()
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
        else child.material.dispose()
      }
    })

    dimObjectsRef.current.delete(id)
    setDimensions(prev => prev.filter(d => d.id !== id))
    if (selectedDimIdRef.current === id) {
      selectedDimIdRef.current = null
      setSelectedDimId(null)
    }
  }

  // --- 寸法測定クリックハンドラ（onMouseUp から呼ぶ）---
  function handleMeasureClick(mouse, scene, camera, container) {
    const hit = getHitElement(mouse, camera, container)
    if (!hit) return

    const sel1 = measureSel1Ref.current
    if (!sel1) {
      // 1点目: 記憶 + 現在のホバーハイライトを sel1Highlight として維持
      measureSel1Ref.current = hit
      setMeasureSel1(hit)
      // ホバーハイライトを sel1Highlight に移管（dispose せず維持）
      if (hoverHighlightRef.current) {
        sel1HighlightRef.current = hoverHighlightRef.current
        hoverHighlightRef.current = null
      }
    } else {
      // 2点目: 寸法を確定・配置
      const meas = computeMeasurement(sel1, hit)
      createDimension(`dim_${Date.now()}`, meas, scene)

      // ゴムバンド・ホバーハイライト・sel1ハイライトをクリア
      const clearObj = (ref) => {
        if (!ref.current) return
        scene.remove(ref.current)
        ref.current.traverse(child => {
          if (child.geometry && !child._sharedGeo) child.geometry.dispose()
          if (child.material) {
            if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
            else child.material.dispose()
          }
        })
        ref.current = null
      }
      if (rubberBandRef.current) {
        scene.remove(rubberBandRef.current)
        rubberBandRef.current.geometry.dispose()
        rubberBandRef.current.material.dispose()
        rubberBandRef.current = null
      }
      clearObj(hoverHighlightRef)
      clearObj(sel1HighlightRef)
      measureSel1Ref.current = null
      setMeasureSel1(null)
    }
  }

  // --- 線ベース矢印の作成・更新 ---
  function makeLineArrow(tip, from, color, modelSize) {
    // tip を先端として from 方向に開く 4 本線（どの視点からでも見える）
    const h = modelSize * 0.012
    const s = modelSize * 0.005
    const dir = tip.clone().sub(from).normalize()
    // dir に垂直な2軸を生成
    const tmp = Math.abs(dir.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(dir, tmp).normalize()
    const v = new THREE.Vector3().crossVectors(dir, u).normalize()
    const back = dir.clone().negate()
    const pts = [
      tip, tip.clone().addScaledVector(back, h).addScaledVector(u, s),
      tip, tip.clone().addScaledVector(back, h).addScaledVector(u, -s),
      tip, tip.clone().addScaledVector(back, h).addScaledVector(v, s),
      tip, tip.clone().addScaledVector(back, h).addScaledVector(v, -s),
    ]
    const geo = new THREE.BufferGeometry().setFromPoints(pts)
    const arrow = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({
      color, depthTest: false,
    }))
    arrow.renderOrder = 100
    return arrow
  }

  function updateLineArrow(arrow, tip, from, modelSize) {
    const h = modelSize * 0.012
    const s = modelSize * 0.005
    const dir = tip.clone().sub(from).normalize()
    const tmp = Math.abs(dir.x) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    const u = new THREE.Vector3().crossVectors(dir, tmp).normalize()
    const v = new THREE.Vector3().crossVectors(dir, u).normalize()
    const back = dir.clone().negate()
    const positions = arrow.geometry.attributes.position.array
    const wings = [
      tip.clone().addScaledVector(back, h).addScaledVector(u, s),
      tip.clone().addScaledVector(back, h).addScaledVector(u, -s),
      tip.clone().addScaledVector(back, h).addScaledVector(v, s),
      tip.clone().addScaledVector(back, h).addScaledVector(v, -s),
    ]
    for (let i = 0; i < 4; i++) {
      const base = i * 6
      positions[base]     = tip.x; positions[base + 1] = tip.y; positions[base + 2] = tip.z
      positions[base + 3] = wings[i].x; positions[base + 4] = wings[i].y; positions[base + 5] = wings[i].z
    }
    arrow.geometry.attributes.position.needsUpdate = true
  }

  // --- コメント全削除 ---
  function clearAllComments() {
    const scene = sceneRef.current
    if (!scene) return
    for (const [, obj] of commentObjectsRef.current) {
      scene.remove(obj.labelObj)
      scene.remove(obj.leader)
      scene.remove(obj.arrow)
      obj.leader.geometry.dispose()
      obj.leader.material.dispose()
      obj.arrow.geometry.dispose()
      obj.arrow.material.dispose()
    }
    commentObjectsRef.current.clear()
  }

  // --- コメント追加（引き出し線 + ドラッグ移動対応）---
  function submitComment(worldPos, text) {
    if (!text.trim() || !sceneRef.current) return
    const scene = sceneRef.current
    const commentId = `cmt_${Date.now()}`
    const COLOR = 0x3b82f6
    const offsetDist = modelSizeRef.current * 0.1
    const anchor = worldPos.clone()

    // ラベル位置（アンカーから少しオフセット）
    const cam = cameraRef.current
    const camUp = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1).normalize()
    const labelPos = anchor.clone().addScaledVector(camUp, offsetDist)

    // CSS2D ラベル
    const div = document.createElement('div')
    div._commentId = commentId
    div.textContent = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    Object.assign(div.style, {
      background: 'rgba(15,23,42,0.95)', color: '#e2e8f0',
      border: '1px solid rgba(59,130,246,0.5)',
      padding: '3px 10px', borderRadius: '5px',
      fontSize: '13px', fontWeight: 'normal',
      maxWidth: '180px', wordBreak: 'break-word',
      fontFamily: "'Noto Sans JP', sans-serif",
      cursor: 'grab', userSelect: 'none', pointerEvents: 'auto',
      transition: 'box-shadow 120ms',
    })
    div.addEventListener('mouseenter', () => {
      if (!div._editing) div.style.boxShadow = '0 0 0 2px rgba(59,130,246,0.5)'
    })
    div.addEventListener('mouseleave', () => {
      if (!div._editing) div.style.boxShadow = 'none'
    })
    const labelObj = new CSS2DObject(div)
    labelObj.position.copy(labelPos)
    // ラベル直接 mousedown でドラッグ開始（編集中はドラッグ無効）
    div.addEventListener('mousedown', (e) => {
      if (e.button !== 0) {
        // 右クリック等はパンのために下のcanvasへイベントを転送
        renderer.domElement.dispatchEvent(new MouseEvent('mousedown', e))
        return
      }
      if (div._editing) return
      e.stopPropagation()
      dragDimRef.current = { type: 'comment', id: commentId, labelObj, lastX: e.clientX, lastY: e.clientY }
    })
    // ダブルクリックでインライン編集
    div.addEventListener('dblclick', (e) => {
      e.stopPropagation()
      if (div._editing) return
      div._editing = true
      div.contentEditable = 'true'
      div.style.cursor = 'text'
      div.style.userSelect = 'text'
      div.style.outline = 'none'
      div.style.boxShadow = '0 0 0 2px #3b82f6'
      div.style.background = 'rgba(15,23,42,1)'
      div.focus()
      // テキスト全選択
      const range = document.createRange()
      range.selectNodeContents(div)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
    })
    // 編集確定（フォーカスアウト or Enter）
    function finishEdit() {
      if (!div._editing) return
      div._editing = false
      div.contentEditable = 'false'
      div.style.cursor = 'grab'
      div.style.userSelect = 'none'
      div.style.boxShadow = 'none'
      div.style.background = 'rgba(15,23,42,0.95)'
      // 空になったら削除
      if (!div.textContent.trim()) {
        const cObj = commentObjectsRef.current.get(commentId)
        if (cObj && sceneRef.current) {
          sceneRef.current.remove(cObj.labelObj)
          sceneRef.current.remove(cObj.leader)
          sceneRef.current.remove(cObj.arrow)
          cObj.leader.geometry.dispose()
          cObj.leader.material.dispose()
          cObj.arrow.geometry.dispose()
          cObj.arrow.material.dispose()
          commentObjectsRef.current.delete(commentId)
        }
      }
    }
    div.addEventListener('blur', finishEdit)
    div.addEventListener('keydown', (e) => {
      if (!div._editing) return
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); div.blur() }
      if (e.key === 'Escape') { div.blur() }
      e.stopPropagation() // キーイベントがビューアに伝搬しないようにする
    })

    // 引き出し線
    const lnArr = new Float32Array([anchor.x, anchor.y, anchor.z, labelPos.x, labelPos.y, labelPos.z])
    const lnGeo = new THREE.BufferGeometry()
    lnGeo.setAttribute('position', new THREE.BufferAttribute(lnArr, 3))
    const leader = new THREE.Line(lnGeo, new THREE.LineBasicMaterial({
      color: COLOR, depthTest: false, transparent: true, opacity: 0.6,
    }))
    leader.renderOrder = 99

    // アンカー矢印（線ベース）
    const arrow = makeLineArrow(anchor, labelPos, COLOR, modelSizeRef.current)

    scene.add(labelObj)
    scene.add(leader)
    scene.add(arrow)

    commentObjectsRef.current.set(commentId, { labelObj, leader, arrow, anchor: anchor.clone() })

    setCommentInput(null)
    setCommentText('')
  }

  // ViewCube: カメラ回転を CSS 3D キューブに同期
  useEffect(() => {
    let rafId
    function sync() {
      rafId = requestAnimationFrame(sync)
      const cam = cameraRef.current
      const el = viewCubeRef.current
      if (!cam || !el) return
      const e = cam.matrixWorldInverse.elements
      // CSS Y軸は下向き、Three.js Y軸は上向きのため Y成分を反転して水平回転方向を合わせる
      el.style.transform =
        `matrix3d(${e[0]},${-e[1]},${e[2]},0,${-e[4]},${e[5]},${-e[6]},0,${e[8]},${-e[9]},${e[10]},0,0,0,0,1)`
    }
    sync()
    return () => cancelAnimationFrame(rafId)
  }, [])

  // カメラの現在方向から相対的に90°回転
  // hStep: 水平回転(+1=画面右方向に回転, -1=左), vStep: 垂直回転(+1=上, -1=下)
  function rotateViewRelative(hStep, vStep) {
    const cam = cameraRef.current
    const ctrl = controlsRef.current
    if (!cam || !ctrl) return
    const dir = cam.position.clone().sub(ctrl.target).normalize()
    const up = cam.up.clone().normalize()
    const right = new THREE.Vector3().crossVectors(up, dir).normalize()
    let newDir = dir.clone()
    let newUp = up.clone()
    if (hStep !== 0) {
      newDir.applyAxisAngle(up, -hStep * Math.PI / 2)
    }
    if (vStep !== 0) {
      newDir.applyAxisAngle(right, vStep * Math.PI / 2)
      newUp.applyAxisAngle(right, vStep * Math.PI / 2)
    }
    // 浮動小数点誤差を除去（90°回転なので軸整列）
    const round = v => { v.x = Math.round(v.x); v.y = Math.round(v.y); v.z = Math.round(v.z); return v }
    round(newDir)
    round(newUp)
    if (newDir.lengthSq() === 0 || newUp.lengthSq() === 0) return
    snapToView(newDir.toArray(), newUp.toArray())
  }

  // 標準ビューへスナップ（350ms easeInOutQuad）＋モデルフィット
  function snapToView(dirArr, upArr) {
    const cam = cameraRef.current
    const ctrl = controlsRef.current
    const container = mountRef.current
    if (!cam || !ctrl || !solidGroupRef.current || !container) return

    const endDir = new THREE.Vector3(...dirArr).normalize()
    const endUp  = new THREE.Vector3(...upArr).normalize()

    // バウンディングボックスの中心を常にターゲット・ビューの中心にする
    const box    = new THREE.Box3().setFromObject(solidGroupRef.current)
    const center = box.getCenter(new THREE.Vector3())

    // カメラ距離はモデル対角線 × 余裕
    const ms = modelSizeRef.current > 0 ? modelSizeRef.current : box.getSize(new THREE.Vector3()).length()
    const d  = ms * 1.5
    const endPos = center.clone().addScaledVector(endDir, d)

    // エンドカメラ軸（lookAt で正確に算出）でコーナーを中心基準に投影 → frustumHalf 決定
    const lookMat  = new THREE.Matrix4().lookAt(endPos, center, endUp)
    const rightVec = new THREE.Vector3().setFromMatrixColumn(lookMat, 0)
    const upVec    = new THREE.Vector3().setFromMatrixColumn(lookMat, 1)
    const corners  = []
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          corners.push(new THREE.Vector3(x, y, z))
    let maxHX = 0, maxHY = 0
    for (const c of corners) {
      const rel = c.clone().sub(center)  // 中心基準
      maxHX = Math.max(maxHX, Math.abs(rel.dot(rightVec)))
      maxHY = Math.max(maxHY, Math.abs(rel.dot(upVec)))
    }
    const aspect   = container.clientWidth / container.clientHeight
    const endFrustum = Math.max(maxHX / aspect, maxHY) * 1.43  // 30% 小さく + 10% パディング

    const startPos     = cam.position.clone()
    const startUp      = cam.up.clone()
    const startTarget  = ctrl.target.clone()
    const startFrustum = cam.userData.frustumHalf / cam.zoom  // zoom 正規化

    // zoom を 1 にリセットして frustumHalf だけで制御
    const T = 350, t0 = performance.now()
    function frame(now) {
      const t = Math.min((now - t0) / T, 1)
      const e = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
      cam.position.lerpVectors(startPos, endPos, e)
      cam.up.lerpVectors(startUp, endUp, e).normalize()
      const lerpTarget = startTarget.clone().lerp(center, e)
      ctrl.target.copy(lerpTarget)
      cam.lookAt(lerpTarget)
      const fh = startFrustum + (endFrustum - startFrustum) * e
      cam.zoom = 1
      cam.userData.frustumHalf = fh
      const asp = container.clientWidth / container.clientHeight
      cam.left   = -fh * asp; cam.right  =  fh * asp
      cam.top    =  fh;        cam.bottom = -fh
      cam.updateProjectionMatrix()
      if (t < 1) requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  }

  // --- 穴アノテーション表示切替 ---
  useEffect(() => {
    setHoleAnnotationsVisible(showHolePanel)
  }, [showHolePanel])

  // --- 選択中の寸法ラベルをハイライト ---
  useEffect(() => {
    dimObjectsRef.current.forEach((obj, id) => {
      obj.labelObj.element.style.background =
        id === selectedDimId ? 'rgba(200,70,0,0.97)' : 'rgba(255,102,0,0.92)'
      obj.labelObj.element.style.boxShadow =
        id === selectedDimId ? '0 0 0 2px #ff9944' : 'none'
    })
  }, [selectedDimId])

  // --- キーボード操作: Delete/Backspace で寸法削除、ESC で1点目解除 ---
  useEffect(() => {
    function onKeyDown(e) {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDimIdRef.current) {
        e.preventDefault()
        deleteDimension(selectedDimIdRef.current)
      }
      if (e.key === 'Escape' && modeRef.current === 'measure' && measureSel1Ref.current) {
        e.preventDefault()
        measureSel1Ref.current = null
        setMeasureSel1(null)
        // sel1 ハイライト・ゴムバンドをクリア
        const scene = sceneRef.current
        if (scene) {
          const clearGrp = (ref) => {
            if (!ref.current) return
            scene.remove(ref.current)
            ref.current.traverse(child => {
              if (child.geometry && !child._sharedGeo) child.geometry.dispose()
              if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose())
                else child.material.dispose()
              }
            })
            ref.current = null
          }
          clearGrp(sel1HighlightRef)
          if (rubberBandRef.current) {
            scene.remove(rubberBandRef.current)
            rubberBandRef.current.geometry.dispose()
            rubberBandRef.current.material.dispose()
            rubberBandRef.current = null
          }
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const sel1TypeLabel = measureSel1?.type === 'face' ? '面' : measureSel1?.type === 'vertex' ? '頂点' : 'エッジ'
  const modeHint = mode === 'measure'
    ? (measureSel1
        ? `2点目を選択（${sel1TypeLabel}選択済み — ESC で解除）`
        : '面・エッジ・頂点をクリックして1点目を選択')
    : 'コメントを追加したい点をクリック'

  return (
    <div className="relative w-full h-full" style={{ minHeight: 0 }}>

      {/* ツールバー */}
      {status === 'ok' && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex gap-1" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
          {/* 操作モード */}
          {[
            { key: 'navigate', label: 'ナビゲート', activeStyle: { background: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db' } },
            { key: 'measure',  label: '寸法測定',   activeStyle: { background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d' } },
            { key: 'comment',  label: 'コメント',   activeStyle: { background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe' } },
          ].map(({ key, label, activeStyle }) => (
            <button
              key={key}
              title={label}
              onClick={() => setMode(key)}
              style={mode === key ? { ...activeStyle, borderRadius: 7, padding: '6px 8px', cursor: 'pointer', transition: 'all 180ms', display: 'flex', alignItems: 'center', justifyContent: 'center' } : { background: 'transparent', color: '#9ca3af', border: '1px solid transparent', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', transition: 'all 180ms', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { if (mode !== key) e.currentTarget.style.color = '#374151' }}
              onMouseLeave={e => { if (mode !== key) e.currentTarget.style.color = '#9ca3af' }}
            >
              {ICONS[key]}
            </button>
          ))}

          {/* セパレータ */}
          <span style={{ width: 1, background: '#e5e7eb', margin: '4px 2px', display: 'inline-block', alignSelf: 'stretch' }} />

          {/* 表示モード */}
          {[
            { key: 'shaded',       label: 'シェード' },
            { key: 'shaded-edges', label: '＋エッジ' },
            { key: 'hiddenline',   label: '陰線' },
            { key: 'wireframe',    label: 'ワイヤー' },
          ].map(({ key, label }) => (
            <button
              key={key}
              title={label}
              onClick={() => setDisplayMode(key)}
              style={displayMode === key
                ? { background: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', transition: 'all 180ms', display: 'flex', alignItems: 'center', justifyContent: 'center' }
                : { background: 'transparent', color: '#9ca3af', border: '1px solid transparent', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', transition: 'all 180ms', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              onMouseEnter={e => { if (displayMode !== key) e.currentTarget.style.color = '#374151' }}
              onMouseLeave={e => { if (displayMode !== key) e.currentTarget.style.color = '#9ca3af' }}
            >
              {ICONS[key]}
            </button>
          ))}

          {/* セパレータ + 穴情報ボタン */}
          {holeInfo && holeInfo.length > 0 && (
            <>
              <span style={{ width: 1, background: '#e5e7eb', margin: '4px 2px', display: 'inline-block', alignSelf: 'stretch' }} />
              <button
                title="穴・円筒面情報"
                onClick={() => setShowHolePanel(v => !v)}
                style={showHolePanel
                  ? { background: '#ecfdf5', color: '#065f46', border: '1px solid #6ee7b7', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', transition: 'all 180ms', display: 'flex', alignItems: 'center', justifyContent: 'center' }
                  : { background: 'transparent', color: '#9ca3af', border: '1px solid transparent', borderRadius: 7, padding: '6px 8px', cursor: 'pointer', transition: 'all 180ms', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseEnter={e => { if (!showHolePanel) e.currentTarget.style.color = '#374151' }}
                onMouseLeave={e => { if (!showHolePanel) e.currentTarget.style.color = '#9ca3af' }}
              >
                {ICONS.holeInfo}
              </button>
            </>
          )}
        </div>
      )}

      {/* 穴・円筒面情報パネル */}
      {showHolePanel && holeInfo && (
        <div className="absolute top-14 right-4" style={{ zIndex: 50, width: 260, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxHeight: 360, overflowY: 'auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.15em', color: '#6b7280', textTransform: 'uppercase' }}>穴・円筒面情報</span>
            <button onClick={() => setShowHolePanel(false)} style={{ background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ height: 1, background: '#e5e7eb', marginBottom: 8 }} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontFamily: "'Noto Sans JP', sans-serif" }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 500, fontSize: 11 }}>記号</th>
                <th style={{ textAlign: 'left', padding: '4px 6px', color: '#6b7280', fontWeight: 500, fontSize: 11 }}>種別</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 500, fontSize: 11 }}>径 (mm)</th>
                <th style={{ textAlign: 'right', padding: '4px 6px', color: '#6b7280', fontWeight: 500, fontSize: 11 }}>個数</th>
              </tr>
            </thead>
            <tbody>
              {holeInfo.map((item, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '4px 6px', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 600, color: item.isHole ? '#b45309' : '#4b5563' }}>
                    {item.symbol || '—'}
                  </td>
                  <td style={{ padding: '4px 6px', color: item.isHole ? '#b45309' : '#4b5563' }}>
                    {item.isHole ? '穴' : '円筒'}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#111827' }}>
                    φ{item.diameter.toFixed(2)}
                  </td>
                  <td style={{ padding: '4px 6px', textAlign: 'right', fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#111827', fontWeight: 600 }}>
                    {item.count}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ marginTop: 8, fontSize: 10, color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace", textAlign: 'center' }}>
            メッシュ解析による推定値
          </div>
        </div>
      )}

      {/* モードヒント */}
      {status === 'ok' && mode !== 'navigate' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none flex flex-col items-center gap-1">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.08em', padding: '4px 14px', borderRadius: 99, background: mode === 'measure' ? '#fef3c7' : '#eff6ff', color: mode === 'measure' ? '#92400e' : '#1d4ed8', border: `1px solid ${mode === 'measure' ? '#fcd34d' : '#bfdbfe'}` }}>
            {modeHint}
          </span>
          {mode === 'measure' && selectedDimId && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.06em', padding: '3px 12px', borderRadius: 99, background: 'rgba(200,70,0,0.12)', color: '#b84500', border: '1px solid rgba(200,70,0,0.3)' }}>
              寸法を選択中 — Delete / Backspace で削除
            </span>
          )}
        </div>
      )}

      {/* ステータス */}
      {status === 'loading' && (
        <div className="absolute inset-x-0 top-4 flex justify-center z-10 pointer-events-none">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.1em', color: '#6b7280', background: 'rgba(255,255,255,0.9)', border: '1px solid #e5e7eb', padding: '6px 18px', borderRadius: 99, boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} className="animate-pulse">
            LOADING...
          </span>
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-10 p-8">
          <p style={{ color: '#ef4444', fontWeight: 600, marginBottom: 8 }}>読み込みエラー</p>
          <p style={{ color: '#6b7280', fontSize: 12, textAlign: 'center', wordBreak: 'break-all', fontFamily: "'JetBrains Mono', monospace" }}>{errorMsg}</p>
        </div>
      )}

      {/* コメント入力ポップアップ */}
      {commentInput && (
        <div
          className="fixed z-50"
          style={{
            left: Math.min(commentInput.clientX, window.innerWidth - 250),
            top: Math.min(commentInput.clientY + 10, window.innerHeight - 150),
            width: 224,
            background: '#ffffff',
            border: '1px solid #e5e7eb',
            borderRadius: 10,
            padding: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
          }}
        >
          <textarea
            autoFocus
            value={commentText}
            onChange={e => setCommentText(e.target.value)}
            placeholder="コメントを入力..."
            style={{ width: '100%', background: '#f9fafb', color: '#111827', fontSize: 12, borderRadius: 6, padding: '8px 10px', resize: 'none', border: '1px solid #e5e7eb', outline: 'none', fontFamily: "'Noto Sans JP', sans-serif", boxSizing: 'border-box' }}
            rows={3}
            onFocus={e => { e.currentTarget.style.borderColor = '#93c5fd' }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb' }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submitComment(commentInput.worldPos, commentText)
              }
              if (e.key === 'Escape') { setCommentInput(null); setCommentText('') }
            }}
          />
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => submitComment(commentInput.worldPos, commentText)}
              disabled={!commentText.trim()}
              style={{ flex: 1, background: commentText.trim() ? '#eff6ff' : '#f9fafb', color: commentText.trim() ? '#1d4ed8' : '#9ca3af', border: `1px solid ${commentText.trim() ? '#bfdbfe' : '#e5e7eb'}`, fontSize: 11, fontWeight: 500, padding: '5px 0', borderRadius: 6, cursor: commentText.trim() ? 'pointer' : 'not-allowed', fontFamily: "'Noto Sans JP', sans-serif", transition: 'all 150ms' }}
            >
              追加
            </button>
            <button
              onClick={() => { setCommentInput(null); setCommentText('') }}
              style={{ padding: '5px 12px', background: '#f9fafb', color: '#6b7280', border: '1px solid #e5e7eb', fontSize: 11, borderRadius: 6, cursor: 'pointer', fontFamily: "'Noto Sans JP', sans-serif" }}
            >
              キャンセル
            </button>
          </div>
        </div>
      )}

      {/* ViewCube */}
      {status === 'ok' && (
        <div style={{ position:'absolute', bottom:16, right:16, zIndex:20, display:'flex', flexDirection:'column', alignItems:'center', gap:5, pointerEvents:'none' }}>

          {/* 矢印＋キューブ */}
          <div style={{ position:'relative', width:80, height:80, pointerEvents:'auto' }}>

            {/* 上矢印 */}
            <button title="上へ回転" onClick={() => rotateViewRelative(0, 1)}
              style={{ position:'absolute', top:0, left:'50%', transform:'translateX(-50%)', background:'none', border:'none', cursor:'pointer', padding:2, lineHeight:1 }}>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                <path d="M7 1L13 9H1L7 1Z" fill="#b0bac5" stroke="none"/>
              </svg>
            </button>
            {/* 下矢印 */}
            <button title="下へ回転" onClick={() => rotateViewRelative(0, -1)}
              style={{ position:'absolute', bottom:0, left:'50%', transform:'translateX(-50%)', background:'none', border:'none', cursor:'pointer', padding:2, lineHeight:1 }}>
              <svg width="14" height="10" viewBox="0 0 14 10" fill="none">
                <path d="M7 9L1 1H13L7 9Z" fill="#b0bac5" stroke="none"/>
              </svg>
            </button>
            {/* 左矢印 */}
            <button title="左へ回転" onClick={() => rotateViewRelative(-1, 0)}
              style={{ position:'absolute', top:'50%', left:0, transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:2, lineHeight:1 }}>
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                <path d="M1 7L9 1V13L1 7Z" fill="#b0bac5" stroke="none"/>
              </svg>
            </button>
            {/* 右矢印 */}
            <button title="右へ回転" onClick={() => rotateViewRelative(1, 0)}
              style={{ position:'absolute', top:'50%', right:0, transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', padding:2, lineHeight:1 }}>
              <svg width="10" height="14" viewBox="0 0 10 14" fill="none">
                <path d="M9 7L1 1V13L9 7Z" fill="#b0bac5" stroke="none"/>
              </svg>
            </button>

            {/* キューブ本体 */}
            <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:38, height:38, perspective:'400px' }}>
              <div ref={viewCubeRef} style={{ width:38, height:38, transformStyle:'preserve-3d', position:'relative' }}>
                {CUBE_FACES.map(({ key, label, cssTransform, dirArr, upArr }) => {
                  // 面ごとに微妙に色を変えて立体感を演出
                  const faceColor = {
                    top:    'linear-gradient(135deg,#e8edf4 0%,#d2dae6 100%)',
                    bottom: 'linear-gradient(135deg,#b8c3d4 0%,#a8b5c8 100%)',
                    front:  'linear-gradient(135deg,#dde4ef 0%,#c8d3e4 100%)',
                    back:   'linear-gradient(135deg,#c4cedd 0%,#b2becd 100%)',
                    right:  'linear-gradient(135deg,#d0d9e8 0%,#bcc8da 100%)',
                    left:   'linear-gradient(135deg,#cad3e2 0%,#b8c3d4 100%)',
                  }[key]
                  const hoverColor = 'linear-gradient(135deg,#b8d4f0 0%,#9bbde8 100%)'
                  return (
                    <div
                      key={key}
                      title={label}
                      onClick={() => snapToView(dirArr, upArr)}
                      style={{
                        position:'absolute', width:38, height:38,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:9, fontWeight:700, letterSpacing:'0.02em',
                        fontFamily:"'Noto Sans JP', sans-serif",
                        background: faceColor,
                        border:'1px solid rgba(90,110,135,0.28)',
                        boxShadow:'inset 0 1px 0 rgba(255,255,255,0.55), inset 0 -1px 0 rgba(0,0,0,0.08)',
                        color:'#3a4a5e',
                        cursor:'pointer', userSelect:'none',
                        transform: cssTransform,
                        backfaceVisibility:'hidden',
                        transition:'background 0.12s',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = hoverColor }}
                      onMouseLeave={e => { e.currentTarget.style.background = faceColor }}
                    >
                      {label}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* 等角ビューリセットボタン */}
          <button
            title="等角投影ビューにリセット"
            onClick={() => snapToView([1,1,1],[0,0,1])}
            style={{ pointerEvents:'auto', background:'rgba(255,255,255,0.92)', border:'1px solid #d1d5db', borderRadius:6, padding:'4px 8px', cursor:'pointer', boxShadow:'0 1px 3px rgba(0,0,0,0.09)', display:'flex', alignItems:'center', gap:4, color:'#6b7280' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='#9ca3af'; e.currentTarget.style.color='#111827' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='#d1d5db'; e.currentTarget.style.color='#6b7280' }}
          >
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
              <path d="M10 2a8 8 0 1 0 5.657 13.657" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              <path d="M15 10V6h-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span style={{ fontSize:10, fontWeight:500, fontFamily:"'JetBrains Mono', monospace", letterSpacing:'0.05em' }}>全体表示</span>
          </button>
        </div>
      )}

      {/* Three.js / CSS2D マウントポイント */}
      <div ref={mountRef} className="relative w-full h-full" style={{ minHeight: 0 }} />
    </div>
  )
}
