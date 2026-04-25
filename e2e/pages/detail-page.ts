/**
 * 详情页面对象
 *
 * 对应 views/Detail.vue
 */
import { BasePage } from './base-page'
import type { Page } from '@playwright/test'

export class DetailPage extends BasePage {
  readonly selectors = {
    title: '.anime-title',
    cover: '.cover-image',
    favoriteButton: '.favorite-btn',
    episodeList: '.episode-grid',
    episodeCard: '.episode-card',
    backButton: '.back-btn',
    bangumiSection: '.bangumi-section',
    videoPlayer: 'video.video-player',
    videoLoading: '.video-loading',
    videoError: '.video-error',
  }

  constructor(page: Page) {
    super(page)
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.getText(this.selectors.title)
  }

  /**
   * 点击收藏/取消收藏按钮
   */
  async toggleFavorite(): Promise<void> {
    await this.safeClick(this.selectors.favoriteButton)
  }

  /**
   * 检查是否已收藏
   */
  async isFavorited(): Promise<boolean> {
    const btn = this.page.locator(this.selectors.favoriteButton)
    const classes = await btn.getAttribute('class') || ''
    return classes.includes('active')
  }

  /**
   * 获取剧集列表
   */
  async getEpisodes(): Promise<Array<{ title: string; index: number }>> {
    const items = this.page.locator(this.selectors.episodeCard)
    const count = await items.count()
    const episodes = []

    for (let i = 0; i < count; i++) {
      const item = items.nth(i)
      const title = await item.textContent() || ''
      episodes.push({ title: title.trim().replace(/\s+/g, ' '), index: i })
    }

    return episodes
  }

  /**
   * 获取当前激活（正在播放）的剧集索引
   */
  async getActiveEpisodeIndex(): Promise<number> {
    const cards = this.page.locator(this.selectors.episodeCard)
    const count = await cards.count()

    for (let i = 0; i < count; i++) {
      const classes = await cards.nth(i).getAttribute('class') || ''
      if (classes.includes('active')) {
        return i
      }
    }

    return -1
  }

  /**
   * 点击剧集播放
   */
  async clickEpisode(index: number): Promise<void> {
    await this.page.locator(this.selectors.episodeCard).nth(index).click()
  }

  /**
   * 点击返回按钮
   */
  async goBack(): Promise<void> {
    await this.safeClick(this.selectors.backButton)
  }

  /**
   * 获取视频元素
   */
  getVideoElement() {
    return this.page.locator(this.selectors.videoPlayer)
  }

  /**
   * 等待视频加载
   */
  async waitForVideoLoaded(timeout = 15000): Promise<void> {
    const video = this.getVideoElement()
    await video.waitFor({ state: 'visible', timeout })
  }

  /**
   * 获取视频当前时间
   */
  async getVideoCurrentTime(): Promise<number> {
    const video = this.getVideoElement()
    return await video.evaluate((el: HTMLVideoElement) => el.currentTime)
  }

  /**
   * 获取 Bangumi 信息
   */
  async getBangumiInfo(): Promise<{ rating?: string; tags?: string[] }> {
    const info: { rating?: string; tags?: string[] } = {}

    const bangumiSection = this.page.locator(this.selectors.bangumiSection)
    if (await bangumiSection.count() > 0) {
      info.rating = await bangumiSection.locator('.rating-value').textContent() || undefined
      const tagElements = bangumiSection.locator('.el-tag')
      const tagCount = await tagElements.count()
      info.tags = []
      for (let i = 0; i < tagCount; i++) {
        const tag = await tagElements.nth(i).textContent()
        if (tag) info.tags.push(tag.trim())
      }
    }

    return info
  }
}
