import { defineConfig, devices } from '@playwright/test'

// Load .env for local runs (Clerk secrets for the test harness). In CI the
// workflow sets these in the environment directly.
try {
  process.loadEnvFile?.('.env')
} catch {
  // .env is optional (CI provides env vars)
}

const PORT = 3000
const BASE_URL = `http://localhost:${PORT}`

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  // Tests share one dev DB and depend on ordered setup (users, wallets) —
  // run serially.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure'
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // CI builds first and serves the production build; local runs use dev.
    command: process.env.CI ? 'npm run start' : 'npm run dev',
    url: `${BASE_URL}/api/v1/tasklists/public`,
    reuseExistingServer: !process.env.CI,
    timeout: 240_000
  }
})
