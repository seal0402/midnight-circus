# 午夜马戏 · 帐篷 3D

当前 GitHub Pages 发布版本为 v53，开场独白已确定采用站酷小薇体。阿里云原站仍为 v50，本次未同步。使用 Three.js 的静态互动网页，无需后端服务或访客登录。

## 在线访问

- GitHub Pages：https://seal0402.github.io/midnight-circus/
- 阿里云原站：https://seal42.top/Sky/?v=50

固定视角展示六洞帐篷，横划切换方向；点击洞口平滑放大，保留帐篷模型及纸牌、胶片、时间三套实时动画。使用返回箭头或 Escape 返回全景。

## 本地预览

在项目目录运行 Python 3 静态服务器：

```sh
python -m http.server 8798 --bind 127.0.0.1
```

访问 http://127.0.0.1:8798/?v=53 。不能直接以 file:// 打开 index.html。

## v53 开场独白

帐篷下方加入开场独白，文字起点根据模型投影底边计算。小屏允许向下滚动阅读；进入洞口后隐藏，返回后恢复。不改动 v50 的模型取景或特效。

`opening.css` 管理排版；`opening-fonts.css` 指定站酷小薇体，`opening-xiaowei.woff2` 为本页字形子集，约 36 KB。授权见 `OFL-zcoolxiaowei.txt`。修改文案时须从原字体重新生成子集，否则新增字形会使用系统回退字体。网站只发布已选定的这一款字体，不发布字体对照工具及其他候选字体。

本次只加入用户提供的五句开场文案，不包含《关于我》中的个人资料或图片。v50 基准内容可从 Git 历史提交 `9e8d1d5cd35f1aba6d4de425f90afb8eb313ca92` 找回。

## 文件

- `viewer.js`：模型、相机、交互与手机取景。
- `effects_first.js`：独立洞内场景和自适应高清渲染目标。
- `effects_v1.js`：第一版纸牌、胶片、时间动画。
- `effects.js`：黑洞内壁构建。
- `model_draco.glb` / `model_full_draco.glb`：手机和桌面模型，约 25 MB / 37 MB。
- `vendor/`：本地 Three.js 和 Draco 解码依赖。
- `media/ambient_ring.webp`：背景图片。

不需要 npm 构建，GitHub Pages 从 main 分支根目录发布，`.nojekyll` 禁用 Jekyll 处理。

此仓库只包含当前网站运行文件，不包含原始素材总档、旧版本、历史日志、服务器配置或访问凭据。首次下载模型及 Draco 解码需要时间；浏览器需支持 WebGL2。
