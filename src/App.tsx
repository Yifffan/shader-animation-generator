import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { copyText } from './clipboard'
import { ShaderGradient, type ShaderShape, type ShaderType } from './components/ShaderGradient'
import { VideoExport } from './components/VideoExport'
import { DEFAULT_PARAMETERS as defaults, SHADER_PRESETS, type ShaderParameters as Parameters } from './presets'
import { generateVariant, type Mood } from './randomize'
import { DEFAULT_VIDEO_DURATION_SECONDS, downloadVideoBlob, getVideoMimeType, MAX_VIDEO_DURATION_SECONDS, type VideoSettings } from './video'
import './styles.css'

type NumericKey = { [K in keyof Parameters]: Parameters[K] extends number ? K : never }[keyof Parameters]
const sliders: { key: NumericKey; label: string; min: number; max: number; step: number; patternOnly?: boolean; flowlightOnly?: boolean; noFluid?: boolean }[] = [
  { key: 'grain', label: 'Grain', min: 0, max: 0.05, step: 0.001 },
  { key: 'speed', label: 'Speed', min: 0, max: 100, step: 1 },
  { key: 'scale', label: 'Scale', min: 0.1, max: 3, step: 0.01 },
  { key: 'shapeScale', label: 'Shape scale', min: 0, max: 50, step: 0.1, patternOnly: true },
  { key: 'rotation', label: 'Rotation', min: -180, max: 180, step: 1, patternOnly: true },
  { key: 'proportion', label: 'Proportion', min: 0, max: 100, step: 1, patternOnly: true },
  { key: 'softness', label: 'Softness', min: 0, max: 100, step: 1, patternOnly: true },
  { key: 'distortion', label: 'Distortion', min: 0, max: 30, step: 1, patternOnly: true },
  { key: 'swirl', label: 'Swirl', min: 0, max: 50, step: 1, patternOnly: true },
  { key: 'swirlIterations', label: 'Swirl iterations', min: 1, max: 30, step: 1, patternOnly: true },
  { key: 'offsetX', label: 'Horizontal offset', min: -500, max: 500, step: 1, noFluid: true },
  { key: 'offsetY', label: 'Vertical offset', min: -500, max: 500, step: 1, noFluid: true },
  { key: 'lightX', label: 'Light X', min: 0, max: 1, step: 0.01, flowlightOnly: true },
  { key: 'lightY', label: 'Light Y', min: 0, max: 1, step: 0.01, flowlightOnly: true },
  { key: 'lightCore', label: 'Light core', min: 0, max: 0.5, step: 0.01, flowlightOnly: true },
  { key: 'lightHalo', label: 'Light halo', min: 0, max: 0.5, step: 0.01, flowlightOnly: true },
  { key: 'bottomFade', label: 'Bottom fade', min: 0, max: 1, step: 0.01, flowlightOnly: true },
  { key: 'vignette', label: 'Vignette', min: 0, max: 1, step: 0.01, flowlightOnly: true },
  { key: 'bloomThreshold', label: 'Bloom threshold', min: 0, max: 1, step: 0.01, flowlightOnly: true },
  { key: 'bloomRange', label: 'Bloom range', min: 0.01, max: 0.5, step: 0.01, flowlightOnly: true },
  { key: 'bloomStrength', label: 'Bloom strength', min: 0, max: 1, step: 0.01, flowlightOnly: true },
]

export default function App() {
  const [params, setParams] = useState<Parameters>({ ...defaults, ...SHADER_PRESETS['Abyss Blue'] })
  const [activePreset, setActivePreset] = useState('Abyss Blue')
  const [panelOpen, setPanelOpen] = useState(true)
  const [message, setMessage] = useState('')
  const [manualCopy, setManualCopy] = useState(false)
  const jsonDetailsRef = useRef<HTMLDetailsElement>(null)
  const jsonTextRef = useRef<HTMLTextAreaElement>(null)
  const [renderError, setRenderError] = useState('')
  const [videoRequest, setVideoRequest] = useState<{ parameters: Parameters; name: string; mimeType: string; settings: VideoSettings } | null>(null)
  const [videoMessage, setVideoMessage] = useState('')
  const [videoDuration, setVideoDuration] = useState(String(DEFAULT_VIDEO_DURATION_SECONDS))
  const [videoSettings, setVideoSettings] = useState<Omit<VideoSettings, 'durationSeconds'>>({ format: 'mp4', resolution: '1080p', ratio: '16:9', frameRate: 30 })
  const [videoOptionsError, setVideoOptionsError] = useState('')
  const videoDialogRef = useRef<HTMLDialogElement>(null)
  const presetsRef = useRef<HTMLElement>(null)
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const element = presetsRef.current
    if (!element) return
    let disposed = false
    const updateEdges = () => {
      if (disposed) return
      const left = element.scrollLeft > 1
      const right = element.scrollWidth - element.clientWidth - element.scrollLeft > 1
      setScrollEdges(previous => previous.left === left && previous.right === right ? previous : { left, right })
    }
    updateEdges()
    element.addEventListener('scroll', updateEdges, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateEdges)
    observer?.observe(element)
    window.addEventListener('resize', updateEdges)
    void document.fonts.ready.then(updateEdges)
    return () => {
      disposed = true
      element.removeEventListener('scroll', updateEdges)
      observer?.disconnect()
      window.removeEventListener('resize', updateEdges)
    }
  }, [])
  const maxColors = params.type === 'pattern' ? 6 : 5
  const json = JSON.stringify(params, null, 2)

  const update = <K extends keyof Parameters>(key: K, value: Parameters[K]) => {
    setParams(previous => ({ ...previous, [key]: value }))
    setActivePreset('')
    setMessage('')
  }
  const selectPreset = (name: string) => {
    setParams({ ...defaults, ...SHADER_PRESETS[name] })
    setActivePreset(name)
    setMessage('')
  }
  const randomize = (mood: Mood) => {
    const seed = crypto.getRandomValues(new Uint32Array(1))[0]
    setParams(generateVariant(seed, mood))
    setActivePreset('')
    setMessage(`Random ${mood} variant · seed ${seed}. Export JSON to keep it.`)
  }
  const copyParams = async () => {
    if (await copyText(json)) {
      setManualCopy(false)
      setMessage('JSON copied to clipboard.')
      return
    }
    setManualCopy(true)
    setMessage('Clipboard unavailable. JSON is selected below — press ⌘C / Ctrl+C, or download it.')
    requestAnimationFrame(() => {
      if (!jsonDetailsRef.current || !jsonTextRef.current) return
      jsonDetailsRef.current.open = true
      jsonTextRef.current.focus({ preventScroll: true })
      jsonTextRef.current.select()
      jsonTextRef.current.scrollIntoView({ block: 'nearest' })
    })
  }
  const downloadParams = () => {
    const url = URL.createObjectURL(new Blob([json + '\n'], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${activePreset ? activePreset.toLowerCase().replaceAll(' ', '-') : 'custom-shader'}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const downloadVideo = () => {
    if (videoRequest || renderError) return
    try {
      getVideoMimeType()
      setVideoOptionsError('')
      videoDialogRef.current?.showModal()
    } catch (error) {
      setVideoMessage(error instanceof Error ? error.message : 'Video export is unavailable in this browser.')
    }
  }
  const startVideoExport = () => {
    const durationSeconds = Number(videoDuration)
    if (videoRequest || renderError || !Number.isInteger(durationSeconds) || durationSeconds < 1 || durationSeconds > MAX_VIDEO_DURATION_SECONDS) return
    try {
      const mimeType = getVideoMimeType(videoSettings.format)
      videoDialogRef.current?.close()
      setVideoMessage('Preparing video… Keep this tab visible.')
      setVideoRequest({
        parameters: { ...params, colors: [...params.colors] },
        name: activePreset ? activePreset.toLowerCase().replaceAll(' ', '-') : 'custom-shader',
        mimeType,
        settings: { ...videoSettings, durationSeconds },
      })
    } catch (error) {
      setVideoOptionsError(error instanceof Error ? error.message : 'Video export is unavailable in this browser.')
    }
  }

  return (
    <main>
      <div className="preview" aria-label="Shader preview">
        <ShaderGradient {...params} onError={setRenderError} />
      </div>
      {videoRequest && <VideoExport parameters={videoRequest.parameters} mimeType={videoRequest.mimeType} settings={videoRequest.settings}
        onProgress={seconds => setVideoMessage(seconds === videoRequest.settings.durationSeconds
          ? 'Finishing video…'
          : `Recording video… ${seconds} / ${videoRequest.settings.durationSeconds} s. Keep this tab visible.`)}
        onComplete={blob => {
          const filename = downloadVideoBlob(blob, videoRequest.name, videoRequest.settings)
          setVideoRequest(null)
          setVideoMessage(`Download started: ${filename}`)
        }}
        onError={error => { setVideoRequest(null); setVideoMessage(error) }}
      />}
      <dialog ref={videoDialogRef} className="video-options" aria-labelledby="video-options-title">
        <form onChange={() => setVideoOptionsError('')} onSubmit={event => { event.preventDefault(); startVideoExport() }}>
          <h2 id="video-options-title">Download video</h2>
          <label className="video-option-row" htmlFor="video-duration">Duration (seconds)
            <input id="video-duration" type="number" min="1" max={MAX_VIDEO_DURATION_SECONDS} step="1" required value={videoDuration} onChange={event => setVideoDuration(event.target.value)} autoFocus />
          </label>
          <label className="video-option-row" htmlFor="video-format">Format
            <select id="video-format" value={videoSettings.format} onChange={event => setVideoSettings(previous => ({ ...previous, format: event.target.value as VideoSettings['format'] }))}><option value="mp4">MP4</option><option value="webm">WebM</option></select>
          </label>
          <label className="video-option-row" htmlFor="video-resolution">Resolution
            <select id="video-resolution" value={videoSettings.resolution} onChange={event => setVideoSettings(previous => ({ ...previous, resolution: event.target.value as VideoSettings['resolution'] }))}><option value="1080p">1080P</option><option value="720p">720P</option></select>
          </label>
          <label className="video-option-row" htmlFor="video-ratio">Ratio
            <select id="video-ratio" value={videoSettings.ratio} onChange={event => setVideoSettings(previous => ({ ...previous, ratio: event.target.value as VideoSettings['ratio'] }))}><option value="9:16">9:16</option><option value="16:9">16:9</option></select>
          </label>
          <label className="video-option-row" htmlFor="video-fps">FPS
            <select id="video-fps" value={videoSettings.frameRate} onChange={event => setVideoSettings(previous => ({ ...previous, frameRate: Number(event.target.value) as VideoSettings['frameRate'] }))}><option value="30">30 fps</option><option value="60">60 fps</option></select>
          </label>
          {videoOptionsError && <p role="alert">{videoOptionsError}</p>}
          <p>Keep this tab visible while recording.</p>
          <div className="dialog-actions"><button type="button" onClick={() => videoDialogRef.current?.close()}>Cancel</button><button type="submit">Start recording</button></div>
        </form>
      </dialog>
      {renderError && <div className="render-error" role="alert">{renderError}</div>}
      <button className="customize-toggle" aria-expanded={panelOpen} aria-controls="controls" onClick={() => setPanelOpen(!panelOpen)}>
        {panelOpen ? 'Close' : 'Customize'}
      </button>
      <nav ref={presetsRef} className="presets" aria-label="Shader presets" data-scroll-left={scrollEdges.left} data-scroll-right={scrollEdges.right}>
        {Object.keys(SHADER_PRESETS).map(name => (
          <button key={name} aria-pressed={activePreset === name} onClick={() => selectPreset(name)}>{name}</button>
        ))}
        <div className="random-actions"><button onClick={() => randomize('light')}>↻ Random light</button><button onClick={() => randomize('dark')}>↻ Random dark</button></div>
      </nav>
      {panelOpen && <aside className="panel" id="controls" aria-label="Shader controls">
        <div className="panel-heading"><h2>{activePreset || 'Custom palette'}</h2></div>
        <div className="actions"><button onClick={copyParams}>Copy JSON</button><button onClick={downloadParams}>Download JSON</button><button onClick={downloadVideo} disabled={!!videoRequest || !!renderError}>Download Video</button></div>
        <p className="status" role="status" aria-label="Video recording status">{videoMessage}</p>
        {videoRequest && <button onClick={() => { setVideoRequest(null); setVideoMessage('Video export cancelled.') }}>Cancel video export</button>}
        <p className="status" role="status" aria-label="Export status">{message}</p>
        <div className="section-heading"><span>Colors ({params.colors.length})</span><div className="color-actions">
          <button aria-label="Remove color" disabled={params.colors.length <= 1} onClick={() => update('colors', params.colors.slice(0, -1))}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14" /></svg></button>
          <button aria-label="Add color" disabled={params.colors.length >= maxColors} onClick={() => update('colors', [...params.colors, '#000000'])}><svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 12h14M12 5v14" /></svg></button>
        </div></div>
        <div className="colors">{params.colors.map((color, index) => (
          <label key={index}><input aria-label={`Color ${index + 1}`} type="color" value={color} onChange={event => update('colors', params.colors.map((c, i) => i === index ? event.target.value : c))} /><span>{color}</span></label>
        ))}</div>
        <label className="select-row" htmlFor="shader-type">Type
          <select aria-label="Type" id="shader-type" value={params.type} onChange={event => {
            const type = event.target.value as ShaderType
            setParams(previous => ({ ...previous, type, colors: previous.colors.slice(0, type === 'pattern' ? 6 : 5) }))
            setActivePreset('')
            setMessage('')
          }}><option value="pattern">Pattern</option><option value="fluid">Fluid</option><option value="flowlight">Flowlight</option></select>
        </label>
        {params.type === 'pattern' && <label className="select-row" htmlFor="shader-shape">Shape
          <select aria-label="Shape" id="shader-shape" value={params.shape} onChange={event => update('shape', event.target.value as ShaderShape)}>
            <option value="checks">Checks</option><option value="stripes">Stripes</option><option value="gradient">Gradient</option>
          </select>
        </label>}
        <div className="sliders">{sliders.filter(slider => (!slider.patternOnly || params.type === 'pattern') && (!slider.flowlightOnly || params.type === 'flowlight') && (!slider.noFluid || params.type !== 'fluid')).map(({ key, label, min, max, step }) => (
          <label className="slider" key={key} htmlFor={key}><span>{label}<output>{params[key].toFixed(step < 0.01 ? 3 : step < 1 ? 2 : 0)}</output></span>
            <input id={key} aria-label={label} type="range" min={min} max={max} step={step} value={params[key]} style={{ '--range-progress': `${Math.max(0, Math.min(100, (params[key] - min) / (max - min) * 100))}%` } as CSSProperties} onChange={event => update(key, Number(event.target.value))} />
          </label>
        ))}</div>
        <details ref={jsonDetailsRef}><summary>View JSON</summary>{manualCopy && <p className="hint" role="status" aria-label="Manual copy instructions">Press ⌘C / Ctrl+C to copy the selected JSON. On mobile, touch and hold to copy.</p>}<textarea ref={jsonTextRef} aria-label="Shader JSON" readOnly value={json} spellCheck={false} /></details>
        <p className="hint">{params.type === 'flowlight' ? 'Flowlight uses five colors with soft lighting, bloom and vignette. Empty slots repeat the last color.' : params.type === 'fluid' ? 'Fluid uses up to five colors. Unfilled slots render as black.' : 'Pattern blends up to six colors.'} All rendering stays in your browser.</p>
      </aside>}
      <footer><a href="https://github.com/Yifffan/shader-animation-generator" target="_blank" rel="noreferrer">GitHub ↗</a><a href="./THIRD_PARTY_NOTICES.txt" target="_blank" rel="noreferrer">Credits & licenses</a></footer>
    </main>
  )
}
