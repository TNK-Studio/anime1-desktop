/**
 * 更新服务 - 基于 electron-updater + GitHub Releases
 * 
 * 特性:
 * 1. 使用 electron-updater 自动检查更新
 * 2. 支持 GitHub Releases 作为更新源
 * 3. 支持稳定版和测试版通道
 * 4. 支持下载进度跟踪
 * 5. 支持静默检查和手动检查
 * 
 * 技术方案:
 * - electron-updater: 自动更新核心库
 * - GitHub Releases: 作为更新服务器
 * - electron-builder.yml: 配置 publish 到 GitHub
 */

import { autoUpdater, UpdateInfo as ElectronUpdateInfo } from 'electron-updater'
import log from 'electron-log'
import { EventEmitter } from 'events'
import { app, BrowserWindow } from 'electron'
import { readFileSync } from 'fs'
import { join } from 'path'

// 读取 package.json 获取正确版本
function getAppVersion(): string {
  // 已打包时，使用 app.getVersion()
  if (app.isPackaged) {
    return app.getVersion()
  }

  // 开发模式下，从 package.json 读取版本
  try {
    // app.getAppPath() 在开发模式下返回 dist-electron/main，需要向上查找
    const appPath = app.getAppPath()
    // 尝试多个可能的路径
    const possiblePaths = [
      join(appPath, 'package.json'),
      join(appPath, '../../package.json'),
      join(appPath, '../../../package.json'),
    ]

    for (const packageJsonPath of possiblePaths) {
      try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'))
        if (packageJson.version) {
          console.log('[UpdateService] Found version:', packageJson.version, 'from:', packageJsonPath)
          return packageJson.version
        }
      } catch {
        // 继续尝试下一个路径
      }
    }

    return app.getVersion()
  } catch (e) {
    console.log('[UpdateService] Failed to read package.json:', e)
    return app.getVersion()
  }
}

export interface UpdateCheckResult {
  hasUpdate: boolean
  currentVersion: string
  latestVersion?: string
  isPrerelease?: boolean
  releaseNotes?: string
  downloadUrl?: string
  assetName?: string
  downloadSize?: number
  publishedAt?: string
  error?: string
}

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

export type UpdateChannel = 'stable' | 'beta'

export class UpdateService extends EventEmitter {
  private currentUpdateInfo: ElectronUpdateInfo | null = null
  private isDownloading = false
  private downloadProgress: UpdateProgress | null = null
  private updateChannel: UpdateChannel = 'stable'
  private autoCheckEnabled = true

  constructor() {
    super()
    this.setupAutoUpdater()
    this.loadSettings()
  }

  /**
   * 配置自动更新
   * 
   * electron-updater 配置:
   * - autoDownload: false (让用户选择是否下载)
   * - autoInstallOnAppQuit: true (退出时自动安装)
   * - allowPrerelease: 根据 updateChannel 决定
   */
  private setupAutoUpdater(): void {
    // 配置日志
    autoUpdater.logger = log
    
    // 不自动下载，让用户选择
    autoUpdater.autoDownload = false
    
    // 应用退出时自动安装
    autoUpdater.autoInstallOnAppQuit = true
    
    // 允许降级（测试版切换到稳定版时需要）
    autoUpdater.allowDowngrade = true

    // 监听更新可用事件
    autoUpdater.on('update-available', (info: ElectronUpdateInfo) => {
      log.info('[UpdateService] Update available:', info)
      this.currentUpdateInfo = info
      this.emit('update-available', this.formatUpdateInfo(info, true))
    })

    // 监听更新不可用事件
    autoUpdater.on('update-not-available', (info: ElectronUpdateInfo) => {
      log.info('[UpdateService] No updates available, current version:', info.version)
      this.emit('update-not-available', this.formatUpdateInfo(info, false))
    })

    // 监听下载进度
    autoUpdater.on('download-progress', (progress: UpdateProgress) => {
      this.downloadProgress = progress
      this.emit('download-progress', progress)
    })

    // 监听更新下载完成
    autoUpdater.on('update-downloaded', (info: ElectronUpdateInfo) => {
      log.info('[UpdateService] Update downloaded:', info)
      this.isDownloading = false
      this.emit('update-downloaded', info)
    })

    // 监听错误
    autoUpdater.on('error', (error: Error) => {
      log.error('[UpdateService] Update error:', error)
      this.isDownloading = false
      this.emit('error', error)
    })
  }

  /**
   * 加载设置
   */
  private loadSettings(): void {
    try {
      // 从环境变量或配置中加载（这里简化处理，实际应该使用 electron-store）
      const channel = process.env.UPDATE_CHANNEL
      if (channel === 'beta') {
        this.updateChannel = 'beta'
      }
      
      autoUpdater.allowPrerelease = this.updateChannel === 'beta'
      log.info('[UpdateService] Loaded settings:', { 
        channel: this.updateChannel, 
        allowPrerelease: autoUpdater.allowPrerelease 
      })
    } catch (error) {
      log.error('[UpdateService] Failed to load settings:', error)
    }
  }

  /**
   * 格式化更新信息
   */
  private formatUpdateInfo(info: ElectronUpdateInfo, hasUpdate: boolean): UpdateCheckResult {
    const result: UpdateCheckResult = {
      hasUpdate,
      currentVersion: getAppVersion(),
      latestVersion: info.version,
      isPrerelease: this.updateChannel === 'beta',
      releaseNotes: Array.isArray(info.releaseNotes)
        ? info.releaseNotes.map(n => typeof n === 'string' ? n : n.note).join('\n')
        : (info.releaseNotes || ''),
      publishedAt: info.releaseDate || new Date().toISOString()
    }

    // 获取下载文件信息
    const files = (info as any).files || []
    if (files.length > 0) {
      // 根据平台选择合适的文件
      const platformFile = this.getPlatformFile(files)
      if (platformFile) {
        result.assetName = platformFile.name
        result.downloadSize = platformFile.size
        result.downloadUrl = platformFile.url
      }
    }

    return result
  }

  /**
   * 获取当前平台的更新文件
   */
  private getPlatformFile(files: any[]): any | null {
    const platform = process.platform
    
    // 平台映射
    const platformMapping: Record<string, string[]> = {
      darwin: ['mac', 'dmg', 'zip'],
      win32: ['win', 'exe', 'nsis'],
      linux: ['linux', 'AppImage', 'deb', 'rpm']
    }
    
    const platformKeywords = platformMapping[platform] || []
    
    // 查找匹配当前平台的文件
    return files.find(file => {
      const name = file.name?.toLowerCase() || ''
      return platformKeywords.some(keyword => 
        name.includes(keyword.toLowerCase())
      )
    }) || files[0] // 如果没有匹配的，返回第一个
  }

  /**
   * 检查更新
   * 
   * @param silent 是否为静默检查（不显示错误提示）
   * @returns 更新检查结果
   */
  async checkForUpdates(silent = false): Promise<UpdateCheckResult> {
    try {
      log.info('[UpdateService] Checking for updates...')
      
      // 在开发环境中使用模拟数据
      if (process.env.NODE_ENV === 'development' && !process.env.FORCE_UPDATE_CHECK) {
        log.info('[UpdateService] Development mode, returning mock data')
        return {
          hasUpdate: false,
          currentVersion: getAppVersion(),
          latestVersion: getAppVersion(),
          releaseNotes: 'Development mode - no updates available'
        }
      }

      // 测试模式：支持环境变量覆盖
      const mockVersion = process.env.UPDATE_VERSION_OVERRIDE
      if (mockVersion) {
        log.info('[UpdateService] Test mode: using mocked version', mockVersion)

        // 模拟下载更新
        const mockDownload = process.env.MOCK_DOWNLOAD === 'true'
        if (mockDownload) {
          log.info('[UpdateService] Test mode: simulating download completion')

          setTimeout(() => {
            this.emit('update-available', {
              hasUpdate: true,
              currentVersion: getAppVersion(),
              latestVersion: mockVersion,
              isPrerelease: this.updateChannel === 'beta',
              releaseNotes: `Test update to version ${mockVersion}`,
              downloadUrl: `http://test-override/${mockVersion}.dmg`,
              assetName: `Anime1 Desktop-${mockVersion}-mac.dmg`,
              downloadSize: 1024 * 1024 * 100, // 100MB
              publishedAt: new Date().toISOString()
            })

            log.info('[UpdateService] Simulated update-available event with version', mockVersion)
          }, 2000)

          return {
            hasUpdate: true,
            currentVersion: getAppVersion(),
            latestVersion: mockVersion,
            isPrerelease: this.updateChannel === 'beta',
            releaseNotes: `Test update to version ${mockVersion}`,
            downloadUrl: `http://test-override/${mockVersion}.dmg`,
            assetName: `Anime1 Desktop-${mockVersion}-mac.dmg`,
            downloadSize: 1024 * 1024 * 100,
            publishedAt: new Date().toISOString()
          }
        } else {
          log.info('[UpdateService] Test mode: forcing real update check')
        }
      }

      const result = await autoUpdater.checkForUpdates()
      
      if (result?.updateInfo) {
        // 检查版本是否真的更新了
        const currentVersion = getAppVersion()
        const latestVersion = result.updateInfo.version
        const hasUpdate = this.compareVersions(latestVersion, currentVersion) > 0
        
        return this.formatUpdateInfo(result.updateInfo, hasUpdate)
      }
      
      return {
        hasUpdate: false,
        currentVersion: getAppVersion()
      }
    } catch (error) {
      log.error('[UpdateService] Failed to check for updates:', error)
      
      if (!silent) {
        return {
          hasUpdate: false,
          currentVersion: getAppVersion(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      }
      
      return {
        hasUpdate: false,
        currentVersion: getAppVersion()
      }
    }
  }

  /**
   * 版本号比较
   * @returns 1: v1 > v2, 0: v1 === v2, -1: v1 < v2
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.replace(/^v/, '').split('.').map(Number)
    const parts2 = v2.replace(/^v/, '').split('.').map(Number)
    
    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0
      const p2 = parts2[i] || 0
      
      if (p1 > p2) return 1
      if (p1 < p2) return -1
    }
    
    return 0
  }

  /**
   * 下载更新
   */
  async downloadUpdate(): Promise<void> {
    if (this.isDownloading) {
      throw new Error('Update is already being downloaded')
    }

    try {
      this.isDownloading = true
      this.downloadProgress = null
      log.info('[UpdateService] Starting update download...')
      
      await autoUpdater.downloadUpdate()
    } catch (error) {
      this.isDownloading = false
      log.error('[UpdateService] Failed to download update:', error)
      throw error
    }
  }

  /**
   * 安装更新
   *
   * 注意：调用后会退出应用
   *
   * macOS 特别处理：
   * - 先关闭所有窗口，避免阻止应用退出
   * - 使用 isSilent=true, isForceRunAfter=true 确保更新正确应用
   * - 短暂延迟让 Squirrel.Mac 有时间处理
   */
  installUpdate(): void {
    log.info('[UpdateService] Installing update and restarting...')

    // 关闭所有窗口，防止阻止应用退出
    BrowserWindow.getAllWindows().forEach((win) => {
      try {
        win.destroy()
      } catch (e) {
        log.warn('[UpdateService] Failed to destroy window:', e)
      }
    })

    // macOS 上使用 isSilent=true 和 isForceRunAfter=true
    // isSilent: 不提示用户，静默退出
    // isForceRunAfter: 确保更新后重新启动应用
    const isSilent = process.platform === 'darwin'
    const isForceRunAfter = process.platform === 'darwin'

    // 短暂延迟确保窗口已关闭
    setTimeout(() => {
      log.info('[UpdateService] Calling quitAndInstall', { isSilent, isForceRunAfter })
      autoUpdater.quitAndInstall(isSilent, isForceRunAfter)
    }, 500)
  }

  /**
   * 设置更新通道
   */
  setChannel(channel: UpdateChannel): void {
    this.updateChannel = channel
    autoUpdater.allowPrerelease = channel === 'beta'
    
    // 保存设置
    try {
      // 这里应该保存到持久化存储
      log.info('[UpdateService] Channel set to:', channel)
    } catch (error) {
      log.error('[UpdateService] Failed to save channel setting:', error)
    }
  }

  /**
   * 获取更新通道
   */
  getChannel(): UpdateChannel {
    return this.updateChannel
  }

  /**
   * 设置自动检查
   */
  setAutoCheck(enabled: boolean): void {
    this.autoCheckEnabled = enabled
    log.info('[UpdateService] Auto check set to:', enabled)
  }

  /**
   * 是否启用自动检查
   */
  isAutoCheckEnabled(): boolean {
    return this.autoCheckEnabled
  }

  /**
   * 获取当前更新信息
   */
  getCurrentUpdateInfo(): ElectronUpdateInfo | null {
    return this.currentUpdateInfo
  }

  /**
   * 获取下载进度
   */
  getDownloadProgress(): UpdateProgress | null {
    return this.downloadProgress
  }

  /**
   * 是否正在下载
   */
  isUpdateDownloading(): boolean {
    return this.isDownloading
  }

  /**
   * 获取应用信息
   */
  getAppInfo() {
    return {
      version: getAppVersion(),
      name: app.getName(),
      channel: this.updateChannel,
      platform: process.platform,
      arch: process.arch
    }
  }
}
