/* ============================================================
 * 图提取 · ImageGrab —— 预览页逻辑
 * 职责：读取后台暂存的图片列表 → 渲染网格 → 勾选 → 转 PNG 批量下载
 * ============================================================ */
(function () {
  'use strict';

  var store = chrome.storage.session || chrome.storage.local;
  var items = [];            // { url, w, h, index, checked, broken, card, cb }
  var downloading = false;
  var pendingRevoke = new Map();   // downloadId -> objectURL

  function $(sel) { return document.querySelector(sel); }
  function pad3(n) { return String(n).padStart(3, '0'); }

  /* ---------------- 初始化 ---------------- */
  function init() {
    bindToolbar();
    chrome.downloads.onChanged.addListener(function (delta) {
      if (delta.state && (delta.state.current === 'complete' || delta.state.current === 'interrupted')) {
        var u = pendingRevoke.get(delta.id);
        if (u) { URL.revokeObjectURL(u); pendingRevoke.delete(delta.id); }
      }
    });

    store.get('igLastPayload', function (data) {
      var payload = data && data.igLastPayload;
      if (!payload || !payload.images || !payload.images.length) { showEmpty(); return; }
      render(payload);
    });
  }

  function showEmpty() {
    $('#empty').classList.remove('hidden');
  }

  /* ---------------- 渲染 ---------------- */
  function render(payload) {
    $('#empty').classList.add('hidden');
    var grid = $('#grid');
    grid.innerHTML = '';

    var page = payload.page || {};
    var when = payload.time ? new Date(payload.time).toLocaleString('zh-CN') : '';
    $('#pageMeta').textContent = [page.platform, page.title, when].filter(Boolean).join(' · ');

    items = payload.images.map(function (im, i) {
      return {
        url: im.url, w: im.w || 0, h: im.h || 0,
        index: i + 1, checked: true, broken: false
      };
    });

    items.forEach(function (it) {
      var card = document.createElement('label');
      card.className = 'card';

      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.className = 'cb';
      cb.checked = true;
      cb.addEventListener('change', function () {
        it.checked = cb.checked;
        updateCount();
      });

      var badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = 'PNG';

      var thumb = document.createElement('div');
      thumb.className = 'thumb';
      var img = document.createElement('img');
      img.loading = 'lazy';
      img.referrerPolicy = 'no-referrer';
      img.alt = '商品图 ' + pad3(it.index);
      img.addEventListener('error', function () {
        it.broken = true;
        card.classList.add('broken');
        cb.checked = false;
        it.checked = false;
        updateCount();
      });
      img.addEventListener('load', function () {
        // 预览加载后如果用真实尺寸发现是小图，标记为次要（仍可下载）
        if (!it.w && img.naturalWidth && (img.naturalWidth < 100 || img.naturalHeight < 100)) {
          card.classList.add('small');
        }
      });
      img.src = it.url;
      thumb.appendChild(img);

      var meta = document.createElement('div');
      meta.className = 'meta';
      var idx = document.createElement('span');
      idx.className = 'idx';
      idx.textContent = '#' + pad3(it.index);
      var size = document.createElement('span');
      size.textContent = (it.w && it.h) ? (it.w + '×' + it.h) : '尺寸未知';
      meta.appendChild(idx);
      meta.appendChild(size);

      card.appendChild(cb);
      card.appendChild(badge);
      card.appendChild(thumb);
      card.appendChild(meta);
      it.card = card;
      it.cb = cb;
      grid.appendChild(card);
    });

    updateCount();
    setStatus('共提取到 ' + items.length + ' 张图片，已默认全选。');
  }

  /* ---------------- 选择操作 ---------------- */
  function setAll(v) {
    items.forEach(function (it) {
      if (it.broken) return;
      it.checked = v;
      if (it.cb) it.cb.checked = v;
    });
    updateCount();
  }

  function invert() {
    items.forEach(function (it) {
      if (it.broken) return;
      it.checked = !it.checked;
      if (it.cb) it.cb.checked = it.checked;
    });
    updateCount();
  }

  function updateCount() {
    var n = items.filter(function (it) { return it.checked && !it.broken; }).length;
    $('#selCount').textContent = String(n);
    $('#total').textContent = String(items.length);
  }

  function bindToolbar() {
    $('#selectAll').addEventListener('click', function () { setAll(true); });
    $('#clearSel').addEventListener('click', function () { setAll(false); });
    $('#invert').addEventListener('click', invert);
    $('#downloadBtn').addEventListener('click', downloadSelected);
  }

  /* ---------------- 下载 ---------------- */
  function lock(v) {
    ['selectAll', 'invert', 'clearSel', 'downloadBtn'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.disabled = v;
    });
  }

  function setStatus(text, isError) {
    var el = $('#status');
    el.textContent = text || '';
    el.classList.toggle('error', !!isError);
  }

  function setProgress(ratio, text) {
    var wrap = $('#progressWrap');
    var bar = $('#progressBar');
    if (ratio >= 1) {
      setTimeout(function () { wrap.classList.add('hidden'); }, 800);
    } else {
      wrap.classList.remove('hidden');
    }
    bar.style.width = Math.max(0, Math.min(1, ratio)) * 100 + '%';
    if (text) setStatus(text);
  }

  // 下载（fetch → ImageBitmap → Canvas → PNG Blob → chrome.downloads）
  function fetchImage(url) {
    return fetch(url, { credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.blob();
      })
      .then(function (blob) {
        if (!blob || !/^image\//.test(blob.type)) throw new Error('不是图片：' + (blob && blob.type));
        return blob;
      });
  }

  function toPng(blob) {
    return createImageBitmap(blob).then(function (bmp) {
      var canvas = document.createElement('canvas');
      canvas.width = bmp.width;
      canvas.height = bmp.height;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(bmp, 0, 0);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve, reject) {
        canvas.toBlob(function (out) {
          out ? resolve(out) : reject(new Error('PNG 转换失败'));
        }, 'image/png');
      });
    });
  }

  function saveBlob(blob, filename) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(blob);
      chrome.downloads.download({ url: url, filename: filename, saveAs: false }, function (id) {
        if (chrome.runtime.lastError || !id) {
          URL.revokeObjectURL(url);
          reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : '下载失败'));
          return;
        }
        pendingRevoke.set(id, url);
        resolve(id);
      });
    });
  }

  function downloadSelected() {
    if (downloading) return;
    var list = items.filter(function (it) { return it.checked && !it.broken; });
    if (!list.length) { setStatus('请先勾选要下载的图片。', true); return; }

    downloading = true;
    lock(true);
    var ok = 0, fail = 0, total = list.length;

    var chain = Promise.resolve();
    list.forEach(function (it, i) {
      chain = chain.then(function () {
        setProgress(i / total, '正在处理 ' + (i + 1) + '/' + total + '：#' + pad3(it.index));
        return fetchImage(it.url)
          .then(toPng)
          .then(function (png) { return saveBlob(png, '商品图_' + pad3(i + 1) + '.png'); })
          .then(function () { ok++; })
          .catch(function (err) {
            fail++;
            console.warn('[ImageGrab] 下载失败：' + it.url, err);
          });
      });
    });

    chain.then(function () {
      setProgress(1, '完成：成功 ' + ok + ' 张，失败 ' + fail + ' 张。');
      if (fail) {
        setStatus('完成：成功 ' + ok + ' 张，失败 ' + fail + ' 张（失败多为图片服务器跨域限制，可在 manifest.json 的 host_permissions 中补充该域名）。', true);
      }
      downloading = false;
      lock(false);
    });
  }

  document.addEventListener('DOMContentLoaded', init);
})();
