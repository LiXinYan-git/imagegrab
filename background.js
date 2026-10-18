/* ============================================================
 * 图提取 · ImageGrab —— background service worker
 * 职责：接收内容脚本发来的图片列表，暂存到 session storage，
 *       然后打开扩展内的图片预览页（gallery.html）。
 * ============================================================ */

const GALLERY_PAGE = 'gallery.html';
// session storage 在浏览器关闭后自动清空；旧版本 Chrome 回退到 local
const storageArea = chrome.storage.session || chrome.storage.local;

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return;

  if (msg.type === 'IG_IMAGES') {
    const payload = {
      images: Array.isArray(msg.images) ? msg.images : [],
      page: msg.page || {},
      time: Date.now()
    };
    storageArea.set({ igLastPayload: payload }, () => {
      chrome.tabs.create({ url: chrome.runtime.getURL(GALLERY_PAGE) }, () => {
        sendResponse({ ok: true, count: payload.images.length });
      });
    });
    return true;   // 异步响应，保持消息通道
  }

  if (msg.type === 'IG_OPEN_GALLERY') {
    chrome.tabs.create({ url: chrome.runtime.getURL(GALLERY_PAGE) });
    sendResponse({ ok: true });
    return true;
  }
});

// 点击工具栏图标：随时打开上一次的图片预览
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL(GALLERY_PAGE) });
});
