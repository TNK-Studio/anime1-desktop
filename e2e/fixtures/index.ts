/**
 * Playwright Electron 测试 Fixtures
 *
 * 提供 Electron 应用测试的基础 fixture
 * worker 级别：同一个测试文件中的所有测试共享一个 Electron 实例
 */
import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 测试数据目录
const TEST_DATA_DIR = resolve(__dirname, '../../test-data/e2e')

// Electron Fixture 类型
type ElectronFixtures = {
  electronApp: ElectronApplication
  window: Page
  testData: {
    dir: string
    cleanup: () => Promise<void>
  }
}

// 缓存的窗口
let cachedWindow: Page | null = null

/**
 * 检查是否有构建好的前端文件
 */
function hasFrontendBuild(): boolean {
  return existsSync(resolve(__dirname, '../../dist/index.html'))
}

/**
 * 扩展的 test fixture
 */
export const test = base.extend<ElectronFixtures>({
  // Electron 应用 - WORKER 级别，整个测试文件共享一个实例
  electronApp: [async ({}, use) => {
    console.log('🚀 [E2E] ===== 启动 Electron 应用（整个测试文件共享） =====')
    const { _electron: electron } = await import('@playwright/test')

    const mainPath = resolve(__dirname, '../../dist-electron/main/index.js')
    console.log('📂 [E2E] 主进程路径:', mainPath)
    console.log('📁 [E2E] 测试数据目录:', TEST_DATA_DIR)
    console.log('✅ [E2E] 前端构建存在:', hasFrontendBuild())

    const env: Record<string, string> = {
      ...process.env as Record<string, string>,
      NODE_ENV: 'test',
      E2E_TEST: 'true',
      APP_DATA_DIR: TEST_DATA_DIR,
      DISABLE_UPDATE_CHECK: 'true',
    }

    if (hasFrontendBuild()) {
      console.log('🎬 [E2E] 使用生产模式（已构建前端）')
      env.NODE_ENV = 'production'
      env.VITE_DEV_SERVER_URL = ''
    } else {
      console.log('⚠️  [E2E] 警告: 未找到前端构建')
    }

    const electronApp = await electron.launch({
      headless: true,
      args: [mainPath, '--no-sandbox'],
      cwd: resolve(__dirname, '../..'),
      env,
      timeout: 60000,
    })

    console.log('✅ [E2E] Electron 应用已启动（将用于本文件所有测试）')

    // 监听控制台
    electronApp.on('console', (msg) => {
      const text = msg.text()
      const type = msg.type()
      if (text.includes('[Preload]') ||
          text.includes('[Window]') ||
          text.includes('[Main]') ||
          text.includes('[AnimeService]') ||
          type === 'error' ||
          text.includes('error') ||
          text.includes('Error')) {
        console.log(`💻 [Electron ${type}]: ${text}`)
      }
    })

    // 监听窗口创建
    electronApp.on('window', (page) => {
      console.log(`🪟 [E2E] 新窗口创建: ${page.url()}`)
    })

    await use(electronApp)

    console.log('🔌 [E2E] ===== 关闭 Electron 应用 =====')
    await electronApp.close()
    console.log('✅ [E2E] Electron 应用已关闭')
    cachedWindow = null
  }, { scope: 'worker' }],

  // 窗口 - WORKER 级别，所有测试共享同一个窗口
  window: [async ({ electronApp }, use, testInfo) => {
    console.log(`🧪 [E2E] 测试: ${testInfo.title}`)

    // 如果窗口已缓存，直接复用
    if (cachedWindow) {
      console.log('♻️  [E2E] 复用已缓存的窗口')
      await use(cachedWindow)
      console.log(`✅ [E2E] 测试完成: ${testInfo.title}`)
      return
    }

    console.log('⏳ [E2E] 首次获取窗口...')
    const window = await electronApp.firstWindow()

    const url = window.url()
    console.log('📄 [E2E] 窗口 URL:', url)

    // 等待页面加载
    console.log('⏳ [E2E] 等待 DOM 加载...')
    try {
      await window.waitForLoadState('domcontentloaded', { timeout: 10000 })
      console.log('✅ [E2E] DOM 已加载')
    } catch (e) {
      console.warn('⚠️  [E2E] DOM 加载超时')
    }

    // 等待 preload API 可用
    console.log('⏳ [E2E] 等待 API 准备就绪...')
    try {
      await window.waitForFunction(() => {
        return typeof window !== 'undefined' &&
               typeof (window as any).api !== 'undefined' &&
               typeof (window as any).api.anime !== 'undefined'
      }, { timeout: 10000 })
      console.log('✅ [E2E] API 已就绪')
    } catch (e) {
      console.error('❌ [E2E] API 准备超时')
    }

    // 缓存窗口
    cachedWindow = window
    console.log('💾 [E2E] 窗口已缓存')

    await use(window)
    console.log(`✅ [E2E] 测试完成: ${testInfo.title}`)
  }, { scope: 'worker' }],

  // 测试数据目录
  testData: async ({}, use) => {
    const fs = await import('fs/promises')
    await fs.mkdir(TEST_DATA_DIR, { recursive: true })

    const cleanup = async () => {
      try {
        await fs.rm(TEST_DATA_DIR, { recursive: true, force: true })
      } catch {}
    }

    await use({ dir: TEST_DATA_DIR, cleanup })
  },
})

export { expect }

/**
 * 等待指定时间
 */
export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 等待条件满足
 */
export async function waitFor<T>(
  fn: () => Promise<T> | T,
  options: { timeout?: number; interval?: number } = {}
): Promise<T> {
  const { timeout = 10000, interval = 100 } = options
  const startTime = Date.now()

  while (Date.now() - startTime < timeout) {
    try {
      const result = await fn()
      if (result) return result
    } catch {}
    await sleep(interval)
  }

  throw new Error(`waitFor timeout after ${timeout}ms`)
}
