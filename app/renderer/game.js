/* 像素渔场 · 状态、玩法逻辑、经济与存档 */

/* ---------------- 状态 ---------------- */
const state = {
  saveVer: SAVE_VERSION,
  coins: 0,
  rod: 1,
  rodRefine: 0,
  basketLv: 1,
  autoSell: false,
  autoSellOwned: false,
  bait: { sel: 'worm', shrimp: 0, glow: 0 },
  marketSel: 'crucian',
  marketSeed: Math.floor(Math.random() * 2147483000) + 1,
  basket: [],
  dex: {},
  dexStats: {},
  ach: {},
  pond: [],
  pondSlots: 3,
  food: 0,
  charms: 0,
  chum: 0,
  stats: {
    minRate: 100, maxSize: 0, soldCoins: 0, highSells: 0,
    weatherCaught: { sunny: 0, rain: 0, night: 0 },
    baitCaught: { worm: 0, shrimp: 0, glow: 0 },
    pondEarned: 0, upTries: 0, upFails: 0, upStreak: 0, bestUpStreak: 0,
    bestTier: 1, chumCaught: 0, glowRare: false, pityWins: 0,
  },
  qualityPaid: false,
  totalCaught: 0,
  lastActive: Date.now(),
  // 以下为瞬时状态，不写入存档
  castBait: 'worm',
  phase: PHASE.IDLE,
  phaseT: 0,
  waitFor: 0,
  hold: false,
  fight: null,
  qualityComp: 0,
};

let curWeather = null;

/* ---------------- 数值公式 ---------------- */
/* 基础 10 秒一咬；鱼竿每级减 0.25 秒，任何加成下最低 6 秒。 */
function fishTime() {
  return Math.max(6, 10 - (state.rod - 1) * 0.25);
}
function biteWait(bait) {
  const b = BAITS[bait] || BAITS.worm;
  return clamp(fishTime() * (0.9 + Math.random() * 0.2) * b.speed, 6, 60);
}
function biteEstimate() {
  const b = BAITS[state.bait.sel] || BAITS.worm;
  return Math.max(6, fishTime() * b.speed);
}
function capacity() {
  return 15 + (state.basketLv - 1) * 10;
}
function rodCost() {
  return Math.floor(60 * Math.pow(1.7, state.rod - 1));
}

/* ---------------- 鱼竿淬炼 ---------------- */
function rodRefineLevel() {
  return (state.rodRefine + 1) * ROD_REFINE_EVERY;
}
function rodStage(n) {
  const refine = n === undefined ? state.rodRefine : Math.max(0, Math.floor(finite(n, 0)));
  if (refine >= ROD_REFINE_STAGES.length) {
    const top = ROD_REFINE_STAGES[ROD_REFINE_STAGES.length - 1];
    return { rod: '无双竿', title: '无双钓神', colors: top.colors };
  }
  return ROD_REFINE_STAGES[refine];
}
function rodRefineCost() {
  return Math.floor(60 * Math.pow(1.7, rodRefineLevel() - 1) * ROD_REFINE_COST_MULT);
}
function refineRod() {
  if (state.rod < rodRefineLevel()) return false;
  const cost = rodRefineCost();
  if (state.coins < cost) return false;
  state.coins -= cost;
  state.rodRefine += 1;
  const stage = rodStage();
  toast(`淬炼成功：${stage.rod} · 「${stage.title}」`, '#ffd24a');
  beep(620, 0.1, 'square', 0.05);
  beep(930, 0.1, 'square', 0.05, 0.08);
  beep(1240, 0.2, 'square', 0.05, 0.16);
  spawnSpark(148, 64, 12, stage.colors.glow || '#ffe066');
  updateUI();
  save();
  return true;
}
function basketCost() {
  return Math.floor(50 * Math.pow(1.65, state.basketLv - 1));
}
const AUTO_COST = 1000;

/* 天气、鱼饵、鱼竿改变单种鱼的权重，再按权重抽鱼。
   多个加成按加法叠加：叠加不互相放大，稀有鱼不会被几层 buff 堆成常见鱼。 */
function fishWeight(fish, opts) {
  const o = opts || {};
  const weather = o.weather || (curWeather ? curWeather.id : currentWeather().id);
  const bait = o.bait || state.castBait;
  let weatherMult = 1;

  if (weather === 'sunny') {
    if (fish.id === 'koi') weatherMult = 2.5;
    else if (fish.id === 'grass') weatherMult = 1.3;
    else if (fish.id === 'golden') weatherMult = 2;
    else if (fish.id === 'whaleshark') weatherMult = 2;
  } else if (weather === 'rain') {
    if (fish.id === 'eel') weatherMult = 3.5;
    else if (fish.id === 'catfish') weatherMult = 2.5;
    else if (fish.id === 'frilled') weatherMult = 2;
  } else if (weather === 'night') {
    if (fish.id === 'lantern') weatherMult = 4;
    else if (fish.id === 'starlight') weatherMult = 2.2;
    else if (fish.id === 'ghost') weatherMult = 1.3;
    else if (fish.id === 'coelacanth') weatherMult = 2;
  }

  const gear = 1 + (state.rod - 1) * (ROD_RANK_BOOST[fish.rank] || 0);
  /* 淬炼只加成 rank≥3 的稀有鱼，普通鱼不受影响 */
  const refine = fish.rank >= 3 ? 1 + ROD_REFINE_RARE_BOOST * state.rodRefine : 1;
  const baitMult = bait === 'glow' && fish.rate <= BAITS.glow.rateMax ? BAITS.glow.rare : 1;
  const chum = o.chum !== undefined ? Boolean(o.chum) : state.chum > 0;
  const chumMult = chum && fish.rate <= CHUM.rateMax ? CHUM.rareMult : 1;

  return fish.rate * (1 + (gear - 1) + (refine - 1) + (weatherMult - 1) + (baitMult - 1) + (chumMult - 1));
}

function rollFish(opts) {
  const weights = FISH.map(f => fishWeight(f, opts));
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < FISH.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return FISH[i];
  }
  return FISH[FISH.length - 1];
}

function tierWeights(chum) {
  return TIERS.map((t, i) => (t.weight || 0) * (chum && i >= 4 ? CHUM.tierMult : 1));
}

/** 野生鱼也按同一套品质抽取：高阶极稀有，钓到后可直接入塘/出售。 */
function rollTier(opts) {
  const o = opts || {};
  const chum = o.chum !== undefined ? Boolean(o.chum) : state.chum > 0;
  const weights = tierWeights(chum);
  let total = 0;
  for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return i + 1;
  }
  return TIERS.length;
}

/* ---------------- 音效 ---------------- */
let audioCtx = null;
function initAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
}
document.addEventListener('pointerdown', initAudio, { once: true });

function beep(freq, dur, type = 'sine', vol = 0.05, delay = 0) {
  if (!audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const o = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g);
  g.connect(audioCtx.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function successFanfare(tier) {
  const notes = [523, 659, 784, 1047, 1319, 1568, 2093];
  beep(110, 0.26, 'triangle', 0.07);
  const n = Math.min(notes.length, 3 + Math.floor(tier / 2));
  for (let i = 0; i < n; i += 1) {
    beep(notes[i], 0.16, 'triangle', 0.055, 0.05 + i * 0.075);
  }
  if (tier >= 5) beep(1047, 0.5, 'sine', 0.04, 0.58);
  if (tier >= 8) beep(1568, 0.7, 'sine', 0.035, 0.64);
}

/* ---------------- 游戏逻辑 ---------------- */
let lastFrame = performance.now();
let uiDirty = true;
let achClock = 0;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function basketValue() {
  let total = 0;
  for (const item of state.basket) total += saleValue(item);
  return total;
}

function basketFull() {
  return state.basket.length >= capacity();
}

function basketSpecies() {
  const ids = new Set();
  for (const item of state.basket) {
    if (item && FISH_MAP[item.id]) ids.add(item.id);
  }
  return ids.size;
}

/* ---------------- M2：尺寸、图鉴、成就 ---------------- */
function dexCount() {
  if (!state.dexStats) return 0;
  return Object.keys(state.dexStats).filter(id => state.dexStats[id] && state.dexStats[id].n > 0).length;
}

function dexBonus() {
  const n = dexCount();
  return n >= 20 ? 0.15 : n >= 12 ? 0.1 : n >= 6 ? 0.05 : 0;
}

function ensureDexStats() {
  if (!state.dexStats || typeof state.dexStats !== 'object' || Array.isArray(state.dexStats)) state.dexStats = {};
  if (!state.dex || typeof state.dex !== 'object' || Array.isArray(state.dex)) state.dex = {};
  const count = (v) => Math.max(0, Math.floor(Number(v) || 0));

  for (const id of Object.keys(state.dexStats)) {
    if (!FISH_MAP[id]) {
      delete state.dexStats[id];
      continue;
    }
    const rec = state.dexStats[id];
    if (!rec || typeof rec !== 'object') {
      state.dexStats[id] = { n: count(state.dex[id]), max: 0, first: 0 };
      continue;
    }
    rec.n = count(rec.n);
    rec.max = Math.max(0, Math.min(9999, Number(rec.max) || 0));
    rec.first = Math.max(0, Number(rec.first) || 0);
    rec.bestTier = Math.min(TIERS.length, count(rec.bestTier));
    delete rec.bestQ;
  }
  for (const id of Object.keys(state.dex)) {
    if (!FISH_MAP[id]) {
      delete state.dex[id];
      continue;
    }
    const n = count(state.dex[id]);
    const rec = state.dexStats[id];
    if (!rec) state.dexStats[id] = { n, max: 0, first: 0 };
    else if (n > rec.n) rec.n = n;
  }
  for (const id of Object.keys(state.dexStats)) {
    state.dex[id] = state.dexStats[id].n;
  }

  // 旧档补录：鱼塘和鱼篓里现存的鱼按当前品质记一次；之前卖掉的历史最高无法追溯
  for (const slot of state.pond || []) if (slot) recordBestTier(slot.id, slot.tier);
  for (const item of state.basket || []) if (item) recordBestTier(item.id, item.tier);

  if (!state.stats || typeof state.stats !== 'object') state.stats = {};
  const s = state.stats;
  // v8 起移除搏鱼星级与 6 档稀有度统计
  delete s.perfects;
  delete s.streak;
  delete s.bestStreak;
  delete s.bestRarity;
  delete s.fastHooks;
  delete s.glowEpic;
  s.maxSize = Math.max(0, Math.min(9999, Number(s.maxSize) || 0));
  s.soldCoins = count(s.soldCoins);
  s.highSells = count(s.highSells);
  s.pondEarned = count(s.pondEarned);
  s.upTries = count(s.upTries);
  s.upFails = count(s.upFails);
  s.upStreak = count(s.upStreak);
  s.bestUpStreak = Math.max(s.upStreak, count(s.bestUpStreak));
  s.bestTier = Math.max(1, Math.min(TIERS.length, Number(s.bestTier) || 1));
  s.chumCaught = count(s.chumCaught);
  s.glowRare = Boolean(s.glowRare);
  s.pityWins = count(s.pityWins);
  if (s.minRate === undefined || s.minRate === null || !Number.isFinite(Number(s.minRate))) {
    let min = 100;
    for (const id of Object.keys(state.dexStats)) {
      if (state.dexStats[id].n > 0 && FISH_MAP[id]) min = Math.min(min, FISH_MAP[id].rate);
    }
    s.minRate = min;
  } else {
    s.minRate = Math.max(0.01, Math.min(100, Number(s.minRate)));
  }

  if (!s.weatherCaught || typeof s.weatherCaught !== 'object') s.weatherCaught = {};
  for (const id of ['sunny', 'rain', 'night']) s.weatherCaught[id] = count(s.weatherCaught[id]);
  if (!s.baitCaught || typeof s.baitCaught !== 'object') s.baitCaught = {};
  for (const id of ['worm', 'shrimp', 'glow']) s.baitCaught[id] = count(s.baitCaught[id]);
  if (!state.ach || typeof state.ach !== 'object') state.ach = {};
  // v8 起旧品质星级成就作废，连解锁记录一起清掉
  delete state.ach.perfect1;
  delete state.ach.perfect20;
  delete state.ach.perfect50;
  delete state.ach.streak3;
  delete state.ach.fast10;
  delete state.ach.glowEpic;
}

function ensureBaits() {
  if (!state.bait || typeof state.bait !== 'object') state.bait = {};
  const b = state.bait;
  b.shrimp = Math.max(0, Math.floor(Number(b.shrimp) || 0));
  b.glow = Math.max(0, Math.floor(Number(b.glow) || 0));
  if (!BAITS[b.sel]) b.sel = 'worm';
  if (b.sel !== 'worm' && !b[b.sel]) b.sel = 'worm';
}

function ensureMeta() {
  ensureBaits();
  state.chum = clampInt(state.chum, 0, CHUM.max, 0);
  if (!FISH_MAP[state.marketSel]) state.marketSel = FISH[0].id;
  if (state.autoSell) state.autoSellOwned = true;
  state.autoSellOwned = Boolean(state.autoSellOwned);
}

function updateDex(fish, size, tier) {
  const rec = state.dexStats[fish.id] || (state.dexStats[fish.id] = { n: 0, max: 0, first: 0 });
  rec.n += 1;
  if (size > rec.max) rec.max = size;
  if (!rec.first) rec.first = Date.now();
  state.dex[fish.id] = rec.n;
  if (tier) recordBestTier(fish.id, tier);
}

/* 每种鱼的史上最高品质；鱼塘只有 6 格，轮着养也能集齐满级勋章 */
function bestTierOf(id) {
  const rec = state.dexStats && state.dexStats[id];
  return rec && rec.bestTier ? rec.bestTier : 0;
}

function eternalCount() {
  if (!state.dexStats) return 0;
  let n = 0;
  for (const f of FISH) if (bestTierOf(f.id) >= TIERS.length) n += 1;
  return n;
}

function recordBestTier(id, tier) {
  if (!FISH_MAP[id]) return;
  const t = clampInt(tier, 1, TIERS.length, 1);
  const rec = state.dexStats[id] || (state.dexStats[id] = { n: 0, max: 0, first: 0 });
  if (t > (rec.bestTier || 0)) rec.bestTier = t;
}

function checkAchievements() {
  let unlocked = 0;
  for (const a of ACHIEVEMENTS) {
    if (state.ach[a.id]) continue;
    let ok = false;
    try {
      ok = a.test ? a.test(state) : (typeof a.get === 'function' && a.goal ? a.get(state) >= a.goal : false);
    } catch (e) {
      ok = false;
    }
    if (ok) {
      state.ach[a.id] = Date.now();
      state.coins += a.reward;
      unlocked += 1;
      toast(`成就解锁：${a.name} +${a.reward} 🪙`, '#ffd24a');
      beep(900, 0.09, 'square', 0.04);
      beep(1200, 0.12, 'square', 0.04, 0.08);
    }
  }
  return unlocked;
}

/* ---------------- 鱼塘 ---------------- */
function ensurePond() {
  if (!Array.isArray(state.pond)) state.pond = [];
  state.pondSlots = Math.min(6, Math.max(3, Number(state.pondSlots) || 3));
  while (state.pond.length < state.pondSlots) state.pond.push(null);
  state.pond.length = state.pondSlots;
  state.food = Math.max(0, Math.floor(Number(state.food) || 0));
  state.charms = Math.max(0, Math.floor(Number(state.charms) || 0));

  state.pond = state.pond.map(slot => {
    if (!slot || !FISH_MAP[slot.id]) return null;

    let tier = Number(slot.tier) || 0;
    let luck = Math.max(0, Math.min(100, Number(slot.luck) || 0));

    // 旧版“等级/升星”存档迁移：按星级折算品质，并退回一部分鱼食
    if (!tier && (slot.lv !== undefined || slot.star !== undefined)) {
      const star = Number(slot.star) || 1;
      const lv = Number(slot.lv) || 1;
      tier = Math.min(TIERS.length, Math.max(1, star + Math.floor((lv - 1) / 3)));
      state.food += Math.max(0, (lv - 1) * 3 + (star - 1) * 15);
    }

    // 旧版“喂养进度”折算回鱼食
    if (slot.feed > 0) {
      state.food += Math.floor(slot.feed);
      luck = Math.min(100, luck + Math.floor(slot.feed / 2));
    }

    const born = Number(slot.born);
    return {
      id: slot.id,
      s: Math.max(0, Math.min(9999, Number(slot.s) || 0)),
      tier: Math.min(TIERS.length, Math.max(1, tier)),
      luck: luck,
      born: Number.isFinite(born) && born > 0 && born <= Date.now() + 60000 ? born : Date.now(),
    };
  });
}

function tierOf(slot) {
  return TIERS[Math.min(TIERS.length, Math.max(1, slot.tier || 1)) - 1];
}

function slotRate(slot) {
  if (!slot) return 0;
  const fish = FISH_MAP[slot.id];
  if (!fish) return 0;
  const sizeF = 0.85 + Math.min(0.75, (slot.s || 20) / 200);
  const tierF = tierOf(slot).mult;
  const base = POND_RATE_CAP / (1.6 * TIERS[TIERS.length - 1].mult * 1.15);
  const valueF = Math.pow(fish.value / POND_TOP_VALUE, POND_VALUE_EXP);
  return Math.min(POND_RATE_CAP, base * valueF * sizeF * tierF * (1 + dexBonus()));
}

function pondRate() {
  let total = 0;
  for (const slot of state.pond) total += slotRate(slot);
  return total;
}

function putInPond(slotIndex, basketIndex) {
  const item = state.basket[basketIndex];
  if (!item || state.pond[slotIndex]) return;
  state.pond[slotIndex] = {
    id: item.id,
    s: item.s || 0,
    tier: Math.min(TIERS.length, Math.max(1, Number(item.tier) || 1)),
    luck: 0,
    born: Date.now(),
  };
  state.basket.splice(basketIndex, 1);
  recordBestTier(item.id, state.pond[slotIndex].tier);
  toast(`${FISH_MAP[item.id].name} 入塘`, '#5fcf7a');
  beep(700, 0.08, 'square', 0.04);
  checkAchievements();
  renderBasket(true);
  renderPond();
  closeModal();
  updateUI();
  save();
}

function removeFromPond(slotIndex) {
  const slot = state.pond[slotIndex];
  if (!slot) return;
  const refund = Math.max(1, Math.round(FISH_MAP[slot.id].value * 0.5 * tierOf(slot).mult));
  state.coins += refund;
  state.pond[slotIndex] = null;
  toast(`取出并折现 +${refund} 🪙`, '#ffd24a');
  renderPond();
  closeModal();
  updateUI();
  save();
}

let rolling = false;

function ampChance(slot) {
  if ((slot.luck || 0) >= 100) return 1;
  const base = AMP_CHANCE[Math.min(AMP_CHANCE.length - 1, slot.tier - 1)] || 0;
  return Math.min(1, base + (slot.luck || 0) * LUCK_BONUS);
}

function showRoll(index, rollMs) {
  const slot = state.pond[index];
  const fish = FISH_MAP[slot.id];
  const cur = TIERS[slot.tier - 1];
  const next = TIERS[Math.min(TIERS.length - 1, slot.tier)];
  let orbit = '';
  for (let i = 0; i < 10; i += 1) {
    orbit += `<i style="--a:${i * 36}deg;--r:${36 + (i % 3) * 6}px;animation-delay:${(i * 0.07).toFixed(2)}s"></i>`;
  }
  showModal(`${fish.name} · 升级中…`, `
    <div class="roll-box" style="--roll-ms:${rollMs}ms;--tier:${next.color}">
      <div class="roll-stage">
        <div class="roll-halo"></div>
        <div class="roll-ring r1"></div>
        <div class="roll-ring r2"></div>
        <div class="roll-orbit">${orbit}</div>
        <div class="up-ring"><img src="${fishIcon(fish)}" alt=""></div>
      </div>
      <div class="roll-tier"><span style="color:${cur.color}">${cur.name}</span><em>➜</em><b style="color:${next.color}">${next.name}</b></div>
      <div class="roll-bar"><i></i></div>
      <p class="roll-text">鱼食注入中…</p>
    </div>
  `);
  const text = document.querySelector('.roll-text');
  if (text) {
    setTimeout(() => { text.textContent = '品质共鸣中…'; }, Math.round(rollMs * 0.34));
    setTimeout(() => { text.textContent = '命运判定…'; }, Math.round(rollMs * 0.68));
  }
}

/** 喂鱼食升级：赌概率进化，失败可能掉阶/跑鱼。 */
function amplify(index) {
  const slot = state.pond[index];
  if (!slot || rolling) return;
  if (slot.tier >= TIERS.length) {
    toast('已经是最高品质', '#ff8a5a');
    return;
  }

  const foodCost = AMP_COST[slot.tier - 1];
  const coinCost = AMP_COIN_COST[slot.tier - 1];
  if (state.food < foodCost && state.coins < coinCost) {
    toast(`鱼食和金币都不够（需要 ${foodCost} 鱼食 + ${coinCost} 金币）`, '#ff8a5a');
    return;
  }
  if (state.food < foodCost) {
    toast(`鱼食不够（需要 ${foodCost}）`, '#ff8a5a');
    return;
  }
  if (state.coins < coinCost) {
    toast(`金币不够（需要 ${coinCost}）`, '#ff8a5a');
    return;
  }

  const destroyRisk = AMP_DESTROY[slot.tier - 1] || 0;
  const dropRisk = AMP_DROP[slot.tier - 1] || 0;
  if (destroyRisk > 0 && state.charms === 0) {
    const target = TIERS[AMP_DROP_TO[slot.tier - 1] - 1].name;
    const ok = confirm(`这次升级要花 ${foodCost} 鱼食 + ${coinCost} 金币。没有保护符：失败有 ${Math.round(destroyRisk * 100)}% 概率跑鱼、${Math.round(dropRisk * 100)}% 概率掉回${target}，确定要赌吗？`);
    if (!ok) return;
  }

  const wasPity = (slot.luck || 0) >= 100;
  const rollMs = 1100 + Math.min(700, slot.tier * 80);
  state.food -= foodCost;
  state.coins -= coinCost;
  state.stats.upTries += 1;
  rolling = true;
  showRoll(index, rollMs);

  const ticks = Math.round(rollMs / 120);
  for (let i = 0; i < ticks; i += 1) {
    const p = ticks > 1 ? i / (ticks - 1) : 1;
    beep(240 + p * p * 660, 0.045, 'square', 0.016, (i * 120) / 1000);
  }

  setTimeout(() => {
    const tier = slot.tier;
    const chance = ampChance(slot);
    const success = Math.random() < chance;
    const name = FISH_MAP[slot.id].name;
    let result = 'success';

    if (success) {
      slot.tier += 1;
      slot.luck = 0;
      state.stats.upStreak += 1;
      state.stats.bestUpStreak = Math.max(state.stats.bestUpStreak, state.stats.upStreak);
      state.stats.bestTier = Math.max(state.stats.bestTier, slot.tier);
      recordBestTier(slot.id, slot.tier);
      if (wasPity) state.stats.pityWins += 1;
      toast(`升级成功！${name} → ${TIERS[slot.tier - 1].name}`, '#ffd24a');
      successFanfare(slot.tier);
    } else {
      slot.luck = Math.min(100, (slot.luck || 0) + LUCK_PER_FAIL);
      state.stats.upFails += 1;
      state.stats.upStreak = 0;

      const destroyRisk = AMP_DESTROY[tier - 1] || 0;
      const dropRisk = AMP_DROP[tier - 1] || 0;
      if (destroyRisk > 0 && Math.random() < destroyRisk) {
        if (state.charms > 0) {
          state.charms -= 1;
          result = 'charm';
          toast(`保护符生效，${name} 没跑！`, '#8ce8d0');
          beep(740, 0.1, 'triangle', 0.045);
          beep(988, 0.14, 'triangle', 0.045, 0.08);
          beep(1319, 0.2, 'sine', 0.04, 0.16);
        } else {
          state.pond[index] = null;
          result = 'destroy';
          state.food += Math.floor(foodCost / 2);
          state.coins += Math.floor(coinCost / 2);
          beep(90, 0.4, 'sawtooth', 0.07);
          beep(150, 0.25, 'square', 0.04, 0.06);
        }
      } else if (dropRisk > 0 && Math.random() < dropRisk) {
        slot.tier = AMP_DROP_TO[tier - 1];
        result = 'drop';
        toast(`升级失败，${name} 掉回 ${TIERS[slot.tier - 1].name}`, '#ff8a5a');
        beep(320, 0.16, 'sawtooth', 0.045);
        beep(160, 0.26, 'sawtooth', 0.045, 0.1);
        beep(80, 0.3, 'triangle', 0.05, 0.2);
      } else {
        result = 'fail';
        toast(`升级失败，幸运 +${LUCK_PER_FAIL}（下次 ${Math.round(ampChance(slot) * 100)}%）`, '#ff8a5a');
        beep(280, 0.16, 'sawtooth', 0.04);
        beep(150, 0.24, 'sawtooth', 0.04, 0.1);
      }
    }

    rolling = false;
    checkAchievements();
    finishRoll(index, result, name, foodCost, coinCost);
    save();
  }, rollMs);
}

function finishRoll(index, result, name, foodCost, coinCost) {
  if (result === 'destroy') {
    showModal('鱼跑了', `
      <p class="destroy-text">升级失败，${name} 挣脱跑掉了…</p>
      <p style="font-size:12px;color:#8fa0c0">回收了 ${Math.floor((foodCost || 0) / 2)} 鱼食 · ${Math.floor((coinCost || 0) / 2)} 金币</p>
      <p style="font-size:12px;color:#7a88a8">下次记得先备一个保护符</p>
    `);
    fxFlash('rgba(255,90,74,.34)', 620);
    shake = Math.max(shake, 6);
    const box = document.querySelector('.modal-box');
    if (box) {
      box.classList.add('up-fail', 'up-destroy');
      const layer = fxLayer(box);
      spawnAsh(layer, 26);
      spawnWave(layer, '#ff5a4a', 0);
      spawnWave(layer, '#ff5a4a', 0.14);
      if (layer && layer.remove) setTimeout(() => layer.remove(), 2200);
      setTimeout(() => box.classList.remove('up-fail', 'up-destroy'), 1300);
    }
    renderPond();
    updateUI();
    return;
  }
  openPond(index, result);
  renderPond();
  updateUI();
}

function buyCharm(index) {
  if (state.coins < CHARM_COST) {
    toast('金币不够', '#ff8a5a');
    return;
  }
  state.coins -= CHARM_COST;
  state.charms += 1;
  toast(`买了一个保护符（现有 ${state.charms}）`, '#8ce8d0');
  beep(760, 0.08, 'square', 0.04);
  openPond(index);
  updateUI();
  save();
}

/** 结算一组已经离开鱼篓的鱼，返回总价和平均行情。 */
function creditSale(sold) {
  let total = 0;
  let base = 0;
  let maxMult = 0;
  for (const item of sold) {
    const value = saleValue(item);
    const b = itemBase(item);
    total += value;
    base += b;
    if (b > 0) maxMult = Math.max(maxMult, value / b);
  }
  if (total <= 0) return { total: 0, avgMult: 1, maxMult: 1 };
  state.coins += total;
  state.stats.soldCoins += total;
  if (maxMult >= MARKET_HOT) state.stats.highSells += 1;
  return { total, avgMult: base > 0 ? total / base : 1, maxMult };
}

function afterSale(result, label) {
  toast(`${label} +${result.total.toLocaleString()} 🪙 · 行情 ×${result.avgMult.toFixed(2)}`, '#ffd24a');
  beep(660, 0.08, 'triangle', 0.04);
  beep(880, 0.1, 'triangle', 0.04, 0.07);
  renderBasket(true);
  renderPond();
  renderMarket(true);
  updateUI();
  save();
  checkAchievements();
  updateUI();
}

/** 只卖当前选中的鱼种；鱼市页和鱼篓列表共用。 */
function sellFish(fishId) {
  if (!FISH_MAP[fishId]) return 0;
  const sold = [];
  const kept = [];
  for (const item of state.basket) {
    if (item && item.id === fishId) sold.push(item);
    else kept.push(item);
  }
  if (!sold.length) return 0;
  state.basket = kept;
  const result = creditSale(sold);
  afterSale(result, `卖出 ${FISH_MAP[fishId].name} ×${sold.length}`);
  return result.total;
}

/** 卖光鱼篓：按当前行情结算，供面板按钮和宠物模式共用。 */
function sellBasket() {
  if (!state.basket.length) return 0;
  const sold = state.basket.slice();
  state.basket = [];
  const result = creditSale(sold);
  afterSale(result, '卖出');
  return result.total;
}

function expandPond() {
  if (state.pondSlots >= 6) return;
  const cost = POND_EXPAND[state.pondSlots - 3];
  if (state.coins < cost) {
    toast('金币不够', '#ff8a5a');
    return;
  }
  state.coins -= cost;
  state.pondSlots += 1;
  state.pond.push(null);
  toast(`鱼塘扩建到 ${state.pondSlots} 格`, '#6fd0ff');
  beep(700, 0.08, 'square', 0.05);
  beep(1050, 0.12, 'square', 0.05, 0.07);
  renderPond();
  updateUI();
  save();
}

/* ---------------- M3：鱼饵 / 鱼食商店 ---------------- */
function consumeBait() {
  ensureBaits();
  const b = state.bait;
  const sel = b.sel;
  if (sel === 'worm') return 'worm';
  if (!b[sel]) {
    b.sel = 'worm';
    return 'worm';
  }
  b[sel] -= 1;
  if (b[sel] <= 0) {
    b.sel = 'worm';
    toast(`${BAITS[sel].name}用完了，换回蚯蚓`, '#ff8a5a');
    renderBaits();
  }
  return sel;
}

function selectBait(id) {
  if (!BAITS[id]) return;
  ensureBaits();
  if (id !== 'worm' && !state.bait[id]) {
    toast(`${BAITS[id].name}用完了，去商店补货`, '#ff8a5a');
    return;
  }
  state.bait.sel = id;
  renderBaits();
  updateUI();
  save();
}

function buyFood(food, cost) {
  if (state.coins < cost) {
    toast('金币不够', '#ff8a5a');
    return;
  }
  state.coins -= cost;
  state.food += food;
  toast(`鱼食 +${food}`, '#5fcf7a');
  beep(760, 0.08, 'square', 0.04);
  renderPond();
  updateUI();
  save();
}

function buyBait(id, n, cost) {
  if (!BAITS[id] || id === 'worm') return;
  if (state.coins < cost) {
    toast('金币不够', '#ff8a5a');
    return;
  }
  state.coins -= cost;
  ensureBaits();
  state.bait[id] += n;
  toast(`${BAITS[id].name} +${n}`, '#6fd0ff');
  beep(820, 0.08, 'square', 0.04);
  beep(1040, 0.1, 'square', 0.04, 0.07);
  renderBaits();
  updateUI();
  save();
}

function buyChum() {
  if (state.chum >= CHUM.max) {
    toast('窝料已经囤满了', '#ff8a5a');
    return;
  }
  const add = Math.min(CHUM.catches, CHUM.max - state.chum);
  const price = Math.ceil(CHUM.cost * add / CHUM.catches);
  if (state.coins < price) {
    toast(`金币不够（需要 ${price}）`, '#ff8a5a');
    return;
  }
  state.coins -= price;
  state.chum += add;
  toast(`打窝 +${add} 条（余 ${state.chum} 条）`, '#ff8a5a');
  beep(700, 0.08, 'square', 0.04);
  beep(980, 0.1, 'square', 0.04, 0.07);
  updateUI();
  save();
}

/** 离线期间鱼塘产出的金币。 */
function settlePond(since) {
  const seconds = Math.min((Date.now() - since) / 1000, MAX_OFFLINE);
  if (seconds < 10) return 0;
  const coins = Math.floor(pondRate() * seconds / 60);
  if (coins > 0) {
    state.coins += coins;
    state.stats.pondEarned += coins;
  }
  return coins;
}

/* 咬钩 / 搏鱼的首两次操作提示，只弹一次 */
let tutorialBite = false;
let tutorialFight = false;

/* ---------------- 钓鱼流程 ---------------- */
function startWaiting() {
  state.phase = PHASE.WAIT;
  state.phaseT = 0;
  const bait = consumeBait();
  state.castBait = bait;
  state.waitFor = biteWait(bait);
}

function startBite() {
  state.phase = PHASE.BITE;
  state.phaseT = 0;
  bobDip = 1;
  spawnSplash(136, 147, 6);
  if (!tutorialBite) {
    tutorialBite = true;
    toast('咬钩了！点一下提竿', '#ffd24a');
  }
  beep(1180, 0.09, 'square', 0.05);
  beep(1580, 0.06, 'square', 0.04, 0.07);
}

function startFight() {
  const fish = rollFish();
  const tune = RANK_FIGHT[fish.rank] || RANK_FIGHT[0];
  state.phase = PHASE.FIGHT;
  state.phaseT = 0;
  state.hold = false;
  state.fight = {
    fish,
    tune,
    tension: 38,
    progress: 0,
    center: 50,
    half: tune.half,
    baseHalf: tune.half,
    pullLeft: 0.9,
    shrink: 0,
    inZone: 0,
    slack: 0,
    elapsed: 0,
    tick: 0,
  };
  beep(620, 0.07, 'triangle', 0.05);
  beep(880, 0.09, 'triangle', 0.045, 0.06);
  if (!tutorialFight) {
    tutorialFight = true;
    toast('按住收线，松开泄力', '#8ce89f');
  }
}

/** 咬钩窗口内提竿，进入搏鱼。 */
function hook() {
  if (state.phase !== PHASE.BITE) return false;
  spawnSplash(136, 147, 6);
  startFight();
  return true;
}

function keepsOnAutoSell(fish, tier) {
  return tier >= AUTO_SELL_KEEP_TIER || fish.rank >= AUTO_SELL_KEEP_RANK;
}

function catchFish(fish, silent) {
  const range = fish.size || [10, 100];
  const t = Math.pow(Math.random(), 0.7);
  const size = Math.round(range[0] + (range[1] - range[0]) * t);
  const sizeMult = 0.85 + 0.9 * t;
  const tier = rollTier();
  const tierF = TIERS[tier - 1].mult;
  const base = Math.max(1, Math.round(fish.value * sizeMult * (1 + dexBonus()) * tierF));
  const value = Math.max(1, Math.round(base * marketMult(fish.id)));

  state.totalCaught += 1;
  if (state.chum > 0) {
    state.stats.chumCaught += 1;
    state.chum = Math.max(0, state.chum - 1);
  }
  state.stats.maxSize = Math.max(state.stats.maxSize, size);
  state.stats.minRate = Math.min(state.stats.minRate, fish.rate);
  state.stats.bestTier = Math.max(state.stats.bestTier, tier);
  state.stats.weatherCaught[weatherId()] = (state.stats.weatherCaught[weatherId()] || 0) + 1;
  if (BAITS[state.castBait]) state.stats.baitCaught[state.castBait] += 1;
  if (state.castBait === 'glow' && fish.rate <= BAITS.glow.rateMax) state.stats.glowRare = true;
  updateDex(fish, size, tier);

  const keep = keepsOnAutoSell(fish, tier);
  const wasFull = basketFull();
  let sold = false;
  if (state.autoSell && !keep) {
    sold = true;
  } else if (!wasFull || keep) {
    state.basket.push({ id: fish.id, b: base, v: value, s: size, tier });
  } else {
    sold = true;
  }
  if (sold) {
    state.coins += value;
    state.stats.soldCoins += value;
    if (marketMult(fish.id) >= MARKET_HOT) state.stats.highSells += 1;
  }

  state.phase = PHASE.LAND;
  state.phaseT = 0;
  state.fight = null;
  state.hold = false;
  bobDip = 1;

  if (!silent) {
    spawnSplash(136, 147, 9);
    particles.push({
      kind: 'fish',
      x: 128, y: 144,
      vx: (Math.random() - 0.5) * 44,
      vy: -95 - Math.random() * 35,
      life: 1.1,
      maxLife: 1.1,
      fish,
    });

    const color = fishColor(fish);
    if (fish.rank >= 2) spawnSpark(136, 136, fish.rank >= 4 ? 22 : 10, color);
    if (tier >= 5) spawnSpark(136, 136, tier >= 8 ? 26 : 14, TIERS[tier - 1].color);
    if (fish.rank >= 4) {
      beep(1046, 0.14, 'square', 0.055);
      beep(1318, 0.18, 'square', 0.055, 0.09);
      beep(1568, 0.22, 'square', 0.05, 0.18);
    } else if (fish.rank >= 2) {
      beep(880, 0.1, 'triangle', 0.045);
    }

    const tierTag = tier > 1 ? `${TIERS[tier - 1].name} ` : '';
    if (tier > 1 || fish.rank >= 2) {
      const fullNow = !sold && basketFull();
      const gain = sold ? `+${value} 🪙` : fullNow ? '已入篓 · 鱼篓满' : '已入篓';
      toast(`${tierTag}${fish.name} ${size}cm ${gain}`, tier > 1 ? TIERS[tier - 1].color : color);
    }
  }

  checkAchievements();
  uiDirty = true;
  save();
  return fish;
}

function failFight(reason) {
  if (state.phase !== PHASE.FIGHT && state.phase !== PHASE.BITE) return;
  state.phase = PHASE.LAND;
  state.phaseT = 0;
  state.fight = null;
  state.hold = false;
  bobDip = 1;
  spawnSplash(136, 147, 6);
  toast(reason, '#ff8a5a');
  beep(300, 0.14, 'sawtooth', 0.04);
  beep(180, 0.2, 'sawtooth', 0.04, 0.11);
  save();
}

/** 挂机模式：到点自动提竿，按成功率直接结算，不弹张力条。 */
function autoResolve() {
  if (Math.random() < AUTO_SUCCESS) {
    catchFish(rollFish(), false);
  } else {
    failFight('没咬稳，鱼跑了…');
  }
}

function updateFight(dt) {
  const f = state.fight;
  if (!f) return;
  f.elapsed += dt;

  f.tension += (state.hold ? 58 : -40) * dt;
  f.tension = clamp(f.tension, 0, 100);

  f.center = 50 + Math.sin(f.elapsed * f.tune.speed) * f.tune.amp;

  f.pullLeft -= dt;
  if (f.pullLeft <= 0) {
    f.pullLeft = (f.tune.pullMin + Math.random() * (f.tune.pullMax - f.tune.pullMin)) / 1000;
    const dir = Math.random() < 0.5 ? -1 : 1;
    f.center = clamp(f.center + dir * f.tune.jitter, 22, 78);
    f.shrink = 0.45;
    shake = Math.max(shake, 2.5);
    beep(300 + Math.random() * 80, 0.05, 'square', 0.03);
  }

  if (f.shrink > 0) {
    f.shrink -= dt;
    f.half = f.baseHalf * 0.65;
  } else {
    f.half = f.baseHalf;
  }

  const inZone = Math.abs(f.tension - f.center) <= f.half;
  if (inZone) {
    f.inZone += dt;
    f.progress += 26 * dt;
  } else {
    f.progress -= 12 * dt;
  }
  f.progress = clamp(f.progress, 0, 100);

  if (f.tension < 4) f.slack += dt; else f.slack = 0;

  f.tick += dt;
  if (f.tick > 0.13) {
    f.tick = 0;
    beep(150 + f.tension * 4, 0.03, 'square', 0.012);
  }

  if (f.tension >= 100) return failFight('线绷断了！');
  if (f.slack > 0.55) return failFight('鱼线松了，脱钩了');
  if (f.progress >= 100) return catchFish(f.fish, false);
  if (f.elapsed >= FIGHT_MAX) return failFight('鱼挣扎太久，跑了');
}

function update(dt, t) {
  state.phaseT += dt;

  // 天气轮换（20 分钟）
  const w = currentWeather();
  if (!curWeather) {
    curWeather = w;
  } else if (w.id !== curWeather.id) {
    curWeather = w;
    toast(`天气：${w.icon} ${w.name}`, w.color);
    beep(520, 0.08, 'triangle', 0.03);
    beep(700, 0.1, 'triangle', 0.03, 0.08);
  }

  // 鱼塘产币
  const pond = pondRate();
  if (pond > 0) {
    const gain = (pond / 60) * dt;
    state.coins += gain;
    state.stats.pondEarned += gain;
  }

  // 低频检查“持有金币 / 鱼篓种类 / 鱼塘产出”等累积类成就
  achClock += dt;
  if (achClock >= 2) {
    achClock = 0;
    checkAchievements();
  }

  switch (state.phase) {
    case PHASE.IDLE:
      if (basketFull()) {
        state.phaseT = 0;
        break;
      }
      if (state.phaseT > 0.35) startWaiting();
      break;
    case PHASE.WAIT:
      if (state.phaseT >= state.waitFor) startBite();
      break;
    case PHASE.BITE:
      if (state.phaseT >= AUTO_HOOK_AT) autoResolve();
      else if (state.phaseT >= BITE_WINDOW) failFight('鱼跑了');
      break;
    case PHASE.FIGHT:
      updateFight(dt);
      break;
    case PHASE.LAND:
      if (state.phaseT > 0.4) {
        state.phase = PHASE.IDLE;
        state.phaseT = 0;
      }
      break;
    default:
      state.phase = PHASE.IDLE;
      state.phaseT = 0;
  }

  // 粒子物理
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    if (p.kind !== 'ring') {
      p.vy += (p.gravity == null ? 210 : p.gravity) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  // 浮标回弹
  if (bobDip > 0) bobDip = Math.max(0, bobDip - dt * 2.8);
  if (shake > 0) shake = Math.max(0, shake - dt * 18);
}

function loop(now) {
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const t = now / 1000;

  state.lastActive = Date.now();
  update(dt, t);
  render(t, dt);

  requestAnimationFrame(loop);
}

/* ---------------- 存档 ---------------- */
let saveWarned = false;

function save(keepActive) {
  if (!keepActive) state.lastActive = Date.now();
  state.saveVer = SAVE_VERSION;
  try {
    const { castBait, phase, phaseT, waitFor, hold, fight, qualityComp, ...persist } = state;
    localStorage.setItem(SAVE_KEY, JSON.stringify(persist));
  } catch (e) {
    if (!saveWarned) {
      saveWarned = true;
      console.warn('存档写入失败，本局进度可能无法保存', e);
    }
  }
}

function finite(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampInt(v, lo, hi, fallback) {
  return Math.min(hi, Math.max(lo, Math.floor(finite(v, fallback))));
}

function normalizeBasketItem(item) {
  if (typeof item === 'string' && FISH_MAP[item]) {
    const base = FISH_MAP[item].value;
    return { id: item, b: base, v: base, s: 0, tier: 1 };
  }
  if (!item || typeof item !== 'object' || !FISH_MAP[item.id]) return null;
  const fallback = FISH_MAP[item.id].value;
  const v = Math.max(1, Math.floor(finite(item.v, fallback)));
  return {
    id: item.id,
    b: Math.max(1, Math.floor(finite(item.b, v))),
    v,
    s: Math.max(0, Math.min(9999, Math.floor(finite(item.s, 0)))),
    tier: clampInt(item.tier, 1, TIERS.length, 1),
  };
}

/** 所有持久化字段的统一入口：坏档、旧档、手改档都收敛到可玩状态。 */
function ensureState() {
  state.saveVer = SAVE_VERSION;
  state.coins = Math.max(0, Math.min(1e12, finite(state.coins, 0)));
  state.rod = clampInt(state.rod, 1, 999, 1);
  // 第 r 段淬炼是在 Lv.5r 买的，所以 Lv.25 刚淬到第 5 段是合法状态
  state.rodRefine = Math.min(
    clampInt(state.rodRefine, 0, 199, 0),
    Math.floor(state.rod / ROD_REFINE_EVERY)
  );
  state.basketLv = clampInt(state.basketLv, 1, 999, 1);
  state.totalCaught = clampInt(state.totalCaught, 0, 1e9, 0);
  state.autoSell = Boolean(state.autoSell);
  state.autoSellOwned = Boolean(state.autoSellOwned || state.autoSell);
  state.food = clampInt(state.food, 0, 1e9, 0);
  state.charms = clampInt(state.charms, 0, 1e9, 0);
  state.pondSlots = clampInt(state.pondSlots, 3, 6, 3);
  state.marketSel = FISH_MAP[state.marketSel] ? state.marketSel : FISH[0].id;
  state.marketSeed = clampInt(state.marketSeed, 1, 2147483647, Math.floor(Math.random() * 2147483646) + 1);
  state.lastActive = finite(state.lastActive, Date.now());
  if (state.lastActive <= 0 || state.lastActive > Date.now() + 60000) state.lastActive = Date.now();

  if (!state.dex || typeof state.dex !== 'object' || Array.isArray(state.dex)) state.dex = {};
  for (const id of Object.keys(state.dex)) if (!FISH_MAP[id]) delete state.dex[id];
  if (!state.dexStats || typeof state.dexStats !== 'object' || Array.isArray(state.dexStats)) state.dexStats = {};
  for (const id of Object.keys(state.dexStats)) if (!FISH_MAP[id]) delete state.dexStats[id];

  const rawBasket = Array.isArray(state.basket) ? state.basket : [];
  const rawPond = Array.isArray(state.pond) ? state.pond : [];
  state.qualityComp = 0;
  state.qualityPaid = Boolean(state.qualityPaid);
  if (!state.qualityPaid) {
    // v8：旧搏鱼星级不再保留，篓里和塘里的鱼按 0.6 / 1.5 倍基础价一次性折算金币
    let comp = 0;
    for (const raw of rawBasket) {
      if (!raw || typeof raw !== 'object' || !FISH_MAP[raw.id]) continue;
      const q = clampInt(raw.q, 0, 2, 0);
      if (q) comp += Math.round(itemBase(raw) * (q === 2 ? 1.5 : 0.6));
    }
    for (const slot of rawPond) {
      if (!slot || !FISH_MAP[slot.id]) continue;
      const q = clampInt(slot.q, 0, 2, 0);
      if (!q) continue;
      let tier = Math.floor(Number(slot.tier) || 0);
      if (tier < 1 || tier > TIERS.length) {
        const star = Math.max(1, Math.floor(Number(slot.star) || 1));
        const lv = Math.max(1, Math.floor(Number(slot.lv) || 1));
        tier = Math.min(TIERS.length, Math.max(1, star + Math.floor((lv - 1) / 3)));
      }
      comp += Math.round(FISH_MAP[slot.id].value * TIERS[tier - 1].mult * (q === 2 ? 1.5 : 0.6));
    }
    state.qualityPaid = true;
    if (comp > 0) {
      state.coins += comp;
      state.qualityComp = comp;
    }
  }

  state.basket = rawBasket.map(normalizeBasketItem).filter(Boolean).slice(0, 500);

  // v7 起移除订单模块，旧档里的字段顺手清掉，避免一直存着
  delete state.orders;
  delete state.ordersDay;
  if (state.stats) delete state.stats.ordersDone;
  if (state.ach) {
    delete state.ach.order1;
    delete state.ach.order10;
  }

  ensureMeta();
  ensurePond();
  ensureDexStats();
  for (const slot of state.pond) {
    if (slot) state.stats.bestTier = Math.max(state.stats.bestTier, slot.tier);
  }
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || Array.isArray(s)) throw new Error('invalid save shape');
    const wasMigrated = Boolean(s.qualityPaid);
    state.qualityComp = 0;
    state.qualityPaid = wasMigrated;
    Object.assign(state, s);
    ensureState();
    // 迁移后立刻落盘（保留 lastActive，交回 init 做离线结算），避免下次重复折算
    if (!wasMigrated) save(true);
    state.castBait = 'worm';
    // 瞬时状态一律从干净的抛竿开始
    state.phase = PHASE.IDLE;
    state.phaseT = 0;
    state.waitFor = 0;
    state.hold = false;
    state.fight = null;
    return true;
  } catch (e) {
    console.warn('存档损坏，已保留原始副本并重新开始', e);
    if (raw) {
      try { localStorage.setItem(`${SAVE_KEY}_corrupt`, raw); } catch (err) { /* 存档空间不足时忽略 */ }
    }
    return false;
  }
}

function settleOffline(since) {
  const now = Date.now();
  const elapsed = Math.min((now - since) / 1000, MAX_OFFLINE);
  if (elapsed < 10) return null;

  // 用和在线一致的“等待 + 提竿 + 上岸”周期结算，避免离线比在线快太多
  const perFish = fishTime() + 1.55;
  if (state.basket.length >= capacity()) {
    return { elapsed, count: 0, coins: 0, gained: {}, kept: 0, full: true };
  }
  const maxByTime = Math.floor((elapsed / perFish) * AUTO_SUCCESS);
  if (maxByTime <= 0) {
    return { elapsed, count: 0, coins: 0, gained: {}, kept: 0, full: false };
  }

  let count = 0;
  let coins = 0;
  let kept = 0;
  let full = false;
  const gained = {};
  for (let i = 0; i < maxByTime; i++) {
    if (state.basket.length >= capacity()) {
      full = true;
      break;
    }
    // 离线不消耗鱼饵/窝料、不吃天气/打窝加成，但尺寸/图鉴/行情与在线一致
    const f = rollFish({ weather: 'none', bait: 'worm', chum: false });
    const range = f.size || [10, 100];
    const t = Math.pow(Math.random(), 0.7);
    const size = Math.round(range[0] + (range[1] - range[0]) * t);
    const tier = rollTier({ chum: false });
    const base = Math.max(1, Math.round(f.value * (0.85 + 0.9 * t) * (1 + dexBonus()) * TIERS[tier - 1].mult));
    const value = Math.max(1, Math.round(base * marketMult(f.id)));
    const keep = !state.autoSell || keepsOnAutoSell(f, tier);

    if (keep) {
      state.basket.push({ id: f.id, b: base, v: value, s: size, tier });
      kept += 1;
    } else {
      coins += value;
      state.stats.soldCoins += value;
      if (marketMult(f.id) >= MARKET_HOT) state.stats.highSells += 1;
    }
    updateDex(f, size, tier);
    state.stats.maxSize = Math.max(state.stats.maxSize, size);
    state.stats.minRate = Math.min(state.stats.minRate, f.rate);
    state.stats.bestTier = Math.max(state.stats.bestTier, tier);
    gained[f.id] = (gained[f.id] || 0) + 1;
    count += 1;
  }
  state.totalCaught += count;
  state.coins += coins;

  return { elapsed, count, coins, gained, kept, full };
}

/* ---------------- 提竿与收线 ---------------- */
cvs.addEventListener('pointerdown', (e) => {
  if (state.phase === PHASE.BITE) {
    e.preventDefault();
    e.stopPropagation();
    if (hook()) state.hold = true;
    try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
  } else if (state.phase === PHASE.FIGHT) {
    e.preventDefault();
    e.stopPropagation();
    state.hold = true;
    try { cvs.setPointerCapture(e.pointerId); } catch (err) {}
  }
});

window.addEventListener('pointerup', () => { state.hold = false; });
window.addEventListener('pointercancel', () => { state.hold = false; });
window.addEventListener('blur', () => { state.hold = false; });

window.addEventListener('keydown', (e) => {
  if (e.code !== 'Space') return;
  e.preventDefault();
  if (e.repeat) return;
  if (state.phase === PHASE.BITE) {
    if (hook()) state.hold = true;
  } else if (state.phase === PHASE.FIGHT) {
    state.hold = true;
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') state.hold = false;
});
