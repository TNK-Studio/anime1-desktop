/**
 * 共享 Electron 应用的测试 Fixtures
 *
 * 多个测试共享同一个 Electron 实例，提高测试速度
 */
import { test as base, expect, type ElectronApplication, type Page } from '@playwright/test'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// 测试数据目录
const TEST_DATA_DIR = resolve(__dirname, '../../test-data/e2e')

// Electron Fixture 类型
type ElectronFixtures = {
  electronApp: ElectronApplication
  window: Page
  resetState: () => Promise<void>
}

// 全局共享实例
let globalWindow: Page | null = null

/**
 * 扩展的 test fixture
 * worker 级别：同一个 worker 中的所有测试共享同一个 Electron 实例
 */
export const test = base.extend<ElectronFixtures>({
  // Electron 应用 - worker 级别（整个测试套件共享一个实例）
  electronApp: [async ({}, use) => {
    console.log('[E2E] 🔧 启动 Electron 应用...')
    const { _electron: electron } = await import('@playwright/test')

    const mainPath = resolve(__dirname, '../../dist-electron/main/index.js')
    console.log('[E2E] 📂 主进程路径:', mainPath)
    console.log('[E2E] 📁 测试数据目录:', TEST_DATA_DIR)

    const electronApp = await electron.launch({
      headless: true,
      args: [mainPath, '--no-sandbox'],
      cwd: resolve(__dirname, '../..'),
      env: {
        ...process.env,
        NODE_ENV: 'test',
        E2E_TEST: 'true',
        APP_DATA_DIR: TEST_DATA_DIR,
        DISABLE_UPDATE_CHECK: 'true',
      },
      timeout: 60000,
    })

    console.log('[E2E] ✅ Electron 应用已启动')

    // 监听控制台输出
    electronApp.on('console', (msg) => {
      const text = msg.text()
      if (text.includes('[Preload]') || text.includes('[Window]') || text.includes('[Main]') || text.includes('[AnimeService]')) {
        console.log('[Electron Console]', msg.type(), ':', text)
      }
    })

    await use(electronApp)

    console.log('[E2E] 🔌 关闭 Electron 应用...')
    await electronApp.close()
    console.log('[E2E] ✅ Electron 应用已关闭')
    globalWindow = null
  }, { scope: 'worker' }],

  // 窗口 - worker 级别缓存，避免重复获取
  window: [async ({ electronApp }, use) => {
    // 如果窗口已缓存，直接复用
    if (globalWindow) {
      console.log('[E2E] ♻️ 复用已缓存的窗口')
      await use(globalWindow)
      return
    }

    console.log('[E2E] 🪟 获取窗口...')
    const window = await electronApp.firstWindow()
    const url = window.url()
    console.log('[E2E] 📄 窗口 URL:', url)

    // 等待页面完全加载
    console.log('[E2E] ⏳ 等待页面加载...')
    await window.waitForLoadState('load', { timeout: 30000 })
    console.log('[E2E] ✅ 页面已加载')

    // 等待 preload API 可用（重要！）
    console.log('[E2E] ⏳ 等待 API 准备就绪...')
    await window.waitForFunction(() => {
      return typeof window !== 'undefined' &&
             typeof (window as any).api !== 'undefined' &&
             typeof (window as any).api.anime !== 'undefined' &&
             typeof (window as any).api.anime.getEpisodes === 'function'
    }, { timeout: 30000 })
    console.log('[E2E] ✅ API 已就绪')

    // 缓存窗口
    globalWindow = window
    console.log('[E2E] 💾 窗口已缓存，后续测试将复用')

    await use(window)
  }, { scope: 'worker' }],

  // 重置状态 - test 级别
  resetState: [async ({ window }, use) => {
    const reset = async () => {
      try {
        console.log('[E2E] 🔄 重置状态...')
        // 导航到首页
        const homePath = 'file://' + resolve(__dirname, '../../dist/index.html') + '#/'
        await window.goto(homePath)
        await window.waitForLoadState('domcontentloaded')

        // 清理 localStorage
        await window.evaluate(() => localStorage.clear()).catch(() => {})

        await window.waitForTimeout(300)
        console.log('[E2E] ✅ 状态已重置')
      } catch (error) {
        console.error('[E2E] ❌ 状态重置错误:', error)
      }
    }

    await use(reset)
  }, { scope: 'test' }],
})

export { expect }

export async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
