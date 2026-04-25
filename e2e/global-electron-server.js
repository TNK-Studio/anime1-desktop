/**
 * 全局 Electron 服务器
 *
 * 启动一个长期运行的 Electron 实例，所有测试文件共享
 */
import { _electron } from '@playwright/test'
import { resolve } from 'path'
import { writeFileSync, readFileSync, unlinkSync, existsSync } from 'fs'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = require('path').dirname(__filename)

// 锁文件路径
const LOCK_FILE = resolve(__dirname, '../..', '.electron-test-server.lock')
const PID_FILE = resolve(__dirname, '../..', '.electron-test-server.pid')

// 主进程路径
const MAIN_PATH = resolve(__dirname, '../../dist-electron/main/index.js')

// 测试数据目录
const TEST_DATA_DIR = resolve(__dirname, '../../test-data/e2e')

/**
 * 启动全局 Electron 服务器
 */
async function startGlobalServer() {
  console.log('🌐 [E2E] 启动全局 Electron 服务器...')

  // 检查是否已经启动
  if (existsSync(LOCK_FILE)) {
    console.log('✅ [E2E] 全局 Electron 服务器已运行')
    const pid = parseInt(readFileSync(PID_FILE, 'utf-8'))
    return pid
  }

  // 创建锁文件
  writeFileSync(LOCK_FILE, Date.now().toString())

  // 启动 Electron
  const app = await _electron.launch({
    headless: true,
    args: [MAIN_PATH, '--no-sandbox'],
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

  // 保存 PID
  writeFileSync(PID_FILE, process.pid.toString())

  // 监听控制台
  app.on('console', (msg) => {
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

  console.log('✅ [E2E] 全局 Electron 服务器已启动')
  console.log('📝 [E2E] PID:', process.pid)

  // 保持运行
  return new Promise(() => {})
}

/**
 * 停止全局 Electron 服务器
 */
async function stopGlobalServer() {
  if (!existsSync(LOCK_FILE)) {
    console.log('ℹ️  [E2E] 全局 Electron 服务器未运行')
    return
  }

  console.log('🔌 [E2E] 停止全局 Electron 服务器...')

  try {
    unlinkSync(LOCK_FILE)
    if (existsSync(PID_FILE)) {
      unlinkSync(PID_FILE)
    }
  } catch {
    // 忽略
  }

  console.log('✅ [E2E] 全局 Electron 服务器已停止')
}

// 主函数
async function main() {
  const command = process.argv[2]

  if (command === 'start') {
    await startGlobalServer()
  } else if (command === 'stop') {
    await stopGlobalServer()
  } else {
    console.log('用法: node e2e/global-electron-server.js [start|stop]')
    process.exit(1)
  }
}

main().catch(console.error)
