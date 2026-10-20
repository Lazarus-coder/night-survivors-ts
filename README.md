# 暗夜幸存者 · Night Survivors

本地运行的吸血鬼幸存者类 Roguelite。全部美术、音效、音乐、字体均复用 **CC0 开源素材**，运行时图集与音频由脚本从原始包生成。

## 运行

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/
npm run assets     # 从 assets-src/ 重新生成 public/assets/
npm test           # 素材路径、音频加载与存档容错回归（使用 mock）
npm run sim        # 无头回归 + 平衡测试（不需要浏览器）
```

### 子路径托管（GitHub Pages）

默认构建使用站点根路径 `/`。部署到仓库子路径时，构建和本地预览使用相同的 `base`，依次执行：

```bash
npm run build -- --base=/night-survivors-ts/
npm run preview -- --base=/night-survivors-ts/
```

默认预览地址为 [http://localhost:4173/night-survivors-ts/](http://localhost:4173/night-survivors-ts/)（端口以终端输出为准）。现有 `.github/workflows/pages.yml` 已使用这个构建参数；更换部署路径时需同步修改。

Pages workflow 在推送 `main` 时运行回归测试、构建并发布；也可手动触发。仅推送修复分支不会更新线上页面，发布状态可在仓库的 Actions 中查看。

图集、`CREDITS.json` 和音频的运行时请求使用 `import.meta.env.BASE_URL`，HTML/CSS 素材引用由 Vite 自动处理。新增运行时素材请求也应使用部署前缀，避免写死 `/assets/...` 导致子路径下加载失败。

## 玩法

- 武器全自动开火，玩家只用 **WASD / 方向键 / 手柄左摇杆** 走位。
- 拾取经验宝石升级，从 4 张卡中选择：新武器 / 武器升级 / 被动道具 / 进化。
- 武器满级 8 级；携带其专属被动后可在升级时进化为强化形态。
- 精英与 Boss 掉落宝箱，开启额外强化。
- 一局 **15 分钟**，最后 25 秒死神降临；存活到底即通关。
- 死亡结算金币，用于「能力强化」永久提升所有角色。

键位：`Esc/P` 暂停 · `1-4` 或 `←→ + Enter` 选卡 · `Space` 跳过 · `M` 静音。

## 开源素材复用

| 来源 | 许可 | 用途 |
| --- | --- | --- |
| [Kenney · Tiny Dungeon](https://kenney.nl/assets/tiny-dungeon) | CC0 1.0 | 角色、敌人、武器、道具、地牢装饰 |
| [Kenney · Roguelike/RPG pack](https://kenney.nl/assets/roguelike-rpg-pack) | CC0 1.0 | 草地/泥土/石板地面、树木灌木、篝火等 |
| [Kenney · Particle Pack](https://kenney.nl/assets/particle-pack) | CC0 1.0 | 打击火花、魔法、血雾、斩击 |
| [Kenney · Fantasy UI Borders](https://kenney.nl/assets/fantasy-ui-borders) | CC0 1.0 | 面板与升级卡牌边框 |
| [Kenney · Fonts](https://kenney.nl/assets/kenney-fonts) | CC0 1.0 | 像素字体 |
| [Kenney · Digital Audio](https://kenney.nl/assets/digital-audio) / [Impact Sounds](https://kenney.nl/assets/impact-sounds) / [Music Jingles](https://kenney.nl/assets/music-jingles) | CC0 1.0 | UI、武器、受击、死亡音效与号角 |
| [OpenGameArt · 4 Atmospheric Ghostly Loops](https://opengameart.org/content/4-atmospheric-ghostly-loops) | CC0 1.0 | 背景音乐（20 秒循环） |

原始素材保留在 `assets-src/`（含各包 `License.txt`），运行时资源由 `tools/build-assets.mjs` 生成到 `public/assets/`：

- 两张 Kenney 大图被切成 **1931 个独立帧**（自动按 alpha 连通域/文件名定位），shelf-pack 成单张 `atlas.png` + `atlas.json`；
- 粒子从 512px 降采样到 64px；音频按语义重命名（`xp.ogg`、`levelup.ogg`…）；FLAC 转 m4a；
- 出处清单写入 `public/assets/CREDITS.json`，游戏内「素材与许可」页面直接读取。

素材编号与语义的对应关系可用 `node tools/preview-frames.mjs <names> <out.png> <zoom>` 渲染带编号索引图核对（`src/data/sprites.ts` 里的每个 id 都这样验证过）。

## 代码结构

```
src/
  core/     engine.ts(定步长循环/相机/输入/空间哈希/噪声)  render.ts(图集绘制/着色/像素字)  audio.ts(WebAudio 混音)
  data/     sprites.ts(语义贴图表)  gameData.ts(武器/被动/敌人/波次/角色/元升级全部数值)
  game/     world.ts(分块程序化地面)  entities.ts(敌人/弹道/掉落/粒子对象池)
            weapons.ts(8 种武器行为)  run.ts(属性计算/碰撞/导演/升级经济)  meta.ts(存档)
  ui/       ui.ts(DOM 菜单与 HUD)
  main.ts   状态机与主循环
tools/      build-assets.mjs  preview-frames.mjs
```

平衡性集中在 `src/data/gameData.ts`，改数值不需要碰系统代码。

## 自我验证

`npm test` 用 Node 内置测试器、Vite 内存构建和 mock 验证图集与音频的部署前缀、慢加载时的音乐补播与退出取消、缺失曲目处理，以及损坏存档字段的恢复；不访问真实网络或玩家存档。

子路径回归（2026-10-20）：本地生产构建分别挂载到 `/` 与 `/night-survivors-ts/`，在 Chrome 中验证标题页、素材与许可页、开局以及 19 个音效和 3 首音乐的解码。两种路径均通过，无失败请求或运行时异常。此浏览器检查不包含在 `npm test` 或 `npm run sim` 中；发布后仍需在 Pages 地址复查启动与素材请求。

`npm run sim` 用 Vite 的 SSR 打包把游戏逻辑跑在 Node 里，不依赖浏览器与 DOM。整局由**固定种子**驱动，因此同一份代码每次输出完全一致——这是它能当回归基线的前提。

- **功能断言**：8 种武器是否真的开火、进化在缺少配对道具时是否正确隐藏、宝箱/精英/Boss 掉落、复活消耗与二次死亡、经验溢出连升、每个被动在满级时确实改变属性。
- **不变量**：位置不出现 NaN、刷怪上限不被击穿、结算数值有限。
- **武器吞吐量表**：一圈活体敌人测清怪率，三个不同距离的假人测单体 DPS，两者合成"总输出价值"。断言所有武器在满级时的总输出差距 ≤ 2.5 倍，避免某个选择成为陷阱选项。
- **压力曲线**：让不可死的假人站在波次里，统计每秒逼近的敌方血量，与"正常玩家在该分钟数应有的输出"对比。

实测（2026-10-14）：满屏 260–370 敌人 + 400 掉落 + 200+ 粒子时，模拟 1.6 ms + 渲染 2.05 ms ≈ **每帧 3.65 ms，占 60fps 预算的 22%**。

`tools/shoot.mjs` 用系统 Chrome 的无头模式 + CDP（Node 内置 WebSocket，零依赖）截取真实界面：

```bash
node tools/shoot.mjs /tmp/shot.png http://localhost:5173/ "<js表达式>"
```

表达式在游戏页面内执行，可先 `__ns.start('mage')` 开局、`__ns.ui.shop(...)` 切界面，再截图。`window.__ns` 同时暴露 `run`（可 `fastForward`）与 `ui`。
