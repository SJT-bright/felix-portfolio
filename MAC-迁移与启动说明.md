# Felix 社群网站：Mac 迁移与启动说明

这是可以直接转移到 macOS 继续编辑的完整源码包。

## 1. 需要的软件

- Node.js 22.12 或更新版本
- npm（安装 Node.js 时会自动附带）
- 推荐编辑器：Visual Studio Code

如果 Mac 还没有 Node.js，可以先安装 Homebrew，然后运行：

```bash
brew install node
```

检查版本：

```bash
node -v
npm -v
```

## 2. 在 Mac 上启动网站

将 ZIP 解压到任意文件夹，例如“文稿”或“桌面”，然后打开终端并进入源码目录：

```bash
cd ~/Documents/Felix社群网站-Mac源码-2026-08-28
npm ci
npm run dev
```

浏览器打开：

```text
http://127.0.0.1:52124/
```

停止开发服务器时，在终端按 `Control + C`。

不要双击 `index.html` 使用 `file://` 打开。网站包含 ES Module、视频和独立影像馆页面，必须通过开发服务器访问。

## 3. 常用命令

```bash
# 启动开发模式，修改代码后自动刷新
npm run dev

# 生成正式部署文件
npm run build

# 构建并用本地预览服务器查看
npm run preview

# 运行代码与页面契约测试
npm test

# 运行全部测试（包含真实浏览器检查，耗时较长）
npx playwright install chromium
npm run test:all
```

第一次在新 Mac 上运行浏览器测试前，需要执行一次 `npx playwright install chromium`。如果只启动和编辑网站，不需要下载这个测试浏览器。

正式构建结果会生成在 `dist/` 文件夹中。`dist/` 是可重新生成的产物，不需要手工编辑。

## 4. 主要编辑位置

- `src/App.jsx`：网站各页面章节的排列顺序
- `index.html`：首页星球加载页的结构、署名和首屏关键样式
- `src/components/OceanHero.jsx`：首页虫洞视频前奏及播放入口
- `src/components/ProfileLanding.jsx`：视频结束后原地显现的个人首页、介绍与空白影像位
- `src/hooks/useHomeLoader.js`：等待星球图与首页视频可播放后解除加载层
- `src/lib/home-loader-controller.js`：`0–100%`、`0–360°` 映射、超时放行和加载页退出状态机
- `scroll-controller.js`：首页滚轮触发有声播放、原地淡化及惯性输入隔离逻辑；播放结束不会自动跳到下一节，浏览器拦截有声播放时会要求用户点击确认
- `src/lib/video-bgm.js`：全站视频的有声播放、音量与单一 BGM 焦点管理
- `src/components/DriftWall/`：横向图片墙组件
- `src/data/galleryItems.js`：图片墙中的作品图片和标题
- `src/components/ScrollExpand/`：中段全幅过渡章节底层组件（当前已关闭缩放，等待新视频）
- `src/components/ProjectShowcase/`：网站 Demo 卡片区；第 1–6 项为带真实外链的静态封面，第 7–8 项仍为视频占位
- `src/components/ProjectShowcase/project-video-controller.js`：第 7–8 项占位视频的可见播放与 BGM 占用控制，同一时刻只允许一路项目音乐
- `src/components/PortfolioEntryTransition.jsx`：进入影像馆时的全屏视频转场
- `src/lib/portfolio-transition-controller.js`：转场播放、跳过、失败放行与导航控制
- `src/data/projectItems.js`：8 个网站 Demo 的标题、说明、静态图片或视频以及跳转链接；当前第 1–6 项已填真实链接，第 7–8 项待补
- `src/pages/LabPage.jsx`：社群成果与引流页面
- `src/styles/global.css` 和 `tokens.css`：全站颜色、字号与通用样式
- `public/portfolio/`：独立的 360° 影像馆整页

## 5. 媒体资源

- `public/loader/planet-loader-art.png`：从用户原图精确裁出的 864×864 透明星球与轨道素材；星球保持静止，装饰轨道与 SVG 进度分别运动
- `assets/wormhole-home-with-audio.mp4`：首页 6 秒虫洞视频（网页优化版），保留用户原始素材的 AAC 立体声 BGM，是当前页面实际使用的版本
- `assets/wormhole-home.mp4`：保留的无声历史网页优化版，当前页面不再引用
- `assets/wormhole-home-poster.jpg`：虫洞视频首帧封面
- `assets/wormhole-home-end.png`：保留的虫洞视频历史末帧素材，当前个人首页淡化不再依赖它
- `assets/portfolio-entry-transition-with-bgm.mp4`：进入影像馆的 6 秒照片漩涡穿越视频，尾帧为纯白。原素材音轨几乎是静音，因此保留为第二 AAC 音轨，同时新增电影感 BGM 作为默认 AAC 音轨；这是当前页面实际使用的版本
- `assets/portfolio-entry-transition.mp4`：保留的无声历史网页优化版，当前页面不再引用
- `assets/portfolio-entry-transition-poster.jpg`：照片漩涡转场首帧封面
- `assets/portfolio-entry-transition-end.png`：影像馆转场真实纯白尾帧
- `src/assets/portfolio-gallery-backdrop.jpg`：首页影像馆入口的横版人物写真背景
- `assets/sailing-poster.jpg`：中段过渡的临时全幅背景，收到新视频后将替换
- `assets/project-01-mufeng-fragrance.jpg` 至 `assets/project-06-mercedes-cinematic.jpg`：第 1–6 个网站 Demo 的本地 sRGB 静态封面；点击卡片打开对应真实作品
- `assets/sailing-august-9.mp4`：第 7–8 个网站 Demo 当前使用的视频占位，内含 AAC 立体声 BGM；真实作品素材与跳转链接待补。为避免多路音乐重叠，同一时刻只允许一个可见卡片占用 BGM
- `assets/sailing-august-9-poster.jpg`：网站 Demo 视频封面
- `public/portfolio/vendor/`：影像馆使用的本地 Three.js 与 GSAP

更换媒体时，请同步生成首帧封面和真实末帧，并修改对应 JSX/数据文件里的 `import` 路径。

首页加载页只等待中央星球素材和首页视频达到可播放状态，不会等待下方全部图片与项目视频。完整顺序是“星球加载页 → 带 BGM 的虫洞视频前奏 → Felix 个人首页”；视频结束只会原地淡出，必须由用户再次滚动才进入 Image Archive。加载超过 8 秒或媒体报错时会自动放行到个人首页，避免遮罩永久卡住；带 `#image-archive`、`#project-showcase` 或 `#portfolio-gallery` 的返回链接会直接跳到目标章节，不重复播放加载动画。站内当前所有可播放视频都必须保留 BGM；如果浏览器禁止滚轮手势直接开启声音，页面会提示点击屏幕后再播放，不会改为静音降级。

## 6. 迁移包已经排除的内容

为了减小体积，本包没有包含以下可重新生成或与编辑无关的内容：

- `node_modules/`：在 Mac 上通过 `npm ci` 重新安装
- `dist/`：通过 `npm run build` 重新生成
- 浏览器测试产生的 `.tmp-*` 用户数据目录
- `artifacts/` 截图与视觉测试证据
- `.superpowers/` 以及 `.hallmark/` 中非测试所需的开发辅助元数据；仅保留基础测试需要的 `.hallmark/log.json`
- 已经不再使用的旧首页短视频 `sailing-hero-august-9-short.mp4`

这些排除项不会影响网站运行、继续编辑、构建或部署。

## 7. Mac 常见问题

### 端口被占用

如果 `52124` 已被其他程序占用，可以临时使用：

```bash
npm run dev -- --port 52125
```

然后访问 `http://127.0.0.1:52125/`。

### 依赖安装异常

优先使用：

```bash
rm -rf node_modules
npm ci
```

`package-lock.json` 已包含在迁移包中，可保证 Mac 安装与当前项目相同的依赖版本。

### 视频不能播放

请确认通过 `http://127.0.0.1:端口/` 访问，而不是 `file://`。正式部署时，静态服务器还需要支持 MP4 的 HTTP Range 请求。

如果首页在滚轮后显示“请点击屏幕，开启音乐并播放序章”，这是浏览器的有声自动播放限制，不是视频损坏。点击首屏后会以 BGM 正常播放；页面不会为了绕过限制而转为静音。
