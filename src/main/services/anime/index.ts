/**
 * 番剧服务
 * 
 * 对应原项目: src/services/anime_cache_service.py
 * 职责: 番剧数据管理、缓存、搜索
 */

import { EventEmitter } from 'events'
import log from 'electron-log'
import * as OpenCC from 'opencc-js'
import type { DatabaseService } from '../database'
import type { CrawlerService } from '../crawler'
import type { Anime, AnimePage, Episode, CacheStatus } from '@shared/types'
import { PAGINATION, CACHE_CONFIG } from '@shared/constants'

export class AnimeService extends EventEmitter {
  private databaseService: DatabaseService
  private crawlerService: CrawlerService
  private animeCache: Map<string, Anime> = new Map()
  private cacheInitialized = false
  private isRefreshing = false
  private refreshInterval: NodeJS.Timeout | null = null
  private s2tConverter: any
  private t2sConverter: any

  constructor(databaseService: DatabaseService, crawlerService: CrawlerService) {
    super()
    this.databaseService = databaseService
    this.crawlerService = crawlerService

    // 初始化简繁转换器
    try {
      this.s2tConverter = OpenCC.Converter({ from: 'cn', to: 'tw' })
      this.t2sConverter = OpenCC.Converter({ from: 'tw', to: 'cn' })
      log.info('[AnimeService] OpenCC converters initialized successfully')
    } catch (e) {
      log.warn('[AnimeService] OpenCC init failed:', e)
    }
  }

  /**
   * 初始化服务
   */
  async initialize(): Promise<void> {
    log.info('[AnimeService] Initializing...')
    
    // 加载番剧列表
    await this.loadAnimeList()
    
    // 启动后台刷新
    this.startBackgroundRefresh()
    
    this.cacheInitialized = true
    this.emit('initialized')
    
    log.info('[AnimeService] Initialized')
  }

  /**
   * 加载番剧列表
   */
  private async loadAnimeList(): Promise<void> {
    try {
      log.info('[AnimeService] Loading anime list...')
      
      const animeList = await this.crawlerService.fetchAnimeList()
      
      // 更新缓存
      this.animeCache.clear()
      for (const anime of animeList) {
        this.animeCache.set(anime.id, anime)
      }
      
      log.info(`[AnimeService] Loaded ${animeList.length} anime`)
      
      // 后台加载封面缓存
      this.loadCoverCachesInBackground()
    } catch (error) {
      log.error('[AnimeService] Failed to load anime list:', error)
      throw error
    }
  }

  /**
   * 后台加载封面缓存
   * 对应原项目: src/services/anime_cache_service.py - _fetch_anime_details
   */
  private async loadCoverCachesInBackground(): Promise<void> {
    const animeList = Array.from(this.animeCache.values())
    log.info(`[AnimeService] Loading cover caches for ${animeList.length} anime...`)
    
    let cachedCount = 0
    let fetchedCount = 0
    let failedCount = 0
    
    // 分批处理，避免阻塞和内存问题
    // 先处理前 200 个，剩余的延迟处理
    const initialLimit = 200
    const priorityList = animeList.slice(0, initialLimit)
    const remainingList = animeList.slice(initialLimit)
    
    log.info(`[AnimeService] Processing first ${priorityList.length} anime immediately, ${remainingList.length} deferred`)
    
    // 处理前 N 个
    await this.processCoverCacheBatch(priorityList, cachedCount, fetchedCount, failedCount)
    
    // 延迟处理剩余的（避免启动时占用太多资源）
    if (remainingList.length > 0) {
      setTimeout(() => {
        this.processCoverCacheBatch(remainingList, cachedCount, fetchedCount, failedCount)
          .catch(e => log.error('[AnimeService] Deferred cover cache loading failed:', e))
      }, 30000) // 30 秒后再处理剩余的
    }
  }
  
  /**
   * 处理封面缓存批次
   */
  private async processCoverCacheBatch(
    animeList: Anime[], 
    cachedCount: number, 
    fetchedCount: number, 
    failedCount: number
  ): Promise<void> {
    // 分批处理，降低并发
    const batchSize = 3
    for (let i = 0; i < animeList.length; i += batchSize) {
      const batch = animeList.slice(i, i + batchSize)
      log.debug(`[AnimeService] Processing batch ${i/batchSize + 1}/${Math.ceil(animeList.length/batchSize)}`)
      
      await Promise.all(
        batch.map(async (anime) => {
          try {
            // 检查是否有缓存
            const cached = this.databaseService.getCoverCache(anime.id)
            
            if (cached) {
              log.debug(`[AnimeService] Cache hit for ${anime.id}: coverUrl=${cached.coverUrl ? 'present' : 'missing'}`)
              // 更新 anime 对象
              anime.coverUrl = cached.coverUrl
              anime.year = cached.year || anime.year
              anime.season = cached.season || anime.season
              anime.subtitleGroup = cached.subtitleGroup || anime.subtitleGroup
              cachedCount++
              return
            }
            
            // 1. 先从 anime1.me 详情页获取信息（年份、季度、字幕组）
            if (anime.detailUrl && !anime.detailUrl.startsWith('http')) {
              try {
                log.debug(`[AnimeService] Fetching detail for ${anime.id} from ${anime.detailUrl}`)
                const detailInfo = await this.crawlerService.fetchAnimeDetail(anime.detailUrl)
                if (detailInfo.year) anime.year = detailInfo.year
                if (detailInfo.season) anime.season = detailInfo.season
                if (detailInfo.subtitleGroup) anime.subtitleGroup = detailInfo.subtitleGroup
                log.debug(`[AnimeService] Got detail for ${anime.id}: year=${anime.year}, season=${anime.season}`)
              } catch (e) {
                log.debug(`[AnimeService] Failed to fetch detail for ${anime.id}:`, e)
              }
            }
            
            // 2. 从 Bangumi 获取封面
            log.debug(`[AnimeService] Searching Bangumi for ${anime.id}: ${anime.title}`)
            const bangumiResult = await this.crawlerService.findBangumiInfo(
              anime.title,
              anime.year
            )
            
            if (bangumiResult) {
              log.info(`[AnimeService] Got Bangumi cover for ${anime.id}: ${bangumiResult.info.coverUrl?.substring(0, 50)}...`)
              anime.coverUrl = bangumiResult.info.coverUrl || ''
              anime.matchScore = bangumiResult.score
              anime.matchSource = 'Bangumi'
              fetchedCount++
              
              // 保存到数据库
              this.databaseService.setCoverCache(anime.id, {
                title: anime.title,
                coverUrl: anime.coverUrl,
                year: anime.year,
                season: anime.season,
                subtitleGroup: anime.subtitleGroup,
                episode: anime.episode
              }, bangumiResult.info)
            } else {
              log.debug(`[AnimeService] No Bangumi result for ${anime.id}: ${anime.title}`)
              failedCount++
            }
          } catch (error) {
            log.warn(`[AnimeService] Failed to load cover for ${anime.id}:`, error)
            failedCount++
          }
        })
      )
      
      // 延迟，避免请求过快
      await this.sleep(1000)
    }
    
    log.info(`[AnimeService] Cover cache loading complete: ${cachedCount} cached, ${fetchedCount} fetched, ${failedCount} failed`)
  }

  /**
   * 启动后台刷新
   */
  private startBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
    }
    
    this.refreshInterval = setInterval(async () => {
      try {
        await this.refreshCache()
      } catch (error) {
        log.error('[AnimeService] Background refresh failed:', error)
      }
    }, CACHE_CONFIG.REFRESH_INTERVAL)
    
    log.info('[AnimeService] Background refresh started')
  }

  /**
   * 停止后台刷新
   */
  stopBackgroundRefresh(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval)
      this.refreshInterval = null
      log.info('[AnimeService] Background refresh stopped')
    }
  }

  /**
   * 获取番剧 Map（用于更新检查）
   */
  getAnimeMap(): Map<string, Anime> {
    return this.animeCache
  }

  /**
   * 获取番剧列表（分页）
   */
  async getList(page: number, pageSize: number = PAGINATION.DEFAULT_PAGE_SIZE): Promise<AnimePage> {
    await this.ensureInitialized()
    
    const allAnime = Array.from(this.animeCache.values())
    const totalItems = allAnime.length
    const totalPages = Math.ceil(totalItems / pageSize)
    
    const startIdx = (page - 1) * pageSize
    const endIdx = startIdx + pageSize
    const pageAnime = allAnime.slice(startIdx, endIdx)
    
    return {
      animeList: pageAnime,
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }

  /**
   * 获取番剧详情
   */
  async getDetail(animeId: string): Promise<Anime> {
    await this.ensureInitialized()
    
    const anime = this.animeCache.get(animeId)
    if (!anime) {
      throw new Error(`Anime not found: ${animeId}`)
    }
    
    // 获取详细信息（年份、季节等）
    if (!anime.year || !anime.season) {
      try {
        const detail = await this.crawlerService.fetchAnimeDetail(anime.detailUrl)
        anime.year = detail.year || anime.year
        anime.season = detail.season || anime.season
        anime.subtitleGroup = detail.subtitleGroup || anime.subtitleGroup
      } catch (error) {
        log.warn(`[AnimeService] Failed to fetch detail for ${animeId}:`, error)
      }
    }
    
    // 获取封面（如果没有）
    if (!anime.coverUrl) {
      const bangumiResult = await this.crawlerService.findBangumiInfo(
        anime.title,
        anime.year
      )
      
      if (bangumiResult) {
        anime.coverUrl = bangumiResult.info.coverUrl || ''
        anime.matchScore = bangumiResult.score
        anime.matchSource = 'Bangumi'
        
        this.databaseService.setCoverCache(anime.id, {
          title: anime.title,
          coverUrl: anime.coverUrl,
          year: anime.year,
          season: anime.season,
          subtitleGroup: anime.subtitleGroup,
          episode: anime.episode
        }, bangumiResult.info)
      }
    }
    
    return anime
  }

  /**
   * 获取剧集列表
   */
  async getEpisodes(animeId: string): Promise<Episode[]> {
    await this.ensureInitialized()
    
    const anime = this.animeCache.get(animeId)
    if (!anime) {
      throw new Error(`Anime not found: ${animeId}`)
    }
    
    return this.crawlerService.fetchEpisodes(anime.detailUrl)
  }

  /**
   * 搜索番剧
   */
  async search(keyword: string, page: number = 1): Promise<AnimePage> {
    await this.ensureInitialized()

    const allAnime = Array.from(this.animeCache.values())

    // 简繁转换
    const variants = this.getSearchVariants(keyword)

    // 过滤
    const filtered = allAnime.filter(anime => {
      const title = anime.title.toLowerCase()
      return variants.some(v => title.includes(v.toLowerCase()))
    })

    // 分页
    const pageSize = PAGINATION.DEFAULT_PAGE_SIZE
    const totalPages = Math.ceil(filtered.length / pageSize)
    const startIdx = (page - 1) * pageSize
    const endIdx = startIdx + pageSize
    
    return {
      animeList: filtered.slice(startIdx, endIdx),
      currentPage: page,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  }

  /**
   * 获取搜索变体（简繁）
   * 使用 opencc-js 进行完整的简繁转换
   */
  private getSearchVariants(keyword: string): string[] {
    const variants = new Set<string>([keyword])

    // 简体转繁体
    if (this.s2tConverter) {
      try {
        const traditional = this.s2tConverter(keyword)
        if (traditional !== keyword) {
          variants.add(traditional)
        }
      } catch (e) {
        log.warn('[AnimeService] S2T conversion failed:', e)
      }
    }

    // 繁体转简体
    if (this.t2sConverter) {
      try {
        const simplified = this.t2sConverter(keyword)
        if (simplified !== keyword) {
          variants.add(simplified)
        }
      } catch (e) {
        log.warn('[AnimeService] T2S conversion failed:', e)
      }
    }

    return Array.from(variants)
  }

  /**
   * 获取缓存状态
   */
  getCacheStatus(): CacheStatus {
    const cachedCovers = this.databaseService.getCoverCacheCount()
    
    return {
      animeCount: this.animeCache.size,
      coversCached: cachedCovers,
      lastRefresh: null, // TODO: 记录最后刷新时间
      isRefreshing: this.isRefreshing,
      initialLoadComplete: this.cacheInitialized,
      progress: {
        currentPage: 0,
        totalPages: 0,
        currentIndex: 0,
        totalAnime: this.animeCache.size,
        isFetching: this.isRefreshing
      }
    }
  }

  /**
   * 刷新缓存
   */
  async refreshCache(): Promise<void> {
    if (this.isRefreshing) {
      log.warn('[AnimeService] Cache refresh already in progress')
      return
    }
    
    this.isRefreshing = true
    this.emit('refreshStart')
    
    try {
      log.info('[AnimeService] Refreshing cache...')
      
      // 重新加载列表
      await this.loadAnimeList()
      
      this.emit('refreshComplete')
      log.info('[AnimeService] Cache refreshed')
    } catch (error) {
      this.emit('refreshError', error)
      log.error('[AnimeService] Failed to refresh cache:', error)
      throw error
    } finally {
      this.isRefreshing = false
    }
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.cacheInitialized) {
      await this.initialize()
    }
  }

  /**
   * 延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * 获取所有番剧（用于导出等）
   */
  getAllAnime(): Anime[] {
    return Array.from(this.animeCache.values())
  }

  /**
   * 关闭服务
   */
  close(): void {
    this.stopBackgroundRefresh()
    this.removeAllListeners()
    log.info('[AnimeService] Service closed')
  }
}
