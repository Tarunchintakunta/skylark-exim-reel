import { Timer } from 'three'

/**
 * THREE.Clock's interface on top of THREE.Timer (PR #324 audit, item 8): three r183 deprecated Clock and warns on every
 * `new Clock()`, which @react-three/fiber 9 still does for its store. vite.config.ts swaps r3f's clock for this one at build
 * time. r3f reads elapsedTime and getDelta(), and writes elapsedTime / oldTime itself under frameloop 'never'.
 */
export class TimerClock {
  autoStart: boolean
  startTime = 0
  oldTime = 0
  elapsedTime = 0
  running = false
  private timer = new Timer()

  constructor(autoStart = true) {
    this.autoStart = autoStart
  }

  start() {
    this.timer.reset()
    this.startTime = this.oldTime = performance.now()
    this.elapsedTime = 0
    this.running = true
  }

  stop() {
    this.getElapsedTime()
    this.running = false
    this.autoStart = false
  }

  getElapsedTime() {
    this.getDelta()
    return this.elapsedTime
  }

  getDelta() {
    if (this.autoStart && !this.running) {
      this.start()
      return 0
    }
    if (!this.running) return 0
    this.timer.update()
    const dt = this.timer.getDelta()
    this.oldTime = performance.now()
    this.elapsedTime += dt
    return dt
  }
}
