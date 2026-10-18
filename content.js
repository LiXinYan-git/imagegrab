/* ============================================================
 * 图提取 · ImageGrab —— content script
 * 职责：在商品详情页右下角注入「获取图片」按钮；扫描页面上的
 *       商品图片（img / srcset / 懒加载属性 / 背景图），过滤掉
 *       图标、logo、占位图与过小图片，去重后交给后台。
 * ============================================================ */
(function () {
  'use strict';

  // 防止同一页面被重复注入
  if (window.__IG_INJECTED__) return;
  window.__IG_INJECTED__ = true;

  var MIN_SIZE = 100;   // 最小宽/高（px），小于该尺寸视为图标/占位图
  var IGNORE_RE = /(logo|icon|sprite|avatar|loading|placeholder|blank|spacer|qrcode|1x1|pixel)/i;
  var IMG_ATTRS = ['src', 'data-src', 'data-lazy-src', 'data-original', 'data-actualsrc',
                   'data-ks-lazyload', 'data-lazyload', 'data-url', 'data-image', 'data-pic'];

  var btn = null;
  var toastEl = null;
  var toastTimer = null;
  var busy = false;
  var lastHref = location.href;

  /* ---------------- 平台识别 ---------------- */
  function getPlatform() {
    var host = location.hostname;
    var path = location.pathname + location.search;

    if (/(^|\.)(taobao|tmall)\.com$/i.test(host)) {
      return {
        name: '淘宝/天猫',
        detail: /item\.htm|detail\.htm|detail\.tmall\.com|\/i\d+\.htm/i.test(path)
      };
    }
    if (/(^|\.)jd\.com$/i.test(host)) {
      return {
        name: '京东',
        detail: /^item\.jd\.com$/i.test(host) || /\/\d+\.html/i.test(path) || /product\/\d+/i.test(path)
      };
    }
    if (/(^|\.)(pinduoduo|yangkeduo)\.com$/i.test(host)) {
      return {
        name: '拼多多',
        detail: /goods|detail|mall/i.test(path) || /goods_id=/i.test(location.search)
      };
    }
    return null;
  }

  /* ---------------- URL 规整 ---------------- */
  function normalizeUrl(raw) {
    if (!raw) return '';
    var u = String(raw).trim().replace(/^["'\s]+|["'\s]+$/g, '');
    if (!u) return '';
    if (u.indexOf('//') === 0) u = 'https:' + u;
    if (/^(data|blob|chrome-extension|moz-extension):/i.test(u)) return '';   // 内联图/临时图不要
    try {
      var x = new URL(u, location.href);
      if (x.protocol !== 'http:' && x.protocol !== 'https:') return '';
      x.hash = '';
      return x.href;
    } catch (e) {
      return '';
    }
  }

  // 解析 srcset="url1 1x, url2 2x" 这类写法
  function parseSrcset(str) {
    if (!str) return [];
    var out = [];
    str.split(',').forEach(function (part) {
      var u = part.trim().split(/\s+/)[0];
      if (u) out.push(u);
    });
    return out;
  }

  /* ---------------- 扫描图片 ---------------- */
  function collectImages() {
    var map = new Map();

    function add(raw, w, h) {
      var url = normalizeUrl(raw);
      if (!url) return;
      if (/\.svg(\?|#|$)/i.test(url)) return;          // 矢量图标
      if (IGNORE_RE.test(url)) return;                  // logo/图标/占位图
      if (w && h && (w < MIN_SIZE || h < MIN_SIZE)) return;
      if (!map.has(url)) {
        map.set(url, { url: url, w: w || 0, h: h || 0 });
      } else {
        var it = map.get(url);
        if (!it.w && w) { it.w = w; it.h = h; }
      }
    }

    // 1) <img> 及其懒加载属性 / srcset
    document.querySelectorAll('img').forEach(function (img) {
      var w = img.naturalWidth || 0;
      var h = img.naturalHeight || 0;
      add(img.currentSrc || img.src, w, h);
      IMG_ATTRS.forEach(function (attr) {
        var v = img.getAttribute(attr);
        if (v) add(v, w, h);
      });
      var ss = img.getAttribute('srcset') || img.getAttribute('data-srcset');
      if (ss) parseSrcset(ss).forEach(function (u) { add(u, w, h); });
    });

    // 2) <source srcset>
    document.querySelectorAll('source[srcset], source[data-srcset]').forEach(function (s) {
      var ss = s.getAttribute('srcset') || s.getAttribute('data-srcset');
      if (ss) parseSrcset(ss).forEach(function (u) { add(u); });
    });

    // 3) 背景图：先扫内联 style，再对类名/ID 可疑的元素取计算样式（控制性能）
    function addBg(el) {
      var bg = el.style && el.style.backgroundImage;
      if (!bg || bg === 'none') {
        var cls = (el.className || '') + ' ' + (el.id || '');
        if (!/(bg|banner|pic|img|image|thumb|swiper|gallery|slide|photo)/i.test(cls)) return;
        try { bg = getComputedStyle(el).backgroundImage; } catch (e) { return; }
      }
      if (!bg || bg === 'none') return;
      var re = /url\((['"]?)(.*?)\1\)/g, m;
      while ((m = re.exec(bg))) add(m[2]);
    }
    var all = document.querySelectorAll('div, section, li, a, span, figure, p');
    for (var i = 0; i < all.length && i < 6000; i++) addBg(all[i]);

    // 按面积从大到小排序，让主图排在前面
    return Array.from(map.values()).sort(function (a, b) {
      return (b.w * b.h) - (a.w * a.h);
    });
  }

  /* ---------------- 界面元素 ---------------- */
  function ensureButton() {
    var info = getPlatform();
    if (!info || !info.detail) { removeButton(); return; }
    if (btn && document.documentElement.contains(btn)) return;

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ig-fab';
    btn.title = '提取当前页面的商品图片';
    btn.innerHTML = '<span class="ig-fab-ico">⬇</span><span class="ig-fab-txt">获取图片</span>';
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      extract();
    });
    document.documentElement.appendChild(btn);
  }

  function removeButton() {
    if (btn && btn.parentNode) btn.parentNode.removeChild(btn);
    btn = null;
  }

  function setBusy(v, text) {
    busy = v;
    if (!btn) return;
    btn.classList.toggle('ig-busy', !!v);
    var t = btn.querySelector('.ig-fab-txt');
    if (t) t.textContent = text || (v ? '扫描中…' : '获取图片');
  }

  function toast(msg, ms) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'ig-toast';
      document.documentElement.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 3200);
  }

  /* ---------------- 主流程 ---------------- */
  function extract() {
    if (busy) return;
    setBusy(true, '扫描中…');

    var images, info;
    try {
      images = collectImages();
      info = getPlatform();
    } catch (e) {
      setBusy(false);
      toast('扫描出错：' + (e && e.message ? e.message : e));
      return;
    }

    if (!images.length) {
      setBusy(false);
      toast('没有找到符合条件的图片（已过滤图标、logo、小图与占位图）');
      return;
    }

    try {
      chrome.runtime.sendMessage({
        type: 'IG_IMAGES',
        images: images,
        page: { title: document.title, url: location.href, platform: info ? info.name : '' }
      }, function () {
        setBusy(false);
        if (chrome.runtime.lastError) {
          toast('扩展通信失败，请刷新页面后重试');
          return;
        }
        toast('已提取 ' + images.length + ' 张图片，正在打开预览页…');
      });
    } catch (e) {
      setBusy(false);
      toast('扩展已更新或重载，请刷新页面后重试');
    }
  }

  /* ---------------- SPA 路由监听 ---------------- */
  function tick() {
    if (location.href !== lastHref) {
      lastHref = location.href;
      // 路由切换后页面内容稍后才渲染，延迟检查
      setTimeout(ensureButton, 900);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(ensureButton, 300); });
  } else {
    setTimeout(ensureButton, 300);
  }
  window.addEventListener('load', function () { setTimeout(ensureButton, 800); });
  setInterval(tick, 1000);
})();
