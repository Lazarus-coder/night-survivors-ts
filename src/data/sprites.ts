/**
 * Semantic sprite table. Ids map 1:1 to Kenney source tiles, verified with
 * `node tools/preview-frames.mjs` (td_NNNN = kenney tiny-dungeon/Tiles/tile_NNNN.png,
 * rl_r_c = kenney roguelike sheet row/column).
 */
export const SPR: Record<string, string> = {
  // playable characters
  knight: 'td_0096',
  knight_alt: 'td_0097',
  mage: 'td_0084',
  rogue: 'td_0112',
  brute: 'td_0088',
  // enemies
  slime: 'td_0108',
  imp: 'td_0110',
  bat: 'td_0124',
  spider: 'td_0122',
  spider_orange: 'td_0120',
  snail: 'td_0123',
  ghost: 'td_0121',
  skull: 'td_0018',
  bandit: 'td_0111',
  cultist: 'td_0100',
  thug: 'td_0098',
  villager: 'td_0085',
  witch: 'td_0087',
  cocoon: 'td_0082',
  mimic: 'td_0092',
  // pickups
  gem: 'td_0116',        // xp gems are drawn procedurally; this is icon-only
  chest: 'td_0089',
  chest_alt: 'td_0090',
  coin: 'td_0074',
  food: 'td_0115',
  potion_green: 'td_0114',
  potion_blue: 'td_0116',
  gravestone: 'td_0064',
  tablet: 'td_0065',
  crate: 'td_0072',
  // weapon art
  w_wand: 'td_0129',
  w_whip: 'td_0131',
  w_knife: 'td_0103',
  w_axe: 'td_0119',
  w_garlic: 'td_0105',
  w_bible: 'td_0066',
  w_lightning: 'td_0125',
  w_molotov: 'td_0113',
  w_scythe: 'td_0093',
  w_hammer: 'td_0117',
  w_sword: 'td_0106',
  w_shield: 'td_0029',
  w_dagger: 'td_0104',
  w_orb: 'td_0127',
  // passive art
  p_might: 'td_0118',
  p_area: 'td_0102',
  p_cooldown: 'td_0130',
  p_speed: 'td_0126',
  p_duration: 'td_0128',
  p_magnet: 'td_0116',   // td_0057 turned out to be cobblestone, not a gem
  p_growth: 'td_0032',
  p_armor: 'td_0101',
  // single decor tiles
  apple_tree: 'rl_10_16',
  dead_tree: 'rl_10_20',
  campfire: 'rl_8_14',
  torch: 'rl_8_17',
  // particles (white sources, tinted at runtime)
  pt_flame: 'pt_flame_01',
  pt_spark: 'pt_spark_01',
  pt_magic: 'pt_magic_01',
  pt_trace: 'pt_trace_01',
  pt_circle: 'pt_circle_01',
  pt_smoke: 'pt_smoke_01',
  pt_slash: 'pt_slash_01',
  pt_star: 'pt_star_01',
  pt_muzzle: 'pt_muzzle_01',
  pt_scorch: 'pt_scorch_01',
  pt_twirl: 'pt_twirl_01',
  // ui
  ui_panel: 'ui_border-010',
  ui_card: 'ui_border-024',
  ui_frame: 'ui_border-000',
};

/** Tile sets sampled procedurally by the ground generator. */
export const SPRSET: Record<string, string[]> = {
  // only these five read as calm open grass; the rest of the pack's green tiles are flower-heavy
  grass: ['rl_15_0', 'rl_15_1', 'rl_16_0', 'rl_16_1', 'rl_16_3'],
  grass_accent: ['rl_12_0', 'rl_13_1', 'rl_9_1', 'rl_10_3'],
  dirt: ['rl_9_5', 'rl_9_6', 'rl_10_5', 'rl_10_6', 'rl_10_8', 'rl_5_5'],
  stone: ['rl_13_22', 'rl_13_23', 'rl_13_25', 'rl_12_25', 'rl_15_22', 'rl_15_24', 'rl_16_25'],
  tree: ['rl_11_15', 'rl_10_18', 'rl_9_23'],
  tree_orange: ['rl_11_14'],
  bush: ['rl_9_21', 'rl_9_24'],
  flower: ['rl_10_22'],
};

/** Resolves a semantic key to an atlas frame id; raw ids pass through unchanged. */
export function frame(key: string): string {
  return SPR[key] ?? key;
}
