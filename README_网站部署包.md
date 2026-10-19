# 午夜马戏 · v50 网站部署包

此包是当前线上 v50 的静态运行文件，不含历史模型变体、原视频或开发工具安装目录。

解压后在本目录运行：

```powershell
python -m http.server 8798 --bind 127.0.0.1
```

浏览器访问 http://127.0.0.1:8798/?v=50 。不要双击 index.html。

可部署到支持静态文件和 WebAssembly 的 HTTP/HTTPS 服务。保留目录层次、vendor、两个 GLB 及 media/ambient_ring.webp，不需要 npm 构建或访客登录。

当前线上：https://seal42.top/Sky/?v=50 ，正确服务器为阿里云 47.105.96.191。详细交接文档在完整资料总目录中。

放大后保留帐篷模型和实时高清洞口；第一版三套动画不变。大模型首次下载及 Draco 解码需要时间，请在真实手机上确认性能。
