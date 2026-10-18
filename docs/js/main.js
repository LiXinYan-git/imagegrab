/* ============================================================
 * 图提取 ImageGrab —— 官网交互
 * 功能：移动端菜单、导航栏滚动阴影、滚动高亮、入场动画、
 *       下载按钮提示、锚点平滑滚动（CSS 已处理）
 * ============================================================ */
(function () {
  'use strict';

  var header = document.getElementById('siteHeader');
  var toggle = document.getElementById('menuToggle');
  var menu = document.getElementById('navMenu');
  var toastEl = document.getElementById('toast');
  var toastTimer = null;

  /* ---------- 轻提示 ---------- */
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 3000);
  }

  /* ---------- 移动端菜单 ---------- */
  function closeMenu() {
    menu.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-label', '打开菜单');
  }
  toggle.addEventListener('click', function () {
    var open = menu.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? '关闭菜单' : '打开菜单');
  });
  menu.querySelectorAll('a').forEach(function (a) {
    a.addEventListener('click', closeMenu);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });

  /* ---------- 滚动：导航阴影 + 当前区块高亮 ---------- */
  var navLinks = Array.prototype.slice.call(menu.querySelectorAll('.nav-link'));
  var sections = Array.prototype.slice.call(document.querySelectorAll('[data-section]'));

  function onScroll() {
    header.classList.toggle('scrolled', window.scrollY > 8);

    var pos = window.scrollY + 120;
    var current = '';
    sections.forEach(function (s) {
      if (s.offsetTop <= pos) current = s.id;
    });
    navLinks.forEach(function (a) {
      var active = a.getAttribute('href') === '#' + current;
      a.classList.toggle('active', active);
      if (active) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  onScroll();

  /* ---------- 入场动画 ---------- */
  var reveals = Array.prototype.slice.call(document.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    reveals.forEach(function (el) { io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add('visible'); });
  }

  // 兜底：个别环境（如无头浏览器、旧版内核）IntersectionObserver 不触发时，
  // 1.5 秒后确保所有内容可见，避免页面一直是"白屏"。
  setTimeout(function () {
    if (!document.querySelector('.reveal.visible')) {
      reveals.forEach(function (el) { el.classList.add('visible'); });
    }
  }, 1500);

  /* ---------- 下载插件：下载 docs/assets/imagegrab.zip ---------- */
  var downloadBtn = document.getElementById('downloadBtn');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function () {
      toast('开始下载插件压缩包；解压后按上方四步加载即可');
    });
  }
})();
