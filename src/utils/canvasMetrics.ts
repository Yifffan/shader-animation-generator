export interface CanvasMetrics {
  cssWidth: number
  cssHeight: number
  pixelWidth: number
  pixelHeight: number
  dpr: number
  deviceDpr: number
}

interface ObserveCanvasMetricsOptions {
  maxDpr: number
  viewport?: boolean
  onResize: (metrics: CanvasMetrics) => void
}

export interface CanvasMetricsController {
  dispose: () => void
}

const RESIZE_DEBOUNCE_MS = 100

const metricsEqual = (a: CanvasMetrics | null, b: CanvasMetrics) =>
  a !== null &&
  a.cssWidth === b.cssWidth &&
  a.cssHeight === b.cssHeight &&
  a.pixelWidth === b.pixelWidth &&
  a.pixelHeight === b.pixelHeight &&
  a.dpr === b.dpr &&
  a.deviceDpr === b.deviceDpr

/**
 * Keeps canvas geometry outside hot render loops. Resize/layout notifications are
 * coalesced into one animation frame and expensive backing-store updates are
 * trailing-debounced while a window is being resized.
 */
export const observeCanvasMetrics = (
  canvas: HTMLCanvasElement,
  {
    maxDpr,
    viewport = false,
    onResize,
  }: ObserveCanvasMetricsOptions
): CanvasMetricsController => {
  let disposed = false
  let measureRaf = 0
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  let latestMetrics: CanvasMetrics | null = null
  let committedMetrics: CanvasMetrics | null = null
  let resolutionQuery: MediaQueryList | null = null

  const addResolutionListener = (query: MediaQueryList) => {
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onResolutionChange, { once: true })
    } else {
      query.addListener(onResolutionChange)
    }
  }

  const removeResolutionListener = (query: MediaQueryList | null) => {
    if (!query) {
      return
    }
    if (typeof query.removeEventListener === 'function') {
      query.removeEventListener('change', onResolutionChange)
    } else {
      query.removeListener(onResolutionChange)
    }
  }

  const readMetrics = (): CanvasMetrics | null => {
    // Shader scale can depend on native DPR even when the backing-store cap is unchanged.
    const deviceDpr = window.devicePixelRatio || 1
    const dpr = Math.min(deviceDpr, maxDpr)
    if (viewport) {
      const cssWidth = window.innerWidth
      const cssHeight = window.innerHeight
      if (cssWidth <= 0 || cssHeight <= 0) {
        return null
      }
      return {
        cssWidth,
        cssHeight,
        pixelWidth: Math.max(1, Math.round(cssWidth * dpr)),
        pixelHeight: Math.max(1, Math.round(cssHeight * dpr)),
        dpr,
        deviceDpr,
      }
    }

    const rect = canvas.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) {
      return null
    }
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      pixelWidth: Math.max(1, Math.round(rect.width * dpr)),
      pixelHeight: Math.max(1, Math.round(rect.height * dpr)),
      dpr,
      deviceDpr,
    }
  }

  const commitResize = () => {
    resizeTimer = null
    if (!latestMetrics || metricsEqual(committedMetrics, latestMetrics)) {
      return
    }
    committedMetrics = latestMetrics
    onResize(latestMetrics)
  }

  const measure = () => {
    measureRaf = 0
    if (disposed) {
      return
    }

    const nextMetrics = readMetrics()
    if (!nextMetrics || metricsEqual(latestMetrics, nextMetrics)) {
      return
    }

    latestMetrics = nextMetrics

    if (!committedMetrics) {
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }
      commitResize()
    } else {
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }
      resizeTimer = setTimeout(commitResize, RESIZE_DEBOUNCE_MS)
    }
  }

  const refresh = () => {
    if (disposed || measureRaf) {
      return
    }
    measureRaf = requestAnimationFrame(measure)
  }

  const onResolutionChange = () => {
    bindResolutionQuery()
    refresh()
  }

  const bindResolutionQuery = () => {
    removeResolutionListener(resolutionQuery)
    resolutionQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    addResolutionListener(resolutionQuery)
  }

  const resizeObserver = viewport || typeof window.ResizeObserver === 'undefined'
    ? null
    : new window.ResizeObserver(refresh)
  resizeObserver?.observe(canvas)
  if (!resizeObserver) {
    window.addEventListener('resize', refresh)
    window.addEventListener('orientationchange', refresh)
    window.visualViewport?.addEventListener('resize', refresh)
    if (!viewport) {
      void document.fonts?.ready.then(refresh)
    }
  }
  bindResolutionQuery()

  measure()

  return {
    dispose: () => {
      disposed = true
      if (measureRaf) {
        cancelAnimationFrame(measureRaf)
      }
      if (resizeTimer) {
        clearTimeout(resizeTimer)
      }
      resizeObserver?.disconnect()
      if (!resizeObserver) {
        window.removeEventListener('resize', refresh)
        window.removeEventListener('orientationchange', refresh)
        window.visualViewport?.removeEventListener('resize', refresh)
      }
      removeResolutionListener(resolutionQuery)
    },
  }
}
