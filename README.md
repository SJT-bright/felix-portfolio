# Felix Wormhole Portfolio

一个由 React + Vite 构建的个人作品与社群展示站：进入首页时先显示由蓝色星球、360° 轨道与 `0–100%` 组成的资源加载页；加载完成后保持视频第 0 帧，第一次点击、滚轮或上滑才播放 6 秒带原始 BGM 的虫洞穿越前奏。视频结束后页面不滚动，而是在原位置交叉淡化到真正的 Felix 个人首页；只有下一次新的滚动才进入虫洞蓝配色的 `DriftWall` 作品墙。点击“进入作品影像馆”时会播放一段带电影感 BGM、由大量照片组成的全屏螺旋穿越转场，以纯白尾帧无闪接入独立 360° 影像馆。

从 Windows 转移到 Mac 继续编辑时，请优先阅读 `MAC-迁移与启动说明.md`。

## 本地预览

```sh
npm install
npm run preview
```

然后打开 `http://127.0.0.1:52124/`。预览服务支持视频拖动所需的 HTTP byte-range 响应；不要直接用 `file://` 打开页面。

开发时也可以运行：

```sh
npm run dev
```

## 视频声音

站内当前所有可播放视频都以带 BGM 的方式播放，不会默认降级成静音：

- 首页使用 `assets/wormhole-home-with-audio.mp4`，保留了用户原始虫洞素材的 BGM。
- 影像馆入场使用 `assets/portfolio-entry-transition-with-bgm.mp4`。原素材的音轨几乎是静音，因此它仍被保留为第二音轨，并新增电影感 BGM 作为默认音轨。
- 第 1–6 张项目卡使用各自的本地 sRGB 静态封面，并整卡跳转到对应真实作品地址。
- 第 7–8 张项目卡暂用自带 AAC 音轨的 `assets/sailing-august-9.mp4` 作为视频占位；同一时刻只会有一个可见项目视频占用 BGM，避免多路音乐重叠。

部分浏览器不允许滚轮手势直接启动有声视频。遇到这种情况时，页面会明确提示点击屏幕开启音乐，而不是偷偷改为静音播放。

## 更换图片

只需编辑 `src/data/galleryItems.js`。每个条目支持：

```js
{
  image: "/你的图片路径.jpg",
  title: "作品名称",
  href: "https://可选的目标地址"
}
```

图片加载失败时页面会自动显示与虫洞蓝主题一致的占位卡片。

## 验证

```sh
npm run test:all
```

普通测试不会写入截图。需要刷新 DriftWall 视觉证据时，在 PowerShell 中运行：

```powershell
$env:FELIX_WRITE_DRIFTWALL_SCREENSHOTS='1'
npm run test:browser
Remove-Item Env:FELIX_WRITE_DRIFTWALL_SCREENSHOTS
```

该模式只写入：

- `artifacts/felix-driftwall-desktop.png`
- `artifacts/felix-driftwall-mobile-320.png`

在 macOS 终端中使用：

```bash
FELIX_WRITE_DRIFTWALL_SCREENSHOTS=1 npm run test:browser
```

## 部署要求

静态主机必须对构建后的两段转场 MP4 支持 byte-range：范围请求返回 `206 Partial Content`，并包含 `Accept-Ranges: bytes` 与正确的 `Content-Range`。

部署后可以对实际地址运行同一套浏览器门禁：

```powershell
$env:FELIX_BASE_URL='https://example.com/'
npm run test:browser
Remove-Item Env:FELIX_BASE_URL
```

在 macOS 终端中使用：

```bash
FELIX_BASE_URL='https://example.com/' npm run test:browser
```
