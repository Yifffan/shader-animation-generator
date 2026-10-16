import { test, expect, type Page } from '@playwright/test'

// Exercise the real browser encoder and decoder, including high-DPI displays.
test.use({ viewport: { width: 640, height: 480 }, deviceScaleFactor: 2 })

async function startExport(page: Page, duration = '2') {
  await page.getByRole('button', { name: 'Download Video', exact: true }).click()
  await page.getByLabel('Duration (seconds)').fill(duration)
  const format = await page.evaluate(() => MediaRecorder.isTypeSupported('video/mp4') ? 'mp4' : 'webm')
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption(format)
  await page.getByRole('button', { name: 'Start recording', exact: true }).click()
}

for (const preset of ['Abyss Blue', 'Glacier', 'Midnight Blue']) {
  test(`${preset} downloads a playable 1080p animation without the editor`, async ({ page }, testInfo) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.goto('/')
    await page.getByRole('button', { name: preset, exact: true }).click()
    const duration = preset === 'Abyss Blue' ? 10 : 2
    const downloadPromise = page.waitForEvent('download')
    await startExport(page, String(duration))
    await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('Recording video')
    await expect(page.getByRole('button', { name: 'Download Video', exact: true })).toBeDisabled()
    expect(await page.locator('.video-renderer canvas').evaluate(canvas => [
      (canvas as HTMLCanvasElement).width, (canvas as HTMLCanvasElement).height,
    ])).toEqual([1920, 1080])
    // Neither editing the preview nor resizing the window may alter this export.
    await page.getByRole('button', { name: 'Cloud White', exact: true }).click()
    await page.setViewportSize({ width: 800, height: 500 })
    const download = await downloadPromise
    expect(download.suggestedFilename()).toMatch(new RegExp(`^${preset.toLowerCase().replaceAll(' ', '-')}-1080p\\.(mp4|webm)$`))
    await download.saveAs(testInfo.outputPath(download.suggestedFilename()))
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const bytes = Buffer.concat(chunks)
    expect(bytes.length).toBeGreaterThan(10_000)
    const decoded = await page.evaluate(async ({ data, extension, duration }) => {
      const video = document.createElement('video')
      video.muted = true
      const blob = new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: `video/${extension}` })
      const url = URL.createObjectURL(blob)
      const waitFor = (event: string) => new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Video did not emit ${event}`)), 10_000)
        video.addEventListener(event, () => { clearTimeout(timer); resolve() }, { once: true })
        video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Downloaded video did not decode')) }, { once: true })
      })
      try {
        const loaded = waitFor('loadeddata')
        video.src = url
        await loaded
        const canvas = document.createElement('canvas')
        canvas.width = 64
        canvas.height = 36
        const ctx = canvas.getContext('2d')!
        const frame = async (time: number) => {
          const seeked = waitFor('seeked')
          video.currentTime = time
          await seeked
          ctx.drawImage(video, 0, 0, 64, 36)
          return Array.from(ctx.getImageData(0, 0, 64, 36).data)
        }
        const first = await frame(0.2)
        const last = await frame(duration - 0.5)
        const variety = new Set<string>()
        let change = 0
        let brightness = 0
        for (let i = 0; i < first.length; i += 4) {
          variety.add(first.slice(i, i + 3).join(','))
          for (let j = 0; j < 3; j++) {
            change += Math.abs(first[i + j] - last[i + j])
            brightness += first[i + j]
          }
        }
        return {
          width: video.videoWidth, height: video.videoHeight,
          duration: Number.isFinite(video.duration) ? video.duration : null,
          variety: variety.size, change, brightness: brightness / (64 * 36 * 3),
        }
      } finally {
        video.removeAttribute('src')
        video.load()
        URL.revokeObjectURL(url)
      }
    }, { data: bytes.toString('base64'), extension: download.suggestedFilename().split('.').pop()!, duration })
    expect(decoded.width).toBe(1920)
    expect(decoded.height).toBe(1080)
    if (decoded.duration !== null) {
      expect(decoded.duration).toBeGreaterThanOrEqual(duration - 0.5)
      expect(decoded.duration).toBeLessThan(duration + 2)
    }
    expect(decoded.variety).toBeGreaterThan(20)
    expect(decoded.change).toBeGreaterThan(1_000)
    // The saved palette remains dark after switching the preview to Cloud White.
    expect(decoded.brightness).toBeLessThan(200)
    await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText(`Download started: ${download.suggestedFilename()}`)
    await expect(page.locator('.video-renderer')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download Video', exact: true })).toBeEnabled()
    expect(errors).toEqual([])
  })
}

test('unsupported MP4 stays in the dialog until the user chooses WebM', async ({ page }) => {
  await page.addInitScript(() => {
    const supported = MediaRecorder.isTypeSupported.bind(MediaRecorder)
    MediaRecorder.isTypeSupported = type => type.startsWith('video/webm') && supported(type)
  })
  await page.goto('/')
  await page.getByRole('slider', { name: 'Speed', exact: true }).fill('50')
  await page.getByRole('button', { name: 'Download Video', exact: true }).click()
  await page.getByLabel('Duration (seconds)').fill('2')
  await page.getByRole('button', { name: 'Start recording', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('alert')).toContainText('MP4 recording is unavailable')
  await expect(page.locator('.video-renderer')).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption('webm')
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Start recording', exact: true }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('custom-shader-1080p.webm')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
  // WebM files begin with an EBML header.
  expect(Buffer.concat(chunks).subarray(0, 4).toString('hex')).toBe('1a45dfa3')
})

async function trackCapture(page: Page) {
  await page.addInitScript(() => {
    const tracks: MediaStreamTrack[] = []
    const recorders: MediaRecorder[] = []
    const frameRates: number[] = []
    Object.assign(window, { exportTracks: tracks, exportRecorders: recorders, exportFrameRates: frameRates })
    window.MediaRecorder = new Proxy(MediaRecorder, {
      construct(target, args) {
        const recorder = Reflect.construct(target, args) as MediaRecorder
        recorders.push(recorder)
        return recorder
      },
    })
    const capture = HTMLCanvasElement.prototype.captureStream
    HTMLCanvasElement.prototype.captureStream = function (...args) {
      const stream = capture.apply(this, args)
      frameRates.push(args[0] ?? 0)
      tracks.push(...stream.getTracks())
      return stream
    }
  })
}

for (const interruption of ['cancel', 'hidden', 'context lost', 'encoder failure', 'early stop']) {
  test(`${interruption} releases recording resources and allows a retry`, async ({ page }) => {
    await trackCapture(page)
    const downloads: string[] = []
    page.on('download', download => downloads.push(download.suggestedFilename()))
    await page.goto('/')
    await startExport(page, '10')
    await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('Recording video')
    if (interruption === 'cancel') {
      await page.getByRole('button', { name: 'Cancel video export' }).click()
    } else if (interruption === 'hidden') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: true })
        document.dispatchEvent(new Event('visibilitychange'))
      })
    } else if (interruption === 'context lost') {
      await page.locator('.video-renderer canvas').evaluate(canvas => canvas.dispatchEvent(new Event('webglcontextlost')))
    } else if (interruption === 'encoder failure') {
      // A real recorder error must not download a truncated clip.
      await page.evaluate(() => {
        const recorder = (window as unknown as { exportRecorders: MediaRecorder[] }).exportRecorders[0]
        recorder.dispatchEvent(new Event('error'))
      })
      await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('Video recording failed')
    } else {
      await page.evaluate(() => (window as unknown as { exportRecorders: MediaRecorder[] }).exportRecorders[0].stop())
      await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('stopped early')
    }
    await expect(page.locator('.video-renderer')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Download Video', exact: true })).toBeEnabled()
    expect(await page.evaluate(() => (window as unknown as { exportTracks: MediaStreamTrack[] }).exportTracks.every(track => track.readyState === 'ended'))).toBe(true)
    if (interruption === 'hidden') {
      await page.evaluate(() => {
        Object.defineProperty(document, 'hidden', { configurable: true, value: false })
        document.dispatchEvent(new Event('visibilitychange'))
      })
    }
    await startExport(page, '10')
    await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('Recording video')
    await page.getByRole('button', { name: 'Cancel video export' }).click()
    expect(downloads).toEqual([])
  })
}

for (const unavailable of ['recorder', 'canvas capture', 'encoder']) {
  test(`missing ${unavailable} gives useful feedback without disabling JSON export`, async ({ page }) => {
    await page.addInitScript(mode => {
      if (mode === 'recorder') Object.defineProperty(window, 'MediaRecorder', { value: undefined })
      else if (mode === 'canvas capture') Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', { value: undefined })
      else MediaRecorder.isTypeSupported = () => false
    }, unavailable)
    await page.goto('/')
    await page.getByRole('button', { name: 'Download Video', exact: true }).click()
    await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText(/unavailable|no supported video encoder/)
    await expect(page.locator('.video-renderer')).toHaveCount(0)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Download JSON', exact: true }).click()
    expect((await download).suggestedFilename()).toBe('abyss-blue.json')
  })
}

test('recorder startup failure stops the captured tracks', async ({ page }) => {
  await trackCapture(page)
  await page.addInitScript(() => { MediaRecorder.prototype.start = () => { throw new Error('Encoder could not start') } })
  await page.goto('/')
  await startExport(page)
  await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('Encoder could not start')
  await expect(page.locator('.video-renderer')).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { exportTracks: MediaStreamTrack[] }).exportTracks.every(track => track.readyState === 'ended'))).toBe(true)
})

test('all three export buttons fit in the panel on narrow and desktop screens', async ({ page }) => {
  await page.goto('/')
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    const panel = await page.getByRole('complementary').boundingBox()
    for (const name of ['Copy JSON', 'Download JSON', 'Download Video']) {
      const button = page.getByRole('button', { name, exact: true })
      await expect(button).toBeInViewport()
      const bounds = await button.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(panel!.x)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(panel!.x + panel!.width)
    }
    expect(await page.getByRole('complementary').evaluate(panel => panel.scrollWidth <= panel.clientWidth)).toBe(true)
  }
})

test('duration dialog waits for confirmation and rejects invalid lengths', async ({ page }) => {
  await trackCapture(page)
  await page.goto('/')
  const button = page.getByRole('button', { name: 'Download Video', exact: true })
  await button.click()
  const dialog = page.getByRole('dialog', { name: 'Download video' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Duration (seconds)')).toHaveValue('10')
  await expect(dialog.getByRole('combobox', { name: 'Format', exact: true })).toHaveValue('mp4')
  await expect(dialog.getByRole('combobox', { name: 'Resolution', exact: true })).toHaveValue('1080p')
  await expect(dialog.getByRole('combobox', { name: 'Ratio', exact: true })).toHaveValue('16:9')
  await expect(dialog.getByRole('combobox', { name: 'FPS', exact: true })).toHaveValue('30')
  await expect(page.locator('.video-renderer')).toHaveCount(0)
  for (const value of ['', '0', '121', '1.5']) {
    await dialog.getByLabel('Duration (seconds)').fill(value)
    await dialog.getByRole('button', { name: 'Start recording' }).click()
    await expect(dialog).toBeVisible()
    await expect(page.locator('.video-renderer')).toHaveCount(0)
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(dialog).not.toBeVisible()
  await expect(button).toBeFocused()
  await button.click()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  expect(await page.evaluate(() => (window as unknown as { exportTracks: MediaStreamTrack[] }).exportTracks.length)).toBe(0)
})

for (const settings of [
  { format: 'mp4', resolution: '720p', ratio: '16:9', fps: '60', width: 1280, height: 720 },
  { format: 'webm', resolution: '720p', ratio: '9:16', fps: '60', width: 720, height: 1280 },
  { format: 'webm', resolution: '1080p', ratio: '9:16', fps: '30', width: 1080, height: 1920 },
]) {
  test(`${settings.format} exports ${settings.width}×${settings.height} with a ${settings.fps} fps capture target`, async ({ page }) => {
    await trackCapture(page)
    await page.goto('/')
    test.skip(!await page.evaluate(format => MediaRecorder.isTypeSupported(`video/${format}`), settings.format), 'Selected format is unavailable in this browser')
    await page.getByRole('button', { name: 'Download Video', exact: true }).click()
    await page.getByLabel('Duration (seconds)').fill('2')
    await page.getByRole('combobox', { name: 'Format', exact: true }).selectOption(settings.format)
    await page.getByRole('combobox', { name: 'Resolution', exact: true }).selectOption(settings.resolution)
    await page.getByRole('combobox', { name: 'Ratio', exact: true }).selectOption(settings.ratio)
    await page.getByRole('combobox', { name: 'FPS', exact: true }).selectOption(settings.fps)
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Start recording' }).click()
    await expect(page.getByRole('status', { name: 'Video recording status' })).toContainText('Recording video')
    expect(await page.evaluate(() => (window as unknown as { exportFrameRates: number[] }).exportFrameRates)).toEqual([Number(settings.fps)])
    const download = await downloadPromise
    expect(download.suggestedFilename()).toBe(`abyss-blue-${settings.resolution}.${settings.format}`)
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk))
    const dimensions = await page.evaluate(async ({ data, format }) => {
      const video = document.createElement('video')
      const url = URL.createObjectURL(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: `video/${format}` }))
      try {
        await new Promise<void>((resolve, reject) => {
          video.onloadeddata = () => resolve()
          video.onerror = () => reject(new Error('Video could not be decoded'))
          video.src = url
        })
        return [video.videoWidth, video.videoHeight]
      } finally {
        video.removeAttribute('src')
        video.load()
        URL.revokeObjectURL(url)
      }
    }, { data: Buffer.concat(chunks).toString('base64'), format: settings.format })
    expect(dimensions).toEqual([settings.width, settings.height])
  })
}
