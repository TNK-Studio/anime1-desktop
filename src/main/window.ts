/**
 * 窗口管理模块
 *
 * 对应原项目: src/desktop.py 中的窗口管理部分
 * 职责: 创建和管理应用窗口、系统托盘、全局快捷键
 */

import {
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  screen,
  ipcMain,
  app,
  globalShortcut,
  shell,
} from "electron";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import log from "electron-log";
import { config, WINDOW_CONFIG } from "./config";

// ES 模块中的 __dirname polyfill - 使用绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 窗口状态接口
interface WindowState {
  width: number;
  height: number;
  x?: number;
  y?: number;
  maximized: boolean;
  fullscreen: boolean;
}

// 默认窗口状态
const DEFAULT_WINDOW_STATE: WindowState = {
  width: WINDOW_CONFIG.DEFAULT_WIDTH,
  height: WINDOW_CONFIG.DEFAULT_HEIGHT,
  maximized: false,
  fullscreen: false,
};

export class WindowManager {
  private mainWindow: BrowserWindow | null = null;
  private tray: Tray | null = null;
  private isQuitting = false;

  /**
   * 创建主窗口
   */
  async createMainWindow(): Promise<BrowserWindow> {
    // 加载保存的窗口状态
    const windowState = this.loadWindowState();

    // 计算 preload 路径 - 使用相对路径
    const preloadPath = join(__dirname, "../preload/index.cjs");
    const absolutePreloadPath = resolve(preloadPath);
    console.log(`[Window] Preload path: ${preloadPath}`);
    console.log(`[Window] Preload absolute path: ${absolutePreloadPath}`);
    console.log(`[Window] Preload exists: ${existsSync(preloadPath)}`);

    // 验证 preload 文件可读
    try {
      const { readFileSync } = await import("fs");
      const content = readFileSync(preloadPath, "utf8");
      console.log(`[Window] Preload file size: ${content.length} bytes`);
    } catch (e: any) {
      console.error(`[Window] Preload file read error: ${e.message}`);
    }

    // 创建窗口（无边框，使用自定义标题栏）
    this.mainWindow = new BrowserWindow({
      width: windowState.width,
      height: windowState.height,
      x: windowState.x,
      y: windowState.y,
      minWidth: WINDOW_CONFIG.MIN_WIDTH,
      minHeight: WINDOW_CONFIG.MIN_HEIGHT,
      title: "Anime1 Desktop",
      frame: false, // 无边框窗口
      show: false,
      webPreferences: {
        preload: preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        allowRunningInsecureContent: true,
      },
      icon: this.getAppIcon(),
    });

    // 恢复窗口状态
    if (windowState.maximized) {
      this.mainWindow.maximize();
    }
    if (windowState.fullscreen) {
      this.mainWindow.setFullScreen(true);
    }

    // 加载页面
    if (process.env.VITE_DEV_SERVER_URL) {
      // 开发模式：使用 Vite dev server
      log.info(
        `[Window] Loading dev server: ${process.env.VITE_DEV_SERVER_URL}`,
      );
      await this.mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    } else {
      // 生产模式：使用构建后的文件
      const indexPath = join(__dirname, "../../dist/index.html");
      log.info(`[Window] Loading production build: ${indexPath}`);
      await this.mainWindow.loadFile(indexPath);
    }
    // 显示窗口 - 使用 setTimeout 确保即使 ready-to-show 不触发也能显示
    const showWindow = () => {
      if (this.mainWindow && !this.mainWindow.isVisible()) {
        this.mainWindow.show();
        log.info("[Window] Main window shown");
      }
    };

    // 方法1: ready-to-show 事件
    this.mainWindow.once("ready-to-show", showWindow);

    // 方法2: 3秒后强制显示（防止 ready-to-show 不触发）
    setTimeout(showWindow, 3000);

    // 方法3: did-finish-load 事件
    this.mainWindow.webContents.once("did-finish-load", showWindow);

    // 窗口事件监听
    this.setupWindowEvents();

    // 创建系统托盘
    this.createTray();

    // 注册全局快捷键
    this.registerGlobalShortcuts();

    // 注册 IPC
    this.registerWindowIPC();

    log.info("[Window] Main window created");
    return this.mainWindow;
  }

  /**
   * 创建窗口右键菜单
   */
  private setupWindowContextMenu(): void {
    log.info("[Window] Window context menu setup complete");
  }

  /**
   * 设置窗口事件
   */
  private setupWindowEvents(): void {
    if (!this.mainWindow) return;

    // 监听 preload 错误
    this.mainWindow.webContents.on(
      "preload-error",
      (_event, preloadPath, error) => {
        log.error("[Window] Preload error:", preloadPath, error);
      },
    );

    // 监听 console-message (Electron 40+ 新 API)
    this.mainWindow.webContents.on("console-message", (event: any) => {
      const message = event.message || "";
      log.info("[Window] Console:", message);
      if (message.includes("[Preload]")) {
        log.info("[Window] Preload console:", message);
      }
    });

    // 保存窗口状态
    const saveState = () => {
      this.saveWindowState();
    };

    this.mainWindow.on("resize", saveState);
    this.mainWindow.on("move", saveState);
    this.mainWindow.on("maximize", saveState);
    this.mainWindow.on("unmaximize", saveState);
    this.mainWindow.on("enter-full-screen", saveState);
    this.mainWindow.on("leave-full-screen", saveState);

    // 窗口完全加载后创建右键菜单 (使用 webContents)
    this.mainWindow.webContents.once("did-finish-load", () => {
      this.setupWindowContextMenu();
    });

    // 关闭处理
    this.mainWindow.on("close", (event) => {
      if (!this.isQuitting && process.platform === "darwin") {
        event.preventDefault();
        this.hide();
      } else {
        saveState();
      }
    });

    this.mainWindow.on("closed", () => {
      this.mainWindow = null;
    });

    // 处理外部链接
    this.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
      const allowedDomains = ["anime1.me", "bgm.tv", "github.com"];
      const urlObj = new URL(url);

      if (allowedDomains.some((domain) => urlObj.hostname.includes(domain))) {
        return { action: "allow" };
      }

      shell.openExternal(url);
      return { action: "deny" };
    });
  }

  /**
   * 获取应用图标路径
   */
  private getAppIcon(): string {
    const isDev = !app.isPackaged;
    let resourcesPath: string;

    if (isDev) {
      resourcesPath = join(__dirname, "../../../resources");
    } else {
      resourcesPath = join(
        process.resourcesPath,
        "app.asar.unpacked/resources",
      );
      if (!existsSync(resourcesPath)) {
        resourcesPath = join(app.getAppPath(), "resources");
      }
    }

    if (process.platform === "darwin") {
      return join(resourcesPath, "icon.icns");
    } else if (process.platform === "win32") {
      return join(resourcesPath, "icon.ico");
    } else {
      return join(resourcesPath, "icon.png");
    }
  }

  /**
   * 获取托盘图标
   */
  private getTrayIcon(): Electron.NativeImage {
    const isDev = !app.isPackaged;
    let resourcesPath: string;

    if (isDev) {
      resourcesPath = join(__dirname, "../../../resources");
    } else {
      resourcesPath = join(
        process.resourcesPath,
        "app.asar.unpacked/resources",
      );
      if (!existsSync(resourcesPath)) {
        resourcesPath = join(app.getAppPath(), "resources");
      }
    }

    let iconPath = join(resourcesPath, "icon.png");

    if (!existsSync(iconPath)) {
      iconPath = this.getAppIcon();
    }

    if (!existsSync(iconPath)) {
      log.error("[Window] Tray icon not found:", iconPath);
      throw new Error("Tray icon not found");
    }

    log.info("[Window] Loading tray icon from:", iconPath);
    const icon = nativeImage.createFromPath(iconPath);

    if (icon.isEmpty()) {
      log.error("[Window] Tray icon is empty:", iconPath);
      throw new Error("Tray icon is empty");
    }

    if (process.platform === "darwin") {
      icon.setTemplateImage(true);
      return icon.resize({ width: 16, height: 16 });
    }

    return icon.resize({ width: 16, height: 16 });
  }

  /**
   * 创建系统托盘
   */
  private createTray(): void {
    try {
      // 使用原生图标创建 tray
      const trayIcon = this.getTrayIcon();

      this.tray = new Tray(trayIcon);
      this.tray.setToolTip("Anime1 Desktop");

      // macOS 托盘图标需要设置按下状态
      if (process.platform === "darwin") {
        this.tray.setPressedImage(trayIcon);
      }

      const contextMenu = Menu.buildFromTemplate([
        {
          label: "显示窗口",
          click: () => this.show(),
        },
        {
          label: "刷新",
          click: () => this.mainWindow?.reload(),
        },
        {
          label: "打开开发者工具",
          click: () => this.mainWindow?.webContents.openDevTools(),
        },
        { type: "separator" },
        {
          label: "退出",
          click: () => {
            this.isQuitting = true;
            app.quit();
          },
        },
      ]);

      this.tray.setContextMenu(contextMenu);

      log.info("[Window] Tray context menu set");
      log.info(`[Window] Menu has ${contextMenu.items?.length || 0} items`);

      // 点击托盘图标显示/隐藏窗口
      this.tray.on("click", () => {
        log.info("[Window] Tray icon clicked");
        if (this.mainWindow?.isVisible()) {
          this.hide();
        } else {
          this.show();
        }
      });

      log.info("[Window] Tray created");
    } catch (error) {
      log.warn("[Window] Failed to create tray:", error);
    }
  }

  /**
   * 注册全局快捷键
   */
  private registerGlobalShortcuts(): void {
    // Cmd/Ctrl + Shift + D: 显示/隐藏窗口
    globalShortcut.register("CommandOrControl+Shift+D", () => {
      if (this.mainWindow?.isVisible()) {
        this.hide();
      } else {
        this.show();
      }
    });

    // F12: 打开/关闭开发者工具
    globalShortcut.register("F12", () => {
      if (this.mainWindow) {
        const wc = this.mainWindow.webContents;
        if (wc.isDevToolsOpened()) {
          wc.closeDevTools();
        } else {
          wc.openDevTools();
        }
      }
    });

    log.info("[Window] Global shortcuts registered");
  }

  /**
   * 注册窗口相关 IPC
   */
  private registerWindowIPC(): void {
    // 最小化
    ipcMain.handle("window:minimize", () => {
      this.mainWindow?.minimize();
    });

    // 最大化/恢复
    ipcMain.handle("window:maximize", () => {
      const win = this.mainWindow;
      if (!win) return { success: false, maximized: false };

      const isFullScreen = win.isFullScreen();

      if (process.platform === "darwin") {
        // macOS: 使用原生全屏（进入独立 Space）
        win.setFullScreen(!isFullScreen);
        log.info(`[Window] macOS fullScreen toggled: ${!isFullScreen}`);
        return { success: true, maximized: !isFullScreen };
      } else {
        // Windows/Linux: 使用普通最大化
        if (win.isMaximized()) {
          win.unmaximize();
          log.info("[Window] Window unmaximized");
          return { success: true, maximized: false };
        } else {
          win.maximize();
          log.info("[Window] Window maximized");
          return { success: true, maximized: true };
        }
      }
    });

    // 关闭窗口
    ipcMain.handle("window:close", () => {
      this.hide();
    });

    // 全屏切换
    ipcMain.handle("window:toggleFullscreen", () => {
      this.mainWindow?.setFullScreen(!this.mainWindow?.isFullScreen());
    });

    // 获取窗口状态
    ipcMain.handle("window:getState", () => {
      const win = this.mainWindow;
      if (!win) {
        return {
          maximized: false,
          minimized: false,
          fullscreen: false,
          focused: false,
        };
      }

      // macOS 上全屏状态用 isFullScreen，其他平台用 isMaximized
      const isMaximized =
        process.platform === "darwin" ? win.isFullScreen() : win.isMaximized();

      const state = {
        maximized: isMaximized,
        minimized: win.isMinimized(),
        fullscreen: win.isFullScreen(),
        focused: win.isFocused(),
      };
      log.info("[Window] getState called:", state);
      return state;
    });
  }

  /**
   * 加载窗口状态
   */
  private loadWindowState(): WindowState {
    const saved = config.window;
    const state = { ...DEFAULT_WINDOW_STATE, ...saved };

    // 确保窗口在屏幕范围内
    if (state.x !== undefined && state.y !== undefined) {
      const displays = screen.getAllDisplays();
      const isInBounds = displays.some((display) => {
        const { x, y, width, height } = display.bounds;
        return (
          state.x! >= x &&
          state.x! <= x + width &&
          state.y! >= y &&
          state.y! <= y + height
        );
      });

      if (!isInBounds) {
        state.x = undefined;
        state.y = undefined;
      }
    }

    return state;
  }

  /**
   * 保存窗口状态
   */
  private saveWindowState(): void {
    if (!this.mainWindow) return;

    const bounds = this.mainWindow.getBounds();
    const state: WindowState = {
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      maximized: this.mainWindow.isMaximized(),
      fullscreen: this.mainWindow.isFullScreen(),
    };

    config.window = state;
  }

  /**
   * 显示窗口
   */
  show(): void {
    if (this.mainWindow) {
      if (this.mainWindow.isMinimized()) {
        this.mainWindow.restore();
      }
      this.mainWindow.show();
      this.mainWindow.focus();
    }
  }

  /**
   * 隐藏窗口
   */
  hide(): void {
    this.mainWindow?.hide();
  }

  /**
   * 聚焦窗口
   */
  focus(): void {
    this.show();
  }

  /**
   * 获取主窗口
   */
  getMainWindow(): BrowserWindow | null {
    return this.mainWindow;
  }

  /**
   * 设置退出标志
   */
  setQuitting(quitting: boolean): void {
    this.isQuitting = quitting;
  }
}
