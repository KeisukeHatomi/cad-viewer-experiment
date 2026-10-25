import './ProgressPanel.css'

export default function ProgressPanel({ steps, onCancel, compact = false }) {
  return <section className={`progress-panel${compact ? ' progress-panel--compact' : ''}`} aria-label="処理の進捗">
    <ol className="progress-panel__steps">
      {steps.map((step, index) => <li key={step.label} className={`progress-panel__row progress-panel__row--${step.state}`} aria-current={step.state === 'active' ? 'step' : undefined}>
        {!compact && <span className="progress-panel__number" aria-hidden="true">{step.state === 'done' ? <svg viewBox="0 0 16 16"><path d="m3.5 8 3 3 6-6" /></svg> : index + 1}</span>}
        <span className="progress-panel__label">{step.label}</span>
        <progress className="progress-panel__bar" aria-label={`${step.label}の進捗`} aria-valuetext={step.valueLabel || (step.percent === null ? '処理中' : `${step.percent}%`)} max="100" value={step.percent ?? undefined} />
        <span className="progress-panel__value">{step.valueLabel || (step.percent === null ? '処理中' : `${step.percent}%`)}</span>
      </li>)}
    </ol>
    {onCancel && <div className="progress-panel__footer"><button type="button" className="progress-panel__cancel" onClick={onCancel}>中止</button></div>}
  </section>
}
