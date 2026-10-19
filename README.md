# 暗夜幸存者 · Night Survivors

本地运行的吸血鬼幸存者类 Roguelite。全部美术、音效、音乐、字体均复用 **CC0 开源素材**，运行时图集与音频由脚本从原始包生成。

## 运行

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 产物在 dist/
npm run assets     # 从 assets-src/ 重新生成 public/assets/
npm run sim        # 无头回归 + 平衡测试（不需要浏览器）
```

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
