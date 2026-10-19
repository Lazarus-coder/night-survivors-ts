// All gameplay tuning lives here so balance can be iterated without touching systems.

export type WeaponKind = 'projectile' | 'stream' | 'thrown' | 'arc' | 'aura' | 'orbit' | 'strike' | 'ground';

export interface WeaponLevel {
  damage: number;
  cooldown: number;
  amount?: number;
  area?: number;
  speed?: number;
  pierce?: number;
  duration?: number;
  desc: string;
}

export interface EvolveSpec {
  name: string;
  sprite: string;
  /** passive id that must be owned (any level) together with a maxed weapon */
  needs: string;
  needsName: string;
  damageMul?: number;
  amountAdd?: number;
  cooldownMul?: number;
  areaMul?: number;
  extra?: string;
}

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  sprite: string;
  blurb: string;
  /** homing, only for projectile/stream */
  homing?: boolean;
  /** bounces/returns, only for projectile */
  arc?: boolean;
  levels: WeaponLevel[];
  evolve?: EvolveSpec;
}

const lv = (damage: number, cooldown: number, desc: string, extra: Partial<WeaponLevel> = {}): WeaponLevel =>
  ({ damage, cooldown, desc, ...extra });

export const WEAPONS: WeaponDef[] = [
  {
    id: 'wand', name: '魔杖', kind: 'projectile', sprite: 'w_wand',
    blurb: '自动瞄准最近的敌人发射魔法弹。',
    levels: [
      lv(11, 1.05, '发射 2 枚魔弹', { amount: 2, speed: 250, pierce: 1 }),
      lv(12, 1.0, '+1 伤害 · +1 魔弹', { amount: 2, speed: 250, pierce: 1 }),
      lv(13, 0.95, '+1 穿透', { amount: 2, speed: 250, pierce: 2 }),
      lv(15, 0.9, '+1 魔弹', { amount: 3, speed: 265, pierce: 2 }),
      lv(16, 0.85, '+1 伤害', { amount: 3, speed: 265, pierce: 2 }),
      lv(18, 0.8, '+1 魔弹', { amount: 4, speed: 280, pierce: 3 }),
      lv(20, 0.75, '+1 穿透', { amount: 4, speed: 280, pierce: 3 }),
      lv(20, 0.75, '+1 魔弹 · 满级', { amount: 4, speed: 300, pierce: 3 }),
    ],
    evolve: { name: '圣光魔杖', sprite: 'w_orb', needs: 'might', needsName: '力量之书', damageMul: 1.15, amountAdd: 1, cooldownMul: 0.85, extra: '魔弹自动追踪并分裂' },
  },
  {
    id: 'whip', name: '鞭刃', kind: 'arc', sprite: 'w_whip',
    blurb: '朝面朝方向挥出弧形斩击，左右交替。',
    levels: [
      lv(8, 1.4, '挥砍一次', { area: 0.68, pierce: 3 }),
      lv(12, 1.25, '+1 伤害', { area: 1.05, pierce: 3 }),
      lv(13, 1.2, '范围 +10%', { area: 1.2, pierce: 5 }),
      lv(15, 1.15, '+1 鞭刃', { area: 1.15, pierce: 4 }),
      lv(16, 1.1, '范围 +15%', { area: 1.3, pierce: 5 }),
      lv(18, 1.05, '+1 鞭刃', { area: 1.3, pierce: 5 }),
      lv(20, 1.0, '+1 伤害 · 范围 +15%', { area: 1.55, pierce: 8 }),
      lv(22, 0.9, '+1 鞭刃 · 满级', { area: 1.45, pierce: 8 }),
    ],
    evolve: { name: '羁绊之刃', sprite: 'w_scythe', needs: 'armor', needsName: '守护铠甲', damageMul: 1.4, amountAdd: 2, areaMul: 1.35, extra: '斩击附带吸引效果' },
  },
  {
    id: 'knife', name: '飞刀', kind: 'stream', sprite: 'w_knife',
    blurb: '朝面朝方向快速投掷飞刀。',
    levels: [
      lv(8, 0.5, '投掷 2 把', { amount: 2, speed: 380, pierce: 1 }),
      lv(7, 0.52, '+1 飞刀', { amount: 2, speed: 380, pierce: 1 }),
      lv(8, 0.5, '+1 伤害', { amount: 2, speed: 400, pierce: 1 }),
      lv(9, 0.48, '+1 飞刀', { amount: 3, speed: 400, pierce: 1 }),
      lv(10, 0.45, '+1 穿透', { amount: 3, speed: 420, pierce: 2 }),
      lv(11, 0.43, '+1 飞刀', { amount: 4, speed: 420, pierce: 2 }),
      lv(12, 0.4, '+1 飞刀', { amount: 5, speed: 440, pierce: 2 }),
      lv(16, 0.34, '+2 飞刀 · 满级', { amount: 8, speed: 460, pierce: 4 }),
    ],
    evolve: { name: '千刃', sprite: 'w_dagger', needs: 'cooldown', needsName: '空虚圣经', cooldownMul: 0.55, amountAdd: 2, extra: '弹幕连绵不绝' },
  },
  {
    id: 'axe', name: '战斧', kind: 'projectile', sprite: 'w_axe', arc: true,
    blurb: '抛出高弧线战斧，落地前穿透大量敌人。',
    levels: [
      lv(20, 2.4, '抛出 2 把战斧', { amount: 2, speed: 200, pierce: 3 }),
      lv(26, 2.3, '+2 伤害', { amount: 1, speed: 200, pierce: 3 }),
      lv(28, 2.2, '+1 战斧', { amount: 2, speed: 210, pierce: 4 }),
      lv(30, 2.1, '+1 穿透', { amount: 2, speed: 210, pierce: 5 }),
      lv(34, 2.0, '+1 战斧', { amount: 3, speed: 220, pierce: 5 }),
      lv(37, 1.9, '+1 伤害', { amount: 3, speed: 220, pierce: 6 }),
      lv(41, 1.8, '+1 战斧', { amount: 4, speed: 230, pierce: 7 }),
      lv(42, 1.75, '+1 战斧 · 满级', { amount: 4, speed: 240, pierce: 8 }),
    ],
    evolve: { name: '死亡螺旋', sprite: 'w_hammer', needs: 'area', needsName: '扩张之烛', damageMul: 1.3, amountAdd: 3, areaMul: 1.25, extra: '全方向环绕投掷' },
  },
  {
    id: 'garlic', name: '圣蒜', kind: 'aura', sprite: 'w_garlic',
    blurb: '环绕自身的腐化领域，持续伤害并击退。',
    levels: [
      lv(3, 0.75, '半径 40', { area: 0.7 }),
      lv(5, 0.58, '半径 +15%', { area: 1.15 }),
      lv(5, 0.56, '+1 伤害', { area: 1.25 }),
      lv(6, 0.54, '半径 +15%', { area: 1.4 }),
      lv(7, 0.52, '+1 伤害', { area: 1.5 }),
      lv(8, 0.5, '半径 +15%', { area: 1.65 }),
      lv(9, 0.58, '+2 伤害', { area: 1.5 }),
      lv(9, 0.55, '半径 +10% · 满级', { area: 1.3 }),
    ],
    evolve: { name: '噬魂之蒜', sprite: 'w_shield', needs: 'duration', needsName: '持久护符', damageMul: 1.5, areaMul: 1.4, extra: '击杀回复生命' },
  },
  {
    id: 'bible', name: '魔典', kind: 'orbit', sprite: 'w_bible',
    blurb: '环绕自身旋转的书本，触碰敌人造成伤害。',
    levels: [
      lv(9, 3.2, '2 本书 · 持续 3.0s', { amount: 2, duration: 3.0, area: 1.2, speed: 2.6 }),
      lv(12, 3.5, '+1 本', { amount: 2, duration: 2.5, area: 1, speed: 2.6 }),
      lv(13, 3.4, '半径 +15%', { amount: 2, duration: 2.8, area: 1.15, speed: 2.7 }),
      lv(15, 3.3, '+1 本', { amount: 3, duration: 2.8, area: 1.15, speed: 2.7 }),
      lv(16, 3.2, '持续 +0.5s', { amount: 3, duration: 3.3, area: 1.25, speed: 2.8 }),
      lv(18, 3.1, '+1 本', { amount: 4, duration: 3.3, area: 1.25, speed: 2.8 }),
      lv(17, 3.0, '半径 +15%', { amount: 6, duration: 3.8, area: 1.45, speed: 2.9 }),
      lv(17, 2.5, '+3 本 · 满级', { amount: 13, duration: 5.6, area: 1.7, speed: 3.0 }),
    ],
    evolve: { name: '无尽魔典', sprite: 'w_bible', needs: 'growth', needsName: '经验之书', damageMul: 1.35, amountAdd: 2, extra: '书本永不消失' },
  },
  {
    id: 'lightning', name: '雷击', kind: 'strike', sprite: 'w_lightning',
    blurb: '随机轰击屏幕内的敌人，范围溅射。',
    levels: [
      lv(28, 3.0, '1 道落雷', { amount: 1, area: 1 }),
      lv(30, 2.9, '+1 道', { amount: 2, area: 1 }),
      lv(33, 2.8, '范围 +15%', { amount: 2, area: 1.15 }),
      lv(36, 2.7, '+1 道', { amount: 3, area: 1.15 }),
      lv(40, 2.6, '+1 伤害', { amount: 3, area: 1.25 }),
      lv(44, 2.5, '+1 道', { amount: 4, area: 1.3 }),
      lv(48, 2.4, '范围 +15%', { amount: 4, area: 1.45 }),
      lv(64, 2.1, '+2 道 · 满级', { amount: 7, area: 1.7 }),
    ],
    evolve: { name: '雷神之怒', sprite: 'w_lightning', needs: 'speed', needsName: '疾行之靴', damageMul: 1.3, amountAdd: 3, cooldownMul: 0.75, extra: '落雷附带眩晕' },
  },
  {
    id: 'molotov', name: '燃烧瓶', kind: 'ground', sprite: 'w_molotov',
    blurb: '向附近抛出油瓶，落地形成持续燃烧区域。',
    levels: [
      lv(13, 1.8, '1 瓶 · 燃烧 2.4s', { amount: 1, duration: 2.4, area: 1.2, pierce: 99 }),
      lv(10, 1.85, '+1 瓶', { amount: 2, duration: 2.4, area: 1.15, pierce: 99 }),
      lv(11, 1.8, '范围 +10%', { amount: 2, duration: 2.6, area: 1.25, pierce: 99 }),
      lv(13, 1.75, '燃烧 +0.2s', { amount: 2, duration: 2.8, area: 1.3, pierce: 99 }),
      lv(14, 1.7, '+1 瓶', { amount: 3, duration: 2.9, area: 1.35, pierce: 99 }),
      lv(16, 1.65, '范围 +10%', { amount: 3, duration: 3.0, area: 1.4, pierce: 99 }),
      lv(19, 1.65, '燃烧 +0.1s', { amount: 3, duration: 2.9, area: 1.4, pierce: 99 }),
      lv(21, 1.6, '+1 瓶 · 满级', { amount: 3, duration: 3.0, area: 1.45, pierce: 99 }),
    ],
    evolve: { name: '炼狱回廊', sprite: 'w_molotov', needs: 'magnet', needsName: '吸引之戒', damageMul: 1.15, amountAdd: 0, areaMul: 1.1, extra: '火海吸附经验' },
  },
];

export interface PassiveDef {
  id: string;
  name: string;
  sprite: string;
  max: number;
  blurb: string;
  /** applied per level into the run stat block */
  apply: (s: MutableStats, level: number) => void;
  levelText: (level: number) => string;
}

export interface MutableStats {
  maxHp: number;
  armor: number;
  might: number;
  area: number;
  cooldown: number;   // multiplier, lower is better
  speed: number;      // px per second
  duration: number;   // multiplier
  magnet: number;     // px radius
  growth: number;     // xp multiplier
  luck: number;
  projSpeed: number;
  regen: number;      // hp per second
  revive: number;
  wealth: number;
}

const pct = (n: number) => `+${Math.round(n * 100)}%`;

export const PASSIVES: PassiveDef[] = [
  { id: 'might', name: '力量之书', sprite: 'p_might', max: 5, blurb: '所有武器伤害提升。', apply: (s, l) => { s.might += 0.1 * l; }, levelText: l => `伤害 ${pct(0.1 * l)}` },
  { id: 'area', name: '扩张之烛', sprite: 'p_area', max: 5, blurb: '所有武器作用范围提升。', apply: (s, l) => { s.area += 0.1 * l; }, levelText: l => `范围 ${pct(0.1 * l)}` },
  { id: 'cooldown', name: '空虚圣经', sprite: 'p_cooldown', max: 5, blurb: '所有武器冷却缩减。', apply: (s, l) => { s.cooldown *= 1 - 0.08 * l; }, levelText: l => `冷却 -${8 * l}%` },
  { id: 'speed', name: '疾行之靴', sprite: 'p_speed', max: 5, blurb: '移动速度提升。', apply: (s, l) => { s.speed *= 1 + 0.1 * l; }, levelText: l => `移速 ${pct(0.1 * l)}` },
  { id: 'duration', name: '持久护符', sprite: 'p_duration', max: 5, blurb: '武器存在时间延长。', apply: (s, l) => { s.duration += 0.1 * l; }, levelText: l => `持续 ${pct(0.1 * l)}` },
  { id: 'magnet', name: '吸引之戒', sprite: 'p_magnet', max: 5, blurb: '经验拾取范围提升。', apply: (s, l) => { s.magnet *= 1 + 0.25 * l; }, levelText: l => `拾取 ${pct(0.25 * l)}` },
  { id: 'growth', name: '经验之书', sprite: 'p_growth', max: 5, blurb: '获得的经验提升。', apply: (s, l) => { s.growth += 0.1 * l; }, levelText: l => `经验 ${pct(0.1 * l)}` },
  { id: 'armor', name: '守护铠甲', sprite: 'p_armor', max: 5, blurb: '受到的伤害降低。', apply: (s, l) => { s.armor += 1.2 * l; }, levelText: l => `护甲 +${(1.2 * l).toFixed(1)}` },
];

export interface EnemyDef {
  id: string;
  name: string;
  sprite: string;
  hp: number;
  speed: number;
  damage: number;
  xp: number;
  radius: number;
  scale: number;
  tint?: string;
  /** knockback resistance 0..1 */
  weight?: number;
  boss?: boolean;
  gold?: number;
}

export const ENEMIES: EnemyDef[] = [
  { id: 'bat', name: '夜蝠', sprite: 'bat', hp: 6, speed: 74, damage: 3, xp: 2, radius: 7, scale: 1, weight: 0.4, gold: 1 },
  { id: 'rat', name: '腐鼠', sprite: 'snail', hp: 10, speed: 58, damage: 4, xp: 2, radius: 7, scale: 1, weight: 0.5, gold: 1 },
  { id: 'slime', name: '泥魔', sprite: 'slime', hp: 16, speed: 46, damage: 5, xp: 3, radius: 8, scale: 1.05, tint: '#7ee08a', weight: 0.6, gold: 2 },
  { id: 'spider', name: '穴蛛', sprite: 'spider', hp: 22, speed: 82, damage: 6, xp: 3, radius: 8, scale: 1.05, weight: 0.5, gold: 2 },
  { id: 'skull', name: '游魂颅', sprite: 'skull', hp: 30, speed: 66, damage: 8, xp: 3, radius: 8, scale: 1.05, weight: 0.7, gold: 3 },
  { id: 'imp', name: '小恶魔', sprite: 'imp', hp: 40, speed: 92, damage: 10, xp: 3, radius: 8, scale: 1.1, weight: 0.6, gold: 3 },
  { id: 'bandit', name: '劫匪', sprite: 'bandit', hp: 55, speed: 70, damage: 11, xp: 4, radius: 8, scale: 1.1, weight: 0.8, gold: 4 },
  { id: 'ghost', name: '怨灵', sprite: 'ghost', hp: 70, speed: 60, damage: 12, xp: 4, radius: 9, scale: 1.15, tint: '#cfd8ff', weight: 0.9, gold: 5 },
  { id: 'cultist', name: '邪徒', sprite: 'cultist', hp: 95, speed: 76, damage: 14, xp: 5, radius: 9, scale: 1.15, weight: 1, gold: 6 },
  { id: 'thug', name: '暴徒', sprite: 'thug', hp: 130, speed: 64, damage: 16, xp: 6, radius: 9, scale: 1.2, weight: 1.1, gold: 8 },
  { id: 'brute', name: '巨魔', sprite: 'brute', hp: 220, speed: 56, damage: 20, xp: 10, radius: 11, scale: 1.45, weight: 1.6, gold: 14 },
  { id: 'witch', name: '咒巫', sprite: 'witch', hp: 170, speed: 88, damage: 18, xp: 9, radius: 10, scale: 1.3, tint: '#e2b3ff', weight: 1.2, gold: 12 },
  { id: 'mimic', name: '宝箱怪', sprite: 'mimic', hp: 420, speed: 52, damage: 24, xp: 24, radius: 12, scale: 1.5, weight: 2, gold: 60 },
  { id: 'golem', name: '石魔', sprite: 'crate', hp: 900, speed: 44, damage: 28, xp: 60, radius: 15, scale: 2.0, tint: '#b9a58c', weight: 3, boss: true, gold: 140 },
  { id: 'reaper', name: '死神', sprite: 'cocoon', hp: 4000, speed: 100, damage: 60, xp: 0, radius: 16, scale: 2.4, tint: '#ff5c5c', weight: 99, boss: true },
];

export interface WaveEntry {
  from: number;
  to?: number;
  enemy: string;
  every: number;
  count: number;
  hpMul?: number;
  speedMul?: number;
}

/** One 15-minute run. Times in seconds. */
export const RUN_LENGTH = 900;

export const WAVES: WaveEntry[] = [
  { from: 0, to: 75, enemy: 'bat', every: 1.9, count: 1 },
  { from: 0, to: 80, enemy: 'rat', every: 2.6, count: 1 },
  { from: 55, to: 170, enemy: 'bat', every: 1.6, count: 1 },
  { from: 70, to: 200, enemy: 'slime', every: 2.2, count: 1 },
  { from: 100, to: 250, enemy: 'spider', every: 2.0, count: 1, hpMul: 1.1 },
  { from: 150, to: 310, enemy: 'rat', every: 1.5, count: 2, hpMul: 1.2 },
  { from: 190, to: 370, enemy: 'skull', every: 1.6, count: 2, hpMul: 1.15 },
  { from: 240, to: 430, enemy: 'imp', every: 1.5, count: 2, hpMul: 1.2 },
  { from: 300, to: 490, enemy: 'slime', every: 1.0, count: 3, hpMul: 1.5 },
  { from: 330, to: 530, enemy: 'bandit', every: 1.6, count: 2, hpMul: 1.3 },
  { from: 400, to: 610, enemy: 'ghost', every: 1.4, count: 3, hpMul: 1.35 },
  { from: 460, to: 650, enemy: 'spider', every: 0.9, count: 4, hpMul: 1.6 },
  { from: 520, to: 710, enemy: 'cultist', every: 1.4, count: 3, hpMul: 1.4 },
  { from: 580, to: 770, enemy: 'thug', every: 1.6, count: 3, hpMul: 1.5 },
  { from: 640, to: 830, enemy: 'imp', every: 0.8, count: 5, hpMul: 1.8 },
  { from: 700, to: 900, enemy: 'witch', every: 1.2, count: 4, hpMul: 1.7 },
  { from: 760, to: 900, enemy: 'brute', every: 2.4, count: 2, hpMul: 1.8 },
  { from: 820, to: 900, enemy: 'cultist', every: 0.7, count: 6, hpMul: 2.2 },
];export interface TimedEvent { at: number; kind: 'swarm' | 'elite' | 'boss' | 'chest'; enemy?: string; count?: number }

export const EVENTS: TimedEvent[] = [
  { at: 60, kind: 'swarm', enemy: 'bat', count: 18 },
  { at: 120, kind: 'elite', enemy: 'slime', count: 1 },
  { at: 180, kind: 'chest' },
  { at: 240, kind: 'swarm', enemy: 'spider', count: 24 },
  { at: 300, kind: 'boss', enemy: 'golem' },
  { at: 360, kind: 'elite', enemy: 'bandit', count: 2 },
  { at: 420, kind: 'chest' },
  { at: 480, kind: 'swarm', enemy: 'skull', count: 30 },
  { at: 540, kind: 'elite', enemy: 'ghost', count: 3 },
  { at: 600, kind: 'boss', enemy: 'golem' },
  { at: 660, kind: 'chest' },
  { at: 720, kind: 'swarm', enemy: 'imp', count: 36 },
  { at: 800, kind: 'elite', enemy: 'brute', count: 4 },
  { at: 870, kind: 'chest' },
];

export interface CharacterDef {
  id: string;
  name: string;
  sprite: string;
  blurb: string;
  weapon: string;
  unlock: { text: string; gold?: number; time?: number; kills?: number };
  base: Partial<MutableStats>;
}

export const CHARACTERS: CharacterDef[] = [
  {
    id: 'knight', name: '罗恩骑士', sprite: 'knight', weapon: 'whip',
    blurb: '均衡的新手之选，鞭刃范围更大。',
    unlock: { text: '初始可用' },
    base: { maxHp: 110, speed: 78, area: 1.15 },
  },
  {
    id: 'mage', name: '薇拉法师', sprite: 'mage', weapon: 'wand',
    blurb: '魔弹更多，但生命偏低。',
    unlock: { text: '累计金币 200 解锁', gold: 200 },
    base: { maxHp: 95, speed: 76, might: 1.15, cooldown: 0.92 },
  },
  {
    id: 'rogue', name: '灰影盗贼', sprite: 'rogue', weapon: 'knife',
    blurb: '移动迅捷，拾取范围大。',
    unlock: { text: '单局存活 10 分钟解锁', time: 600 },
    base: { maxHp: 100, speed: 92, magnet: 100, cooldown: 0.95 },
  },
  {
    id: 'brute', name: '屠夫巴洛', sprite: 'brute', weapon: 'garlic',
    blurb: '皮糙肉厚，圣蒜范围惊人。',
    unlock: { text: '击杀 5000 解锁', kills: 5000 },
    base: { maxHp: 165, speed: 66, armor: 3, area: 1.25, might: 0.95 },
  },
];

export interface MetaDef {
  id: string;
  name: string;
  sprite: string;
  max: number;
  cost: (level: number) => number;
  text: (level: number) => string;
}

export const META: MetaDef[] = [
  { id: 'm_might', name: '力量', sprite: 'p_might', max: 8, cost: l => 80 + l * l * 55, text: l => `伤害 +${l * 5}%` },
  { id: 'm_hp', name: '生命', sprite: 'food', max: 8, cost: l => 70 + l * l * 50, text: l => `生命 +${l * 10}%` },
  { id: 'm_armor', name: '护甲', sprite: 'w_shield', max: 6, cost: l => 90 + l * l * 65, text: l => `护甲 +${l}` },
  { id: 'm_speed', name: '移速', sprite: 'p_speed', max: 5, cost: l => 100 + l * l * 70, text: l => `移速 +${l * 4}%` },
  { id: 'm_regen', name: '回复', sprite: 'food', max: 6, cost: l => 85 + l * l * 60, text: l => `每秒回复 ${(l * 0.2).toFixed(1)} HP` },
  { id: 'm_growth', name: '经验', sprite: 'w_bible', max: 5, cost: l => 120 + l * l * 85, text: l => `经验 +${l * 6}%` },
  { id: 'm_magnet', name: '拾取', sprite: 'p_magnet', max: 5, cost: l => 60 + l * l * 45, text: l => `拾取范围 +${l * 15}%` },
  { id: 'm_luck', name: '幸运', sprite: 'potion_green', max: 5, cost: l => 75 + l * l * 55, text: l => `幸运 +${l * 8}%` },
  { id: 'm_cooldown', name: '冷却', sprite: 'p_cooldown', max: 5, cost: l => 130 + l * l * 90, text: l => `冷却 -${l * 3}%` },
  { id: 'm_duration', name: '持续', sprite: 'p_duration', max: 5, cost: l => 110 + l * l * 70, text: l => `持续 +${l * 6}%` },
  { id: 'm_revive', name: '复活', sprite: 'w_shield', max: 2, cost: l => 900 + l * 1400, text: l => `复活 ${l} 次` },
  { id: 'm_wealth', name: '财富', sprite: 'coin', max: 5, cost: l => 100 + l * l * 60, text: l => `金币 +${l * 10}%` },
];

export const xpToNext = (level: number) => Math.floor(6 + level * 11 + Math.pow(level, 1.92) * 1.5);

export const WEAPON_MAP: Record<string, WeaponDef> = Object.fromEntries(WEAPONS.map(w => [w.id, w]));
export const PASSIVE_MAP: Record<string, PassiveDef> = Object.fromEntries(PASSIVES.map(p => [p.id, p]));
export const ENEMY_MAP: Record<string, EnemyDef> = Object.fromEntries(ENEMIES.map(e => [e.id, e]));
