export interface CanvasPlaybackController {
  schedule: () => void
  dispose: () => void
}

interface CreateCanvasPlaybackControllerOptions {
  canvas: HTMLCanvasElement
  enabled: boolean
  frameRate?: 30 | 60
  render: (now: number) => void
}

/**
 * Keeps animation scheduling and page/canvas visibility in one place so each
 * renderer only owns its drawing work and resource lifecycle.
 */
export const createCanvasPlaybackController = ({
  canvas,
  enabled,
  frameRate = 30,
  render,
}: CreateCanvasPlaybackControllerOptions): CanvasPlaybackController => {
  let disposed = false
  let visible = true
  let raf = 0
  let lastFrameAt = 0
  const frameIntervalMs = 1000 / frameRate

  const frame = (now: number) => {
    raf = 0
    if (disposed || !visible || document.hidden) {
      return
    }

    const elapsed = now - lastFrameAt
    if (lastFrameAt && elapsed < frameIntervalMs) {
      schedule()
      return
    }

    lastFrameAt = now - (elapsed % frameIntervalMs)
    render(now)
    schedule()
  }

  const schedule = () => {
    if (!enabled || disposed || raf || !visible || document.hidden) {
      return
    }
    raf = requestAnimationFrame(frame)
  }

  const stop = () => {
    if (!raf) {
      return
    }
    cancelAnimationFrame(raf)
    raf = 0
  }

  const updatePlayback = () => {
    if (visible && !document.hidden) {
      schedule()
    } else {
      stop()
    }
  }

  const observer = enabled && typeof window.IntersectionObserver === 'function'
    ? new window.IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting
          updatePlayback()
        },
        { threshold: 0 }
      )
    : null

  if (enabled) {
    observer?.observe(canvas)
    document.addEventListener('visibilitychange', updatePlayback)
  }

  return {
    schedule,
    dispose: () => {
      disposed = true
      stop()
      observer?.disconnect()
      if (enabled) {
        document.removeEventListener('visibilitychange', updatePlayback)
      }
    },
  }
}
