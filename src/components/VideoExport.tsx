import { useEffect, useRef } from 'react'
import type { ShaderParameters } from '../presets'
import { getVideoResolution, recordCanvasVideo, type VideoSettings } from '../video'
import { ShaderGradient } from './ShaderGradient'

interface VideoExportProps {
  parameters: ShaderParameters
  mimeType: string
  settings: VideoSettings
  onProgress: (seconds: number) => void
  onComplete: (blob: Blob) => void
  onError: (message: string) => void
}

/** A fixed-size, invisible renderer keeps edits and viewport changes out of the clip. */
export function VideoExport(props: VideoExportProps) {
  const callbacks = useRef(props)
  callbacks.current = props
  const recording = useRef<{
    controller: AbortController
    canvas?: HTMLCanvasElement
    startupTimer: ReturnType<typeof setTimeout>
    fail: (message: string) => void
  } | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const fail = (message: string) => {
      if (controller.signal.aborted) return
      controller.abort()
      callbacks.current.onError(message)
    }
    const hidden = () => {
      if (document.hidden) fail('Video export cancelled because the tab was hidden. Keep this tab visible and try again.')
    }
    const contextLost = () => fail('Video export stopped because the graphics context was lost. Please reload and try again.')
    const pageHidden = () => fail('Video export cancelled because the page was left. Please try again.')
    const startupTimer = setTimeout(() => fail('The shader did not start. Please reload and try again.'), 15_000)
    const current = { controller, startupTimer, fail, canvas: undefined as HTMLCanvasElement | undefined }
    recording.current = current
    document.addEventListener('visibilitychange', hidden)
    window.addEventListener('pagehide', pageHidden)
    // Context loss does not bubble, so listen in the capture phase.
    window.addEventListener('webglcontextlost', contextLost, true)
    hidden()
    return () => {
      controller.abort()
      clearTimeout(startupTimer)
      recording.current = null
      document.removeEventListener('visibilitychange', hidden)
      window.removeEventListener('pagehide', pageHidden)
      window.removeEventListener('webglcontextlost', contextLost, true)
    }
  }, [])

  const ready = (canvas: HTMLCanvasElement) => {
    const current = recording.current
    if (!current || current.canvas || current.controller.signal.aborted) return
    current.canvas = canvas
    clearTimeout(current.startupTimer)
    void recordCanvasVideo(canvas, {
      mimeType: props.mimeType,
      settings: props.settings,
      signal: current.controller.signal,
      onProgress: seconds => callbacks.current.onProgress(seconds),
    }).then(blob => {
      if (!current.controller.signal.aborted) callbacks.current.onComplete(blob)
    }).catch(error => {
      if (!current.controller.signal.aborted) current.fail(error instanceof Error ? error.message : 'Video export failed. Please try again.')
    })
  }

  return <div className="video-renderer" aria-hidden="true">
    <ShaderGradient {...props.parameters} resolution={getVideoResolution(props.settings)} frameRate={props.settings.frameRate} onReady={ready}
      onError={message => { if (message) callbacks.current.onError(message) }} />
  </div>
}
