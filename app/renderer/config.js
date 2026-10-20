/* 像素渔场 · 静态配置与数值表（无构建，按 index.html 顺序加载） */

const W = 320, H = 180;
const SAVE_KEY = 'pixel_fisher_v1';
const SAVE_VERSION = 8;
const MAX_OFFLINE = 8 * 3600; // 离线最多累计 8 小时

/* ---------------- M3：鱼市 / 天气 / 鱼饵 ---------------- */
const MARKET_TICK_MS = 60 * 1000;       // 一分钟一个价
const MARKET_CANDLES = 10;              // 图表只显示最近 10 分钟
const MARKET_MIN = 0.7;
const MARKET_MAX = 1.35;
const WEATHER_TICK_MS = 20 * 60 * 1000; // 天气仍是 20 分钟轮换

const WEATHERS = [
  { id: 'sunny', name: '晴', icon: '☀️', color: '#ffd24a' },
  { id: 'rain',  name: '雨', icon: '🌧️', color: '#6fd0ff' },
  { id: 'night', name: '夜', icon: '🌙', color: '#b06cff' },
];

const BAITS = {
  worm:   { id: 'worm',   name: '蚯蚓',   icon: '🪱', desc: '免费，无加成',                    speed: 1,   rare: 1,   rateMax: 0 },
  shrimp: { id: 'shrimp', name: '鲜虾饵', icon: '🦐', desc: '上鱼快 30%',                      speed: 0.7, rare: 1,   rateMax: 0 },
  glow:   { id: 'glow',   name: '发光饵', icon: '✨', desc: '出率 ≤3% 的鱼权重 ×1.4',          speed: 1,   rare: 1.4, rateMax: 3 },
};

const FOOD_PACKS = [
  { food: 20,  cost: 100 },
  { food: 100, cost: 450 },
  { food: 300, cost: 1200 },
];

const POND_EXPAND = [1200, 4000, 10000];

const BAIT_PACKS = {
  shrimp: [{ n: 10, cost: 60 }, { n: 30, cost: 150 }],
  glow:   [{ n: 5,  cost: 45 }, { n: 15, cost: 120 }],
};

/* 打窝：金币换稀有鱼概率。成功上鱼才扣 1 条，离线结算不吃。 */
const CHUM = {
  cost: 600,       // 10 条的价格
  catches: 10,     // 每次购买可持续的鱼数
  max: 30,         // 最多囤多少条
  rateMax: 2,      // 基础出率 ≤2% 的鱼权重倍率
  rareMult: 3,
  tierMult: 2,     // 钻石及以上品质的权重倍率
};

/* 行情达到这个倍数时，鱼市页会提示“高点” */
const MARKET_HOT = 1.22;

/* ---------------- 钓鱼阶段 ---------------- */
const PHASE = { IDLE: 'idle', WAIT: 'waiting', BITE: 'bite', FIGHT: 'fight', LAND: 'land' };
const BITE_WINDOW = 1.2;   // 咬钩后多久内必须提竿
const AUTO_HOOK_AT = 0.8;  // 挂机时自动提竿的时刻
const AUTO_SUCCESS = 0.92; // 挂机自动结算的成功率
/* 自动卖鱼也会留下：钻石及以上品质，或 rank≥4 的稀有鱼种 */
const AUTO_SELL_KEEP_TIER = 5;
const AUTO_SELL_KEEP_RANK = 4;
const FIGHT_MAX = 7;       // 搏鱼最长时间

/* 搏鱼手感按鱼的基础出率分 6 档：安全区半宽、发力间隔、拉扯幅度 */
const RANK_FIGHT = [
  { half: 16,  pullMin: 1200, pullMax: 1800, jitter: 15, speed: 0.7,  amp: 10 },
  { half: 14,  pullMin: 1100, pullMax: 1700, jitter: 17, speed: 0.8,  amp: 11 },
  { half: 12,  pullMin: 950,  pullMax: 1450, jitter: 19, speed: 0.95, amp: 12 },
  { half: 10,  pullMin: 850,  pullMax: 1300, jitter: 21, speed: 1.1,  amp: 13 },
  { half: 8.5, pullMin: 750,  pullMax: 1150, jitter: 23, speed: 1.25, amp: 14 },
  { half: 7,   pullMin: 650,  pullMax: 1000, jitter: 25, speed: 1.4,  amp: 15 },
];

/* 鱼竿对越稀有的鱼加成越大（按 rank 0–5） */
const ROD_RANK_BOOST = [0, 0.05, 0.09, 0.13, 0.18, 0.24];

/* 品质：10 阶通用阶梯。weight 是野生品质的抽取权重。 */
const TIERS = [
  { name: '普通', color: '#9aa4b8', mult: 1,    weight: 1000 },
  { name: '白银', color: '#c8d4f0', mult: 1.35, weight: 320 },
  { name: '黄金', color: '#ffd24a', mult: 1.8,  weight: 102 },
  { name: '铂金', color: '#8ce8d0', mult: 2.4,  weight: 33 },
  { name: '钻石', color: '#b06cff', mult: 3.2,  weight: 10.5 },
  { name: '星耀', color: '#6fd0ff', mult: 4.2,  weight: 3.4 },
  { name: '王者', color: '#ff8a5a', mult: 5.5,  weight: 1.1 },
  { name: '荣耀', color: '#ff5c8a', mult: 7.0,  weight: 0.35 },
  { name: '传奇', color: '#ffb03a', mult: 9.0,  weight: 0.11 },
  { name: '永恒', color: '#e8f4ff', mult: 11.5, weight: 0.035 },
];

/* 升级：消耗、基础成功率、失败时的掉阶/跑鱼概率、掉到几阶。
   幸运每点 +0.5% 成功率，失败 +8 点，满 100 必成。 */
const AMP_COST = [24, 60, 150, 360, 800, 1700, 3600, 7500, 15000];
const AMP_COIN_COST = [60, 150, 360, 800, 1800, 4000, 8500, 18000, 40000];
const AMP_CHANCE = [0.55, 0.42, 0.32, 0.24, 0.17, 0.12, 0.085, 0.06, 0.04];
const AMP_DROP = [0, 0.12, 0.16, 0.18, 0.2, 0.22, 0.24, 0.26, 0.28];
const AMP_DESTROY = [0, 0, 0, 0.06, 0.08, 0.1, 0.12, 0.15, 0.2];
const AMP_DROP_TO = [1, 1, 2, 3, 4, 5, 6, 7, 8];
const CHARM_COST = 600;
const LUCK_PER_FAIL = 8;
const LUCK_BONUS = 0.005;

const ACH_CATEGORIES = ['全部', '钓鱼', '收集', '经营', '探索'];

const ACHIEVEMENTS = [
  /* 钓鱼 */
  { id: 'first',      name: '初次下竿', desc: '钓到第一条鱼',           cat: '钓鱼', reward: 20,  goal: 1,    get: s => s.totalCaught,                              test: s => s.totalCaught >= 1 },
  { id: 'catch50',    name: '熟练渔夫', desc: '累计钓到 50 条',         cat: '钓鱼', reward: 80,  goal: 50,   get: s => s.totalCaught },
  { id: 'catch300',   name: '渔场常客', desc: '累计钓到 300 条',        cat: '钓鱼', reward: 200, goal: 300,  get: s => s.totalCaught },
  { id: 'catch1000',  name: '千鱼斩',   desc: '累计钓到 1,000 条',      cat: '钓鱼', reward: 500, goal: 1000, get: s => s.totalCaught },
  { id: 'rare',       name: '稀有发现', desc: '钓到出率 ≤2% 的鱼',      cat: '钓鱼', reward: 60,  test: s => s.stats.minRate <= 2 },
  { id: 'legend',     name: '传说降临', desc: '钓到出率 ≤0.6% 的鱼',    cat: '钓鱼', reward: 180, test: s => s.stats.minRate <= 0.6 },
  { id: 'mythic',     name: '神话之影', desc: '钓到出率 ≤0.12% 的鱼',   cat: '钓鱼', reward: 400, test: s => s.stats.minRate <= 0.12 },

  /* 收集 */
  { id: 'dex6',       name: '图鉴半成', desc: '收集 6 种鱼',            cat: '收集', reward: 100, goal: 6,    get: () => dexCount(),                               test: () => dexCount() >= 6 },
  { id: 'dex12',      name: '图鉴大成', desc: '收集 12 种鱼',           cat: '收集', reward: 300, goal: 12,   get: () => dexCount(),                               test: () => dexCount() >= 12 },
  { id: 'dex20',      name: '图鉴全满', desc: '收集全部 20 种鱼',       cat: '收集', reward: 800, goal: 20,   get: () => dexCount(),                               test: () => dexCount() >= 20 },
  { id: 'max100',     name: '百厘米俱乐部', desc: '钓到一条 100cm 的鱼', cat: '收集', reward: 120, goal: 100, get: s => s.stats.maxSize },
  { id: 'max200',     name: '巨物猎人', desc: '钓到一条 200cm 的鱼',    cat: '收集', reward: 260, goal: 200,  get: s => s.stats.maxSize },
  { id: 'basket5',    name: '五鱼待沽', desc: '鱼篓同时有 5 种鱼',      cat: '收集', reward: 100, goal: 5,    get: () => basketSpecies() },

  /* 经营 */
  { id: 'coin1k',     name: '小有积蓄', desc: '持有 1,000 金币',        cat: '经营', reward: 40,  goal: 1000,  get: s => Math.floor(s.coins) },
  { id: 'coin10k',    name: '万元户',   desc: '持有 10,000 金币',       cat: '经营', reward: 200, goal: 10000, get: s => Math.floor(s.coins) },
  { id: 'sold1k',     name: '第一桶金', desc: '累计卖鱼收入 1,000',     cat: '经营', reward: 60,  goal: 1000,  get: s => s.stats.soldCoins },
  { id: 'sold20k',    name: '生意兴隆', desc: '累计卖鱼收入 20,000',    cat: '经营', reward: 250, goal: 20000, get: s => s.stats.soldCoins },
  { id: 'sellHigh',   name: '高点抛售', desc: '在 1.22× 以上行情卖鱼',  cat: '经营', reward: 80,  goal: 1,     get: s => s.stats.highSells },
  { id: 'pond1',      name: '第一塘鱼', desc: '鱼塘里放入第一条鱼',     cat: '经营', reward: 50,  goal: 1,     get: s => (s.pond || []).filter(Boolean).length,     test: s => (s.pond || []).some(Boolean) },
  { id: 'pond6',      name: '六六大顺', desc: '鱼塘住满 6 条鱼',        cat: '经营', reward: 250, goal: 6,     get: s => (s.pond || []).filter(Boolean).length },
  { id: 'pond1k',     name: '小塘主',   desc: '鱼塘累计产出 1,000',     cat: '经营', reward: 60,  goal: 1000,  get: s => s.stats.pondEarned },
  { id: 'pond10k',    name: '塘主',     desc: '鱼塘累计产出 10,000',    cat: '经营', reward: 200, goal: 10000, get: s => s.stats.pondEarned },
  { id: 'tier3',      name: '黄金之手', desc: '拥有黄金品质的鱼',       cat: '经营', reward: 150, goal: 3,     get: s => s.stats.bestTier },
  { id: 'tier5',      name: '钻石之心', desc: '拥有钻石品质的鱼',       cat: '经营', reward: 400, goal: 5,     get: s => s.stats.bestTier },
  { id: 'tier7',      name: '王者之姿', desc: '拥有王者品质的鱼',       cat: '经营', reward: 700, goal: 7,     get: s => s.stats.bestTier },
  { id: 'tier9',      name: '传奇品质', desc: '拥有传奇品质的鱼',       cat: '经营', reward: 1200, goal: 9,    get: s => s.stats.bestTier },
  { id: 'upFails5',   name: '百折不挠', desc: '升级失败 5 次',          cat: '经营', reward: 60,  goal: 5,     get: s => s.stats.upFails },
  { id: 'pityWin',    name: '时来运转', desc: '触发幸运保底并成功',     cat: '经营', reward: 100, test: s => s.stats.pityWins >= 1 },

  /* 探索 */
  { id: 'weatherSun',   name: '晴空万里', desc: '晴天钓到 50 条',       cat: '探索', reward: 80,  goal: 50, get: s => s.stats.weatherCaught.sunny },
  { id: 'weatherRain',  name: '雨中垂钓', desc: '雨天钓到 50 条',       cat: '探索', reward: 80,  goal: 50, get: s => s.stats.weatherCaught.rain },
  { id: 'weatherNight', name: '夜航船',   desc: '夜晚钓到 50 条',       cat: '探索', reward: 80,  goal: 50, get: s => s.stats.weatherCaught.night },
  { id: 'shrimp20',     name: '虾饵专家', desc: '用鲜虾饵钓 20 条',     cat: '探索', reward: 80,  goal: 20, get: s => s.stats.baitCaught.shrimp },
  { id: 'glowRare',     name: '发光的诱惑', desc: '用发光饵钓到出率 ≤3% 的鱼', cat: '探索', reward: 120, test: s => Boolean(s.stats.glowRare) },
  { id: 'chum30',       name: '窝料大师', desc: '打窝期间钓到 30 条',   cat: '探索', reward: 160, goal: 30, get: s => s.stats.chumCaught },
];

/* ---------------- 鱼类：每条鱼单独配置基础出率（合计 100%） ---------------- */
/* rank 只用于隐藏的搏鱼手感、鱼竿加成和行情波动，不在界面显示。
   rate 是基础出率百分比，rod / 天气 / 鱼饵 / 打窝会在此基础上改变权重。 */
const FISH = [
  { id:'crucian',   name:'小鲫鱼',     rank:0, rate:22,   value:2,    size:[10,30],   pattern:'scales',   colors:{ body:'#93aabb', fin:'#6d8898', belly:'#b8ccd8' } },
  { id:'loach',     name:'泥鳅',       rank:0, rate:18,   value:3,    size:[10,25],   pattern:'spots',    colors:{ body:'#8a7a55', fin:'#6a5c3d', belly:'#a89870' }, accent:'#5f5038' },
  { id:'grass',     name:'草鱼',       rank:0, rate:15,   value:4,    size:[40,110],  pattern:'stripes',  colors:{ body:'#7a9a5a', fin:'#5c7a42', belly:'#9ab878' }, accent:'#5c7a42' },
  { id:'bass',      name:'鲈鱼',       rank:0, rate:9,    value:6,    size:[25,70],   pattern:'spots',    colors:{ body:'#a8b8c0', fin:'#6a7f8c', belly:'#d8e2e8' }, accent:'#4a5a66' },
  { id:'salmon',    name:'三文鱼',     rank:0, rate:6,    value:8,    size:[50,100],  pattern:'stripes',  colors:{ body:'#b8c8d0', fin:'#7a8a96', belly:'#e8f0f4' }, accent:'#d87a6a' },
  { id:'carp',      name:'鲤鱼',       rank:1, rate:7,    value:10,   size:[40,120],  pattern:'whiskers', colors:{ body:'#c98a4a', fin:'#a06a35', belly:'#e0aa70' }, accent:'#f0c080' },
  { id:'catfish',   name:'鲶鱼',       rank:1, rate:6,    value:13,   size:[50,130],  pattern:'whiskers', colors:{ body:'#6a6250', fin:'#4e483a', belly:'#948a74' }, accent:'#3a3428' },
  { id:'puffer',    name:'河豚',       rank:1, rate:4,    value:16,   size:[20,50],   pattern:'spines',   colors:{ body:'#d8c85a', fin:'#b0a03a', belly:'#f0e088' }, accent:'#8a7a2a' },
  { id:'grouper',   name:'石斑鱼',     rank:1, rate:3,    value:20,   size:[40,120],  pattern:'spots',    colors:{ body:'#a07050', fin:'#7a5038', belly:'#c8a078' }, accent:'#5a3a28' },
  { id:'koi',       name:'锦鲤',       rank:2, rate:2.5,  value:26,   size:[50,100],  pattern:'koi',      colors:{ body:'#e8e8e8', fin:'#e05a4a', belly:'#ffffff' }, accent:'#e05a4a' },
  { id:'flounder',  name:'比目鱼',     rank:2, rate:2,    value:32,   size:[30,80],   pattern:'flat',     colors:{ body:'#9a8060', fin:'#6e5a40', belly:'#c8b490' }, accent:'#5a4a34' },
  { id:'eel',       name:'鳗鱼',       rank:2, rate:1.5,  value:40,   size:[40,100],  pattern:'long',     shape:'long', colors:{ body:'#4a5a6a', fin:'#36424e', belly:'#6a7a8a' } },
  { id:'sailfish',  name:'旗鱼',       rank:2, rate:1,    value:50,   size:[150,300], pattern:'sail',     colors:{ body:'#4a7ac8', fin:'#2e5aa0', belly:'#8ab0e8' }, accent:'#ffd24a' },
  { id:'tuna',      name:'蓝鳍金枪鱼', rank:3, rate:1.2,  value:65,   size:[150,300], pattern:'tuna',     colors:{ body:'#3a5a8a', fin:'#243a5e', belly:'#c8d8e8' }, accent:'#ffd24a' },
  { id:'sword',     name:'剑鱼',       rank:3, rate:0.8,  value:85,   size:[200,450], pattern:'bill',     colors:{ body:'#5a7a9a', fin:'#3e5a75', belly:'#7a9aba' } },
  { id:'lantern',   name:'鮟鱇鱼',     rank:3, rate:0.5,  value:110,  size:[30,100],  pattern:'glow',     colors:{ body:'#4a3a5a', fin:'#322844', belly:'#6a5a7a' }, light:'#ffe066' },
  { id:'golden',    name:'金鳟',       rank:4, rate:0.3,  value:200,  size:[40,80],   pattern:'shine',    colors:{ body:'#ffcc33', fin:'#e0a020', belly:'#ffe680' } },
  { id:'shark',     name:'大白鲨',     rank:4, rate:0.15, value:300,  size:[300,600], pattern:'shark',    colors:{ body:'#7a8894', fin:'#4a5866', belly:'#d8e0e8' }, accent:'#2a3440' },
  { id:'starlight', name:'皇带鱼',     rank:5, rate:0.03, value:800,  size:[300,800], pattern:'stars',    shape:'long', colors:{ body:'#d8e8f0', fin:'#e05a4a', belly:'#f6fbff' }, accent:'#ffe066' },
  { id:'ghost',     name:'巨骨舌鱼',   rank:5, rate:0.02, value:1200, size:[200,450], pattern:'koi',      shape:'long', colors:{ body:'#6a7a5a', fin:'#a83a3a', belly:'#b8a878' }, accent:'#c84a3a' },
];
const FISH_MAP = {};
const FISH_INDEX = {};
FISH.forEach((f, i) => {
  FISH_MAP[f.id] = f;
  FISH_INDEX[f.id] = i;
});

/* 出率配色：不显示档位名，只用颜色帮助快速扫视 */
const RATE_COLORS = [
  { min: 10,  color: '#9aa4b8' },
  { min: 5,   color: '#5fcf7a' },
  { min: 2,   color: '#4aa8ff' },
  { min: 1,   color: '#b06cff' },
  { min: 0.1, color: '#ffb03a' },
  { min: 0,   color: '#ff5c8a' },
];

function fishColor(fish) {
  const rate = Number(fish && fish.rate) || 0;
  for (const band of RATE_COLORS) if (rate >= band.min) return band.color;
  return RATE_COLORS[RATE_COLORS.length - 1].color;
}

function fishRateLabel(fish) {
  const rate = Number(fish && fish.rate) || 0;
  if (rate >= 1) return `${Math.round(rate * 10) / 10}%`;
  return `${rate.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}%`;
}
