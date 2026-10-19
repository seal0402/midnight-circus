# 午夜马戏 · 帐篷 3D

当前版本：v50。使用 Three.js 的静态互动网页，无需后端服务或访客登录。

## 在线访问

- GitHub Pages：https://seal0402.github.io/midnight-circus/
- 阿里云原站：https://seal42.top/Sky/?v=50

固定视角展示六洞帐篷，横划切换方向；点击洞口平滑放大，保留帐篷模型及纸牌、胶片、时间三套实时动画。使用返回箭头或 Escape 返回全景。

## 本地预览

在项目目录运行 Python 3 静态服务器：

```sh
python -m http.server 8798 --bind 127.0.0.1
```

访问 http://127.0.0.1:8798/?v=50 。不能直接以 file:// 打开 index.html。

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
