/**
 * 共享 Electron 应用的测试 Fixtures
 *
 * 多个测试共享同一个 Electron 实例，提高测试速度
 */
import { test, expect } from '../fixtures/shared'

test.describe('功能验证', () => {
  test('剧集获取应该正常', async ({ window }) => {
    // 直接使用已知番剧 ID 来测试剧集获取
    const animeId = '1646' // 鬼滅之刃 柱訓練篇

    // 获取剧集列表
    const episodesResult = await window.evaluate(async (id) => {
      return await window.api.anime.getEpisodes({ id })
    }, animeId)

    console.log('episodesResult:', episodesResult)

    expect(episodesResult).toBeDefined()
    expect(episodesResult.success).toBe(true)

    // 验证返回格式
    expect(Array.isArray(episodesResult.data.episodes)).toBe(true)

    const episodes = episodesResult.data.episodes
    console.log('剧集数量:', episodes.length)

    // 验证有剧集
    expect(episodes.length).toBeGreaterThan(0)
  })
})
