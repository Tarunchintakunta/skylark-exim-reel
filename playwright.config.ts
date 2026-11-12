import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: 'tests',
  timeout: 120_000,
  reporter: [['list']],
  use: {
    // BASE_URL=<deployed preview> runs the suite against Vercel instead of the local vite preview
    baseURL: process.env.BASE_URL ?? 'http://localhost:4173',
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    // GPU=1: new headless Chromium on the real GPU (macOS Metal). Default headless uses SwiftShader, whose
    // WebGL readback shows up as long tasks that real browsers don't have. CI has no GPU either way.
    ...(process.env.GPU ? { channel: 'chromium', launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } } : {}),
  },
  webServer: process.env.BASE_URL ? undefined : { command: 'npm run preview', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 60_000 },
})
