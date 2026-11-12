import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'
import { clipManifest } from './scripts/clip-manifest.ts'
import { staticHero } from './scripts/static-hero.ts'

/** /story, /quote and /news are their own HTML entries; /order is the standalone public/order.html: only /story boots the film; /products, /about, /contact redirect to their homepage section. */
function documentRoutes(): Plugin {
  const rewrite = (req: Connect.IncomingMessage) => {
    const raw = req.url ?? '/'
    const cut = raw.search(/[?#]/)
    const path = (cut === -1 ? raw : raw.slice(0, cut)).replace(/\/+$/, '') || '/'
    const tail = cut === -1 ? '' : raw.slice(cut)
    let file: string | null = null
    if (path === '/story') file = '/story.html'
    else if (path === '/quote') file = '/quote.html'
    else if (path === '/order') file = '/order.html'
    else if (path === '/news' || path.startsWith('/news/')) file = '/news.html'
    if (file) req.url = file + tail
  }
  // Register inside the hook so this runs before Vite's htmlFallback.
  const attach = (server: { middlewares: Connect.Server }) => {
    server.middlewares.use((req, res, next) => {
      // /products, /about, /contact (and .html): no page of their own, land on the homepage section, like vercel.json
      const section = /^\/(products|about|contact)(?:\.html)?\/?(?:\?|$)/.exec(req.url ?? '')?.[1]
      if (section) return res.writeHead(307, { Location: `/#${section}` }).end()
      rewrite(req)
      next()
    })
  }
  return {
    name: 'document-routes',
    configureServer: attach,
    configurePreviewServer: attach,
  }
}

/** public/order.html is copied as is: write VITE_ORDER_WEBHOOK_URL into it after the build (empty → no webhook). */
function orderWebhook(): Plugin {
  return {
    name: 'order-webhook',
    apply: 'build',
    closeBundle() {
      const file = resolve(import.meta.dirname, 'dist/order.html')
      const url = loadEnv('production', import.meta.dirname, 'VITE_').VITE_ORDER_WEBHOOK_URL ?? ''
      if (existsSync(file)) writeFileSync(file, readFileSync(file, 'utf8').replace('__ORDER_WEBHOOK_URL__', url))
    },
  }
}

/** @react-three/fiber 9 builds its store with `new THREE.Clock()`, deprecated in three r183 (a warning per canvas): swap in the Timer-backed TimerClock (src/three/timerClock.ts). Build only; dev serves r3f prebundled. */
function r3fTimer(): Plugin {
  const clock = resolve(import.meta.dirname, 'src/three/timerClock.ts')
  return {
    name: 'r3f-timer',
    apply: 'build',
    transform(code, id) {
      if (!id.includes('@react-three/fiber/dist/') || !code.includes('new THREE.Clock()')) return null
      return `import { TimerClock as __TimerClock } from ${JSON.stringify(clock)};\n${code.replaceAll('new THREE.Clock()', 'new __TimerClock()')}`
    },
  }
}

// Three builds, so no page shares a chunk: a shared chunk adds a request before the hero paints (LCP budget).
// '' → the homepage (and it empties dist), 'story' → the film, 'documents' → /quote and /news.
const entries = process.env.BUILD_ENTRIES ?? ''
const page = (name: string) => resolve(import.meta.dirname, name)
const INPUTS: Record<string, Record<string, string>> = {
  '': { main: page('index.html') },
  story: { story: page('story.html') },
  documents: { quote: page('quote.html'), news: page('news.html') },
}

export default defineConfig({
  plugins: [clipManifest(), documentRoutes(), react(), r3fTimer(), staticHero(), orderWebhook()],
  build: {
    target: 'es2022',
    // three.js (lazy, the globe) and the homepage entry run past 500 kB on purpose: one request before the hero (LCP)
    chunkSizeWarningLimit: 800,
    // the later builds add their pages and must not wipe the homepage
    emptyOutDir: !entries,
    rolldownOptions: {
      input: INPUTS[entries],
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: 'three', test: /node_modules[\\/]three[\\/]/ },
            { name: 'r3f', test: /node_modules[\\/]@react-three[\\/]|src[\\/]three[\\/]timerClock/ },
          ],
        },
      },
    },
  },
})
