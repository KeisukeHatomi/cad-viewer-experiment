import ProgressPanel from './ProgressPanel'

const STAGES = [
  { label: '準備', phases: ['engine', 'reading', 'cache-check'] },
  { label: 'STEP 解析', phases: ['converting', 'reading-step'] },
  { label: '形状生成', phases: ['transferring'] },
  { label: 'メッシュ生成', phases: ['transferred', 'meshing', 'meshing-parts', 'meshing-faces'] },
  { label: 'データ変換', phases: ['meshed', 'exporting', 'cache-save'] },
  { label: '表示準備', phases: ['geometry'] },
  { label: '描画', phases: ['rendering'] },
]
export default function LoadingProgress({ progress, onCancel }) {
  const active = Math.max(0, STAGES.findIndex(stage => stage.phases.includes(progress.phase)))
  const measurable = progress.total > 0 && ['reading', 'geometry', 'meshing-parts', 'meshing-faces', 'exporting'].includes(progress.phase)
  const completed = progress.loaded ?? progress.completed ?? 0
  const steps = STAGES.map((stage, index) => {
    const skipped = progress.cacheHit && index >= 1 && index <= 4
    return {
      label: stage.label,
      state: skipped || index < active ? 'done' : index === active ? 'active' : 'waiting',
      percent: skipped || index < active ? 100 : index > active ? 0 : measurable ? Math.max(0, Math.min(100, Math.floor(100 * completed / progress.total))) : null,
      valueLabel: skipped ? '保存済み' : undefined,
    }
  })
  return <div style={{ position: 'absolute', inset: 0, zIndex: 30, display: 'flex', alignItems: 'flex-start', padding: '20px 16px', boxSizing: 'border-box', background: 'rgba(245,245,245,0.96)', overflowY: 'auto' }}>
    <div style={{ width: 440, maxWidth: '100%', margin: 'auto', flexShrink: 0 }}><ProgressPanel steps={steps} onCancel={onCancel} /></div>
  </div>
}
