import { useState, useEffect } from 'react'
import StepViewer from './components/StepViewer'

const DEFAULT_COLORS = {
  background: '#f0f0f0',
  model:      '#d7d7d7',
  sharpEdge:  '#111111',
  ridge:      '#888888',
  silhouette: '#888888',
}

const DEFAULT_LIGHTS = {
  hem:  1.0,
  key:  2.0,
  fill: 1.0,
}

function SliderRow({ label, value, min, max, step, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13, color: '#6b7280', fontFamily: "'Noto Sans JP', sans-serif", flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9ca3af', width: 28, textAlign: 'right' }}>{value.toFixed(1)}</span>
        <input
          type="range"
          min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(parseFloat(e.target.value))}
          style={{ width: 80, cursor: 'pointer', accentColor: '#6b7280' }}
        />
      </div>
    </div>
  )
}

function ColorRow({ label, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <span style={{ fontSize: 13, color: '#6b7280', fontFamily: "'Noto Sans JP', sans-serif", flex: 1 }}>{label}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9ca3af' }}>{value.toUpperCase()}</span>
        <input
          type="color"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ width: 28, height: 22, border: '1px solid #d1d5db', borderRadius: 4, cursor: 'pointer', background: 'none', padding: 1 }}
        />
      </div>
    </div>
  )
}

// 解像度プリセット定義
const MESH_PRESETS = [
  {
    id: 'low',
    label: '低品質',
    sublabel: '読み込み優先',
    params: { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.005, angularDeflection: 1.0 },
  },
  {
    id: 'standard',
    label: '標準',
    sublabel: 'バランス（推奨）',
    params: null, // ライブラリデフォルト
  },
  {
    id: 'high',
    label: '高品質',
    sublabel: '曲面が滑らか',
    params: { linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.0003, angularDeflection: 0.2 },
  },
]

function MeshQualityDialog({ fileName, onConfirm, onCancel }) {
  const [selected, setSelected] = useState('standard')

  function handleConfirm() {
    const preset = MESH_PRESETS.find(p => p.id === selected)
    onConfirm(preset.params)
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#ffffff', borderRadius: 12, padding: '24px 28px', width: 320, boxShadow: '0 16px 48px rgba(0,0,0,0.18)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* タイトル */}
        <div>
          <p style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 15, fontWeight: 600, color: '#111827', margin: 0 }}>読み込み品質</p>
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9ca3af', margin: '4px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fileName}</p>
        </div>

        <div style={{ height: 1, background: '#e5e7eb' }} />

        {/* プリセット選択 */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MESH_PRESETS.map(preset => (
            <button
              key={preset.id}
              onClick={() => setSelected(preset.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '10px 14px', borderRadius: 8, cursor: 'pointer',
                border: selected === preset.id ? '1.5px solid #374151' : '1.5px solid #e5e7eb',
                background: selected === preset.id ? '#f9fafb' : '#ffffff',
                transition: 'all 120ms', textAlign: 'left',
              }}
            >
              <div style={{
                width: 14, height: 14, borderRadius: '50%', flexShrink: 0,
                border: selected === preset.id ? '4px solid #374151' : '1.5px solid #d1d5db',
                background: '#ffffff',
                transition: 'all 120ms',
              }} />
              <div>
                <p style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, fontWeight: 600, color: '#111827', margin: 0 }}>{preset.label}</p>
                <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#9ca3af', margin: '2px 0 0' }}>{preset.sublabel}</p>
              </div>
            </button>
          ))}
        </div>

        <div style={{ height: 1, background: '#e5e7eb' }} />

        {/* ボタン */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 7, padding: '7px 16px', cursor: 'pointer' }}
          >
            キャンセル
          </button>
          <button
            onClick={handleConfirm}
            style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 13, fontWeight: 500, color: '#ffffff', background: '#374151', border: 'none', borderRadius: 7, padding: '7px 20px', cursor: 'pointer' }}
          >
            読み込む
          </button>
        </div>
      </div>
    </div>
  )
}

function App() {
  const [file, setFile] = useState(null)
  const [meshParams, setMeshParams] = useState(null) // null = ライブラリデフォルト
  const [pendingFile, setPendingFile] = useState(null) // ダイアログ表示中の仮ファイル
  const [debugOpen, setDebugOpen] = useState(false)
  const [colors, setColors] = useState(DEFAULT_COLORS)
  const [lights, setLights] = useState(DEFAULT_LIGHTS)

  // ?fileOpen=false でファイルを開くボタン・ドロップゾーンを非表示
  const showFileOpen = new URLSearchParams(window.location.search).get('fileOpen') !== 'false'

  function setColor(key, val) {
    setColors(prev => ({ ...prev, [key]: val }))
  }

  function setLight(key, val) {
    setLights(prev => ({ ...prev, [key]: val }))
  }

  // Ctrl+Shift+D でデバッグパネル トグル
  useEffect(() => {
    function onKey(e) {
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        e.preventDefault()
        setDebugOpen(v => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // 親ウィンドウに「ビューア準備完了」を通知
  useEffect(() => {
    window.parent?.postMessage({ type: 'viewerReady' }, '*')
  }, [])

  useEffect(() => {
    function onMessage(e) {
      const msg = e.data
      if (!msg) return
      if (!(msg.buffer instanceof ArrayBuffer)) return
      if (msg.type === 'loadStep') {
        const blob = new Blob([msg.buffer])
        const virtualFile = new File([blob], msg.name || 'model.stp')
        // tessellation パラメータが含まれていれば保持する
        const { linearDeflectionType, linearDeflection, angularDeflection } = msg
        const params = (linearDeflectionType || linearDeflection != null || angularDeflection != null)
          ? { linearDeflectionType, linearDeflection, angularDeflection }
          : null
        setMeshParams(params)
        setFile(virtualFile)
      }
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  // ドラッグ＆ドロップ：解像度ダイアログなしで即読み込み
  function handleDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0]
    if (f) {
      setMeshParams(null)
      setFile(f)
    }
  }

  // ファイルピッカー：解像度ダイアログを表示してから読み込む
  function handlePickerChange(e) {
    const f = e.target.files?.[0]
    if (f) setPendingFile(f)
  }

  function handleDialogConfirm(params) {
    setMeshParams(params)
    setFile(pendingFile)
    setPendingFile(null)
  }

  function handleDialogCancel() {
    setPendingFile(null)
  }

  const isStep = Boolean(file?.name?.toLowerCase().match(/\.(step|stp)$/))

  return (
    <div className="flex flex-col" style={{ height: '100%', background: '#f5f5f5', color: '#1a1a1a' }}>
      {/* 解像度選択ダイアログ（ファイルピッカー経由のみ表示） */}
      {pendingFile && (
        <MeshQualityDialog
          fileName={pendingFile.name}
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        />
      )}
      {/* Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} className="px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <h1 style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 17, fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>BlueMark</h1>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.12em', color: '#9ca3af', textTransform: 'uppercase' }}>Beyond the Blueprint</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9ca3af', marginLeft: 6, border: '1px solid #d1d5db', borderRadius: 4, padding: '1px 6px' }}>v1.1</span>
        </div>
        {file && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 10px' }} className="truncate max-w-xs">
            {file.name}
          </span>
        )}
        {showFileOpen && (
          <div style={{ marginLeft: 'auto' }}>
            <input id="fileInput" type="file" className="hidden" accept=".step,.stp" onChange={handlePickerChange} />
            <button
              onClick={() => { document.getElementById('fileInput').value = ''; document.getElementById('fileInput').click() }}
              style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 14, fontWeight: 500, color: '#374151', background: '#ffffff', border: '1px solid #d1d5db', borderRadius: 7, padding: '6px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, transition: 'all 180ms' }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f9fafb'; e.currentTarget.style.borderColor = '#9ca3af' }}
              onMouseLeave={e => { e.currentTarget.style.background = '#ffffff'; e.currentTarget.style.borderColor = '#d1d5db' }}
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 9.5V12h2.5l7-7L8 2.5l-7 7Z"/>
                <path d="M10.5 1l2.5 2.5"/>
              </svg>
              ファイルを開く
            </button>
          </div>
        )}
      </header>

      {/* Drop zone (モデル表示中も次のファイルへ切り替え可能) */}
      {showFileOpen && (
        <div
          className="m-4 cursor-pointer transition-all"
          style={{ position: 'relative', border: '1px dashed #d1d5db', borderRadius: 10, padding: '28px 24px', textAlign: 'center', background: '#ffffff' }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.background = '#f9fafb' }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#ffffff' }}
          onDrop={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#ffffff'; handleDrop(e) }}
          onClick={() => { document.getElementById('fileInput').value = ''; document.getElementById('fileInput').click() }}
        >
          {[['top:6px;left:6px', 'M0,12 L0,0 L12,0'], ['top:6px;right:6px', 'M0,0 L12,0 L12,12'], ['bottom:6px;left:6px', 'M0,0 L0,12 L12,12'], ['bottom:6px;right:6px', 'M12,0 L12,12 L0,12']].map(([pos, d], i) => (
            <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', ...Object.fromEntries(pos.split(';').map(s => s.split(':'))) }}>
              <path d={d} stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ))}
          <p style={{ color: '#6b7280', fontSize: 15, fontWeight: 500 }}>
            {file ? '次のSTEP / STP ファイルをドロップ or クリックして選択' : 'STEP / STP ファイルをドロップ or クリックして選択'}
          </p>
          <p style={{ color: '#9ca3af', fontSize: 12, marginTop: 5, fontFamily: "'JetBrains Mono', monospace" }}>または親アプリから postMessage で受け取ります</p>
        </div>
      )}

      {/* Debug color panel (Ctrl+Shift+D) */}
      {debugOpen && (
        <div style={{ position: 'fixed', top: 60, right: 16, zIndex: 1000, width: 220, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 10, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#6b7280', textTransform: 'uppercase' }}>Debug — Colors</span>
            <button onClick={() => { setColors(DEFAULT_COLORS); setLights(DEFAULT_LIGHTS) }} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 4, padding: '2px 7px', cursor: 'pointer' }}>Reset</button>
          </div>
          <div style={{ height: 1, background: '#e5e7eb' }} />
          <ColorRow label="背景"       value={colors.background} onChange={v => setColor('background', v)} />
          <ColorRow label="モデル"     value={colors.model}      onChange={v => setColor('model', v)} />
          <ColorRow label="鋭角エッジ" value={colors.sharpEdge}  onChange={v => setColor('sharpEdge', v)} />
          <ColorRow label="稜線"       value={colors.ridge}      onChange={v => setColor('ridge', v)} />
          <ColorRow label="シルエット" value={colors.silhouette} onChange={v => setColor('silhouette', v)} />
          <div style={{ height: 1, background: '#e5e7eb' }} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: '0.18em', color: '#6b7280', textTransform: 'uppercase' }}>Lighting</span>
          <SliderRow label="環境光"       value={lights.hem}  min={0} max={4} step={0.1} onChange={v => setLight('hem', v)} />
          <SliderRow label="キーライト"   value={lights.key}  min={0} max={3} step={0.1} onChange={v => setLight('key', v)} />
          <SliderRow label="フィルライト" value={lights.fill} min={0} max={3} step={0.1} onChange={v => setLight('fill', v)} />
          <div style={{ height: 1, background: '#e5e7eb' }} />
          <p style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: '#9ca3af', textAlign: 'center', lineHeight: 1.6 }}>Ctrl+Shift+D で閉じる</p>
        </div>
      )}

      {/* Viewer */}
      <div className="flex-1 mx-4 mb-4 overflow-hidden" style={{ minHeight: 0, background: colors.background, borderRadius: 10, border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
        {!file && (
          <div className="h-full flex items-center justify-center" style={{ color: '#9ca3af', fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: '0.08em' }}>
            ファイルを選択してください
          </div>
        )}
        {file && isStep && <StepViewer file={file} meshParams={meshParams} colors={colors} lights={lights} />}
        {file && !isStep && (
          <div className="h-full flex items-center justify-center" style={{ color: '#ef4444', fontSize: 13 }}>
            対応フォーマット: .step / .stp
          </div>
        )}
      </div>
    </div>
  )
}

export default App
