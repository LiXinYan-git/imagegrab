# 图提取 · ImageGrab

一个 Chrome 浏览器扩展（Manifest V3）：在**淘宝/天猫、京东、拼多多商家版**的商品详情页右下角注入「获取图片」按钮，
一键提取页面上的所有商品图片，在新标签页中集中预览、勾选，并**批量下载为 PNG**。

> 纯前端实现，不上传任何数据；图片列表只保存在浏览器会话中。

## 功能

- **仅在商品详情页显示**浮动按钮（圆角、渐变、阴影、hover 反馈），不遮挡页面原有操作
- **图片提取**：支持 `<img>`、`srcset`、`data-src` / `data-lazy-src` 等懒加载属性、`background-image` 背景图
- **智能过滤**：自动排除 logo、图标、头像、占位图、1×1 像素图，以及小于 100×100 的图片
- **自动去重**：相对路径补全为绝对 URL，按 URL 去重，并按面积从大到小排序
- **集中预览**：新页面网格展示缩略图、序号、尺寸
- **自由勾选**：全选 / 反选 / 清空 / 已选数量统计
- **统一 PNG**：用 `createImageBitmap` + Canvas 把 jpg / webp / png 统一转为 PNG
- **批量下载**：`chrome.downloads` 保存到默认下载目录，文件名 `商品图_001.png`（序号自动补零）
- **进度反馈**：下载时显示进度条与「正在处理 3/12」，完成后汇总成功/失败数量

## 安装（开发者模式）

1. 打开 Chrome，地址栏输入 `chrome://extensions` 回车；
2. 打开右上角 **开发者模式**；
3. 点击 **加载已解压的扩展程序**，选择**本文件夹**（含 `manifest.json` 的这一层）；
4. 固定扩展图标（可选）。

> Edge 同样适用：地址栏输入 `edge://extensions`，开启「开发人员模式」→「加载解压缩的扩展」。

## 使用

1. 打开商品详情页（淘宝/天猫 item.htm、京东 item.jd.com、拼多多 goods.html 等）；
2. 页面右下角出现 **「获取图片」** 按钮，点击；
3. 自动打开「图提取」预览页，勾选需要的图片（默认全选）；
4. 点击 **下载选中**，等待进度完成，图片保存为 PNG。

> 也可以在扩展页点击工具栏图标，随时打开上一次提取的图片预览。

## 目录结构

```
imagegrab/                    ← GitHub 仓库根目录
├─ manifest.json              # MV3 扩展清单
├─ content.js                 # 注入按钮 + 扫描/过滤图片
├─ content.css                # 按钮与提示样式
├─ background.js              # service worker：暂存图片列表、打开预览页
├─ gallery.html               # 图片预览页
├─ gallery.js                 # 勾选、PNG 转换与批量下载
├─ gallery.css                # 预览页样式
├─ icons/                     # 16/32/48/128 图标
├─ README.md
└─ docs/                      # 插件官网（GitHub Pages 发布目录）
   ├─ index.html
   ├─ 404.html
   ├─ .nojekyll
   ├─ css/style.css
   ├─ js/main.js
   └─ assets/{favicon.svg, imagegrab.zip}
```

## 官网（docs/）

- 线上地址：https://lixinyan-git.github.io/imagegrab/
- 本地预览：直接双击 `docs/index.html`
- GitHub Pages 设置：`Settings → Pages → Deploy from a branch → main + /docs`
- 官网上的「下载插件」按钮下载的是 `docs/assets/imagegrab.zip`。
  **修改扩展代码后，记得重新打包这个 zip**（包含 manifest.json、content.*、background.js、gallery.*、icons/、README.md）。

## 权限说明

| 权限 | 用途 |
|---|---|
| `activeTab` / `scripting` | 在用户主动操作的页面注入脚本（预留） |
| `downloads` | 批量保存 PNG 到下载目录 |
| `storage` | 在内容脚本与预览页之间传递图片列表（session 级） |
| `host_permissions` | 覆盖淘宝/天猫、京东、拼多多主域，以及图片 CDN（alicdn、360buyimg、pddpic 等），用于跨域取图转 PNG |

## 已知限制

- 页面若把商品图放在 **iframe** 内，当前版本（`all_frames: false`）不会扫描到，可在 `manifest.json` 中改为 `true` 再测试；
- 极少数图片 CDN 不在 `host_permissions` 中时，跨域取图会失败（预览页会提示失败数量），可在 manifest 里补充对应域名；
- 详情页判断是启发式规则；若某平台改版导致按钮不出现，可在 `content.js` 的 `getPlatform()` 中补充路径规则；
- 请仅下载自己有权使用的图片，遵守各平台的服务条款与版权规定。

MIT License
