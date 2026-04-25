/**
 * IPC 处理器注册中心
 *
 * 对应原项目: src/routes/ 下的所有 Flask 路由
 * 职责: 注册所有 IPC 处理器，处理渲染进程请求
 */

import { ipcMain, shell, BrowserWindow } from "electron";
import type { DatabaseService } from "../services/database";
import type { AnimeService } from "../services/anime";
import type { CrawlerService } from "../services/crawler";
import type { DownloadService } from "../services/download";
import type { UpdateService } from "../services/update";
import type { AutoDownloadService } from "../services/autoDownload";
import { videoProxyService } from "../services/video-proxy";
import { hlsProxyService } from "../services/video-proxy/hls-proxy";
import log from "electron-log";

// 服务容器接口
interface Services {
  databaseService: DatabaseService;
  animeService: AnimeService;
  crawlerService: CrawlerService;
  downloadService: DownloadService;
  updateService: UpdateService;
  autoDownloadService: AutoDownloadService;
  videoProxyService: any;
  hlsProxyService: any;
}

/**
 * 格式化时长（秒 -> MM:SS 或 HH:MM:SS）
 */
function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "00:00";

  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 注册所有 IPC 处理器
 */
export function registerIPCHandlers(services: Services): void {
  const {
    databaseService,
    animeService,
    crawlerService,
    downloadService,
    updateService,
    autoDownloadService,
  } = services;

  // ==========================================
  // 番剧相关 IPC
  // ==========================================

  // 获取番剧列表
  ipcMain.handle(
    "anime:list",
    async (_, params: { page: number; pageSize?: number }) => {
      try {
        const result = await animeService.getList(
          params.page,
          params.pageSize || 24,
        );
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取番剧列表（带播放进度）
  ipcMain.handle(
    "anime:listWithProgress",
    async (_, params: { page: number; pageSize?: number }) => {
      try {
        const result = await animeService.getList(
          params.page,
          params.pageSize || 24,
        );

        // 为每个番剧获取播放进度
        const animeListWithProgress = await Promise.all(
          result.animeList.map(async (anime) => {
            const playback = databaseService.getLatestPlaybackForAnime(
              anime.id,
            );
            return {
              ...anime,
              playbackProgress: playback
                ? {
                    episodeNum: playback.episodeNum,
                    positionSeconds: playback.positionSeconds,
                    positionFormatted: formatDuration(playback.positionSeconds),
                    progressPercent:
                      playback.totalSeconds > 0
                        ? Math.round(
                            (playback.positionSeconds / playback.totalSeconds) *
                              100,
                          )
                        : 0,
                    lastWatchedAt: playback.lastWatchedAt,
                  }
                : null,
            };
          }),
        );

        return {
          success: true,
          data: {
            ...result,
            animeList: animeListWithProgress,
          },
        };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取番剧详情
  ipcMain.handle("anime:detail", async (_, params: { id: string }) => {
    try {
      const result = await animeService.getDetail(params.id);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 获取剧集列表
  ipcMain.handle("anime:episodes", async (_, params: { id: string }) => {
    try {
      const result = await animeService.getEpisodes(params.id);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 搜索番剧
  ipcMain.handle(
    "anime:search",
    async (_, params: { keyword: string; page?: number }) => {
      try {
        const result = await animeService.search(
          params.keyword,
          params.page || 1,
        );
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 搜索番剧（带播放进度）
  ipcMain.handle(
    "anime:searchWithProgress",
    async (_, params: { keyword: string; page?: number }) => {
      try {
        const result = await animeService.search(
          params.keyword,
          params.page || 1,
        );

        // 为每个番剧获取播放进度
        const animeListWithProgress = await Promise.all(
          result.animeList.map(async (anime) => {
            const playback = databaseService.getLatestPlaybackForAnime(
              anime.id,
            );
            return {
              ...anime,
              playbackProgress: playback
                ? {
                    episodeNum: playback.episodeNum,
                    positionSeconds: playback.positionSeconds,
                    positionFormatted: formatDuration(playback.positionSeconds),
                    progressPercent:
                      playback.totalSeconds > 0
                        ? Math.round(
                            (playback.positionSeconds / playback.totalSeconds) *
                              100,
                          )
                        : 0,
                    lastWatchedAt: playback.lastWatchedAt,
                  }
                : null,
            };
          }),
        );

        return {
          success: true,
          data: {
            ...result,
            animeList: animeListWithProgress,
          },
        };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取 Bangumi 信息
  ipcMain.handle("anime:bangumi", async (_, params: { id: string }) => {
    try {
      const result = databaseService.getBangumiInfo(params.id);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 提取视频 URL
  ipcMain.handle(
    "anime:extractVideo",
    async (_, params: { episodeUrl: string }) => {
      try {
        const result = await crawlerService.extractVideoUrl(params.episodeUrl);

        // 检测是否为 m3u8 视频（剧场版）
        const isM3u8Video =
          result.url.includes(".m3u8") ||
          result.url.includes("#EXTM3U") ||
          result.url.includes("#EXT-X-STREAM-INF");

        let proxyUrl = "";

        if (isM3u8Video) {
          // 使用 HLS 代理服务
          proxyUrl = hlsProxyService.registerProxyUrl(
            result.url,
            result.cookies,
          );
        } else {
          // 使用普通视频代理服务
          proxyUrl = videoProxyService.registerProxyUrl(
            result.url,
            result.cookies,
          );
        }

        return {
          success: true,
          data: {
            ...result,
            url: proxyUrl,
            isM3u8: isM3u8Video,
          },
        };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取 HLS 代理 URL
  ipcMain.handle(
    "anime:getHlsProxyUrl",
    async (_, params: { episodeUrl: string; videoUrl?: string }) => {
      try {
        let videoUrl = params.videoUrl;
        let cookies: Record<string, string> | undefined;

        if (!videoUrl) {
          const result = await crawlerService.extractVideoUrl(
            params.episodeUrl,
          );
          videoUrl = result.url;
          cookies = result.cookies;
        }

        log.info(`[IPC] getHlsProxyUrl - videoUrl: ${videoUrl?.substring(0, 100)}...`);
        log.info(`[IPC] getHlsProxyUrl - hasCookies: ${!!cookies}`);

        const isM3u8Video =
          videoUrl.includes(".m3u8") ||
          videoUrl.includes("#EXTM3U") ||
          videoUrl.includes("#EXT-X-STREAM-INF");

        log.info(`[IPC] getHlsProxyUrl - isM3u8Video: ${isM3u8Video}`);

        let proxyUrl = "";

        if (isM3u8Video) {
          log.info(`[IPC] getHlsProxyUrl - Using HLS proxy service (port: ${hlsProxyService.getPort()})`);
          log.info(`[IPC] getHlsProxyUrl - Cookies object:`, cookies);
          proxyUrl = hlsProxyService.registerProxyUrl(videoUrl, undefined, cookies);
        } else {
          log.info(`[IPC] getHlsProxyUrl - Using Video proxy service`);
          log.info(`[IPC] getHlsProxyUrl - Cookies object:`, cookies);
          proxyUrl = videoProxyService.registerProxyUrl(videoUrl, cookies);
        }

        log.info(`[IPC] getHlsProxyUrl - proxyUrl: ${proxyUrl}`);

        return {
          success: true,
          data: {
            url: proxyUrl,
            isM3u8: isM3u8Video,
          },
        };
      } catch (error) {
        log.error(`[IPC] getHlsProxyUrl error:`, error);
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 解析 anime1.pw 剧集（从 HTML 内容解析）
  ipcMain.handle(
    "anime:pwEpisodes",
    async (_, params: { html: string; animeId: string }) => {
      try {
        // 从爬虫服务获取解析器
        const { Anime1Crawler } = await import("../services/crawler/anime1");
        const crawler = new Anime1Crawler();

        // 使用私有方法解析剧集（需要临时转换）
        const episodes = (crawler as any).extractEpisodes(params.html);

        // 获取番剧信息
        const animeMap = animeService.getAnimeMap();
        const anime = animeMap.get(params.animeId);

        // 按集数降序排列
        episodes.sort((a: any, b: any) => {
          const numA = parseFloat(a.episode) || 0;
          const numB = parseFloat(b.episode) || 0;
          return numB - numA;
        });

        return {
          success: true,
          data: {
            anime: anime ? { ...anime, isAdult: true } : null,
            episodes,
            totalEpisodes: episodes.length,
            requiresFrontendFetch: false,
          },
        };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 视频流代理（解决 CORS 问题）
  // 返回代理后的本地 URL，前端通过这个 URL 播放视频
  ipcMain.handle(
    "anime:video:proxy",
    async (
      _,
      params: { videoUrl: string; headers?: Record<string, string> },
    ) => {
      try {
        // 生成一个本地代理 URL
        // 使用 Electron 的 protocol 模块注册一个自定义协议来代理视频流
        const proxyUrl = await videoProxyService.registerProxyUrl(
          params.videoUrl,
          params.headers,
        );
        return { success: true, data: { url: proxyUrl } };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取缓存状态
  ipcMain.handle("anime:cache:status", async () => {
    try {
      const result = await animeService.getCacheStatus();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 刷新缓存
  ipcMain.handle("anime:cache:refresh", async () => {
    try {
      await animeService.refreshCache();
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // ==========================================
  // 收藏相关 IPC
  // ==========================================

  // 获取收藏列表（带播放进度和更新状态）
  ipcMain.handle("favorite:list", async () => {
    try {
      const favorites = await databaseService.getFavorites();
      const animeMap = animeService.getAnimeMap();

      // 增强收藏数据
      const enhancedFavorites = favorites.map((fav) => {
        // 获取播放进度
        const playback = databaseService.getLatestPlaybackForAnime(fav.animeId);
        const playbackProgress = playback
          ? {
              episodeNum: playback.episodeNum,
              positionSeconds: playback.positionSeconds,
              positionFormatted: formatDuration(playback.positionSeconds),
              progressPercent:
                playback.totalSeconds > 0
                  ? Math.round(
                      (playback.positionSeconds / playback.totalSeconds) * 100,
                    )
                  : 0,
              lastWatchedAt: playback.lastWatchedAt,
            }
          : {
              episodeNum: 1,
              positionSeconds: 0,
              positionFormatted: "00:00",
              progressPercent: 0,
              lastWatchedAt: null,
            };

        // 检查更新
        const currentAnime = animeMap.get(fav.animeId);
        const currentEpisode = currentAnime?.episode ?? fav.episode ?? 0;
        const lastEpisode = fav.lastEpisode ?? fav.episode ?? 0;
        const hasUpdate = currentEpisode > lastEpisode;
        const newEpisodeCount = hasUpdate ? currentEpisode - lastEpisode : 0;

        return {
          ...fav,
          playbackProgress,
          hasUpdate,
          newEpisodeCount,
          currentEpisode,
        };
      });

      // 排序：有更新优先 -> 新集数多的优先 -> 有播放进度的优先 -> 最近观看优先
      enhancedFavorites.sort((a, b) => {
        // 有更新优先
        if (a.hasUpdate !== b.hasUpdate) return a.hasUpdate ? -1 : 1;
        // 新集数多的优先
        if (a.newEpisodeCount !== b.newEpisodeCount)
          return b.newEpisodeCount - a.newEpisodeCount;
        // 有播放进度优先
        const aHasProgress = a.playbackProgress.progressPercent > 0;
        const bHasProgress = b.playbackProgress.progressPercent > 0;
        if (aHasProgress !== bHasProgress) return aHasProgress ? -1 : 1;
        // 最近观看优先
        const aTime = a.playbackProgress.lastWatchedAt
          ? new Date(a.playbackProgress.lastWatchedAt).getTime()
          : 0;
        const bTime = b.playbackProgress.lastWatchedAt
          ? new Date(b.playbackProgress.lastWatchedAt).getTime()
          : 0;
        return bTime - aTime;
      });

      return { success: true, data: enhancedFavorites };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 批量检查收藏状态
  ipcMain.handle(
    "favorite:batchStatus",
    async (_, params: { ids: string[] }) => {
      try {
        const favorites = await databaseService.getFavorites();
        const favoriteIds = new Set(favorites.map((f) => f.animeId));

        const statusMap: Record<string, boolean> = {};
        for (const id of params.ids) {
          statusMap[id] = favoriteIds.has(id);
        }

        return { success: true, data: statusMap };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 添加收藏
  ipcMain.handle(
    "favorite:add",
    async (
      _,
      params: {
        animeId: string;
        title: string;
        coverUrl?: string;
        detailUrl: string;
        episode?: number;
        year?: string;
        season?: string;
        subtitleGroup?: string;
      },
    ) => {
      try {
        await databaseService.addFavorite(params);
        return { success: true };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 移除收藏
  ipcMain.handle("favorite:remove", async (_, params: { animeId: string }) => {
    try {
      await databaseService.removeFavorite(params.animeId);
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 检查是否已收藏
  ipcMain.handle("favorite:check", async (_, params: { animeId: string }) => {
    try {
      const result = await databaseService.isFavorite(params.animeId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // ==========================================
  // 设置相关 IPC
  // ==========================================

  // 获取设置
  ipcMain.handle("settings:get", async (_, params: { key: string }) => {
    try {
      const result = await databaseService.getSetting(params.key);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 保存设置
  ipcMain.handle(
    "settings:set",
    async (_, params: { key: string; value: string }) => {
      try {
        await databaseService.setSetting(params.key, params.value);
        return { success: true };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取所有设置
  ipcMain.handle("settings:getAll", async () => {
    try {
      const result = await databaseService.getAllSettings();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // ==========================================
  // 播放历史相关 IPC
  // ==========================================

  // 获取播放历史
  ipcMain.handle("history:list", async (_, params: { limit?: number }) => {
    try {
      const result = databaseService.getPlaybackHistory(params?.limit || 100);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 保存播放进度
  ipcMain.handle(
    "history:save",
    async (
      _,
      params: {
        animeId: string;
        animeTitle: string;
        episodeId: string;
        episodeNum: number;
        positionSeconds: number;
        totalSeconds: number;
        coverUrl?: string;
      },
    ) => {
      try {
        databaseService.addPlaybackHistory({
          ...params,
          lastWatchedAt: Date.now(),
        });
        return { success: true };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取播放进度
  ipcMain.handle(
    "history:progress",
    async (_, params: { animeId: string; episodeId: string }) => {
      try {
        const result = databaseService.getPlaybackProgress(
          params.animeId,
          params.episodeId,
        );
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 清空播放历史
  ipcMain.handle("history:clear", async () => {
    try {
      databaseService.clearPlaybackHistory();
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 删除播放历史
  ipcMain.handle(
    "history:delete",
    async (_, params: { animeId: string; episodeId?: string }) => {
      try {
        databaseService.deletePlaybackHistory(params.animeId, params.episodeId);
        return { success: true };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取番剧的所有播放历史
  ipcMain.handle("history:byAnime", async (_, params: { animeId: string }) => {
    try {
      const result = databaseService.getPlaybackHistoryByAnime(params.animeId);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 批量获取播放进度
  ipcMain.handle(
    "history:batchProgress",
    async (_, params: { ids: string[] }) => {
      try {
        const result = databaseService.getBatchPlaybackProgress(params.ids);
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // ==========================================
  // 下载相关 IPC
  // ==========================================

  // 获取下载任务列表
  ipcMain.handle("download:list", async () => {
    try {
      const result = await downloadService.getTasks();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 添加下载任务
  ipcMain.handle(
    "download:add",
    async (
      _,
      params: {
        url: string;
        filename: string;
        animeId?: string;
        episodeId?: string;
        title?: string;
        episodeTitle?: string;
      },
    ) => {
      try {
        const result = await downloadService.addTask({
          url: params.url,
          filename: params.filename,
          animeId: params.animeId,
          episodeId: params.episodeId,
          title: params.title,
          episodeTitle: params.episodeTitle,
        });
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 暂停下载
  ipcMain.handle("download:pause", async (_, params: { taskId: string }) => {
    try {
      await downloadService.pauseTask(params.taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 恢复下载
  ipcMain.handle("download:resume", async (_, params: { taskId: string }) => {
    try {
      await downloadService.resumeTask(params.taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 取消下载
  ipcMain.handle("download:cancel", async (_, params: { taskId: string }) => {
    try {
      await downloadService.cancelTask(params.taskId);
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // ==========================================
  // 自动下载相关 IPC
  // ==========================================

  // 获取自动下载配置
  ipcMain.handle("autoDownload:getConfig", async () => {
    try {
      const config = autoDownloadService.getConfig();
      return { success: true, data: config };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 更新自动下载配置
  ipcMain.handle(
    "autoDownload:updateConfig",
    async (_, params: { config: any }) => {
      try {
        const success = autoDownloadService.updateConfig(params.config);
        return { success };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 获取自动下载状态
  ipcMain.handle("autoDownload:getStatus", async () => {
    try {
      const status = autoDownloadService.getStatus();
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 获取下载历史
  ipcMain.handle(
    "autoDownload:getHistory",
    async (_, params: { limit?: number; status?: string }) => {
      try {
        const history = autoDownloadService.getHistory(
          params.limit || 100,
          params.status as any,
        );
        return { success: true, data: history };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 预览筛选结果
  ipcMain.handle(
    "autoDownload:previewFilter",
    async (_, params: { filters?: any }) => {
      try {
        // 获取所有番剧
        const allAnime = await animeService.getList(1, 9999);
        const result = autoDownloadService.previewFilter(
          allAnime.animeList,
          params.filters,
        );
        return { success: true, data: result };
      } catch (error) {
        return { success: false, error: { message: String(error) } };
      }
    },
  );

  // 手动执行检查
  ipcMain.handle("autoDownload:runCheck", async () => {
    try {
      const result = await autoDownloadService.runCheckNow();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // ==========================================
  // 系统相关 IPC
  // ==========================================

  // 在资源管理器中显示
  ipcMain.handle(
    "system:showItemInFolder",
    async (_, params: { path: string }) => {
      shell.showItemInFolder(params.path);
    },
  );

  // 用系统浏览器打开链接
  ipcMain.handle("system:openExternal", async (_, params: { url: string }) => {
    await shell.openExternal(params.url);
  });

  // ==========================================
  // 更新相关 IPC
  // ==========================================

  // 检查更新
  ipcMain.handle("update:check", async () => {
    try {
      const result = await updateService.checkForUpdates();
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 下载更新
  ipcMain.handle("update:download", async () => {
    try {
      await updateService.downloadUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 安装更新
  ipcMain.handle("update:install", async () => {
    try {
      updateService.installUpdate();
      return { success: true };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // 获取更新状态
  ipcMain.handle("update:getStatus", async () => {
    try {
      const status = {
        downloadProgress: updateService.getDownloadProgress(),
        isDownloading: updateService.isUpdateDownloading(),
        currentUpdateInfo: updateService.getCurrentUpdateInfo(),
      };
      return { success: true, data: status };
    } catch (error) {
      return { success: false, error: { message: String(error) } };
    }
  });

  // ==========================================
  // 更新事件转发 - 将 UpdateService 事件转发到渲染进程
  // ==========================================

  // 监听更新可用事件并转发
  updateService.on("update-available", (info) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("update:onAvailable", info);
    });
  });

  // 监听下载进度事件并转发
  updateService.on("download-progress", (progress) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("update:onProgress", progress);
    });
  });

  // 监听下载完成事件并转发
  updateService.on("update-downloaded", (info) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("update:onDownloaded", info);
    });
  });

  // 监听更新错误事件并转发
  updateService.on("error", (error) => {
    BrowserWindow.getAllWindows().forEach((window) => {
      window.webContents.send("update:onError", { message: error.message });
    });
  });
}
