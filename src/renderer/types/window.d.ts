/**
 * Window API 类型声明
 *
 * 注意: Preload 实际实现位于 src/preload/index.cjs
 * 此文件只提供类型声明
 */

export interface ElectronAPI {
  // 窗口控制
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<{ success: boolean; maximized: boolean }>;
    close: () => Promise<void>;
    toggleFullscreen: () => Promise<void>;
    getState: () => Promise<{
      maximized: boolean;
      minimized: boolean;
      fullscreen: boolean;
      focused: boolean;
    }>;
  };

  // 番剧
  anime: {
    getList: (params: { page: number; pageSize?: number }) => Promise<any>;
    getListWithProgress: (params: {
      page: number;
      pageSize?: number;
    }) => Promise<any>;
    getDetail: (params: { id: string }) => Promise<any>;
    getEpisodes: (params: { id: string }) => Promise<any>;
    search: (params: { keyword: string; page?: number }) => Promise<any>;
    searchWithProgress: (params: {
      keyword: string;
      page?: number;
    }) => Promise<any>;
    getBangumiInfo: (params: { id: string }) => Promise<any>;
    extractVideo: (params: { episodeUrl: string }) => Promise<any>;
    getVideoProxyUrl: (params: {
      videoUrl: string;
      headers?: Record<string, string>;
    }) => Promise<any>;
    getHlsProxyUrl: (params: {
      episodeUrl: string;
      videoUrl?: string;
    }) => Promise<any>;
    getCacheStatus: () => Promise<any>;
    refreshCache: () => Promise<any>;
  };

  // 收藏
  favorite: {
    getList: () => Promise<any>;
    batchStatus: (params: { ids: string[] }) => Promise<any>;
    add: (params: {
      animeId: string;
      title: string;
      coverUrl?: string;
      detailUrl: string;
      episode?: number;
      year?: string;
      season?: string;
      subtitleGroup?: string;
    }) => Promise<any>;
    remove: (params: { animeId: string }) => Promise<any>;
    check: (params: { animeId: string }) => Promise<any>;
  };

  // 播放历史
  history: {
    getList: (params?: { limit?: number }) => Promise<any>;
    save: (params: {
      animeId: string;
      animeTitle: string;
      episodeId: string;
      episodeNum: number;
      positionSeconds: number;
      totalSeconds: number;
      coverUrl?: string;
    }) => Promise<any>;
    getProgress: (params: {
      animeId: string;
      episodeId: string;
    }) => Promise<any>;
    clear: () => Promise<any>;
    delete: (params: { animeId: string; episodeId?: string }) => Promise<any>;
    getByAnime: (params: { animeId: string }) => Promise<any>;
    batchProgress: (params: { ids: string[] }) => Promise<any>;
  };

  // 设置
  settings: {
    get: (params: { key: string }) => Promise<any>;
    set: (params: { key: string; value: string }) => Promise<any>;
    getAll: () => Promise<any>;
  };

  // 下载
  download: {
    getList: () => Promise<any>;
    add: (params: {
      url: string;
      filename: string;
      animeId?: string;
      episodeId?: string;
      title?: string;
      episodeTitle?: string;
    }) => Promise<any>;
    pause: (params: { taskId: string }) => Promise<any>;
    resume: (params: { taskId: string }) => Promise<any>;
    cancel: (params: { taskId: string }) => Promise<any>;
    onProgress: (callback: (task: any) => void) => void;
  };

  // 自动下载
  autoDownload: {
    start: () => Promise<any>;
    stop: () => Promise<any>;
    getStatus: () => Promise<any>;
    getSettings: () => Promise<any>;
    updateSettings: (params: any) => Promise<any>;
    getHistory: (params: { limit?: number }) => Promise<any>;
    previewFilter: (params: { filters: any }) => Promise<any>;
    updateConfig: (params: { config: any }) => Promise<any>;
  };

  // 系统
  system: {
    showItemInFolder: (params: { path: string }) => Promise<void>;
    openExternal: (params: { url: string }) => Promise<void>;
  };

  // 更新
  update: {
    check: () => Promise<any>;
    download: () => Promise<any>;
    install: () => Promise<any>;
    onAvailable: (callback: (info: any) => void) => void;
    onProgress: (callback: (progress: number) => void) => void;
    onDownloaded: (callback: (info?: any) => void) => void;
  };
}

declare global {
  interface Window {
    api: ElectronAPI;
  }
}

export {};
