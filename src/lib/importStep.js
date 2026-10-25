export function importStep(file, params, options) {
  return runStepWorker(file, params, options)
}

export function clearStepCache() {
  return runStepWorker(null, null, { signal: new AbortController().signal, onProgress() {} }, 'clear-cache')
}

function runStepWorker(file, params, { signal, onProgress }, type) {
  return new Promise((resolve, reject) => {
    const worker = new Worker('/step-import-worker.js')
    const requestId = crypto.randomUUID()
    let settled = false
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      worker.terminate()
      signal.removeEventListener('abort', abort)
      callback(value)
    }
    const abort = () => finish(reject, new DOMException('読み込みを中止しました', 'AbortError'))
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { abort(); return }
    worker.onerror = e => finish(reject, new Error(e.message || '変換処理が停止しました。'))
    worker.onmessageerror = () => finish(reject, new Error('変換結果を受信できませんでした。'))
    worker.onmessage = ({ data }) => {
      if (settled || data.requestId !== requestId) return
      if (data.type === 'progress') onProgress(data)
      if (data.type === 'result') finish(resolve, data.result)
      if (data.type === 'error') finish(reject, new Error(data.message))
    }
    try {
      if (type === 'clear-cache') worker.postMessage({ type, requestId })
      else if (file.buffer instanceof ArrayBuffer) {
        worker.postMessage({ buffer: file.buffer, params, requestId }, [file.buffer])
      } else worker.postMessage({ file, params, requestId })
    } catch (error) {
      finish(reject, error)
    }
  })
}
