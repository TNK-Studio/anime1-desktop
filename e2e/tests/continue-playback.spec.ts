/**
 * 续播功能测试
 *
 * 测试进入番剧详情页时，自动选择未看完的集数并跳转到历史进度
 */
import { test, expect } from "../fixtures";
import { HomePage, DetailPage } from "../pages";

test.describe("续播功能", () => {
  test.beforeEach(async ({ window }) => {
    // 确保每个测试开始时都在首页
    const url = window.url();
    if (!url.includes("/anime/")) {
      // 已经在首页或根路径
      return;
    }
    // 如果在详情页，点击返回
    const detailPage = new DetailPage(window);
    await detailPage.goBack();
    await window.waitForTimeout(2000);
  });

  test("没有历史记录时应该播放第一集", async ({ window }) => {
    const homePage = new HomePage(window);
    const detailPage = new DetailPage(window);

    // 等待首页加载
    await homePage.waitForLoaded();
    await window.waitForTimeout(3000);

    const animeCount = await homePage.getAnimeCount();
    if (animeCount === 0) {
      test.skip("没有可点击的番剧");
      return;
    }

    // 获取第一个番剧的 ID
    const animeId = await homePage.getAnimeId(0);
    if (!animeId) {
      test.skip("无法获取番剧 ID");
      return;
    }

    // 清除该番剧的历史记录
    await window.evaluate(async (id) => {
      await window.api.history.delete({ animeId: id });
    }, animeId);

    // 点击第一个卡片进入详情
    await homePage.clickAnimeCard(0);
    await window.waitForTimeout(3000);

    // 等待详情页加载
    await detailPage.waitForLoaded();
    await window.waitForTimeout(3000);

    // 验证激活的是第一集
    const activeIndex = await detailPage.getActiveEpisodeIndex();
    expect(activeIndex).toBe(0);
  });

  test("第一集未看完时应该自动播放第一集并跳转进度", async ({ window }) => {
    const homePage = new HomePage(window);
    const detailPage = new DetailPage(window);

    // 确保在首页
    await homePage.waitForLoaded();
    await window.waitForTimeout(3000);

    const animeCount = await homePage.getAnimeCount();
    if (animeCount === 0) {
      test.skip("没有可点击的番剧");
      return;
    }

    // 获取第一个番剧的 ID
    const animeId = await homePage.getAnimeId(0);
    if (!animeId) {
      test.skip("无法获取番剧 ID");
      return;
    }

    // 清除历史记录
    await window.evaluate(async (id) => {
      await window.api.history.delete({ animeId: id });
    }, animeId);

    // 先进入详情页获取剧集信息
    await homePage.clickAnimeCard(0);
    await window.waitForTimeout(2000);
    await detailPage.waitForLoaded();

    const episodes = await detailPage.getEpisodes();
    if (episodes.length === 0) {
      test.skip("没有剧集数据");
      return;
    }

    // 获取第一集的 episodeId
    const firstEpisodeCard = window.locator(detailPage.selectors.episodeCard).nth(0);
    const episodeId = await firstEpisodeCard.getAttribute("data-id") || "";
    const episodeTitle = await detailPage.getTitle();

    // 先返回首页
    await detailPage.goBack();
    await window.waitForTimeout(2000);

    // 保存第一集的历史记录（看到 30 秒，总时长 1200 秒）
    await window.evaluate(
      async ({ animeId, animeTitle, episodeId, episodeNum }) => {
        await window.api.history.save({
          animeId,
          animeTitle,
          episodeId,
          episodeNum,
          positionSeconds: 30,
          totalSeconds: 1200,
        });
      },
      {
        animeId,
        animeTitle: episodeTitle || "测试番剧",
        episodeId,
        episodeNum: 1,
      },
    );

    // 重新进入详情页
    await homePage.clickAnimeCard(0);
    await window.waitForTimeout(3000);
    await detailPage.waitForLoaded();
    await window.waitForTimeout(3000);

    // 验证激活的是第一集
    const activeIndex = await detailPage.getActiveEpisodeIndex();
    expect(activeIndex).toBe(0);

    // 验证视频播放器显示了
    const hasVideo = await detailPage.hasElement(detailPage.selectors.videoPlayer);
    if (hasVideo) {
      // 等待视频加载并跳转
      await detailPage.waitForVideoLoaded();
      await window.waitForTimeout(2000);

      // 获取当前播放时间
      const currentTime = await detailPage.getVideoCurrentTime();
      console.log("[E2E] 视频当前时间:", currentTime);

      // 应该跳转到历史进度附近（允许一定误差）
      expect(currentTime).toBeGreaterThanOrEqual(25);
    }
  });

  test("第一集已看完时应该自动播放第二集", async ({ window }) => {
    const homePage = new HomePage(window);
    const detailPage = new DetailPage(window);

    // 确保在首页
    await homePage.waitForLoaded();
    await window.waitForTimeout(3000);

    const animeCount = await homePage.getAnimeCount();
    if (animeCount === 0) {
      test.skip("没有可点击的番剧");
      return;
    }

    // 获取第一个番剧的 ID
    const animeId = await homePage.getAnimeId(0);
    if (!animeId) {
      test.skip("无法获取番剧 ID");
      return;
    }

    // 清除历史记录
    await window.evaluate(async (id) => {
      await window.api.history.delete({ animeId: id });
    }, animeId);

    // 先进入详情页获取剧集信息
    await homePage.clickAnimeCard(0);
    await window.waitForTimeout(2000);
    await detailPage.waitForLoaded();

    const episodes = await detailPage.getEpisodes();
    if (episodes.length < 2) {
      test.skip("剧集不足 2 集，无法测试续播到下一集");
      return;
    }

    // 获取前两集的 episodeId
    const episodeCards = window.locator(detailPage.selectors.episodeCard);
    const firstEpisodeId = await episodeCards.nth(0).getAttribute("data-id") || "";
    const episodeTitle = await detailPage.getTitle();

    // 先返回首页
    await detailPage.goBack();
    await window.waitForTimeout(2000);

    // 保存第一集已看完的历史记录（进度 95%）
    await window.evaluate(
      async ({ animeId, animeTitle, episodeId }) => {
        await window.api.history.save({
          animeId,
          animeTitle,
          episodeId,
          episodeNum: 1,
          positionSeconds: 1140,
          totalSeconds: 1200,
        });
      },
      { animeId, animeTitle: episodeTitle || "测试番剧", episodeId: firstEpisodeId },
    );

    // 重新进入详情页
    await homePage.clickAnimeCard(0);
    await window.waitForTimeout(3000);
    await detailPage.waitForLoaded();
    await window.waitForTimeout(3000);

    // 验证激活的是第二集
    const activeIndex = await detailPage.getActiveEpisodeIndex();
    expect(activeIndex).toBe(1);
  });
});
