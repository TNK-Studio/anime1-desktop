<template>
  <div class="settings-page">
    <!-- 页面头部 -->
    <header class="page-header">
      <h1>设置</h1>
    </header>

    <main class="main-content">
      <el-form label-width="150px" class="settings-form">
        <!-- 外观设置 -->
        <el-card class="settings-section" shadow="never">
          <template #header>
            <div class="section-header">
              <el-icon><Brush /></el-icon>
              <span>外观</span>
            </div>
          </template>
          
          <el-form-item label="主题">
            <el-radio-group v-model="settings.theme" @change="handleThemeChange">
              <el-radio-button label="light">
                <el-icon><Sunny /></el-icon> 浅色
              </el-radio-button>
              <el-radio-button label="dark">
                <el-icon><Moon /></el-icon> 深色
              </el-radio-button>
              <el-radio-button label="system">
                <el-icon><Monitor /></el-icon> 跟随系统
              </el-radio-button>
            </el-radio-group>
          </el-form-item>
        </el-card>

        <!-- 播放设置 -->
        <el-card class="settings-section" shadow="never">
          <template #header>
            <div class="section-header">
              <el-icon><VideoPlay /></el-icon>
              <span>播放</span>
            </div>
          </template>
          
          <el-form-item label="自动播放下一集">
            <el-switch v-model="settings.autoPlayNext" />
          </el-form-item>
          
          <el-form-item label="记住播放进度">
            <el-switch v-model="settings.rememberPosition" />
          </el-form-item>
          
          <el-form-item label="默认音量">
            <el-slider v-model="settings.defaultVolume" :max="1" :step="0.1" show-stops />
          </el-form-item>
        </el-card>

        <!-- 下载设置 -->
        <el-card class="settings-section" shadow="never">
          <template #header>
            <div class="section-header">
              <el-icon><Download /></el-icon>
              <span>下载</span>
            </div>
          </template>
          
          <el-form-item label="下载路径">
            <el-input v-model="settings.downloadPath" readonly>
              <template #append>
                <el-button @click="selectDownloadPath">选择</el-button>
              </template>
            </el-input>
          </el-form-item>
          
          <el-form-item label="同时下载数量">
            <el-input-number v-model="settings.maxConcurrentDownloads" :min="1" :max="5" />
          </el-form-item>
        </el-card>

        <!-- 更新设置 -->
        <el-card class="settings-section" shadow="never">
          <template #header>
            <div class="section-header">
              <el-icon><Refresh /></el-icon>
              <span>更新</span>
            </div>
          </template>
          
          <el-form-item label="自动检查更新">
            <el-switch v-model="settings.autoCheckUpdates" />
          </el-form-item>
          
          <el-form-item label="更新通道">
            <el-radio-group v-model="settings.updateChannel">
              <el-radio-button label="stable">稳定版</el-radio-button>
              <el-radio-button label="beta">测试版</el-radio-button>
            </el-radio-group>
          </el-form-item>
          
          <el-form-item>
            <div class="update-status" v-if="updateInfo.hasUpdate">
              <el-alert
                :title="`发现新版本: ${updateInfo.latestVersion}`"
                type="success"
                show-icon
                :closable="false"
              />
              <div class="release-notes" v-html="updateInfo.releaseNotes || '暂无更新说明'"></div>
              <div class="update-actions">
                <el-button 
                  type="primary" 
                  @click="downloadUpdate" 
                  :loading="updateInfo.isDownloading"
                  :disabled="updateInfo.isDownloaded"
                >
                  {{ updateInfo.isDownloaded ? '已下载' : updateInfo.isDownloading ? '下载中...' : '下载更新' }}
                </el-button>
                <el-button 
                  type="success" 
                  @click="installUpdate" 
                  v-if="updateInfo.isDownloaded"
                >
                  立即安装
                </el-button>
              </div>
              <div class="download-progress" v-if="updateInfo.isDownloading && updateInfo.progress">
                <el-progress 
                  :percentage="Math.round(updateInfo.progress.percent || 0)" 
                  :format="progressFormat"
                />
              </div>
            </div>
            <div v-else-if="updateInfo.checked && !updateInfo.hasUpdate">
              <el-alert
                title="当前已是最新版本"
                type="info"
                :description="`当前版本: ${appVersion}`"
                show-icon
                :closable="false"
              />
            </div>
            <el-button 
              type="primary" 
              @click="checkUpdate" 
              :loading="checkingUpdate"
              v-if="!updateInfo.hasUpdate"
            >
              {{ checkingUpdate ? '检查中...' : '立即检查更新' }}
            </el-button>
          </el-form-item>
        </el-card>

        <!-- 关于 -->
        <el-card class="settings-section" shadow="never">
          <template #header>
            <div class="section-header">
              <el-icon><InfoFilled /></el-icon>
              <span>关于</span>
            </div>
          </template>
          
          <div class="about-content">
            <div class="app-logo">
              <span class="logo-text">Anime1 Desktop</span>
              <span class="version">v{{ appVersion }}</span>
            </div>
            <p class="app-desc">使用 Electron + Vue 3 + TypeScript 构建的 Anime1 桌面客户端</p>
            <div class="app-links">
              <el-link type="primary" @click="openExternal('https://github.com/TNK-Studio/anime1-desktop')">
                GitHub
              </el-link>
              <el-link type="primary" @click="openExternal('https://anime1.me')">
                Anime1 官网
              </el-link>
            </div>
          </div>
        </el-card>

        <!-- 保存按钮 -->
        <div class="form-actions">
          <el-button type="primary" size="large" @click="saveSettings" :loading="saving">
            保存设置
          </el-button>
          <el-button size="large" @click="resetSettings">重置</el-button>
        </div>
      </el-form>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Brush, Sunny, Moon, Monitor, VideoPlay, Download, Refresh, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  autoPlayNext: boolean
  rememberPosition: boolean
  defaultVolume: number
  downloadPath: string
  maxConcurrentDownloads: number
  autoCheckUpdates: boolean
  updateChannel: 'stable' | 'beta'
}

interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  total: number
  transferred: number
}

interface UpdateInfo {
  hasUpdate: boolean
  checked: boolean
  currentVersion: string
  latestVersion: string
  releaseNotes: string
  isDownloading: boolean
  isDownloaded: boolean
  progress: UpdateProgress | null
}

const appVersion = ref('0.3.6')
const saving = ref(false)
const checkingUpdate = ref(false)

const defaultSettings: AppSettings = {
  theme: 'system',
  autoPlayNext: true,
  rememberPosition: true,
  defaultVolume: 0.8,
  downloadPath: '',
  maxConcurrentDownloads: 3,
  autoCheckUpdates: true,
  updateChannel: 'stable'
}

const settings = ref<AppSettings>({ ...defaultSettings })

const updateInfo = ref<UpdateInfo>({
  hasUpdate: false,
  checked: false,
  currentVersion: '',
  latestVersion: '',
  releaseNotes: '',
  isDownloading: false,
  isDownloaded: false,
  progress: null
})

// 加载设置
const loadSettings = async () => {
  try {
    const result = await window.api.settings.getAll()
    if (result.success && result.data) {
      // 解析 JSON 格式的设置值
      const parsedSettings: Partial<AppSettings> = {}
      for (const [key, value] of Object.entries(result.data)) {
        try {
          parsedSettings[key as keyof AppSettings] = JSON.parse(value as string)
        } catch {
          parsedSettings[key as keyof AppSettings] = value as any
        }
      }
      settings.value = { ...defaultSettings, ...parsedSettings }
      // 立即应用主题
      applyTheme(settings.value.theme)
    }
  } catch (err) {
    console.error('[Settings] 加载设置失败:', err)
    // 使用默认设置
    settings.value = { ...defaultSettings }
    applyTheme(settings.value.theme)
  }
}

// 获取应用版本
const loadAppVersion = async () => {
  try {
    // 尝试从 API 获取版本
    const result = await window.api.update.check()
    if (result.success && result.data) {
      appVersion.value = result.data.currentVersion || '0.3.6'
    }
  } catch (err) {
    console.error('[Settings] 获取版本失败:', err)
  }
}

// 保存设置
const saveSettings = async () => {
  saving.value = true
  try {
    // 保存每个设置项
    const promises = Object.entries(settings.value).map(([key, value]) =>
      window.api.settings.set({ key, value: JSON.stringify(value) })
    )
    await Promise.all(promises)
    
    // 应用主题
    applyTheme(settings.value.theme)
    
    ElMessage.success('设置已保存')
  } catch (err: any) {
    ElMessage.error(err.message || '保存设置失败')
  } finally {
    saving.value = false
  }
}

// 重置设置
const resetSettings = () => {
  settings.value = { ...defaultSettings }
  // 应用重置后的主题
  applyTheme(settings.value.theme)
  ElMessage.info('设置已重置为默认值')
}

// 处理主题变更（立即应用）
const handleThemeChange = (theme: string) => {
  applyTheme(theme)
}

// 应用主题
const applyTheme = (theme: string) => {
  const html = document.documentElement
  html.classList.remove('light', 'dark')
  
  if (theme === 'dark') {
    html.classList.add('dark')
  } else if (theme === 'light') {
    html.classList.add('light')
  } else {
    // 跟随系统
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    html.classList.add(prefersDark ? 'dark' : 'light')
  }
}

// 选择下载路径
const selectDownloadPath = async () => {
  // TODO: 实现选择文件夹对话框
  ElMessage.info('功能开发中...')
}

// 检查更新
const checkUpdate = async () => {
  checkingUpdate.value = true
  updateInfo.value.checked = false
  
  try {
    // 先设置事件监听
    setupUpdateListeners()
    
    const result = await window.api.update.check()
    if (result.success && result.data) {
      const { hasUpdate, currentVersion, latestVersion, releaseNotes } = result.data
      
      updateInfo.value = {
        ...updateInfo.value,
        hasUpdate,
        checked: true,
        currentVersion: currentVersion || '',
        latestVersion: latestVersion || '',
        releaseNotes: releaseNotes || ''
      }
      
      if (hasUpdate) {
        ElMessage.success(`发现新版本: ${latestVersion}`)
      } else {
        ElMessage.success('当前已是最新版本')
      }
    } else {
      ElMessage.error(result.error?.message || '检查更新失败')
    }
  } catch (err: any) {
    console.error('[Settings] 检查更新失败:', err)
    ElMessage.error(err.message || '检查更新失败')
  } finally {
    checkingUpdate.value = false
  }
}

// 设置更新事件监听
const setupUpdateListeners = () => {
  // 清理旧的监听
  cleanupUpdateListeners()

  // 监听更新可用事件
  try {
    window.api.update.onAvailable((info: any) => {
      console.log('[Settings] Update available:', info)
      if (info.hasUpdate) {
        updateInfo.value = {
          ...updateInfo.value,
          hasUpdate: true,
          latestVersion: info.latestVersion || '',
          releaseNotes: info.releaseNotes || '',
          currentVersion: info.currentVersion || ''
        }
      }
    })
  } catch (err) {
    console.error('[Settings] 监听 update-available 失败:', err)
  }

  // 监听下载进度
  try {
    window.api.update.onProgress((progress: any) => {
      console.log('[Settings] Download progress:', progress)
      updateInfo.value.progress = progress
    })
  } catch (err) {
    console.error('[Settings] 监听 download-progress 失败:', err)
  }

  // 监听下载完成
  try {
    window.api.update.onDownloaded((info: any) => {
      console.log('[Settings] Update downloaded:', info)
      updateInfo.value.isDownloading = false
      updateInfo.value.isDownloaded = true
      
      ElMessageBox.confirm(
        '更新已下载完成，是否立即安装并重启应用？',
        '下载完成',
        {
          confirmButtonText: '立即安装',
          cancelButtonText: '稍后安装',
          type: 'success'
        }
      ).then(() => {
        installUpdate()
      }).catch(() => {
        ElMessage.info('更新将在下次启动时自动安装')
      })
    })
  } catch (err) {
    console.error('[Settings] 监听 update-downloaded 失败:', err)
  }
}

// 清理更新事件监听
const cleanupUpdateListeners = () => {
  // 注意：当前 API 设计可能不支持取消监听，需要时可以实现
}

// 下载更新
const downloadUpdate = async () => {
  try {
    updateInfo.value.isDownloading = true
    const result = await window.api.update.download()
    
    if (!result.success) {
      throw new Error(result.error?.message || '下载更新失败')
    }
    
    ElMessage.info('开始下载更新...')
  } catch (err: any) {
    console.error('[Settings] 下载更新失败:', err)
    ElMessage.error(err.message || '下载更新失败')
    updateInfo.value.isDownloading = false
  }
}

// 安装更新
const installUpdate = async () => {
  try {
    await ElMessageBox.confirm(
      '安装更新需要重启应用，是否继续？',
      '确认安装',
      {
        confirmButtonText: '立即重启',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )
    
    const result = await window.api.update.install()
    if (!result.success) {
      throw new Error(result.error?.message || '安装更新失败')
    }
    
    // 应用会在 install() 后自动退出并重启
  } catch (err: any) {
    if (err !== 'cancel') {
      console.error('[Settings] 安装更新失败:', err)
      ElMessage.error(err.message || '安装更新失败')
    }
  }
}

// 格式化下载进度
const progressFormat = (percentage: number) => {
  if (updateInfo.value.progress) {
    const speed = ((updateInfo.value.progress.bytesPerSecond || 0) / 1024 / 1024).toFixed(2)
    return `${percentage}% (${speed} MB/s)`
  }
  return `${percentage}%`
}

// 打开外部链接
const openExternal = async (url: string) => {
  try {
    await window.api.system.openExternal({ url })
  } catch (err) {
    console.error('[Settings] 打开链接失败:', err)
  }
}

onMounted(() => {
  loadSettings()
  loadAppVersion()
  setupUpdateListeners()
  
  // 如果启用了自动检查更新，启动时检查
  if (settings.value.autoCheckUpdates) {
    setTimeout(() => {
      checkUpdate()
    }, 5000) // 延迟 5 秒后检查
  }
})

onUnmounted(() => {
  cleanupUpdateListeners()
})
</script>

<style scoped>
.settings-page {
  min-height: 100%;
  background: var(--el-bg-color-page);
}

.page-header {
  padding: 20px 40px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
}

.main-content {
  padding: 24px 40px;
  max-width: 800px;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.settings-section {
  border-radius: 12px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 500;
}

.update-status {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.release-notes {
  background: var(--el-fill-color-light);
  border-radius: 8px;
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.release-notes :deep(h2) {
  font-size: 18px;
  margin: 0 0 12px 0;
  color: var(--el-text-color-primary);
}

.release-notes :deep(h3) {
  font-size: 16px;
  margin: 16px 0 8px 0;
  color: var(--el-text-color-primary);
}

.release-notes :deep(ul), .release-notes :deep(ol) {
  margin: 8px 0;
  padding-left: 20px;
}

.release-notes :deep(li) {
  margin: 4px 0;
  color: var(--el-text-color-regular);
}

.release-notes :deep(p) {
  margin: 8px 0;
  color: var(--el-text-color-regular);
}

.update-actions {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.download-progress {
  width: 100%;
}

.about-content {
  text-align: center;
  padding: 24px;
}

.app-logo {
  margin-bottom: 16px;
}

.logo-text {
  font-size: 24px;
  font-weight: 700;
  background: linear-gradient(135deg, #ff6b9d 0%, #7c5cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-right: 12px;
}

.version {
  font-size: 14px;
  color: var(--el-text-color-secondary);
  background: var(--el-fill-color);
  padding: 2px 8px;
  border-radius: 4px;
}

.app-desc {
  color: var(--el-text-color-secondary);
  margin: 0 0 16px;
}

.app-links {
  display: flex;
  justify-content: center;
  gap: 24px;
}

.form-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding: 24px 0;
}

@media (max-width: 768px) {
  .page-header {
    padding: 16px 20px;
  }
  
  .main-content {
    padding: 16px 20px;
  }
  
  .settings-form :deep(.el-form-item__label) {
    float: none;
    display: block;
    text-align: left;
    margin-bottom: 8px;
  }
  
  .settings-form :deep(.el-form-item__content) {
    margin-left: 0 !important;
  }
  
  .update-actions {
    flex-direction: column;
  }
  
  .update-actions .el-button {
    width: 100%;
    margin-left: 0;
  }
}
</style>
