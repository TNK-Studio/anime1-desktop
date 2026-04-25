<template>
  <div class="layout-container">
    <!-- 顶部标题栏（最外层，全宽） -->
    <div class="custom-titlebar">
      <div class="window-controls">
        <button class="window-btn close" @click="closeWindow" title="关闭">
          <el-icon><Close /></el-icon>
        </button>
        <button
          class="window-btn minimize"
          @click="minimizeWindow"
          title="最小化"
        >
          <el-icon><Minus /></el-icon>
        </button>
        <button
          class="window-btn maximize"
          @click="toggleMaximize"
          :title="isMaximized ? '还原' : '最大化'"
        >
          <el-icon
            ><FullScreen v-if="!isMaximized" /><CopyDocument v-else
          /></el-icon>
        </button>
      </div>
      <div class="titlebar-drag-area"></div>
    </div>

    <!-- 内容区：侧边栏 + 主内容 -->
    <div
      class="content-wrapper"
      :class="{ 'sidebar-collapsed': sidebarCollapsed }"
    >
      <!-- 侧边栏 -->
      <el-aside :width="sidebarCollapsed ? '64px' : '240px'" class="sidebar">
        <div class="sidebar-header">
          <h1 v-if="!sidebarCollapsed" class="sidebar-title">Anime1</h1>
          <span v-else class="sidebar-logo">A1</span>
        </div>

        <el-menu
          :default-active="activeMenu"
          :collapse="sidebarCollapsed"
          :collapse-transition="false"
          router
          class="sidebar-menu"
        >
          <el-menu-item index="/" data-testid="menu-home">
            <el-icon><VideoPlay /></el-icon>
            <template #title>最新番剧</template>
          </el-menu-item>

          <el-menu-item index="/favorites" data-testid="menu-favorites">
            <el-icon><Star /></el-icon>
            <template #title>我的追番</template>
            <el-badge
              v-if="favoritesStore.hasUpdates"
              :value="''"
              class="sidebar-badge"
              :hidden="!favoritesStore.hasUpdates"
            />
          </el-menu-item>

          <el-menu-item index="/history" data-testid="menu-history">
            <el-icon><Clock /></el-icon>
            <template #title>观看历史</template>
          </el-menu-item>

          <el-menu-item index="/downloads" data-testid="menu-downloads">
            <el-icon><Download /></el-icon>
            <template #title>下载管理</template>
          </el-menu-item>

          <el-menu-item index="/settings" data-testid="menu-settings">
            <el-icon>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                <path
                  d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                />
              </svg>
            </el-icon>
            <template #title>设置</template>
          </el-menu-item>
        </el-menu>

        <div class="sidebar-footer">
          <el-button
            :icon="sidebarCollapsed ? Expand : Fold"
            circle
            size="small"
            @click="toggleSidebar"
            class="collapse-btn"
          />
        </div>
      </el-aside>

      <!-- 主内容区 -->
      <el-container class="main-container">
        <el-main class="main-content">
          <router-view />
        </el-main>
      </el-container>
    </div>

    <!-- 更新弹窗 -->
    <el-dialog
      v-model="updateDialogVisible"
      title="发现新版本"
      width="420px"
      :close-on-click-modal="false"
    >
      <div class="update-dialog-header">
        <el-icon color="#67c23a" size="20"><CircleCheckFilled /></el-icon>
        <span style="margin-left: 8px">发现新版本</span>
        <el-tag
          v-if="updateInfo.isPrelease"
          type="warning"
          size="small"
          style="margin-left: 8px"
          >预发布</el-tag
        >
      </div>
      <div class="update-dialog-content">
        <div class="version-info">
          <p>
            <strong>当前版本:</strong> {{ updateInfo.currentVersion || "-" }}
          </p>
          <p>
            <strong>最新版本:</strong> {{ updateInfo.latestVersion || "-" }}
          </p>
        </div>
        <el-divider />
        <div
          class="release-notes"
          v-html="formatReleaseNotes(updateInfo.releaseNotes)"
        />
      </div>
      <template #footer>
        <el-button @click="updateDialogVisible = false">暂不更新</el-button>
        <el-button
          type="primary"
          @click="handleDownloadUpdate"
          :loading="downloading"
        >
          {{ downloading ? "下载中..." : "下载更新" }}
          <el-icon v-if="!downloading" style="margin-left: 4px"
            ><Download
          /></el-icon>
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
// 引用类型定义
import "../types/window.d";
import { ref, computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import {
  VideoPlay,
  Star,
  Clock,
  Expand,
  Fold,
  CircleCheckFilled,
  Download,
  Close,
  Minus,
  FullScreen,
  CopyDocument,
} from "@element-plus/icons-vue";
import { useFavoritesStore } from "../stores";
import { ElMessage } from "element-plus";

const route = useRoute();
const favoritesStore = useFavoritesStore();

// 窗口控制
const isMaximized = ref(false);

const closeWindow = () => {
  window.api.window.close();
};

const minimizeWindow = () => {
  window.api.window.minimize();
};

const toggleMaximize = async () => {
  const result = (await window.api.window.maximize()) as {
    success: boolean;
    maximized: boolean;
  };
  console.log("[Window] Maximize result:", result);
  if (result.success) {
    isMaximized.value = result.maximized;
  }
};

const sidebarCollapsed = ref(true);
const updateDialogVisible = ref(false);
const downloading = ref(false);

const updateInfo = ref({
  latestVersion: "",
  currentVersion: "",
  downloadUrl: "",
  releaseNotes: "",
  isPrelease: false,
});

// 当前激活的菜单
const activeMenu = computed(() => {
  const path = route.path;
  if (path.startsWith("/anime/")) {
    return "/";
  }
  return path;
});

// 切换侧边栏
const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value;
  localStorage.setItem("sidebar-collapsed", sidebarCollapsed.value.toString());
};

// 格式化发布说明
const formatReleaseNotes = (notes: string) => {
  if (!notes) return "暂无更新说明";
  return notes.replace(/\n/g, "<br>");
};

// 检查更新
const checkUpdate = async () => {
  try {
    // 跳过更新检查
  } catch (error) {
    console.log("[更新检查] 失败:", error);
  }
};

// 处理下载更新
const handleDownloadUpdate = async () => {
  if (!updateInfo.value.downloadUrl) {
    ElMessage.warning("暂无下载链接");
    return;
  }

  downloading.value = true;
  try {
    await window.api.update.download();
    ElMessage.success("更新下载中...");
    updateDialogVisible.value = false;
  } catch (error) {
    ElMessage.error("下载失败");
  } finally {
    downloading.value = false;
  }
};

onMounted(() => {
  const saved = localStorage.getItem("sidebar-collapsed");
  if (saved !== null) {
    sidebarCollapsed.value = saved === "true";
  }

  checkUpdate();
  favoritesStore.loadFavorites();
});
</script>

<style scoped>
.layout-container {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--el-bg-color-page);
  overflow: hidden;
}

/* 顶部标题栏（全宽） */
.custom-titlebar {
  height: 38px;
  background: var(--el-bg-color-page);
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  padding: 0 12px;
  -webkit-app-region: drag;
  flex-shrink: 0;
  z-index: 1000;
}

.window-controls {
  display: flex;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.window-btn {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: all 0.2s;
  font-size: 8px;
  color: transparent;
}

.window-btn:hover {
  color: rgba(0, 0, 0, 0.6);
}

.window-btn.close {
  background: #ff5f57;
}
.window-btn.close:hover {
  background: #ff5f57;
}
.window-btn.minimize {
  background: #febc2e;
}
.window-btn.minimize:hover {
  background: #febc2e;
}
.window-btn.maximize {
  background: #28c840;
}
.window-btn.maximize:hover {
  background: #28c840;
}

.window-btn .el-icon {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.titlebar-drag-area {
  flex: 1;
  height: 100%;
}

/* 内容区（侧边栏 + 主内容） */
.content-wrapper {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  background: var(--el-bg-color);
  border-right: 1px solid var(--el-border-color);
  display: flex;
  flex-direction: column;
  transition: width 0.3s;
  overflow: hidden;
  flex-shrink: 0;
}

.sidebar-header {
  padding: 20px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 60px;
}

.sidebar-title {
  font-size: 1.5rem;
  font-weight: 700;
  background: linear-gradient(135deg, #ff6b9d 0%, #7c5cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin: 0;
}

.sidebar-logo {
  font-size: 1rem;
  font-weight: 700;
  background: linear-gradient(135deg, #ff6b9d 0%, #7c5cff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sidebar-menu {
  flex: 1;
  border: none;
  background: transparent;
}

.sidebar-badge {
  position: absolute;
  right: 20px;
  top: 50%;
  transform: translateY(-50%);
}

.sidebar-footer {
  padding: 15px;
  border-top: 1px solid var(--el-border-color);
  display: flex;
  justify-content: center;
}

.collapse-btn {
  width: 32px;
  height: 32px;
}

/* 主内容区 */
.main-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

/* 响应式布局 */
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    left: 0;
    top: 38px;
    bottom: 0;
    z-index: 1000;
    transform: translateX(-100%);
  }

  .sidebar-collapsed .sidebar {
    transform: translateX(0);
  }
}

/* 更新弹窗样式 */
.update-dialog-header {
  display: flex;
  align-items: center;
  margin-bottom: 16px;
}

.update-dialog-content {
  max-height: 300px;
  overflow-y: auto;
}

.version-info {
  margin-bottom: 16px;
}

.version-info p {
  margin: 4px 0;
}

.release-notes {
  font-size: 14px;
  line-height: 1.6;
  color: var(--el-text-color-regular);
}

.release-notes :deep(ul) {
  padding-left: 20px;
}

.release-notes :deep(li) {
  margin: 4px 0;
}
</style>
