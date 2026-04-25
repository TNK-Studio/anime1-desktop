<template>
  <div class="home">
    <!-- 页面头部 -->
    <header class="page-header">
      <h1>最新番剧</h1>
      <div class="search">
        <el-input
          v-model="searchQuery"
          placeholder="搜索番剧..."
          clearable
          @keyup.enter="handleSearch"
        >
          <template #append>
            <el-button @click="handleSearch">
              <el-icon><Search /></el-icon>
            </el-button>
          </template>
        </el-input>
      </div>
    </header>

    <main class="main">
      <!-- 加载状态 -->
      <div v-if="animeStore.loading" class="loading">
        <el-skeleton :rows="5" animated />
      </div>

      <!-- 错误状态 -->
      <el-alert
        v-else-if="animeStore.error"
        :title="animeStore.error"
        type="error"
        show-icon
        closable
      />

      <!-- 空状态 -->
      <el-empty
        v-else-if="animeStore.animeList.length === 0"
        description="暂无番剧数据"
      />

      <!-- 番剧列表 -->
      <div v-else class="anime-grid">
        <el-card
          v-for="anime in animeStore.animeList"
          :key="anime.id"
          class="anime-card"
          shadow="hover"
          :data-id="anime.id"
          @click="goToDetail(anime.id)"
        >
          <!-- 收藏按钮 -->
          <el-button
            :icon="isAnimeFavorite(anime.id) ? StarFilled : Star"
            circle
            class="favorite-btn"
            :class="{ active: isAnimeFavorite(anime.id) }"
            @click.stop="toggleFavorite(anime)"
          />
          <div class="anime-cover">
            <!-- 成人内容标记 -->
            <div v-if="anime.isAdult" class="adult-mark">
              <span>🔞</span>
            </div>
            <!-- 封面图片 -->
            <img
              v-else-if="anime.coverUrl && !anime.coverError"
              :src="anime.coverUrl"
              :alt="anime.title"
              class="cover-image"
              :class="{ 'image-loaded': anime.coverLoaded }"
              @load="handleImageLoad(anime)"
              @error="handleImageError(anime)"
            />
            <!-- 加载中状态 -->
            <div v-else-if="!anime.coverUrl && !anime.coverError" class="image-loading">
              <el-icon class="loading-icon"><Loading /></el-icon>
              <span class="loading-text">加载中...</span>
            </div>
            <!-- 加载失败/无封面状态 -->
            <div v-else class="image-error">
              <el-icon><Picture /></el-icon>
              <span class="error-text">暂无封面</span>
            </div>
            <span v-if="anime.episode > 0" class="episode-badge">
              更新至 {{ anime.episode }} 集
            </span>
          </div>
          <div class="anime-info">
            <h3 class="anime-title" :title="anime.title">{{ anime.title }}</h3>
            <div class="anime-meta">
              <el-tag v-if="anime.year" size="small">{{ anime.year }}</el-tag>
              <el-tag v-if="anime.season" size="small" type="success">{{ anime.season }}</el-tag>
              <el-tag v-if="anime.subtitleGroup" size="small" type="info">{{ anime.subtitleGroup }}</el-tag>
            </div>
            <!-- 播放进度 -->
            <div v-if="anime.playbackProgress && anime.playbackProgress.progressPercent > 0" class="progress-info">
              <span class="progress-text">看到第{{ anime.playbackProgress.episodeNum }}集 {{ anime.playbackProgress.positionFormatted }}</span>
              <el-progress :percentage="anime.playbackProgress.progressPercent" :show-text="false" :stroke-width="3" />
            </div>
            <!-- 调试: 显示哪些番剧有播放进度 -->
            <div v-else-if="anime.playbackProgress" style="font-size: 10px; color: orange;">
              进度0%: {{ anime.playbackProgress.episodeNum }}
            </div>
          </div>
        </el-card>
      </div>

      <!-- 分页 -->
      <div v-if="animeStore.totalPages > 1" class="pagination">
        <el-pagination
          v-model:current-page="currentPage"
          :page-count="animeStore.totalPages"
          layout="prev, pager, next"
          @change="handlePageChange"
        />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Picture, Loading, Star, StarFilled } from '@element-plus/icons-vue'
import { useAnimeStore, useFavoritesStore } from '../stores'
import { ElMessage } from 'element-plus'

const router = useRouter()
const animeStore = useAnimeStore()
const favoritesStore = useFavoritesStore()

const searchQuery = ref('')
const currentPage = ref(1)

// 滚动位置存储键
const SCROLL_POSITION_KEY = 'home_scroll_position'

// 保存滚动位置
const saveScrollPosition = () => {
  sessionStorage.setItem(SCROLL_POSITION_KEY, JSON.stringify({
    scrollY: window.scrollY,
    page: currentPage.value,
    search: searchQuery.value
  }))
}

// 恢复滚动位置
const restoreScrollPosition = async () => {
  const saved = sessionStorage.getItem(SCROLL_POSITION_KEY)
  if (saved) {
    try {
      const { scrollY, page, search } = JSON.parse(saved)
      
      // 恢复搜索状态
      if (search) {
        searchQuery.value = search
      }
      
      // 恢复页码
      if (page && page > 1) {
        currentPage.value = page
      }
      
      // 等待数据加载完成后恢复滚动位置
      await nextTick()
      setTimeout(() => {
        window.scrollTo({ top: scrollY, behavior: 'instant' })
      }, 100)
      
      // 清除保存的位置
      sessionStorage.removeItem(SCROLL_POSITION_KEY)
      return true
    } catch (e) {
      console.error('[Home] 恢复滚动位置失败:', e)
    }
  }
  return false
}

onMounted(async () => {
  // 尝试恢复滚动位置
  const restored = await restoreScrollPosition()
  
  if (!restored) {
    // 没有保存的位置，正常加载
    await animeStore.fetchAnimeList(1, true)
  } else {
    // 恢复搜索状态后加载对应数据
    if (searchQuery.value) {
      await animeStore.search(searchQuery.value, currentPage.value, true)
    } else {
      await animeStore.fetchAnimeList(currentPage.value, true)
    }
  }
  
  // 加载收藏列表
  favoritesStore.loadFavorites()
  
  // 监听页面离开事件保存滚动位置
  window.addEventListener('beforeunload', saveScrollPosition)
})

onUnmounted(() => {
  // 清理定时器
  animeStore.cleanup()
  window.removeEventListener('beforeunload', saveScrollPosition)
})

function handleSearch() {
  if (searchQuery.value.trim()) {
    animeStore.search(searchQuery.value.trim(), 1, true)
  } else {
    animeStore.fetchAnimeList(1, true)
  }
}

function handlePageChange(page: number) {
  animeStore.fetchAnimeList(page, true)
  // 滚动到顶部
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goToDetail(id: string) {
  saveScrollPosition()
  router.push(`/anime/${id}`)
}

function handleImageLoad(anime: any) {
  anime.coverLoaded = true
}

function handleImageError(anime: any) {
  // 图片加载失败时标记错误，显示默认错误图标
  anime.coverError = true
  anime.coverUrl = ''
}

// 检查是否已收藏
function isAnimeFavorite(animeId: string): boolean {
  try {
    return favoritesStore.isFavorite(animeId)
  } catch {
    return false
  }
}

async function toggleFavorite(anime: any) {
  try {
    if (isAnimeFavorite(anime.id)) {
      await favoritesStore.removeFavorite(anime.id)
      ElMessage.success('已取消收藏')
    } else {
      // 构造收藏需要的完整对象
      await favoritesStore.addFavorite({
        animeId: anime.id,
        title: anime.title,
        coverUrl: anime.coverUrl,
        detailUrl: anime.detailUrl || `/anime/${anime.id}`, // 使用详情页路径
        year: anime.year,
        season: anime.season,
        subtitleGroup: anime.subtitleGroup
      })
      ElMessage.success('已添加到收藏')
    }
  } catch (error) {
    ElMessage.error('操作失败')
  }
}
</script>

<style scoped>
.home {
  min-height: 100%;
  background: var(--el-bg-color-page);
}

.page-header {
  padding: 20px 40px;
  border-bottom: 1px solid var(--el-border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 20px;
  background: var(--el-bg-color);
}

.page-header h1 {
  margin: 0;
  font-size: 24px;
  color: var(--el-text-color-primary);
}

.search {
  width: 300px;
}

.main {
  padding: 20px 40px;
}

.loading {
  padding: 40px;
}

.anime-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 20px;
}

.anime-card {
  cursor: pointer;
  transition: transform 0.2s, box-shadow 0.2s;
  position: relative;
}

.anime-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
}

.favorite-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 10;
  background: rgba(255, 255, 255, 0.9);
  border: none;
  opacity: 0;
  transition: opacity 0.2s;
}

.anime-card:hover .favorite-btn {
  opacity: 1;
}

.favorite-btn.active {
  opacity: 1;
  color: #f7ba2a;
  background: rgba(255, 255, 255, 0.95);
}

.favorite-btn:hover {
  transform: scale(1.1);
}

.anime-cover {
  position: relative;
  aspect-ratio: 2/3;
  overflow: hidden;
  border-radius: 4px;
}

.cover-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.image-loading {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  gap: 8px;
}

.loading-icon {
  font-size: 28px;
  animation: rotate 1s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.loading-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.image-error {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
  font-size: 32px;
  gap: 8px;
}

.error-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.episode-badge {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.7);
  color: white;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 12px;
}

.anime-info {
  padding: 12px 0;
}

.anime-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 40px;
}

.anime-meta {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.progress-info {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.progress-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: block;
  margin-bottom: 4px;
}

.adult-mark {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #252542 0%, #1a1a2e 100%);
  font-size: 40px;
}

.adult-mark span {
  filter: grayscale(100%);
  opacity: 0.8;
}

.pagination {
  margin-top: 40px;
  display: flex;
  justify-content: center;
  padding-bottom: 40px;
}

@media (max-width: 768px) {
  .page-header {
    flex-direction: column;
    padding: 20px;
  }
  
  .search {
    width: 100%;
  }
  
  .main {
    padding: 20px;
  }
  
  .anime-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
}
</style>
