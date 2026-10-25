import { useEffect, useRef, useState } from 'react'

const buttonStyle = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #e5e7eb', borderRadius: 8, background: '#fff', color: '#6b7280', cursor: 'pointer', padding: 8 }
const panelStyle = { position: 'absolute', top: 44, right: 0, width: 'min(320px, calc(100vw - 64px))', border: '1px solid #e5e7eb', borderRadius: 10, background: '#fff', padding: 14, boxShadow: '0 4px 16px rgba(0,0,0,.1)', fontSize: 12, lineHeight: 1.65, color: '#4b5563' }

export default function ViewerNotices({ notice, cacheStatus, clearingCache, onClearCache, canAnalyze, onAnalyze }) {
  const [open, setOpen] = useState(false)
  const [dismissedMessage, setDismissedMessage] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!cacheStatus) return
    const timer = setTimeout(() => setDismissedMessage(cacheStatus), 4000)
    return () => clearTimeout(timer)
  }, [cacheStatus])

  useEffect(() => {
    if (!open) return
    const closeOutside = event => { if (!rootRef.current?.contains(event.target)) setOpen(false) }
    const closeEscape = event => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOutside)
    document.addEventListener('keydown', closeEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOutside)
      document.removeEventListener('keydown', closeEscape)
    }
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'absolute', top: 12, right: 12, zIndex: 30 }}>
      <button type="button" aria-label={notice ? 'モデル情報（注意あり）' : 'モデル情報'} title={notice ? 'モデル情報（注意あり）' : 'モデル情報'} aria-expanded={open} aria-controls="viewer-notices-panel" onClick={() => setOpen(value => !value)} style={{ ...buttonStyle, position: 'relative', boxShadow: '0 2px 8px rgba(0,0,0,.06)' }}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true"><circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" /><path d="M10 9v5M10 6v.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></svg>
        {notice && <span style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, borderRadius: '50%', background: '#d97706', border: '2px solid #fff' }} />}
      </button>
      {open && (
        <div id="viewer-notices-panel" role="region" aria-label="モデル情報" style={panelStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ color: '#374151' }}>モデル情報</strong>
            <button type="button" aria-label="モデル情報を閉じる" onClick={() => setOpen(false)} style={{ ...buttonStyle, border: 0, padding: '0 4px', fontSize: 18 }}>×</button>
          </div>
          {notice && <p style={{ margin: '0 0 10px', color: '#92400e' }}>{notice}</p>}
          {cacheStatus && <p style={{ margin: '0 0 10px' }}>{cacheStatus}</p>}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {canAnalyze && <button type="button" style={buttonStyle} onClick={() => { setOpen(false); onAnalyze() }}>穴・円筒面を解析</button>}
            {cacheStatus && <button type="button" style={buttonStyle} disabled={clearingCache} onClick={onClearCache}>{clearingCache ? '削除中…' : '保存データを削除'}</button>}
          </div>
        </div>
      )}
      {!open && cacheStatus && cacheStatus !== dismissedMessage && (
        <div role="status" style={{ ...panelStyle, display: 'flex', alignItems: 'flex-start', gap: 8, padding: '10px 12px' }}>
          <span style={{ flex: 1 }}>{cacheStatus}</span>
          <button type="button" aria-label="通知を閉じる" onClick={() => setDismissedMessage(cacheStatus)} style={{ ...buttonStyle, border: 0, padding: '0 2px', fontSize: 16 }}>×</button>
        </div>
      )}
    </div>
  )
}
