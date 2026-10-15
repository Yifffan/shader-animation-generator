import { defineConfig } from 'vite'
import { readFileSync } from 'node:fs'

export default defineConfig({
  base: './',
  plugins: [{
    name: 'include-release-licenses',
    apply: 'build',
    generateBundle() {
      for (const fileName of ['LICENSE', 'NOTICE']) {
        this.emitFile({ type: 'asset', fileName, source: readFileSync(new URL(fileName, import.meta.url), 'utf8') })
      }
    },
  }],
  server: { port: 5173, strictPort: true },
  preview: { port: 4173, strictPort: true },
})
