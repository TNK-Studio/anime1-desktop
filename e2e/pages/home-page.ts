/**
 * 首页面对象
 * 
 * 对应 views/Home.vue
 */
import { BasePage } from './base-page'
import type { Page, Locator } from '@playwright/test'

export class HomePage extends BasePage {
  // 选择器
  readonly selectors = {
    header: '.header h1',
    searchInput: '.search input',
    searchButton: '.search button',
    animeGrid: '.anime-grid',
    animeCard: '.anime-card',
    animeTitle: '.anime-title',
    loading: '.loading',
    empty: '.el-empty',
    pagination: '.el-pagination',
    episodeBadge: '.episode-badge',
  }

  constructor(page: Page) {
    super(page)
  }

  /**
   * 导航到首页
   */
  async goto(): Promise<void> {
    await this.page.goto('/')
    await this.waitForLoaded()
  }

  /**
   * 获取页面标题
   */
  async getTitle(): Promise<string> {
    return await this.getText(this.selectors.header)
  }

  /**
   * 搜索番剧
   */
  async search(keyword: string): Promise<void> {
    await this.safeFill(this.selectors.searchInput, keyword)
    await this.safeClick(this.selectors.searchButton)
    // 等待加载完成
    await this.page.waitForSelector(this.selectors.animeGrid, { timeout: 15000 })
  }

  /**
   * 获取搜索结果
   */
  async getSearchResults(): Promise<Array<{ title: string; episode?: string }>> {
    const cards = this.page.locator(this.selectors.animeCard)
    const count = await cards.count()
    const results = []
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i)
      const title = await card.locator(this.selectors.animeTitle).textContent() || ''
      const episode = await card.locator(this.selectors.episodeBadge).textContent().catch(() => undefined)
      results.push({ title: title.trim(), episode: episode?.trim() })
    }
    
    return results
  }

  /**
   * 点击番剧卡片进入详情页
   */
  async clickAnimeCard(index = 0): Promise<void> {
    await this.page.locator(this.selectors.animeCard).nth(index).click()
  }

  /**
   * 获取番剧卡片数量
   */
  async getAnimeCount(): Promise<number> {
    return await this.page.locator(this.selectors.animeCard).count()
  }

  /**
   * 检查是否显示加载中
   */
  async isLoading(): Promise<boolean> {
    return await this.hasElement(this.selectors.loading)
  }

  /**
   * 检查是否显示空状态
   */
  async isEmpty(): Promise<boolean> {
    return await this.hasElement(this.selectors.empty)
  }

  /**
   * 获取番剧卡片的 ID
   */
  async getAnimeId(index = 0): Promise<string | null> {
    const card = this.page.locator(this.selectors.animeCard).nth(index)
    const id = await card.getAttribute('data-id')
    return id
  }

  /**
   * 翻页到指定页码
   */
  async goToPage(pageNum: number): Promise<void> {
    const pageButton = this.page.locator(`.el-pagination .number:has-text("${pageNum}")`)
    await pageButton.click()
    // 等待页面刷新
    await this.page.waitForTimeout(500)
  }

  /**
   * 获取当前页码
   */
  async getCurrentPage(): Promise<number> {
    const activePage = this.page.locator('.el-pagination .active')
    const text = await activePage.textContent()
    return parseInt(text || '1', 10)
  }
}
