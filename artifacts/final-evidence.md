# 原型验证记录

日期：2026-11-04。范围：Three.js 螺旋平台移动原型；桌面键盘操作。

## 自动检查

`node --check game/main.js` 通过。`node --test game/physics.test.mjs` 通过。

- 1,335 个胶囊线段，总路径长度 417.48 单位。
- 固定 1/120 秒步长；全程向内行走 44.39 秒，反向行走 44.67 秒。
- 跳跃高度约 2.94 单位，腾空约 0.88 秒。
- 连续移动跳跃 38 次，涵盖外圈、中圈、内圈，55.63 秒完成。
- 覆盖最近地面重力、底面跳跃、倒挂、圆头绕行、停止后稳定接触、相邻胶囊接缝无穿透。

## 实际浏览器

通过内置 Chromium 浏览器访问与发布文件相同的静态文件，无需编译。1440×900 和 390×844 布局检查。窄屏仅验证信息布局，当前版本需要物理键盘。

- 真实 A 键连续按住30秒，进度69%；继续15秒，进度100%，状态 finished=true。
- R 将进度恢复为00%；D 使路径进度从0.040回到0.025。
- 空格后 grounded=false、jumps=1；随后 grounded=true，完成落地。
- V 切换全景与跟随；地图始终可见。
- 确认只保留进度、左下控制说明、WORLD MAP 三组UI。
- 浏览器 error/warn 日志为空。
- 观察到10–20次 draw calls、约10,840–11,232个三角形；DPR上限2。未做正式帧率或真实移动设备性能测试。

本地截图：overview.jpg、finish.jpg、jump.jpg、narrow.jpg（保留本机，忽略 Git）。键盘行走与跳跃通过运行中的渲染观察；未录制视频。此原型不需要完整视觉回归框架。

## 实现与边界

地形由草图锚点 Catmull-Rom 平滑采样，显示和碰撞共用路径。局部左右由当前法线决定，绕到另一面后方向随身体旋转。最近表面变化可改变空中引力，无全球向下重力。无敌人、伤害、剧情或解谜；用户指定圆形临时代替角色。当前简化碰撞适合单角色静态地形。

交付使用 GitHub Pages。GitHub Actions 在 main 更新时运行同一物理检查，并发布 index.html、game、vendor。Three.js 固定为0.180.0且已附MIT许可证，无外部运行时CDN依赖。

发布结果：正式网址 https://fengziqian0206.github.io/NaiLong/ 。首次应用版本 e36456b；Actions 41819423230 的测试与部署成功。已打开正式网址并确认画面、三组 UI 和无控制台错误；published.jpg 是正式站点截图。Git 传输曾连续返回服务器500，之后通过官方 Git Data API 提交，已核对远端和本地文件树哈希一致。

使用资源：threejs-game-director、gameplay-systems及physics-engine-selection/genre-design、game-ui-designer及ui-patterns、qa-release及release-checks、ponytail；阅读debug-profiler和graphics-builder以确认原型范围。Sites已被用户指定GitHub仓库/Pages方案取代，未创建额外站点。
