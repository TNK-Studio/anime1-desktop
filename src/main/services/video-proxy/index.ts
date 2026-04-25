/**
 * 视频代理服务
 * 
 * 解决 Electron 本地文件协议访问外部视频 URL 的 CORS 问题
 * 使用本地 HTTP 服务器代理视频流（比 protocol.handle 更可靠）
 */

import http from 'http'
import https from 'https'
import { URL } from 'url'
import log from 'electron-log'
import { hlsProxyService } from './hls-proxy'

export class VideoProxyService {
  private server: http.Server | null = null
  private proxyMap = new Map<string, { url: string; headers?: Record<string, string> }>()
  private idCounter = 0
  private port = 0

  /**
   * 初始化视频代理服务
   */
  async initialize(): Promise<void> {
    await this.startServer()
    await hlsProxyService.initialize()
    log.info(`[VideoProxy] Service initialized on port ${this.port}`)
  }

  /**
   * 启动本地 HTTP 代理服务器
   */
  private async startServer(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server = http.createServer((req, res) => this.handleRequest(req, res))
      
      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server?.address() as { port: number }
        this.port = addr.port
        resolve()
      })
      
      this.server.on('error', reject)
    })
  }

  /**
   * 注册代理 URL
   */
  registerProxyUrl(videoUrl: string, customHeaders?: Record<string, string>): string {
    const id = `${Date.now()}_${++this.idCounter}`
    this.proxyMap.set(id, { url: videoUrl, headers: customHeaders })
    return `http://127.0.0.1:${this.port}/proxy?id=${id}`
  }

  /**
   * 处理 HTTP 请求
   */
  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    // 设置 CORS 头
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Range, Accept, Content-Type, Origin, Referer, User-Agent')
    res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    const url = new URL(req.url || '', `http://${req.headers.host}`)
    const proxyId = url.searchParams.get('id')

    if (!proxyId || !this.proxyMap.has(proxyId)) {
      res.writeHead(400)
      res.end('Invalid proxy ID')
      return
    }

    const proxyInfo = this.proxyMap.get(proxyId)!
    
    try {
      await this.proxyVideoStream(proxyInfo.url, req, res, proxyInfo.headers)
    } catch (error: any) {
      log.error('[VideoProxy] Error:', error.message)
      if (!res.headersSent) {
        res.writeHead(502)
        res.end(`Proxy error: ${error.message}`)
      }
    }
  }

  /**
   * 代理视频流
   */
  private async proxyVideoStream(
    targetUrl: string,
    clientReq: http.IncomingMessage,
    clientRes: http.ServerResponse,
    customHeaders?: Record<string, string>
  ): Promise<void> {
    const parsedUrl = new URL(targetUrl)
    const isHttps = parsedUrl.protocol === 'https:'
    const requestLib = isHttps ? https : http

    // 构建请求头
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': '*/*',
      'Accept-Language': 'zh-TW,zh;q=0.9,en;q=0.8',
      'Referer': 'https://anime1.me',
      'Accept-Encoding': 'identity' // 禁用gzip，避免chunked编码问题
    }

    // 处理自定义 headers (cookies)
    if (customHeaders) {
      const cookieFields = ['e', 'p', 'h']
      const hasCookieFields = cookieFields.some(f => customHeaders[f] !== undefined)
      
      if (hasCookieFields) {
        headers['Cookie'] = Object.entries(customHeaders)
          .map(([k, v]) => `${k}=${v}`)
          .join('; ')
      } else {
        Object.assign(headers, customHeaders)
      }
    }

    // 转发 Range 头（用于视频 seek）
    const rangeHeader = clientReq.headers.range
    if (rangeHeader) {
      headers['Range'] = rangeHeader as string
      log.info('[VideoProxy] Range request:', rangeHeader)
    }

    return new Promise((resolve, reject) => {
      const request = requestLib.get(targetUrl, { headers }, (response) => {
        // 处理重定向
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location
          if (redirectUrl) {
            const fullRedirectUrl = redirectUrl.startsWith('http') 
              ? redirectUrl 
              : new URL(redirectUrl, targetUrl).toString()
            log.info('[VideoProxy] Following redirect to:', fullRedirectUrl.substring(0, 100))
            this.proxyVideoStream(fullRedirectUrl, clientReq, clientRes, customHeaders)
              .then(resolve)
              .catch(reject)
            return
          }
        }

        // 检查响应状态
        if (response.statusCode !== 200 && response.statusCode !== 206) {
          reject(new Error(`HTTP ${response.statusCode}`))
          return
        }

        log.info('[VideoProxy] Response:', response.statusCode, 
          'Content-Type:', response.headers['content-type'],
          'Content-Length:', response.headers['content-length'])

        // 构建响应头
        const responseHeaders: Record<string, string | number | string[]> = {
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }

        if (response.headers['content-type']) {
          responseHeaders['Content-Type'] = response.headers['content-type']
        }
        if (response.headers['content-length']) {
          responseHeaders['Content-Length'] = response.headers['content-length']
        }
        if (response.headers['content-range']) {
          responseHeaders['Content-Range'] = response.headers['content-range']
          log.info('[VideoProxy] Content-Range:', response.headers['content-range'])
        }

        // 发送响应头
        clientRes.writeHead(response.statusCode || 200, responseHeaders)
        
        // 使用 pipe 传输数据（流式传输）
        response.pipe(clientRes)
        
        response.on('end', () => {
          log.info('[VideoProxy] Stream ended')
          resolve()
        })
        response.on('error', (err) => {
          log.error('[VideoProxy] Response stream error:', err)
          reject(err)
        })
      })

      request.on('error', (err) => {
        log.error('[VideoProxy] Request error:', err)
        reject(err)
      })

      request.setTimeout(60000, () => {
        request.destroy()
        reject(new Error('Request timeout'))
      })
    })
  }

  /**
   * 停止代理服务器
   */
  cleanup(): void {
    this.server?.close()
    this.proxyMap.clear()
    hlsProxyService.cleanup()
    log.info('[VideoProxy] Service stopped')
  }
}

// 单例实例
export const videoProxyService = new VideoProxyService()
