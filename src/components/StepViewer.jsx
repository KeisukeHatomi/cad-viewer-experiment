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

  // 寸法測定
  const [pendingPoint, setPendingPoint] = useState(null)
  const pendingPointRef = useRef(null)
  const pendingMarkerRef = useRef(null)

  // コメント入力ポップアップ
  const [commentInput, setCommentInput] = useState(null) // { clientX, clientY, worldPos }
  const [commentText, setCommentText] = useState('')

  // ドラッグ判定
  const mouseDownRef = useRef(null)

  // モード変更時: pending 状態のクリア
  useEffect(() => {
    modeRef.current = mode
    if (mode !== 'measure') {
      if (pendingMarkerRef.current && sceneRef.current) {
        sceneRef.current.remove(pendingMarkerRef.current)
        pendingMarkerRef.current.geometry.dispose()
        pendingMarkerRef.current.material.dispose()
        pendingMarkerRef.current = null
      }
      pendingPointRef.current = null
      setPendingPoint(null)
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
    pendingPointRef.current = null
    setPendingPoint(null)
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
      position: 'absolute', top: '0', left: '0', pointerEvents: 'none',
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
      if (modeRef.current !== 'navigate') return
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
      if (modeRef.current !== 'navigate') return
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

    function onPanDown(e) {
      if (e.button !== 2) return
      panLastX = e.clientX
      panLastY = e.clientY
    }

    function onPanMove(e) {
      if (!(e.buttons & 2)) return
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

    function onContextMenu(e) { e.preventDefault() }
    renderer.domElement.addEventListener('contextmenu', onContextMenu)
    renderer.domElement.addEventListener('mousedown', onPanDown)
    document.addEventListener('mousemove', onPanMove)

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

    // --- クリック vs ドラッグ判定 ---
    function onMouseDown(e) {
      mouseDownRef.current = { x: e.clientX, y: e.clientY }
    }

    function onMouseUp(e) {
      const down = mouseDownRef.current
      mouseDownRef.current = null
      if (!down) return
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return
      if (modeRef.current === 'navigate') return

      const rect = renderer.domElement.getBoundingClientRect()
      const mouse = new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1,
      )
      const rc = new THREE.Raycaster()
      rc.setFromCamera(mouse, camera)
      const hits = rc.intersectObjects(meshesRef.current, false)
      if (!hits.length) return

      const pt = hits[0].point.clone()

      if (modeRef.current === 'measure') {
        handleMeasureClick(pt, scene)
      } else if (modeRef.current === 'comment') {
        setCommentInput({ clientX: e.clientX, clientY: e.clientY, worldPos: pt })
        setCommentText('')
      }
    }

    renderer.domElement.addEventListener('mousedown', onRotateDown)   // 独自回転: ピボット確定
    document.addEventListener('mousemove', onRotateMove)               // ドキュメント全体: 範囲外ドラッグ対応
    document.addEventListener('mouseup', onRotateUp)
    renderer.domElement.addEventListener('mousedown', onMouseDown)
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
      renderer.domElement.removeEventListener('mousedown', onRotateDown)
      document.removeEventListener('mousemove', onRotateMove)
      document.removeEventListener('mouseup', onRotateUp)
      renderer.domElement.removeEventListener('mousedown', onMouseDown)
      renderer.domElement.removeEventListener('mouseup', onMouseUp)
      renderer.domElement.removeEventListener('wheel', onWheelZoom, true)
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

  // --- 寸法測定: 2点クリックで線とラベルを生成 ---
  function handleMeasureClick(pt, scene) {
    const markerR = modelSizeRef.current * 0.008

    if (!pendingPointRef.current) {
      pendingPointRef.current = pt
      setPendingPoint(pt)

      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(markerR, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xff6600 }),
      )
      marker.position.copy(pt)
      scene.add(marker)
      pendingMarkerRef.current = marker
    } else {
      const p1 = pendingPointRef.current
      const p2 = pt
      const dist = p1.distanceTo(p2)

      scene.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([p1, p2]),
        new THREE.LineBasicMaterial({ color: 0xff6600 }),
      ))

      const m2 = new THREE.Mesh(
        new THREE.SphereGeometry(markerR, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xff6600 }),
      )
      m2.position.copy(p2)
      scene.add(m2)

      const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5)
      const div = document.createElement('div')
      div.textContent = `${dist.toFixed(2)} mm`
      Object.assign(div.style, {
        background: 'rgba(255,102,0,0.92)', color: '#fff',
        padding: '2px 8px', borderRadius: '4px',
        fontSize: '11px', fontWeight: 'bold',
        whiteSpace: 'nowrap', fontFamily: 'monospace',
      })
      const label = new CSS2DObject(div)
      label.position.copy(mid)
      scene.add(label)

      pendingPointRef.current = null
      pendingMarkerRef.current = null
      setPendingPoint(null)
    }
  }

  // --- コメント追加 ---
  function submitComment(worldPos, text) {
    if (!text.trim() || !sceneRef.current) return

    const pin = document.createElement('div')
    pin.style.cssText = 'display:flex;align-items:flex-start;gap:5px;pointer-events:none;'
    pin.innerHTML = `
      <div style="width:8px;height:8px;border-radius:50%;background:#3b82f6;
        flex-shrink:0;margin-top:3px;box-shadow:0 0 0 2px rgba(59,130,246,0.35);"></div>
      <div style="background:rgba(15,23,42,0.95);border:1px solid rgba(59,130,246,0.5);
        color:#e2e8f0;padding:3px 8px;border-radius:5px;font-size:11px;
        max-width:160px;word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    `
    const labelObj = new CSS2DObject(pin)
    labelObj.position.copy(worldPos)
    sceneRef.current.add(labelObj)

    setCommentInput(null)
    setCommentText('')
  }

  const modeHint = mode === 'measure'
    ? (pendingPoint ? '2点目をクリックしてください' : '1点目をクリックしてください')
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
              onClick={() => setMode(key)}
              style={mode === key ? { ...activeStyle, borderRadius: 7, padding: '6px 16px', fontSize: 13, fontWeight: 500, fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer', transition: 'all 180ms' } : { background: 'transparent', color: '#9ca3af', border: '1px solid transparent', borderRadius: 7, padding: '6px 16px', fontSize: 13, fontWeight: 500, fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer', transition: 'all 180ms' }}
              onMouseEnter={e => { if (mode !== key) e.currentTarget.style.color = '#374151' }}
              onMouseLeave={e => { if (mode !== key) e.currentTarget.style.color = '#9ca3af' }}
            >
              {label}
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
              onClick={() => setDisplayMode(key)}
              style={displayMode === key
                ? { background: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db', borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer', transition: 'all 180ms' }
                : { background: 'transparent', color: '#9ca3af', border: '1px solid transparent', borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 500, fontFamily: "'Noto Sans JP', sans-serif", cursor: 'pointer', transition: 'all 180ms' }}
              onMouseEnter={e => { if (displayMode !== key) e.currentTarget.style.color = '#374151' }}
              onMouseLeave={e => { if (displayMode !== key) e.currentTarget.style.color = '#9ca3af' }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* モードヒント */}
      {status === 'ok' && mode !== 'navigate' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.08em', padding: '4px 14px', borderRadius: 99, background: mode === 'measure' ? '#fef3c7' : '#eff6ff', color: mode === 'measure' ? '#92400e' : '#1d4ed8', border: `1px solid ${mode === 'measure' ? '#fcd34d' : '#bfdbfe'}` }}>
            {modeHint}
          </span>
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

      {/* Three.js / CSS2D マウントポイント */}
      <div ref={mountRef} className="relative w-full h-full" style={{ minHeight: 0 }} />
    </div>
  )
}
