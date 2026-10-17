# 拾页 · GitHub Pages

这是一个可直接发布为 iPhone / Android 主屏幕 PWA 的完整静态网站。

## 发布

1. 在 GitHub 新建一个 **Public** 仓库，例如 `shiye`；
2. 把本文件夹里的**所有内容**上传到仓库根目录（不是上传本文件夹本身）；
   - 确认根目录能看到 `index.html`、`sw.js`、`.nojekyll`；
3. 仓库 Settings → Pages → Build and deployment：
   - Source 选 **Deploy from a branch**；
   - Branch 选 `main`，目录选 **/(root)**，Save；
4. 等待 1–2 分钟，打开：

   `https://<你的GitHub用户名>.github.io/shiye/`

5. iPhone Safari 打开这个 HTTPS 地址，等页面完整加载一次（约 4 MB），
   分享 → 添加到主屏幕。之后可以断网打开。

> 笔记不会上传到 GitHub。它们只保存在你当前浏览器 / 主屏幕 Web App 的本地存储里。
> 更新网页后，需要重新部署，并在设备上联网打开一次以更新离线缓存。

### 如果 `.nojekyll` 没有上传成功

在仓库根目录新建一个空文件，文件名就是 `.nojekyll`（注意前面的点）。
