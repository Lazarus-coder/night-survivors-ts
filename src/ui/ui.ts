// DOM overlay for menus and HUD; the world itself stays on canvas.
import { iconURL } from '../core/render';
import { CHARACTERS, META, RUN_LENGTH } from '../data/gameData';
import type { CharacterDef } from '../data/gameData';
import { frame } from '../data/sprites';
import type { Choice, HudState, RunSummary } from '../game/run';
import type { SaveData } from '../game/meta';
import { metaLevel } from '../game/meta';

const iconCache = new Map<string, string>();
function icon(spriteKey: string, tint?: string, size = 64) {
  const id = frame(spriteKey);
  const key = id + '|' + (tint ?? '') + '|' + size;
  let url = iconCache.get(key);
  if (!url) { url = iconURL(id, size, tint) as string; iconCache.set(key, url); }
  return url;
}

export const fmtTime = (t: number) => {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

type ScreenName = 'none' | 'boot' | 'title' | 'chars' | 'shop' | 'help' | 'credits' | 'levelup' | 'chest' | 'pause' | 'results';

export class UI {
  private root: HTMLElement;
  private hudEl!: HTMLElement;
  private screenEl!: HTMLElement;
  screen: ScreenName = 'none';
  private cardEls: HTMLElement[] = [];
  cardIndex = 0;

  constructor(root: HTMLElement) {
    this.root = root;
    this.root.innerHTML = `<div class="hud" id="hud" style="display:none"></div><div id="screen"></div>`;
    this.hudEl = this.root.querySelector('#hud') as HTMLElement;
    this.screenEl = this.root.querySelector('#screen') as HTMLElement;
    this.buildHud();
  }

  // ------------------------------------------------------------------ HUD
  private refs: Record<string, HTMLElement> = {};

  private buildHud() {
    this.hudEl.innerHTML = `
      <div class="xpbar"><i id="xpfill"></i><span id="xptext">LV 1</span></div>
      <div class="hud-top">
        <div class="hud-kills" id="hkills">击杀 0</div>
        <div class="hud-gold" id="hgold">金币 0</div>
      </div>
      <div class="hud-timer" id="htime">0:00</div>
      <div class="hud-hp"><div class="bar"><i id="hpfill"></i></div><div class="txt" id="hptext">100 / 100</div></div>
      <div class="hud-weapons" id="hweapons"></div>
      <div class="hud-tip" id="htip">WASD / 方向键 移动 · Esc 暂停 · 1-4 选择强化</div>`;
    for (const id of ['xpfill', 'xptext', 'hkills', 'hgold', 'htime', 'hpfill', 'hptext', 'hweapons']) {
      this.refs[id] = this.hudEl.querySelector('#' + id) as HTMLElement;
    }
    this.refs.hweapons.innerHTML = '';
  }

  showHud(on: boolean) { this.hudEl.style.display = on ? '' : 'none'; }

  setHud(h: HudState) {
    this.refs.xpfill.style.width = `${Math.min(100, (h.xp / h.xpNext) * 100)}%`;
    this.refs.xptext.textContent = `LV ${h.level}`;
    this.refs.htime.textContent = fmtTime(h.time);
    this.refs.hkills.textContent = `击杀 ${h.kills}`;
    this.refs.hgold.textContent = `金币 ${h.gold}`;
    this.refs.hpfill.style.width = `${Math.max(0, (h.hp / h.maxHp) * 100)}%`;
    this.refs.hptext.textContent = `${h.hp} / ${h.maxHp}`;
    const slots = h.weapons.map(w =>
      `<div class="wslot"><img src="${icon(w.sprite, w.evolved ? '#ffd08a' : undefined)}" alt="${w.name}" title="${w.name}"><b>${w.evolved ? '∞' : w.level}</b></div>`).join('');
    if (this.refs.hweapons.dataset.k !== slots) { this.refs.hweapons.innerHTML = slots; this.refs.hweapons.dataset.k = slots; }
  }

  // --------------------------------------------------------------- screens
  private show(name: ScreenName, html: string) {
    this.screen = name;
    this.screenEl.innerHTML = html ? `<div class="screen">${html}</div>` : '';
    this.cardEls = [...this.screenEl.querySelectorAll<HTMLElement>('[data-card]')];
    this.cardIndex = 0;
    this.highlight();
  }

  hide() { this.show('none', ''); }

  title(save: SaveData, handlers: { start: () => void; shop: () => void; help: () => void; credits: () => void }) {
    this.showHud(false);
    this.show('title', `
      <div class="title">暗夜幸存者</div>
      <div class="subtitle">NIGHT SURVIVORS · 开源素材 · 本地运行</div>
      <div class="row" style="flex-direction:column">
        <button class="btn" data-act="start">开始新的一局<small>选择角色后进入 15 分钟的生存挑战</small></button>
        <button class="btn" data-act="shop">能力强化<small>用金币永久提升所有角色</small></button>
        <button class="btn" data-act="help">操作说明</button>
        <button class="btn" data-act="credits">素材与许可</button>
      </div>
      <div class="panel">
        <div class="kv"><span>金币</span><b style="color:var(--gold)">${save.gold}</b></div>
        <div class="kv"><span>最长存活</span><b>${fmtTime(save.bestTime)}</b></div>
        <div class="kv"><span>累计击杀</span><b>${save.totalKills}</b></div>
        <div class="kv"><span>局数 / 通关</span><b>${save.runs} / ${save.wins}</b></div>
      </div>`);
    this.bind(handlers as unknown as Record<string, () => void>);
  }

  chars(save: SaveData, onPick: (c: CharacterDef) => void, back: () => void) {
    const isUnlocked = (c: CharacterDef) => {
      const u = c.unlock;
      if (!u.gold && !u.time && !u.kills) return true;
      if (u.gold) return save.gold >= u.gold || save.unlocked.includes(c.id);
      if (u.time) return save.bestTime >= u.time || save.unlocked.includes(c.id);
      if (u.kills) return save.totalKills >= u.kills || save.unlocked.includes(c.id);
      return false;
    };
    const cards = CHARACTERS.map((c, i) => {
      const ok = isUnlocked(c);
      return `<div class="chr ${ok ? '' : 'locked'}" data-chr="${i}">
        <canvas data-sprite="${c.sprite}" width="52" height="52"></canvas>
        <div class="nm">${c.name}</div>
        <div class="ds">${c.blurb}</div>
        <div class="ds" style="color:${ok ? 'var(--gold)' : '#e0736f'}">${ok ? '可用' : c.unlock.text}</div>
      </div>`;
    }).join('');
    this.show('chars', `
      <div class="title" style="font-size:24px">选择角色</div>
      <div class="chars">${cards}</div>
      <div class="panel" style="min-width:520px"><h3>初始属性</h3><div class="stats" id="chrstats"></div></div>
      <button class="btn" data-act="back" style="min-width:160px">返回</button>`);
    this.paintSprites(this.screenEl);
    const stats = this.screenEl.querySelector('#chrstats') as HTMLElement;
    const render = (c: CharacterDef) => {
      stats.innerHTML = [
        ['生命', Math.round(100 * (c.base.maxHp ?? 100) / 100)],
        ['移速', Math.round(78 * (c.base.speed ?? 78) / 78)],
        ['伤害', Math.round((c.base.might ?? 1) * 100) + '%'],
        ['范围', Math.round((c.base.area ?? 1) * 100) + '%'],
        ['护甲', (c.base.armor ?? 0).toString()],
        ['初始武器', ({ whip: '鞭刃', wand: '魔杖', knife: '飞刀', garlic: '圣蒜' } as Record<string, string>)[c.weapon] ?? c.weapon],
      ].map(([k, v]) => `<div>${k}<b>${v}</b></div>`).join('');
    };
    render(CHARACTERS[0]);
    this.screenEl.querySelectorAll<HTMLElement>('[data-chr]').forEach(el => {
      el.addEventListener('mouseenter', () => render(CHARACTERS[+el.dataset.chr!]));
      el.addEventListener('click', () => {
        const c = CHARACTERS[+el.dataset.chr!];
        if (!isUnlocked(c)) return;
        onPick(c);
      });
    });
    this.bind({ back });
  }

  shop(save: SaveData, onBuy: (id: string) => void, back: () => void) {
    const items = META.map(m => {
      const lvl = metaLevel(save, m.id);
      const maxed = lvl >= m.max;
      const cost = m.cost(lvl);
      const afford = save.gold >= cost;
      const pips = Array.from({ length: m.max }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
      return `<div class="up ${maxed ? 'max' : ''}" data-buy="${m.id}" style="${!maxed && !afford ? 'opacity:.65' : ''}">
        <img src="${icon(m.sprite)}" width="30" height="30" style="image-rendering:pixelated">
        <div><div class="nm">${m.name}</div><div class="pips">${pips}</div><div class="ds" style="font-size:10px;color:var(--dim)">${m.text(lvl + (maxed ? 0 : 1))}</div></div>
        <div class="ct">${maxed ? 'MAX' : cost}</div>
      </div>`;
    }).join('');
    this.show('shop', `
      <div class="title" style="font-size:24px">能力强化</div>
      <div class="subtitle">金币 ${save.gold}</div>
      <div class="shop">${items}</div>
      <button class="btn" data-act="back" style="min-width:160px">返回</button>`);
    this.screenEl.querySelectorAll<HTMLElement>('[data-buy]').forEach(el => {
      el.addEventListener('click', () => onBuy(el.dataset.buy!));
    });
    this.bind({ back });
  }

  help(back: () => void) {
    this.show('help', `
      <div class="title" style="font-size:24px">操作说明</div>
      <div class="panel" style="min-width:460px">
        <h3>键位</h3>
        <div class="kv"><span>移动</span><b>WASD / 方向键 / 手柄左摇杆</b></div>
        <div class="kv"><span>暂停</span><b>Esc 或 P</b></div>
        <div class="kv"><span>强化选择</span><b>1 - 4 或 ← → + Enter</b></div>
        <div class="kv"><span>跳过选择</span><b>Space</b></div>
        <div class="kv"><span>静音</span><b>M</b></div>
        <h3 style="margin-top:14px">规则</h3>
        <div class="desc" style="font-size:12px;color:#b7b3c9;line-height:1.8">
          武器全自动攻击，你只需要走位。<br>
          拾取绿色经验宝石升级，从四张卡中选择新武器、强化或道具。<br>
          武器满级 8 级，携带其专属道具时可进化为强化形态。<br>
          精英与 Boss 掉落宝箱，开启可获得额外强化。<br>
          存活 15 分钟即通关；最后 25 秒死神会降临。<br>
          死亡后本局金币结算，可在「能力强化」中永久消费。
        </div>
      </div>
      <button class="btn" data-act="back" style="min-width:160px">返回</button>`);
    this.bind({ back });
  }

  credits(list: { name: string; url: string; license: string; usedFor?: string; frames?: string }[], back: () => void) {
    this.show('credits', `
      <div class="title" style="font-size:24px">素材与许可</div>
      <div class="panel" style="max-width:720px">
        <h3>本局使用的全部第三方资产（均为 CC0 公有领域）</h3>
        <div class="credits">${list.map(c =>
          `<div>· <b style="color:#dcd7ea">${c.name}</b> — ${c.license}<br>&nbsp;&nbsp;&nbsp;${c.usedFor ?? ''}<br>&nbsp;&nbsp;&nbsp;<a href="${c.url}" target="_blank" rel="noopener">${c.url}</a></div>`).join('<br>')}</div>
        <div class="credits" style="margin-top:10px">原始包体保存在 <b>assets-src/</b>，运行时图集与音频由 <b>tools/build-assets.mjs</b> 生成。</div>
      </div>
      <button class="btn" data-act="back" style="min-width:160px">返回</button>`);
    this.bind({ back });
  }

  cards(title: string, sub: string, choices: Choice[], onPick: (c: Choice | null) => void) {
    this.cardChoices = choices;
    this.onCardPick = onPick;
    const html = choices.map((c, i) => `
      <div class="card ${c.kind === 'evolve' ? 'evo' : ''}" data-card="${i}">
        <div class="kind">${c.label}</div>
        <img class="icon" src="${icon(c.sprite, c.tint)}" alt="">
        <div class="name">${c.name}</div>
        <div class="desc">${c.desc}</div>
        <div class="lv">${c.max ? `等级 ${Math.min(c.level, c.max)} / ${c.max}` : ''}</div>
        <div class="tag">按 ${i + 1}</div>
      </div>`).join('');
    this.show('levelup', `
      <div class="title" style="font-size:26px">${title}</div>
      <div class="subtitle">${sub}</div>
      <div class="cards">${html}</div>
      <div class="hint">← → 选择 · Enter 确认 · Space 跳过</div>`);
    this.screenEl.querySelectorAll<HTMLElement>('[data-card]').forEach(el => {
      el.addEventListener('click', () => this.pick(+el.dataset.card!));
      el.addEventListener('mouseenter', () => { this.cardIndex = +el.dataset.card!; this.highlight(); });
    });
  }

  private cardChoices: Choice[] = [];
  private onCardPick: ((c: Choice | null) => void) | null = null;

  private pick(i: number) {
    const c = this.cardChoices[i];
    if (!c) return;
    const cb = this.onCardPick;
    this.onCardPick = null;
    this.cardChoices = [];
    cb?.(c);
  }

  /** keyboard-driven selection while a card screen is up */
  cardKeys(index: number | null, confirm: boolean, skip: boolean) {
    if (this.screen !== 'levelup' || this.cardChoices.length === 0) return;
    if (index !== null) { const n = this.cardChoices.length; this.cardIndex = ((index % n) + n) % n; this.highlight(); }
    if (skip) { const cb = this.onCardPick; this.onCardPick = null; this.cardChoices = []; cb?.(null); }
    if (confirm) this.pick(this.cardIndex);
  }

  private highlight() {
    this.cardEls.forEach((el, i) => el.classList.toggle('sel', i === this.cardIndex));
  }

  pause(resume: () => void, quit: () => void) {
    this.show('pause', `
      <div class="title" style="font-size:28px">暂停</div>
      <div class="row" style="flex-direction:column">
        <button class="btn" data-act="resume">继续 (Esc)</button>
        <button class="btn" data-act="quit">放弃本局</button>
      </div>`);
    this.bind({ resume, quit });
  }

  results(s: RunSummary, again: () => void, home: () => void) {
    this.showHud(false);
    this.show('results', `
      <div class="title" style="font-size:30px;color:${s.victory ? '#ffe08a' : '#ff8f8a'}">${s.victory ? '生还成功' : '你死了'}</div>
      <div class="subtitle">${s.character}</div>
      <div class="panel" style="min-width:340px">
        <div class="kv"><span>存活时间</span><b>${fmtTime(s.time)} / ${fmtTime(RUN_LENGTH)}</b></div>
        <div class="kv"><span>等级</span><b>${s.level}</b></div>
        <div class="kv"><span>击杀</span><b>${s.kills}</b></div>
        <div class="kv"><span>获得金币</span><b style="color:var(--gold)">${s.gold}</b></div>
        <h3 style="margin-top:12px">武器</h3>
        <div class="desc" style="font-size:12px;color:#b7b3c9">${s.weapons.join(' · ') || '无'}</div>
      </div>
      <div class="row">
        <button class="btn" data-act="again" style="min-width:180px">再来一局</button>
        <button class="btn" data-act="home" style="min-width:180px">返回标题</button>
      </div>`);
    this.bind({ again, home });
  }

  boot(msg: string) {
    this.screenEl.innerHTML = `<div class="screen"><div class="title" style="font-size:22px">暗夜幸存者</div><div class="subtitle">${msg}</div></div>`;
  }

  private bind(map: Record<string, () => void>) {
    this.screenEl.querySelectorAll<HTMLElement>('[data-act]').forEach(el => {
      el.addEventListener('click', () => map[el.dataset.act!]?.());
    });
  }

  private paintSprites(scope: HTMLElement) {
    scope.querySelectorAll<HTMLCanvasElement>('canvas[data-sprite]').forEach(cv => {
      const key = cv.dataset.sprite!;
      const src = icon(key) as string;
      const img = new Image();
      img.onload = () => {
        const ctx = cv.getContext('2d')!;
        ctx.imageSmoothingEnabled = false;
        ctx.clearRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
      };
      img.src = src;
    });
  }
}
