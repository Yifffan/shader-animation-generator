export const DEFAULT_VIDEO_DURATION_SECONDS = 10
export const MAX_VIDEO_DURATION_SECONDS = 120

export interface VideoSettings {
  durationSeconds: number
  format: 'mp4' | 'webm'
  resolution: '1080p' | '720p'
  ratio: '9:16' | '16:9'
  frameRate: 30 | 60
}

export function getVideoResolution(settings: VideoSettings) {
  const shortSide = settings.resolution === '1080p' ? 1080 : 720
  const longSide = settings.resolution === '1080p' ? 1920 : 1280
  return settings.ratio === '9:16'
    ? { width: shortSide, height: longSide }
    : { width: longSide, height: shortSide }
}

export function getVideoMimeType(format?: VideoSettings['format']): string {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement.prototype.captureStream !== 'function') {
    throw new Error('Video export is unavailable in this browser. Try a current version of Chrome, Edge, Firefox or Safari.')
  }
  const formats = {
    mp4: ['video/mp4;codecs=avc1.42E02A', 'video/mp4'],
    webm: ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'],
  }
  const mimeType = (format ? formats[format] : [...formats.mp4, ...formats.webm]).find(type => MediaRecorder.isTypeSupported(type))
  if (!mimeType) throw new Error(format
    ? `${format === 'mp4' ? 'MP4' : 'WebM'} recording is unavailable in this browser. Choose another format.`
    : 'This browser has no supported video encoder. Try another browser.')
  return mimeType
}

/** Record only the shader canvas. The caller owns cancellation and downloading. */
export function recordCanvasVideo(canvas: HTMLCanvasElement, options: {
  mimeType: string
  settings: VideoSettings
  signal: AbortSignal
  onProgress: (seconds: number) => void
}): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const { mimeType, settings, signal, onProgress } = options
    const { durationSeconds, frameRate } = settings
    if (!Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_VIDEO_DURATION_SECONDS) {
      reject(new Error(`Choose a whole number of seconds between 1 and ${MAX_VIDEO_DURATION_SECONDS}.`))
      return
    }
    if (signal.aborted) {
      reject(new DOMException('Video export cancelled.', 'AbortError'))
      return
    }
    let stream: MediaStream | undefined
    let recorder: MediaRecorder | undefined
    let stopTimer: ReturnType<typeof setTimeout> | undefined
    let progressTimer: ReturnType<typeof setInterval> | undefined
    let finalizeTimer: ReturnType<typeof setTimeout> | undefined
    let completedRecording = false
    const chunks: Blob[] = []
    const cleanup = () => {
      clearTimeout(stopTimer)
      clearInterval(progressTimer)
      clearTimeout(finalizeTimer)
      signal.removeEventListener('abort', abort)
      if (recorder) {
        recorder.ondataavailable = null
        recorder.onerror = null
        recorder.onstop = null
        if (recorder.state !== 'inactive') recorder.stop()
      }
      stream?.getTracks().forEach(track => track.stop())
    }
    const fail = (error: unknown) => {
      cleanup()
      reject(error)
    }
    const abort = () => fail(new DOMException('Video export cancelled.', 'AbortError'))
    try {
      stream = canvas.captureStream(frameRate)
      const videoBitsPerSecond = (settings.resolution === '1080p' ? 12_000_000 : 6_000_000) * frameRate / 30
      recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond })
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onerror = () => fail(new Error('Video recording failed. Try another browser or close other GPU-heavy tabs.'))
      recorder.onstop = () => {
        if (!completedRecording) {
          fail(new Error('Video recording stopped early. Please try exporting again.'))
          return
        }
        const blob = new Blob(chunks, { type: recorder!.mimeType || mimeType })
        cleanup()
        if (blob.size) resolve(blob)
        else reject(new Error('The video was empty. Please try exporting again.'))
      }
      signal.addEventListener('abort', abort, { once: true })
      recorder.start()
      const startedAt = performance.now()
      onProgress(0)
      progressTimer = setInterval(() => {
        onProgress(Math.min(durationSeconds, Math.floor((performance.now() - startedAt) / 1000)))
      }, 250)
      stopTimer = setTimeout(() => {
        clearInterval(progressTimer)
        onProgress(durationSeconds)
        completedRecording = true
        recorder!.stop()
        finalizeTimer = setTimeout(() => fail(new Error('The video encoder did not finish. Please try again.')), 15_000)
      }, durationSeconds * 1000)
    } catch (error) {
      fail(error)
    }
  })
}

export function downloadVideoBlob(blob: Blob, name: string, settings: VideoSettings) {
  const extension = blob.type.startsWith('video/mp4') ? 'mp4' : 'webm'
  const filename = `${name}-${settings.resolution}.${extension}`
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Give the browser time to consume the URL, including Safari's download handoff.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
  return filename
}
