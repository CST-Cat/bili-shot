// ==UserScript==
// @name         BiliShot - Bilibili video screenshot
// @namespace    https://github.com/CST-Cat/bili-shot
// @version      0.1.1
// @description  Copy the current Bilibili video frame to the clipboard with a custom hotkey.
// @author       CST-Cat
// @match        *://www.bilibili.com/*
// @match        *://m.bilibili.com/*
// @icon         https://www.bilibili.com/favicon.ico
// @homepageURL  https://github.com/CST-Cat/bili-shot
// @supportURL   https://github.com/CST-Cat/bili-shot/issues
// @downloadURL  https://raw.githubusercontent.com/CST-Cat/bili-shot/main/bili-shot.user.js
// @updateURL    https://raw.githubusercontent.com/CST-Cat/bili-shot/main/bili-shot.user.js
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// ==/UserScript==

/*
README

BiliShot copies the current Bilibili video frame to the clipboard as a PNG.
Default hotkey: W.

Menu commands:
- BiliShot: 复制当前视频帧
- BiliShot: 设置快捷键
- BiliShot: 恢复默认快捷键

*/

(function () {
  "use strict";

  const SCRIPT_NAME = "BiliShot";
  const DEFAULT_HOTKEY = "W";
  const HOTKEY_STORAGE_KEY = "bili-shot.hotkey";
  const TOAST_ID = "bili-shot-toast";
  const TOAST_STYLE_ID = "bili-shot-toast-style";
  const IS_MAC = /\b(Mac|iPhone|iPad|iPod)\b/i.test(
    `${navigator.platform || ""} ${navigator.userAgent || ""}`,
  );

  let activeHotkey = parseHotkey(readStoredValue(HOTKEY_STORAGE_KEY, DEFAULT_HOTKEY));
  let captureRunning = false;
  let toastTimer = 0;

  if (!activeHotkey) {
    activeHotkey = parseHotkey(DEFAULT_HOTKEY);
    writeStoredValue(HOTKEY_STORAGE_KEY, DEFAULT_HOTKEY);
  }

  registerMenuCommands();
  window.addEventListener("keydown", onKeyDown, true);

  function onKeyDown(event) {
    if (!activeHotkey || event.repeat || event.defaultPrevented) {
      return;
    }

    if (!matchesHotkey(event, activeHotkey)) {
      return;
    }

    if (isEditableTarget(event.target) && !activeHotkey.hasModifier) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    void copyCurrentVideoFrame();
  }

  async function copyCurrentVideoFrame() {
    if (captureRunning) {
      showToast("正在复制上一张截图...", "info");
      return;
    }

    captureRunning = true;

    try {
      const video = pickBestVideo();
      if (!video) {
        showToast("没有找到可截图的视频", "error", 2600);
        return;
      }

      if (
        video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA ||
        video.videoWidth <= 0 ||
        video.videoHeight <= 0
      ) {
        showToast("视频画面还没有加载完成", "error", 2600);
        return;
      }

      const clipboard = getClipboardApi();
      if (!clipboard.supported) {
        showToast("当前浏览器不支持写入图片剪贴板", "error", 3600);
        return;
      }

      const width = video.videoWidth;
      const height = video.videoHeight;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { alpha: false });
      if (!context) {
        throw new Error("Cannot create a canvas context.");
      }

      context.drawImage(video, 0, 0, width, height);

      const item = new clipboard.ClipboardItem({
        "image/png": canvasToPngBlob(canvas),
      });

      await clipboard.writeItems([item]);
      showToast(`已复制视频截图 ${width} x ${height}`, "success");
    } catch (error) {
      reportCaptureError(error);
    } finally {
      captureRunning = false;
    }
  }

  function pickBestVideo() {
    const videos = collectVideos(document).filter(isUsableVideo);
    if (videos.length === 0) {
      return null;
    }

    videos.sort((left, right) => scoreVideo(right) - scoreVideo(left));
    return videos[0];
  }

  function collectVideos(root) {
    const videos = [];
    const seen = new Set();

    function add(video) {
      if (!seen.has(video)) {
        seen.add(video);
        videos.push(video);
      }
    }

    function visit(node) {
      if (!node || typeof node.querySelectorAll !== "function") {
        return;
      }

      if (node.nodeType === Node.ELEMENT_NODE && node.localName === "video") {
        add(node);
      }

      for (const video of node.querySelectorAll("video")) {
        add(video);
      }

      for (const element of node.querySelectorAll("*")) {
        if (element.shadowRoot) {
          visit(element.shadowRoot);
        }
      }
    }

    visit(root);
    return videos;
  }

  function isUsableVideo(video) {
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) {
      return false;
    }

    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      return false;
    }

    const rect = video.getBoundingClientRect();
    if (rect.width <= 1 || rect.height <= 1) {
      return false;
    }

    const style = getComputedStyle(video);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0
    );
  }

  function scoreVideo(video) {
    const rect = video.getBoundingClientRect();
    const visibleArea = getVisibleArea(rect);
    let score = visibleArea || rect.width * rect.height;

    if (document.pictureInPictureElement === video) {
      score += 1_000_000_000;
    }

    if (!video.paused && !video.ended) {
      score += score * 0.25 + 500;
    }

    score += Math.min(video.videoWidth * video.videoHeight, 10_000_000) / 1000;
    return score;
  }

  function getVisibleArea(rect) {
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
    const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
    return width * height;
  }

  function canvasToPngBlob(canvas) {
    return new Promise((resolve, reject) => {
      try {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Canvas export returned an empty image."));
          }
        }, "image/png");
      } catch (error) {
        reject(error);
      }
    });
  }

  function getClipboardApi() {
    const clipboard = navigator.clipboard;
    const ClipboardItemConstructor = window.ClipboardItem;

    return {
      ClipboardItem: ClipboardItemConstructor,
      supported:
        clipboard &&
        typeof clipboard.write === "function" &&
        typeof ClipboardItemConstructor === "function",
      writeItems: (items) => clipboard.write(items),
    };
  }

  function reportCaptureError(error) {
    const text = `${error && error.name ? error.name : ""} ${
      error && error.message ? error.message : String(error)
    }`;

    console.error(`[${SCRIPT_NAME}] Screenshot failed`, error);

    if (/SecurityError|taint|origin|cross-origin/i.test(text)) {
      showToast("视频源禁止导出画面，无法复制这帧", "error", 4200);
      return;
    }

    if (/NotAllowedError|clipboard|permission|denied/i.test(text)) {
      showToast("剪贴板写入被浏览器拒绝，请点一下页面后重试", "error", 3600);
      return;
    }

    showToast(`截图失败：${shorten(text, 70)}`, "error", 4200);
  }

  function registerMenuCommands() {
    if (typeof GM_registerMenuCommand !== "function") {
      return;
    }

    GM_registerMenuCommand("BiliShot: 复制当前视频帧", () => {
      void copyCurrentVideoFrame();
    });

    GM_registerMenuCommand("BiliShot: 设置快捷键", openHotkeyPrompt);

    GM_registerMenuCommand("BiliShot: 恢复默认快捷键", () => {
      writeStoredValue(HOTKEY_STORAGE_KEY, DEFAULT_HOTKEY);
      activeHotkey = parseHotkey(DEFAULT_HOTKEY);
      showToast(`快捷键已恢复为 ${DEFAULT_HOTKEY}`, "success");
    });
  }

  function openHotkeyPrompt() {
    const current = readStoredValue(HOTKEY_STORAGE_KEY, DEFAULT_HOTKEY);
    const next = prompt(
      [
        "设置 BiliShot 截图快捷键",
        "",
        "示例：W、Alt+Shift+S、Mod+Shift+S、Ctrl+Alt+V",
        "Mod 在 macOS 是 Cmd，在 Windows/Linux 是 Ctrl。",
      ].join("\n"),
      current,
    );

    if (next === null) {
      return;
    }

    const parsed = parseHotkey(next);
    if (!parsed) {
      alert("快捷键格式无效。请使用类似 W 或 Alt+Shift+S 的格式。");
      return;
    }

    writeStoredValue(HOTKEY_STORAGE_KEY, parsed.canonical);
    activeHotkey = parsed;
    showToast(`快捷键已设置为 ${parsed.canonical}`, "success");
  }

  function parseHotkey(input) {
    if (typeof input !== "string") {
      return null;
    }

    const tokens = input
      .trim()
      .split(/\s*\+\s*|\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return null;
    }

    const hotkey = {
      alt: false,
      ctrl: false,
      hasModifier: false,
      key: "",
      meta: false,
      shift: false,
      usesMod: false,
    };

    for (const rawToken of tokens) {
      const token = rawToken.trim();
      const lower = token.toLowerCase();

      if (lower === "mod") {
        hotkey.usesMod = true;
        if (IS_MAC) {
          hotkey.meta = true;
        } else {
          hotkey.ctrl = true;
        }
      } else if (lower === "ctrl" || lower === "control") {
        hotkey.ctrl = true;
      } else if (
        lower === "cmd" ||
        lower === "command" ||
        lower === "meta" ||
        lower === "super" ||
        lower === "win"
      ) {
        hotkey.meta = true;
      } else if (lower === "alt" || lower === "option" || lower === "opt") {
        hotkey.alt = true;
      } else if (lower === "shift") {
        hotkey.shift = true;
      } else {
        if (hotkey.key) {
          return null;
        }

        hotkey.key = normalizeKeyToken(token);
        if (!hotkey.key) {
          return null;
        }
      }
    }

    if (!hotkey.key) {
      return null;
    }

    hotkey.hasModifier = hotkey.alt || hotkey.ctrl || hotkey.meta || hotkey.shift;
    hotkey.canonical = stringifyHotkey(hotkey);
    return hotkey;
  }

  function normalizeKeyToken(token) {
    const lower = token.toLowerCase();
    const aliases = {
      backspace: "Backspace",
      backquote: "`",
      comma: ",",
      del: "Delete",
      delete: "Delete",
      down: "ArrowDown",
      end: "End",
      enter: "Enter",
      esc: "Escape",
      escape: "Escape",
      home: "Home",
      insert: "Insert",
      ins: "Insert",
      left: "ArrowLeft",
      minus: "-",
      pagedown: "PageDown",
      pageup: "PageUp",
      period: ".",
      plus: "+",
      return: "Enter",
      right: "ArrowRight",
      slash: "/",
      space: "Space",
      spacebar: "Space",
      tab: "Tab",
      up: "ArrowUp",
    };

    if (aliases[lower]) {
      return aliases[lower];
    }

    if (/^f([1-9]|1[0-9]|2[0-4])$/i.test(token)) {
      return token.toUpperCase();
    }

    if (/^[a-z]$/i.test(token)) {
      return token.toUpperCase();
    }

    if (/^\d$/.test(token)) {
      return token;
    }

    return token.length === 1 ? token : "";
  }

  function stringifyHotkey(hotkey) {
    const parts = [];

    if (hotkey.usesMod) {
      parts.push("Mod");
      if (IS_MAC && hotkey.ctrl) {
        parts.push("Ctrl");
      }
      if (!IS_MAC && hotkey.meta) {
        parts.push("Meta");
      }
    } else {
      if (hotkey.ctrl) {
        parts.push("Ctrl");
      }
      if (hotkey.meta) {
        parts.push(IS_MAC ? "Cmd" : "Meta");
      }
    }

    if (hotkey.alt) {
      parts.push("Alt");
    }
    if (hotkey.shift) {
      parts.push("Shift");
    }

    parts.push(hotkey.key);
    return parts.join("+");
  }

  function matchesHotkey(event, hotkey) {
    if (event.getModifierState && event.getModifierState("AltGraph")) {
      return false;
    }

    return (
      Boolean(event.altKey) === hotkey.alt &&
      Boolean(event.ctrlKey) === hotkey.ctrl &&
      Boolean(event.metaKey) === hotkey.meta &&
      Boolean(event.shiftKey) === hotkey.shift &&
      matchesKey(event, hotkey.key)
    );
  }

  function matchesKey(event, key) {
    if (/^[A-Z]$/.test(key)) {
      return event.code === `Key${key}` || event.key.toUpperCase() === key;
    }

    if (/^\d$/.test(key)) {
      return event.code === `Digit${key}` || event.code === `Numpad${key}` || event.key === key;
    }

    if (/^F([1-9]|1[0-9]|2[0-4])$/.test(key)) {
      return event.key.toUpperCase() === key;
    }

    const specialKeys = {
      ArrowDown: ["ArrowDown", "Down"],
      ArrowLeft: ["ArrowLeft", "Left"],
      ArrowRight: ["ArrowRight", "Right"],
      ArrowUp: ["ArrowUp", "Up"],
      Backspace: ["Backspace"],
      Delete: ["Delete", "Del"],
      End: ["End"],
      Enter: ["Enter"],
      Escape: ["Escape", "Esc"],
      Home: ["Home"],
      Insert: ["Insert", "Ins"],
      PageDown: ["PageDown"],
      PageUp: ["PageUp"],
      Space: [" ", "Spacebar", "Space"],
      Tab: ["Tab"],
    };

    if (specialKeys[key]) {
      return specialKeys[key].includes(event.key) || event.code === key;
    }

    return event.key === key || event.code === key;
  }

  function isEditableTarget(target) {
    const element =
      target && target.nodeType === Node.ELEMENT_NODE
        ? target
        : target && target.parentElement;

    if (!element || typeof element.closest !== "function") {
      return false;
    }

    return Boolean(
      element.isContentEditable ||
        element.closest("input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"),
    );
  }

  function readStoredValue(key, fallback) {
    try {
      if (typeof GM_getValue === "function") {
        return GM_getValue(key, fallback);
      }
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] GM_getValue failed`, error);
    }

    try {
      return localStorage.getItem(key) || fallback;
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] localStorage read failed`, error);
      return fallback;
    }
  }

  function writeStoredValue(key, value) {
    try {
      if (typeof GM_setValue === "function") {
        GM_setValue(key, value);
        return;
      }
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] GM_setValue failed`, error);
    }

    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn(`[${SCRIPT_NAME}] localStorage write failed`, error);
    }
  }

  function showToast(message, kind = "info", timeout = 1800) {
    ensureToastStyle();

    let toast = document.getElementById(TOAST_ID);
    if (!toast) {
      toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.setAttribute("role", "status");
      document.documentElement.appendChild(toast);
    }

    toast.className = `bili-shot-toast bili-shot-toast-${kind}`;
    toast.textContent = message;

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.remove();
    }, timeout);
  }

  function ensureToastStyle() {
    if (document.getElementById(TOAST_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = TOAST_STYLE_ID;
    style.textContent = `
      .bili-shot-toast {
        position: fixed;
        left: 50%;
        bottom: 28px;
        z-index: 2147483647;
        max-width: min(520px, calc(100vw - 32px));
        transform: translateX(-50%);
        padding: 10px 14px;
        border-radius: 6px;
        background: rgba(20, 24, 31, 0.94);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.22);
        color: #fff;
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        overflow-wrap: anywhere;
        pointer-events: none;
      }

      .bili-shot-toast-success {
        background: rgba(0, 132, 92, 0.96);
      }

      .bili-shot-toast-error {
        background: rgba(192, 54, 54, 0.96);
      }
    `;
    document.documentElement.appendChild(style);
  }

  function shorten(text, maxLength) {
    if (text.length <= maxLength) {
      return text;
    }

    return `${text.slice(0, maxLength - 1)}...`;
  }
})();
