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

function App() {
  const [file, setFile] = useState(null)
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

  useEffect(() => {
    function onMessage(e) {
      const msg = e.data
      if (!msg || msg.type !== 'loadStep') return
      if (!(msg.buffer instanceof ArrayBuffer)) return
      const blob = new Blob([msg.buffer])
      const virtualFile = new File([blob], msg.name || 'model.stp')
      setFile(virtualFile)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  function handleFileDrop(e) {
    e.preventDefault()
    const f = e.dataTransfer?.files?.[0] || e.target.files?.[0]
    if (f) setFile(f)
  }

  const isStep = Boolean(file?.name?.toLowerCase().match(/\.(step|stp)$/))

  return (
    <div className="flex flex-col" style={{ height: '100%', background: '#f5f5f5', color: '#1a1a1a' }}>
      {/* Header */}
      <header style={{ background: '#ffffff', borderBottom: '1px solid #e5e7eb', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }} className="px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.18em', color: '#6b7280', textTransform: 'uppercase' }}>CAD</span>
          <span style={{ width: 1, height: 14, background: '#e5e7eb', display: 'inline-block' }} />
          <h1 style={{ fontFamily: "'Noto Sans JP', sans-serif", fontSize: 17, fontWeight: 600, color: '#111827', letterSpacing: '-0.01em' }}>STEP Viewer</h1>
        </div>
        {file && (
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#6b7280', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 6, padding: '2px 10px' }} className="truncate max-w-xs">
            {file.name}
          </span>
        )}
        {showFileOpen && (
          <div style={{ marginLeft: 'auto' }}>
            <input id="fileInput" type="file" className="hidden" accept=".step,.stp" onChange={handleFileDrop} />
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

      {/* Drop zone (ファイル未選択時のみ・fileOpen=false の場合は非表示) */}
      {!file && showFileOpen && (
        <div
          className="m-4 cursor-pointer transition-all"
          style={{ position: 'relative', border: '1px dashed #d1d5db', borderRadius: 10, padding: '28px 24px', textAlign: 'center', background: '#ffffff' }}
          onDragOver={(e) => { e.preventDefault(); e.currentTarget.style.borderColor = '#6b7280'; e.currentTarget.style.background = '#f9fafb' }}
          onDragLeave={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#ffffff' }}
          onDrop={(e) => { e.currentTarget.style.borderColor = '#d1d5db'; e.currentTarget.style.background = '#ffffff'; handleFileDrop(e) }}
          onClick={() => { document.getElementById('fileInput').value = ''; document.getElementById('fileInput').click() }}
        >
          {[['top:6px;left:6px', 'M0,12 L0,0 L12,0'], ['top:6px;right:6px', 'M0,0 L12,0 L12,12'], ['bottom:6px;left:6px', 'M0,0 L0,12 L12,12'], ['bottom:6px;right:6px', 'M12,0 L12,12 L0,12']].map(([pos, d], i) => (
            <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ position: 'absolute', ...Object.fromEntries(pos.split(';').map(s => s.split(':'))) }}>
              <path d={d} stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          ))}
          <p style={{ color: '#6b7280', fontSize: 15, fontWeight: 500 }}>STEP / STP ファイルをドロップ or クリックして選択</p>
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
        {file && isStep && <StepViewer file={file} colors={colors} lights={lights} />}
        {file && !isStep && (
          <div className="h-full flex items-center justify-center" style={{ color: '#ef4444', fontSize: 13 }}>
            STEP ファイルを選択してください（拡張子: .step / .stp）
          </div>
        )}
      </div>
    </div>
  )
}

export default App
