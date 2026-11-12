import { Line } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Suspense, use, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { ACESFilmicToneMapping, AdditiveBlending, BackSide, Color, Group, MathUtils, Quaternion, SRGBColorSpace, Texture, Vector2, Vector3, type Mesh, type Object3D } from 'three'
import type { Line2 } from 'three-stdlib'
import { MARKET_COORDS, MARKET_COUNT, MARKETS_BY_REGION, ORIGIN } from '../config/markets'
import { env } from '../engine/env'
import { frame } from '../engine/store'
import { onTick, startClock } from '../engine/ticker'
import { faceRotation, latLon, routePoints, toLatLon } from './geo'
import { calm } from './calm'
import { earthBitmap, globeUi, type GlobeKind } from './globeState'

/** the world card's thin-line globe (#269): brass arcs and origin, ice market dots (tokens.css --brass, --ice) */
const BRASS = new Color('#e08a5f')
const ICE = new Color('#f6f2ea')
const N = 64 // points per route
const Z = new Vector3(0, 0, 1)
/** texture pixels uploaded per idle slice (2 MB): more in one frame stalls the GPU process (~20–30 ms on Metal) */
const STRIP_PX = 1 << 19
const FOV = 35
const TAN = Math.tan(MathUtils.degToRad(FOV / 2))
const ease = (t: number) => t * t * (3 - 2 * t)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
/** the fixed header (.topbar height); label lift above a dot, gap between labels, margin to the viewport edge (px) */
const HEADER = 68
const LIFT = 8
const GAP = 6
const EDGE = 8
/** at most this many labels on screen, the origin's included */
const MAX_LABELS = 4
/** a pointer within this many px of a dot reveals its label */
const HIT = 22
/** route widths in px (resting, highlighted) and opacities (resting, highlighted, dimmed) */
const LINE_W = env.mobile ? 1 : 1.25
const LINE_HL = 2
const OP = 0.75
const OP_HL = 0.95
const OP_DIM = 0.2
/** routes draw one by one between these scroll progresses of the world chapter */
const DRAW = [0.2, 0.8]

/** Settled view: centred between Algeria and Japan so every market faces the camera; the idle tour sways ±SWAY° around it. */
const C_LON = 70
const C_LAT = 24
const SWAY = 18
/** idle tour: one region at a time (≤3 markets, the origin label is the 4th), the globe easing toward it */
const SPOTS = MARKETS_BY_REGION.flatMap(({ markets }) => {
  const out: number[][] = []
  for (let i = 0; i < markets.length; i += MAX_LABELS - 1) out.push(markets.slice(i, i + MAX_LABELS - 1))
  return out
})
const toSway = (lon: number) => Math.min(SWAY, Math.max(-SWAY, lon - C_LON))
const SPOT_SWAY = SPOTS.map((ids) => toSway(ids.reduce((s, i) => s + MARKET_COORDS[i].lon, 0) / ids.length))
const DWELL = 3.2
/** user rotation (#198): max tilt from the scroll view (deg), idle seconds before easing home, inertia/ease/home rates (1/s) */
const TILT = 25
const IDLE = 3
const FRICTION = 4
const SEEK = 4
const HOME = 1.2
/** wraps a longitude difference into −180..180 */
const wrapLon = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180
const clampTilt = (t: number) => Math.min(TILT, Math.max(-TILT, t))

const atmosphere = {
  uniforms: { color: { value: new Color('#9fd3ff') } },
  vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  // a thin, faint rim. Seen from inside (BackSide), view-space n.z runs 0 at the shell's silhouette to about -0.22 at the
  // globe's edge (scale 1.025): fade alpha from 0 at the shell edge, so there is no hard, aliased step there
  fragmentShader: 'uniform vec3 color; varying vec3 vN; void main(){ float i = smoothstep(0.0, 0.22, -vN.z) * 0.35; gl_FragColor = vec4(color, i); }',
}
const haze = {
  uniforms: { color: { value: new Color('#cfe9ff') } },
  vertexShader: 'varying vec3 vN; void main(){ vN = normalize(normalMatrix * normal); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: 'uniform vec3 color; varying vec3 vN; void main(){ float i = pow(1.0 - max(dot(vN, vec3(0.0, 0.0, 1.0)), 0.0), 3.0); gl_FragColor = vec4(color * i * 0.35, 1.0); }',
}

export type GlobeLabels = { markets: (HTMLSpanElement | null)[]; origin: HTMLSpanElement | null }

/** decodes the earth texture ahead of the mount (#274): the one shared fetch and decode (globeState earthBitmap) */
export const preloadGlobe = (kind: GlobeKind) => earthBitmap(kind)

/**
 * Scroll-driven globe: camera pulls back from the sea off Visakhapatnam, routes draw one by one (STORY §11).
 * `worldIndex` is the world chapter in the film; -1 is the standalone globe (homepage Markets, in a [data-globe] box):
 * no film, always live while on screen, and it opens on the settled full view with every route drawn, the view its
 * poster shows (#274), so poster and live globe crossfade without a jump.
 */
function Earth({ worldIndex, labels, live, onWarm }: { worldIndex: number; labels: RefObject<GlobeLabels>; live: boolean; onWarm: () => void }) {
  const standalone = worldIndex < 0
  // homepage: 4096×2048 desktop, 2048×1024 phones; film: 2048×1024 (#274). An ImageBitmap is decoded off the main thread, so the upload below is a
  // copy, not a decode; it runs in an idle slice (below), mipmapped, with the GPU's full anisotropy for the limb.
  const bitmap = use(earthBitmap(standalone ? 'home' : 'film'))
  const { camera, invalidate, gl, scene, get } = useThree()
  const tex = useMemo(() => {
    // storage for the full mip chain, filled in idle slices (below)
    const t = new Texture({ width: bitmap.width, height: bitmap.height })
    const levels = Math.log2(Math.max(bitmap.width, bitmap.height)) + 1
    t.mipmaps = Array.from({ length: levels }, (_, i) => ({ width: Math.max(1, bitmap.width >> i), height: Math.max(1, bitmap.height >> i) })) as unknown as Texture['mipmaps']
    t.source.dataReady = false
    t.generateMipmaps = false
    t.flipY = false
    t.colorSpace = SRGBColorSpace
    t.anisotropy = gl.capabilities.getMaxAnisotropy()
    t.needsUpdate = true
    return t
  }, [bitmap, gl])
  const seg = env.mobile ? 64 : 128
  const group = useRef<Group>(null)
  const lines = useRef<(Line2 | null)[]>([])
  const dots = useRef<(Object3D | null)[]>([])
  const originDot = useRef<Mesh>(null)

  // the first frame with the earth drawn: a mark for tests/globe-load.spec.ts and the cue for the placeholder to fade
  const drawn = useRef(false)
  useFrame(() => {
    if (drawn.current) return
    drawn.current = true
    performance.mark('globe:first-frame')
    gl.domElement.closest('.stage__light, [data-globe]')?.classList.add('is-globe-live')
  })

  // pre-warm ahead of time, in idle slices: the texture's storage, its mip chain strip by strip (≤ 2 MB per slice: the
  // whole 4096 upload plus mipmap generation was one ~110 ms task, #274; the small levels share a slice), then the shader
  // compile; only then does the canvas render at all (frameloop 'never' until onWarm), so no frame uploads, compiles and
  // draws in one task
  useEffect(() => {
    let stop = false
    let budget = 0
    const slice = () => new Promise<void>((done) => ('requestIdleCallback' in window ? requestIdleCallback(() => done(), { timeout: 300 }) : setTimeout(done, 50)))
    // the homepage globe also waits for a still page (three/calm.ts); the film's globe keeps its own timing
    const idle = () => slice().then(standalone ? calm : undefined).then(() => void (budget = STRIP_PX))
    const at = new Vector2()
    void (async () => {
      await idle()
      if (stop) return
      gl.initTexture(tex)
      for (const [level, { width, height }] of tex.mipmaps.entries()) {
        // the smaller levels are resized off the main thread, at better quality than the GPU's box filter
        const img = level ? await createImageBitmap(bitmap, { resizeWidth: width, resizeHeight: height, resizeQuality: 'high' }) : bitmap
        const rows = Math.min(height, Math.max(1, STRIP_PX / width))
        for (let y = 0; y < height && !stop; y += rows) {
          const strip = rows < height ? await createImageBitmap(img, 0, y, width, Math.min(rows, height - y)) : img
          if (budget <= 0) await idle()
          budget -= strip.width * strip.height
          if (!stop) gl.copyTextureToTexture(new Texture(strip), tex, null, at.set(0, y), 0, level)
          if (strip !== bitmap) strip.close()
        }
        if (img !== bitmap) img.close()
        if (stop) return
      }
      await idle()
      // compileAsync uses KHR_parallel_shader_compile: no main-thread wait on link status
      if (!stop) await gl.compileAsync(scene, camera)
      await idle()
      if (!stop) onWarm()
    })()
    return () => void (stop = true)
  }, [gl, scene, camera, tex, bitmap, onWarm, standalone])
  useEffect(() => void (live && invalidate()), [live, invalidate])

  const origin = useMemo(() => latLon(ORIGIN.lat, ORIGIN.lon, 1.002), [])
  const routes = useMemo(
    () => MARKET_COORDS.map((m, j) => {
      const to = latLon(m.lat, m.lon, 1.002)
      // varied heights (a golden-ratio spread per market) so the routes don't bundle into one fan
      // face: the middle of the arc, which the globe turns to when this market is clicked (market and route in front)
      const q = new Quaternion().setFromUnitVectors(Z, to.clone().normalize())
      return { to, q, points: routePoints(origin, to, N, 0.12 + 0.26 * ((j * 0.618) % 1)), face: toLatLon(origin.clone().add(to)) }
    }),
    [origin],
  )

  useEffect(() => {
    const L = labels.current!
    const tmp = new Vector3()
    const camDir = new Vector3()
    const sizes = new Map<HTMLElement, [number, number]>()
    const shown = new Map<HTMLElement, string>()

    // pause when the world chapter is off-screen or the tab is hidden (frameloop="demand": no invalidate, no render)
    let onScreen = true
    const section = standalone ? gl.domElement.closest('[data-globe]') : document.querySelector('[data-chapter="world"]')
    const io = new IntersectionObserver(([e]) => void (onScreen = e.isIntersecting), { rootMargin: '50% 0px' })
    if (section) io.observe(section)

    // hover / tap on a dot: the stage takes no pointer events, so read the pointer on the window
    let px = -1e4
    let py = -1e4
    const onPointer = (e: PointerEvent) => {
      // the film's canvas fills the viewport; the standalone one sits in the page, so read the pointer in its own box
      const r = standalone ? wrap.getBoundingClientRect() : null
      px = e.clientX - (r?.left ?? 0)
      py = e.clientY - (r?.top ?? 0)
    }
    const onLeave = () => (px = py = -1e4)
    addEventListener('pointermove', onPointer, { passive: true })
    addEventListener('pointerdown', onPointer, { passive: true })
    document.documentElement.addEventListener('pointerleave', onLeave)

    // layout in px (globe radius and centre), from the market caption's box: on resize and once a second
    let dirty = true
    let sinceMeasure = 0
    const onResize = () => (dirty = true)
    addEventListener('resize', onResize)
    const lay = { r: 0, cx: 0, cy: 0 }
    const top = standalone ? 0 : HEADER
    const measure = (vw: number, vh: number) => {
      if (standalone) {
        lay.r = Math.min(vw, vh) * 0.4
        lay.cx = vw / 2
        lay.cy = vh / 2
        return
      }
      const cap = section?.querySelector('.caption--markets')?.getBoundingClientRect()
      if (!cap?.height) return
      if (env.mobile) {
        // phones: the globe sits above the market list
        lay.r = Math.max(24, Math.min(vw * 0.4, (cap.top - HEADER) / 2 - 10))
        lay.cx = vw / 2
        lay.cy = (HEADER + cap.top) / 2
      } else {
        // right of the copy, its vertical centre on the headline block's
        const room = vw - cap.right
        lay.r = Math.min(room * 0.4, (vh - HEADER) * 0.36)
        lay.cx = cap.right + room / 2
        lay.cy = Math.min(Math.max(cap.top + cap.height / 2, HEADER + lay.r + 12), vh - lay.r - 12)
      }
    }

    /** places a label centred over (x, y): above it, else below it, else not at all (overlap) */
    const place = (label: HTMLElement, x: number, y: number, boxes: number[][], vw: number, vh: number) => {
      let s = sizes.get(label)
      if (!s) sizes.set(label, (s = [label.offsetWidth, label.offsetHeight]))
      const [w, h] = s
      const l = Math.min(Math.max(x - w / 2, EDGE), vw - EDGE - w)
      const free = (t: number) => !boxes.some(([bl, bt, br, bb]) => l < br + GAP && l + w > bl - GAP && t < bb + GAP && t + h > bt - GAP)
      const t = [y - LIFT - h, y + LIFT].map((t) => Math.min(Math.max(t, top + EDGE), vh - EDGE - h)).find(free)
      if (t === undefined) return false
      boxes.push([l, t, l + w, t + h])
      const tf = `translate(${Math.round(l)}px, ${Math.round(t)}px)`
      if (shown.get(label) !== tf) {
        label.style.transform = tf
        shown.set(label, tf)
      }
      return true
    }
    const setOpacity = (label: HTMLElement | null, on: boolean) => {
      const o = on ? '1' : '0'
      if (label && label.style.opacity !== o) label.style.opacity = o
    }

    // drag / keys / market clicks (#198): an offset on top of the scroll view (lat, lon in degrees), with inertia; after
    // IDLE seconds without input it eases home and the idle tour resumes. Wheel is never handled: it scrolls the page.
    const wrap = gl.domElement.closest<HTMLElement>('.globe-canvas')!
    const user = { lat: 0, lon: 0 }
    const vel = { lat: 0, lon: 0 }
    let now = 0
    let idleAt = -Infinity
    let lastClick = -1
    let drag: { id: number; x: number; y: number; t: number; live: boolean } | null = null
    const interact = () => void (idleAt = now)
    const turn = (dLat: number, dLon: number) => {
      user.lat = clampTilt(user.lat + dLat)
      user.lon += dLon
    }
    const down = (e: PointerEvent) => {
      if (e.button !== 0) return
      // touch: wait to see the gesture; mouse/pen: grab at once
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, t: e.timeStamp, live: e.pointerType !== 'touch' }
      if (drag.live) grab(e)
    }
    const grab = (e: PointerEvent) => {
      wrap.setPointerCapture(e.pointerId)
      wrap.classList.add('is-grabbing')
      vel.lat = vel.lon = 0
      globeUi.focus = lastClick = -1
      interact()
      if (!globeUi.explored) {
        globeUi.explored = true
        wrap.parentElement?.querySelector('.globe-hint')?.classList.add('is-gone')
      }
    }
    const move = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      const dx = e.clientX - drag.x
      const dy = e.clientY - drag.y
      if (!drag.live) {
        // touch-action: pan-y hands vertical swipes to the page (pointercancel); only a mostly-horizontal drag turns
        if (Math.hypot(dx, dy) < 6) return
        if (Math.abs(dx) <= Math.abs(dy)) return void (drag = null)
        drag.live = true
        grab(e)
      }
      // ≈ 180° across the globe's on-screen diameter
      const k = 180 / (2 * (lay.r || wrap.clientHeight / 2.5))
      const dt = Math.max(e.timeStamp - drag.t, 8) / 1000
      turn(dy * k, -dx * k)
      vel.lat = lerp(vel.lat, (dy * k) / dt, 0.5)
      vel.lon = lerp(vel.lon, (-dx * k) / dt, 0.5)
      Object.assign(drag, { x: e.clientX, y: e.clientY, t: e.timeStamp })
      interact()
    }
    const up = (e: PointerEvent) => {
      if (!drag || e.pointerId !== drag.id) return
      // a pause before letting go means no fling
      if (env.reduced || e.timeStamp - drag.t > 80) vel.lat = vel.lon = 0
      drag = null
      wrap.classList.remove('is-grabbing')
      interact()
    }
    const key = (e: KeyboardEvent) => {
      const d = { ArrowLeft: [0, -15], ArrowRight: [0, 15], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key]
      if (!d) return
      e.preventDefault()
      globeUi.focus = lastClick = -1
      interact()
      // instant under reduced motion; otherwise an inertia kick that glides the same distance
      if (env.reduced) turn(d[0], d[1])
      else {
        vel.lat = d[0] * FRICTION
        vel.lon = d[1] * FRICTION
      }
    }
    wrap.addEventListener('pointerdown', down)
    wrap.addEventListener('pointermove', move)
    wrap.addEventListener('pointerup', up)
    wrap.addEventListener('pointercancel', up)
    wrap.addEventListener('keydown', key)

    let last = -1
    let clock = 0
    let sway = 0
    let lastFocus = -2
    const screen: [number, number, boolean][] = routes.map(() => [0, 0, false])
    const placed = new Set<HTMLElement>()

    const off = onTick((time) => {
      const dt = last < 0 ? 0 : Math.min(0.05, time - last)
      last = now = time
      const i = standalone ? worldIndex : frame.index
      const past = !standalone && frame.past
      // only the world chapter takes pointer and keyboard input; the layer is invisible before it
      const live = i === worldIndex && !past
      if (wrap.tabIndex !== (live ? 0 : -1)) {
        wrap.tabIndex = live ? 0 : -1
        wrap.style.pointerEvents = live ? 'auto' : 'none'
      }
      const nearWorld = i === worldIndex || (i === worldIndex - 1 && frame.local > 0.8)
      if (!nearWorld || past) {
        user.lat = user.lon = vel.lat = vel.lon = 0
        globeUi.focus = lastClick = -1
      }
      if (!nearWorld || past || !onScreen || document.hidden || !group.current) return
      const g = group.current
      const p = standalone ? 1 : i === worldIndex ? frame.local : 0
      const { width: vw, height: vh } = get().size
      if (dirty || (sinceMeasure += dt) > 1) {
        measure(vw, vh)
        dirty = false
        sinceMeasure = 0
      }
      if (!lay.r) {
        lay.r = Math.min(vw, vh) * 0.3
        lay.cx = vw / 2
        lay.cy = vh / 2
      }

      // camera: close over the sea off Visakhapatnam → the full globe at its laid-out size and place
      // phones: the list shows from 0.08 of the chapter (chapters.ts), so the globe is at its laid-out size by then and
      // never sits over the list
      const k = ease(clamp01(p / (env.mobile ? 0.08 : 0.5)))
      const dEnd = Math.sqrt(1 + (vh / (2 * TAN * lay.r)) ** 2)
      const d = lerp(1.45, dEnd, k)
      camera.position.set(0, 0, d)
      camera.lookAt(0, 0, 0)
      const unit = (2 * d * TAN) / vh // world units per px at the globe's depth
      g.position.x = lerp(0, (lay.cx - vw / 2) * unit, k)
      g.position.y = lerp(0, (vh / 2 - lay.cy) * unit, k)
      const s = d / 4
      originDot.current?.scale.setScalar(s)

      // focus: a hovered list item, else a hovered/tapped dot (found below, from last frame's screen positions)
      let focus = globeUi.highlight >= 0 ? globeUi.highlight : globeUi.focus
      if (focus < 0 && px > -1e3 && !drag?.live) {
        let best = HIT * HIT
        screen.forEach(([x, y, vis], j) => {
          const dd = (x - px) ** 2 + (y - py) ** 2
          if (vis && dd < best) {
            best = dd
            focus = j
          }
        })
      }

      // rotation: Visakhapatnam → the settled view, then (motion allowed) the idle tour eases toward each region
      const settled = p > DRAW[1]
      // user input (#198): a clicked market turns to face the camera and holds while it stays highlighted; a drag or
      // fling moves the offset; after IDLE seconds it eases home and the tour resumes
      const clicked = globeUi.focus
      if (clicked !== lastClick) {
        lastClick = clicked
        if (clicked >= 0) {
          interact()
          vel.lat = vel.lon = 0
        }
      }
      if (clicked >= 0 && globeUi.highlight === clicked) idleAt = time
      const idle = time - idleAt > IDLE
      if (clicked >= 0 && idle) globeUi.focus = lastClick = -1
      if (settled && idle) clock += dt
      const spot = SPOTS[Math.floor(clock / DWELL) % SPOTS.length]
      if (!env.reduced && idle) {
        const target = focus >= 0 ? toSway(MARKET_COORDS[focus].lon) : settled ? SPOT_SWAY[SPOTS.indexOf(spot)] : 0
        sway += (target - sway) * (1 - Math.exp(-dt * 0.9))
      }
      const baseLon = lerp(ORIGIN.lon + 4, C_LON, ease(clamp01(p / 0.6))) + sway
      const baseLat = lerp(15, C_LAT, k)
      if (drag?.live) {
        // the pointer moves the globe directly
      } else if (globeUi.focus >= 0) {
        const [fLat, fLon] = routes[globeUi.focus].face
        const tLat = clampTilt(fLat - baseLat)
        const tLon = user.lon + wrapLon(fLon - baseLon - user.lon)
        const a = env.reduced ? 1 : 1 - Math.exp(-dt * SEEK)
        user.lat += (tLat - user.lat) * a
        user.lon += (tLon - user.lon) * a
      } else if (idle) {
        user.lon = wrapLon(user.lon)
        const a = env.reduced ? 1 : 1 - Math.exp(-dt * HOME)
        user.lat -= user.lat * a
        user.lon -= user.lon * a
        if (Math.abs(user.lat) + Math.abs(user.lon) < 0.05) user.lat = user.lon = 0
      } else {
        turn(vel.lat * dt, vel.lon * dt)
        const a = Math.exp(-dt * FRICTION)
        vel.lat *= a
        vel.lon *= a
      }
      const [rx, ry] = faceRotation(baseLat + user.lat, baseLon + user.lon)
      g.rotation.set(rx, ry, 0, 'XYZ')
      g.updateMatrixWorld()
      camera.updateMatrixWorld()
      camDir.copy(camera.position).normalize()

      // routes draw one by one; dots appear as each lands
      const w = (DRAW[1] - DRAW[0]) / routes.length
      routes.forEach((r, j) => {
        const a = clamp01((p - DRAW[0] - j * w) / (w * 1.6))
        const line = lines.current[j]
        if (line) {
          line.geometry.instanceCount = Math.round(a * (N - 1))
          if (focus !== lastFocus) {
            line.material.opacity = focus < 0 ? OP : focus === j ? OP_HL : OP_DIM
            line.material.linewidth = focus === j ? LINE_HL : LINE_W
          }
        }
        const landed = a >= 1
        dots.current[j]?.scale.setScalar(landed ? s : 0)
        tmp.copy(r.to).applyMatrix4(g.matrixWorld).sub(g.position)
        const facing = tmp.dot(camDir) > 0.2
        tmp.copy(r.to).applyMatrix4(g.matrixWorld).project(camera)
        const sc = screen[j]
        sc[0] = ((tmp.x + 1) / 2) * vw
        sc[1] = ((1 - tmp.y) / 2) * vh
        sc[2] = landed && facing
      })
      lastFocus = focus

      // labels in screen space: the origin, then the focus (or the tour's region), ≤ MAX_LABELS, never overlapping
      const boxes: number[][] = []
      placed.clear()
      tmp.copy(origin).applyMatrix4(g.matrixWorld).project(camera)
      if (k > 0.6 && L.origin && place(L.origin, ((tmp.x + 1) / 2) * vw, ((1 - tmp.y) / 2) * vh, boxes, vw, vh)) placed.add(L.origin)
      const want = focus >= 0 ? [focus] : settled && idle ? spot : []
      for (const j of want) {
        const label = L.markets[j]
        if (placed.size >= MAX_LABELS || !label || !screen[j][2]) continue
        if (place(label, screen[j][0], screen[j][1], boxes, vw, vh)) placed.add(label)
      }
      setOpacity(L.origin, placed.has(L.origin!))
      L.markets.forEach((label) => setOpacity(label, placed.has(label!)))
      invalidate()
    })

    return () => {
      off()
      io.disconnect()
      wrap.removeEventListener('pointerdown', down)
      wrap.removeEventListener('pointermove', move)
      wrap.removeEventListener('pointerup', up)
      wrap.removeEventListener('pointercancel', up)
      wrap.removeEventListener('keydown', key)
      removeEventListener('pointermove', onPointer)
      removeEventListener('pointerdown', onPointer)
      document.documentElement.removeEventListener('pointerleave', onLeave)
      removeEventListener('resize', onResize)
    }
  }, [camera, get, gl, invalidate, labels, origin, routes, worldIndex, standalone])

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[1, seg, seg / 2]} />
        {/* emissive copy of the albedo lifts the dark Blue Marble oceans: the globe must read bright daytime */}
        <meshStandardMaterial map={tex} roughness={0.85} metalness={0} emissive="#ffffff" emissiveMap={tex} emissiveIntensity={0.25} />
      </mesh>
      <mesh scale={1.001}>
        <sphereGeometry args={[1, seg, seg / 2]} />
        <shaderMaterial args={[haze]} blending={AdditiveBlending} transparent depthWrite={false} />
      </mesh>
      <mesh scale={1.025}>
        <sphereGeometry args={[1, 64, 32]} />
        <shaderMaterial args={[atmosphere]} side={BackSide} transparent depthWrite={false} />
      </mesh>
      {/* origin pin: brass, a touch larger than the market dots */}
      <mesh position={origin} ref={originDot}>
        <sphereGeometry args={[0.016, 12, 8]} />
        <meshBasicMaterial color={BRASS} toneMapped={false} />
      </mesh>
      {routes.map((r, j) => (
        <group key={MARKET_COORDS[j].name}>
          <Line
            ref={(l) => {
              lines.current[j] = l as unknown as Line2 | null
              if (l) (l as unknown as Line2).geometry.instanceCount = 0
            }}
            points={r.points}
            color={BRASS}
            lineWidth={LINE_W}
            opacity={OP}
            transparent
            depthWrite={false}
          />
          {/* an ice dot on a brass disc lying on the surface, legible on sea and sand */}
          <group position={r.to} quaternion={r.q} scale={0} ref={(g) => void (dots.current[j] = g)}>
            <mesh>
              <circleGeometry args={[0.013, 24]} />
              <meshBasicMaterial color={BRASS} toneMapped={false} />
            </mesh>
            <mesh>
              <sphereGeometry args={[0.008, 12, 8]} />
              <meshBasicMaterial color={ICE} toneMapped={false} />
            </mesh>
          </group>
        </group>
      ))}
    </group>
  )
}

/** `worldIndex`: the world chapter's index in the film, or -1 for the standalone globe (see Earth). */
export default function GlobeCanvas({ worldIndex }: { worldIndex: number }) {
  // the film starts the engine; a page without the film still needs the clock that drives Earth's tick
  useEffect(() => void (worldIndex < 0 && startClock()), [worldIndex])
  const labels = useRef<GlobeLabels>({ markets: [], origin: null })
  const [live, setLive] = useState(false)
  const warm = useMemo(() => () => setLive(true), [])
  return (
    <>
      <Canvas
        className="globe-canvas"
        role="application"
        aria-roledescription="globe"
        aria-label={`Globe of the ${MARKET_COUNT} export markets. Drag or use the arrow keys to turn it.`}
        tabIndex={-1}
        style={{ pointerEvents: 'none' }}
        // capped at 2× (#274): sharp on retina screens; one sphere and a few lines, so the fill rate holds on phones
        dpr={[1, 2]}
        frameloop={live ? 'demand' : 'never'}
        // no scroll tracking (#274): react-use-measure debounces the canvas's first measure on every scroll event, so
        // under a smooth scroll the scene never mounted until the page stopped; the globe reads its own box for input
        resize={{ scroll: worldIndex >= 0 }}
        gl={{ antialias: false, alpha: true, powerPreference: 'high-performance' }}
        camera={{ fov: FOV, near: 0.01, far: 20, position: [0, 0, 3.2] }}
        onCreated={({ gl }) => {
          gl.toneMapping = ACESFilmicToneMapping
          gl.toneMappingExposure = 1.1
        }}
      >
        <ambientLight intensity={0.9} />
        <hemisphereLight args={['#ffffff', '#cfe3ea', 0.8]} />
        <directionalLight position={[-3, 2, 3]} intensity={2.5} />
        <Suspense fallback={null}>
          <Earth worldIndex={worldIndex} labels={labels} live={live} onWarm={warm} />
        </Suspense>
      </Canvas>
      {/* positioned per frame by Earth; decorative (the stage is aria-hidden), the market list is the real text */}
      <p className={`globe-hint mono${globeUi.explored ? ' is-gone' : ''}`} aria-hidden="true">
        Drag to explore
      </p>
      <div className="globe-labels" aria-hidden="true">
        <span className="globe-label globe-label--origin mono" ref={(s) => void (labels.current.origin = s)}>
          {ORIGIN.name}
        </span>
        {MARKET_COORDS.map((m, j) => (
          <span key={m.name} className="globe-label mono" ref={(s) => void (labels.current.markets[j] = s)}>
            {m.name}
          </span>
        ))}
      </div>
    </>
  )
}
