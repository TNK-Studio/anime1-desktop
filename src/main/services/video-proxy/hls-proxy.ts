/**
 * HLS/m3u8 播放列表解析代理服务
 * 使用 Node.js 原生解析 m3u8 文件
 * 参考 Python 版本: src/routes/proxy.py - proxy_hls_playlist
 */

import http from "http";
import log from "electron-log";

export interface ProxyData {
  url: string;
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
}

export class HlsProxyService {
  private server: http.Server | null = null;
  private proxyMap = new Map<string, ProxyData>();
  private idCounter = 0;
  private port = 0;

  async initialize(): Promise<void> {
    await this.startServer();
    log.info("[HlsProxy] HLS proxy service initialized on port " + this.port);
  }

  getPort(): number {
    return this.port;
  }

  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) =>
        this.handleRequest(req, res),
      );

      this.server.listen(0, "127.0.0.1", () => {
        const addr = this.server?.address() as { port: number };
        this.port = addr.port;
        log.info(`[HlsProxy] Server started on port ${this.port}`);
        resolve();
      });

      this.server.on("error", reject);
    });
  }

  registerProxyUrl(
    videoUrl: string,
    headers?: Record<string, string>,
    cookies?: Record<string, string>,
  ): string {
    const id = `hls_${++this.idCounter}`;
    this.proxyMap.set(id, { url: videoUrl, headers, cookies });

    log.info(
      `[HlsProxy] Registered proxy: ${videoUrl.substring(0, 80)}... -> ${id}`,
    );
    log.info(
      `[HlsProxy] Proxy URL: http://127.0.0.1:${this.port}/hls-proxy/${id}`,
    );
    log.info(`[HlsProxy] Current active proxies: ${this.proxyMap.size}`);

    // 10 分钟后清理
    setTimeout(() => {
      if (this.proxyMap.has(id)) {
        this.proxyMap.delete(id);
        log.info(`[HlsProxy] Cleaned up proxy: ${id}`);
      }
    }, 600000);

    return `http://127.0.0.1:${this.port}/hls-proxy/${id}`;
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    const url = req.url?.toString();
    log.info(`[HlsProxy] Request: ${req.method} ${url}`);

    // CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Range, Accept, Content-Type, Origin, Referer, User-Agent",
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Range, Content-Length, Accept-Ranges",
    );
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    if (req.method === "OPTIONS") {
      log.info("[HlsProxy] OPTIONS request, returning 200");
      res.writeHead(200);
      res.end();
      return;
    }

    if (!url) {
      log.warn("[HlsProxy] Missing URL in request");
      res.writeHead(400);
      res.end("Missing URL");
      return;
    }

    const parts = url.split("/");
    log.info(`[HlsProxy] URL parts:`, parts);

    // 主播放列表请求：/hls-proxy/{proxyId}
    // 片段请求：/hls-proxy/{proxyId}/{path}
    const proxyId = parts[2];
    log.info(`[HlsProxy] Proxy ID: ${proxyId}`);
    log.info(`[HlsProxy] Active proxies:`, Array.from(this.proxyMap.keys()));

    const proxyData = this.proxyMap.get(proxyId);

    if (!proxyData) {
      log.warn(`[HlsProxy] Proxy ID ${proxyId} not found in proxyMap`);
      res.writeHead(404);
      res.end("Proxy not found or expired");
      return;
    }

    const targetUrl = proxyData.url;
    const path = parts.slice(3).join("/");
    log.info(`[HlsProxy] Target URL: ${targetUrl}`);
    log.info(`[HlsProxy] Path: ${path}`);
    log.info(`[HlsProxy] Has cookies: ${!!proxyData.cookies}`);
    log.info(`[HlsProxy] Cookies:`, proxyData.cookies);

    try {
      const requestHeaders: Record<string, string> = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0 Safari/537.36",
        Accept: "*/*",
        "Accept-Language": "zh-TW,zh-CN;q=0.03",
        Referer: "https://anime1.me/",
        ...proxyData.headers,
      };

      // 添加 cookies 到 header
      if (proxyData.cookies) {
        const cookieHeader = Object.entries(proxyData.cookies)
          .map(([k, v]) => `${k}=${v}`)
          .join("; ");
        requestHeaders["Cookie"] = cookieHeader;
        log.info(`[HlsProxy] Added Cookie header:`, cookieHeader);
      }

      log.info(`[HlsProxy] Fetching: ${targetUrl}${path ? `/${path}` : ""}`);
      const response = await fetch(`${targetUrl}${path ? `/${path}` : ""}`, {
        headers: requestHeaders as Record<string, string>,
      });

      if (!response.ok) {
        res.writeHead(response.status);
        res.end(`HTTP ${response.status}`);
        return;
      }

      const contentType = response.headers.get("Content-Type");
      const contentLength = response.headers.get("Content-Length");
      const contentRange = response.headers.get("Content-Range");

      if (contentType) {
        res.setHeader("Content-Type", contentType);
      }
      if (contentLength) {
        res.setHeader("Content-Length", contentLength);
      }
      if (contentRange) {
        res.setHeader("Content-Range", contentRange);
      }
      res.setHeader("Accept-Ranges", "bytes");

      const content = await response.text();

      // 直接返回原始内容，不做任何重写
      // HLS.js 会自动处理相对路径解析
      log.info(`[HlsProxy] Returning original content, no rewrite`);

      res.setHeader("Content-Type", contentType || "video/mp2t");
      res.end(content);
    } catch (error) {
      log.error("[HlsProxy] Error fetching:", error);
      res.writeHead(500);
      res.end("Internal server error");
    }
  }

  cleanup(): void {
    if (this.server) {
      this.server.close();
      this.proxyMap.clear();
      log.info("[HlsProxy] Service cleaned up");
    }
  }
}

export const hlsProxyService = new HlsProxyService();
