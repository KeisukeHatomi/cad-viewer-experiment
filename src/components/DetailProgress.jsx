import ProgressPanel from './ProgressPanel'

export default function DetailProgress({ progress }) {
  const percent = progress.total > 0 ? Math.max(0, Math.min(100, Math.floor(100 * progress.completed / progress.total))) : null
  const label = progress.kind === 'edges' ? 'エッジ生成' : '穴・円筒面解析'
  return <div style={{ position: 'absolute', top: 62, left: '50%', transform: 'translateX(-50%)', zIndex: 40, width: 380, maxWidth: 'calc(100% - 24px)', pointerEvents: 'none' }}>
    <ProgressPanel compact steps={[{ label, state: 'active', percent }]} />
  </div>
}
