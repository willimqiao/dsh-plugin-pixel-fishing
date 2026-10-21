// Headless regression test for the pixel-fishing game logic.
// Boots the renderer in a vm with a tiny DOM stub, then drives the real
// functions. Run with:
//   node tools/test-headless.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const here = path.dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const renderer = path.join(here, '..', 'app', 'renderer');
const scripts = ['config.js', 'market.js', 'scene.js', 'game.js', 'ui.js'];

function makeCtx2d() {
  const noop = () => {};
  return {
    fillStyle: '', strokeStyle: '', font: '', lineWidth: 1, globalAlpha: 1,
    imageSmoothingEnabled: false,
    fillRect: noop, fillText: noop, strokeRect: noop, save: noop, restore: noop, translate: noop,
    clearRect: noop, drawImage: noop,
  };
}

function makeElement(id) {
  const listeners = {};
  return {
    id, style: { setProperty() {} }, textContent: '', innerHTML: '', disabled: false, width: 0, height: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); },
    click(extra) {
      const event = Object.assign({ target: this, currentTarget: this, button: 0, preventDefault() {} }, extra);
      (listeners.click || []).forEach(fn => fn(event));
    },
    setPointerCapture() {}, releasePointerCapture() {},
    querySelector() { return makeElement('x'); },
    querySelectorAll() { return []; },
    appendChild() {}, getContext() { return makeCtx2d(); }, toDataURL() { return ''; },
  };
}

const els = new Map();
const storage = new Map();
const rafQueue = [];
let clock = 1000;
let lastStamp = null;

const modalBox = {
  classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  querySelectorAll() { return []; },
  appendChild(el) { if (String(el.className || '').includes('up-stamp')) lastStamp = el.textContent; },
};

const document = {
  hidden: false,
  body: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
  documentElement: { lang: 'zh-CN' },
  getElementById(id) { if (!els.has(id)) els.set(id, makeElement(id)); return els.get(id); },
  querySelector(sel) { return sel === '.modal-box' ? modalBox : null; },
  querySelectorAll() { return []; },
  createElement(tag) { return makeElement(tag); },
  addEventListener() {},
};

const sandbox = {
  console, document,
  window: { addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined },
  localStorage: {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, v),
    removeItem: (k) => storage.delete(k),
  },
  performance: { now: () => clock },
  requestAnimationFrame: (fn) => { rafQueue.push(fn); return rafQueue.length; },
  setInterval: () => 0, clearInterval: () => {},
  // Resolve amplification rolls synchronously so the test can assert results.
  setTimeout: (fn) => { fn(); return 0; },
  clearTimeout: () => {},
  confirm: () => true,
  location: { reload() {} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
for (const file of scripts) {
  vm.runInContext(fs.readFileSync(path.join(renderer, file), 'utf8'), sandbox, { filename: file });
}

const run = (expr) => vm.runInContext(expr, sandbox);
const state = () => run('state');
const phase = () => run('state.phase');
const assert = (ok, msg) => { if (!ok) throw new Error(msg); };

function step(ms) {
  clock += ms;
  const fn = rafQueue.shift();
  if (!fn) throw new Error('no rAF callback');
  fn(clock);
}

function setRandom(seq) {
  run(`Math.random = (function(){ var seq = ${JSON.stringify(seq)}; return function(){ return seq.length ? seq.shift() : 0.5; }; })()`);
}

// ---- fish table: 23 real fish, per-fish rates sum to 100% -------------------
assert(run('FISH.length') === 23, 'fish count should be 23');
assert(run('new Set(FISH.map(f => f.id)).size') === 23, 'duplicate fish ids');
assert(Math.abs(run('FISH.reduce((n, f) => n + f.rate, 0)') - 100) < 1e-9, 'fish rates should sum to 100');
assert(run('FISH.every(f => f.rate > 0 && Number.isInteger(f.rank) && f.rank >= 0 && f.rank <= 5)'), 'fish rate/rank invalid');
assert(run('FISH.every(f => f.value > 0 && Array.isArray(f.size) && f.size[0] < f.size[1])'), 'fish value/size invalid');
assert(run('new Set(FISH.map(f => f.pattern)).size') >= 12, 'not enough fish patterns');

assert(run('fishRateLabel(FISH_MAP.crucian)') === '22%', 'crucian rate label wrong');
assert(run('fishRateLabel(FISH_MAP.koi)') === '2.5%', 'koi rate label wrong');
assert(run('fishRateLabel(FISH_MAP.sword)') === '0.8%', 'sword rate label wrong');
assert(run('fishRateLabel(FISH_MAP.starlight)') === '0.03%', 'starlight rate label wrong');
assert(run('fishRateLabel(FISH_MAP.ghost)') === '0.02%', 'ghost rate label wrong');
assert(run('fishRateLabel(FISH_MAP.coelacanth)') === '0.01%', 'coelacanth rate label wrong');
assert(run('fishRateLabel(FISH_MAP.whaleshark)') === '0.006%', 'whaleshark rate label wrong');
assert(run('fishRateLabel(FISH_MAP.frilled)') === '0.004%', 'frilled shark rate label wrong');
assert(run('fishColor(FISH_MAP.crucian) === "#9aa4b8"'), 'common fish color wrong');
assert(run('fishColor(FISH_MAP.bass) === "#5fcf7a"'), 'uncommon fish color wrong');
assert(run('fishColor(FISH_MAP.grouper) === "#4aa8ff"'), 'rare fish color wrong');
assert(run('fishColor(FISH_MAP.eel) === "#b06cff"'), 'epic fish color wrong');
assert(run('fishColor(FISH_MAP.golden) === "#ffb03a"'), 'legendary fish color wrong');
assert(run('fishColor(FISH_MAP.starlight) === "#ff5c8a"'), 'mythic fish color wrong');
assert(run('fishColor(FISH_MAP.frilled) === "#ff5c8a"'), 'ultra rare fish color wrong');

// ---- M1: bite -> hook -> fight -> catch ------------------------------------
for (let i = 0; i < 3000; i += 1) {
  step(16.7);
  if (phase() === 'bite') break;
}
assert(phase() === 'bite', 'never reached bite');
run('hook(); state.hold = true;');
assert(run('state.fight.tune === RANK_FIGHT[state.fight.fish.rank]'), 'fight tuning not based on hidden rank');
for (let i = 0; i < 1500; i += 1) {
  const f = run('state.fight');
  if (!f) break;
  run(`state.hold = ${f.tension < f.center + f.half * 0.15}`);
  step(16.7);
  if (phase() !== 'fight') break;
}
assert(state().totalCaught >= 1, 'manual fight caught nothing');
assert(state().basket.length >= 1 || state().autoSell, 'catch not stored');
assert(state().basket.every(it => it.tier >= 1 && it.tier <= 10 && !('q' in it)), 'catch tier missing or old quality leaked');

// ---- tiers: wild high-tier catch ------------------------------------------
run('state.basket = []; state.autoSell = false;');
setRandom([0, 0.999999]);       // size roll + top-tier roll
run('catchFish(FISH_MAP.carp, true)');
assert(state().basket.length === 1 && state().basket[0].tier === 10, 'high wild tier not stored');
assert(state().basket[0].b > run('FISH_MAP.carp.value'), 'tier not applied to value');
assert(state().basket[0].q === undefined, 'quality star still stored');

// ---- auto sell keeps diamond+ and rare species -----------------------------
run('state.autoSell = true; state.autoSellOwned = true; state.chum = 0; state.basket = [];');
const soldBefore = state().stats.soldCoins;
setRandom([0, 0]);
run('catchFish(FISH_MAP.carp, true)');
assert(state().basket.length === 0 && state().stats.soldCoins > soldBefore, 'common catch was not auto sold');

const soldAfterCommon = state().stats.soldCoins;
setRandom([0, 0.99]);
run('catchFish(FISH_MAP.carp, true)');
assert(state().basket.length === 1 && state().basket[0].tier === 5, 'diamond tier was not kept');
assert(state().stats.soldCoins === soldAfterCommon, 'diamond tier was auto sold');

setRandom([0, 0]);
run('catchFish(FISH_MAP.golden, true)');
assert(state().basket.length === 2 && state().basket[1].id === 'golden', 'rare species was not kept');
assert(state().stats.soldCoins === soldAfterCommon, 'rare species was auto sold');
run('state.autoSell = false; state.basket = [];');

// ---- full basket pauses fishing even when auto sell is on ------------------
run('state.phase = PHASE.IDLE; state.phaseT = 1; state.autoSell = true; state.basket = Array.from({ length: capacity() }, () => ({ id: "carp", b: 1, v: 1, s: 10, tier: 1 }));');
run('update(0.5, 1);');
assert(state().phase === 'idle', 'full basket did not pause fishing');
run('state.autoSell = false; state.basket = [];');

// ---- offline auto sell keeps high grade and pauses when full ---------------
run('state.autoSell = true; state.basket = Array.from({ length: capacity() }, () => ({ id: "carp", b: 1, v: 1, s: 10, tier: 1 }));');
run('var __origRollFish = rollFish, __origRollTier = rollTier; rollFish = () => FISH_MAP.carp; rollTier = () => 5;');
const blockedOffline = run('settleOffline(Date.now() - 60000)');
assert(blockedOffline.full === true && blockedOffline.count === 0, 'offline did not pause on full basket');
assert(state().basket.length === run('capacity()'), 'offline added past capacity');

run('rollTier = () => 1;');
const stoppedOffline = run('settleOffline(Date.now() - 60000)');
assert(stoppedOffline.full === true && stoppedOffline.count === 0 && stoppedOffline.coins === 0, 'offline kept fishing with full basket');

run('state.basket = []; rollTier = () => 5;');
const keptOffline = run('settleOffline(Date.now() - 60000)');
assert(keptOffline.kept > 0 && keptOffline.coins === 0 && state().basket.length === keptOffline.kept, 'offline did not keep high grade fish');
run('rollFish = __origRollFish; rollTier = __origRollTier; state.autoSell = false; state.basket = [];');
setRandom([0.5]);

// ---- M2: dex ---------------------------------------------------------------
run('state.dexStats = {}; state.dex = {}; ensureDexStats(); updateDex(FISH_MAP.carp, 40);');
assert(state().dexStats.carp.n === 1 && state().dexStats.carp.max === 40, 'dex not updated');
assert(state().dexStats.carp.bestQ === undefined && state().dexStats.carp.bestTier === undefined, 'dex still stores old quality');
run('updateDex(FISH_MAP.carp, 55, 3); updateDex(FISH_MAP.carp, 60, 2);');
assert(state().dexStats.carp.n === 3 && state().dexStats.carp.bestTier === 3, 'best tier not recorded or lowered by a worse fish');
assert(run('eternalCount()') === 0, 'eternal count should be zero before any eternal fish');
run('updateDex(FISH_MAP.carp, 70, 10);');
assert(state().dexStats.carp.bestTier === 10 && run('eternalCount()') === 1, 'eternal tier not recorded');
run('var __pond0 = state.pond, __basket0 = state.basket, __dex0 = state.dex, __dexStats0 = state.dexStats;');
run('state.pond = [{id:"koi", tier:10}]; state.basket = [{id:"eel", tier:7}]; state.dex = {}; state.dexStats = {}; ensureDexStats();');
assert(run('bestTierOf("koi")') === 10 && run('bestTierOf("eel")') === 7 && run('eternalCount()') === 1, 'pond/basket tiers not seeded into dex records');
run('state.pond = __pond0; state.basket = __basket0; state.dex = __dex0; state.dexStats = __dexStats0;');
assert(run('dexCount()') === 1, 'dex count wrong');
run('var __dex = state.dexStats; state.dexStats = Object.fromEntries(FISH.map(f => [f.id, {n:1,max:0,first:1}])); if (dexBonus() !== 0.15) throw new Error("full dex bonus wrong"); state.dexStats = __dex;');

// ---- weights: weather / bait / rod / chum ---------------------------------
run('state.rod = 1; state.castBait = "worm"; state.chum = 0; curWeather = WEATHERS[0];');
const koiSun = run('fishWeight(FISH_MAP.koi)');
const goldenWorm = run('fishWeight(FISH_MAP.golden)');
const carpWorm = run('fishWeight(FISH_MAP.carp)');
run('curWeather = WEATHERS[1];');
const koiRain = run('fishWeight(FISH_MAP.koi)');
const eelRain = run('fishWeight(FISH_MAP.eel)');
run('curWeather = WEATHERS[0];');
const eelSun = run('fishWeight(FISH_MAP.eel)');
run('state.castBait = "glow";');
const goldenGlow = run('fishWeight(FISH_MAP.golden)');
const carpGlow = run('fishWeight(FISH_MAP.carp)');
assert(koiSun > koiRain * 2.4, 'sunny does not boost koi');
assert(eelRain > eelSun * 3.4, 'rain does not boost eel');
assert(Math.abs(goldenGlow / goldenWorm - 1.4) < 1e-9, 'glow bait does not boost <=3% fish');
assert(Math.abs(carpGlow - carpWorm) < 1e-9, 'glow bait boosted common fish');
run('curWeather = WEATHERS[2]; state.castBait = "worm";');
const lanternNight = run('fishWeight(FISH_MAP.lantern)');
const lanternSun = (() => { run('curWeather = WEATHERS[0];'); return run('fishWeight(FISH_MAP.lantern)'); })();
assert(lanternNight > lanternSun * 3.9, 'night does not boost lantern fish');

run('curWeather = WEATHERS[2];');
const coelacanthNight = run('fishWeight(FISH_MAP.coelacanth)');
run('curWeather = WEATHERS[0];');
const coelacanthSun = run('fishWeight(FISH_MAP.coelacanth)');
assert(coelacanthNight > coelacanthSun * 1.9, 'night does not boost coelacanth');
const whalesharkSun = run('fishWeight(FISH_MAP.whaleshark)');
run('curWeather = WEATHERS[1];');
const whalesharkRain = run('fishWeight(FISH_MAP.whaleshark)');
assert(whalesharkSun > whalesharkRain * 1.9, 'sunny does not boost whale shark');
const frilledRain = run('fishWeight(FISH_MAP.frilled)');
run('curWeather = WEATHERS[0];');
const frilledSun = run('fishWeight(FISH_MAP.frilled)');
assert(frilledRain > frilledSun * 1.9, 'rain does not boost frilled shark');

run('state.rod = 21; curWeather = WEATHERS[0]; state.castBait = "worm";');
const starlightBoost = run('fishWeight(FISH_MAP.starlight) / FISH_MAP.starlight.rate');
const crucianBoost = run('fishWeight(FISH_MAP.crucian) / FISH_MAP.crucian.rate');
assert(starlightBoost > 5.5, 'rod does not boost rare fish enough');
assert(Math.abs(crucianBoost - 1) < 1e-9, 'rod boosted common fish');
run('state.rod = 1;');
setRandom([0]);
assert(run('rollFish().id') === 'crucian', 'rollFish first weight wrong');
setRandom([0.999999]);
assert(run('rollFish().id === FISH[FISH.length - 1].id'), 'rollFish last weight wrong');

run('state.chum = 10; curWeather = WEATHERS[0]; state.castBait = "worm"; state.rod = 1;');
const lanternChum = run('fishWeight(FISH_MAP.lantern)');
const carpChum = run('fishWeight(FISH_MAP.carp)');
assert(Math.abs(lanternChum / lanternSun - 3) < 1e-9, 'chum does not triple <=2% fish');
assert(Math.abs(carpChum - carpWorm) < 1e-9, 'chum boosted common fish');
run('state.chum = 0;');

// ---- M3: pond + amplification ---------------------------------------------
// 本段只验升级扣费，关掉成就奖励，避免奖励金币混进断言
run('var __checkAch = checkAchievements; checkAchievements = function(){};');
run('state.basket = [{id:"carp", v:20, s:40, tier:1}]; state.food = 1000; state.charms = 0; state.coins = 1000; ensurePond(); state.dexStats.carp.bestTier = 0; putInPond(0,0);');
assert(state().pond[0].tier === 1, 'pond fish tier wrong');
assert(state().pond[0].q === undefined, 'pond still stores old quality');
assert(run('bestTierOf("carp")') === 1, 'putInPond did not record best tier');

setRandom([0]);                 // success
lastStamp = null;
run('amplify(0)');
assert(state().pond[0].tier === 2, 'amplify success failed');
assert(run('bestTierOf("carp")') === 2, 'pond upgrade did not record best tier');
assert(state().food === 976 && state().coins === 940, 'amplify food/coin cost wrong');
assert(lastStamp === '升级成功', 'success stamp missing');

run('state.pond[0].luck = 0;');
setRandom([0.99, 0.99]);        // fail, no drop
lastStamp = null;
run('amplify(0)');
assert(state().pond[0].tier === 2 && state().pond[0].luck === 8, 'fail/luck wrong');
assert(state().food === 916 && state().coins === 790, 'failed upgrade cost wrong');
assert(lastStamp === '升级失败', 'plain failure played success feedback');

run('state.pond[0].tier = 3; state.pond[0].luck = 0;');
setRandom([0.99, 0.1]);         // fail + drop
lastStamp = null;
run('amplify(0)');
assert(state().pond[0].tier === 2, 'drop tier wrong');
assert(state().food === 766 && state().coins === 430, 'drop cost wrong');
assert(lastStamp === '升级失败', 'drop did not show failure stamp');

run('state.pond[0].tier = 4; state.pond[0].luck = 0; state.food = 1000; state.coins = 2000; state.charms = 1;');
setRandom([0.99, 0.0]);         // fail + destroy risk, charm saves
lastStamp = null;
run('amplify(0)');
assert(state().pond[0] && state().pond[0].tier === 4, 'charm did not protect');
assert(state().charms === 0, 'charm not consumed');
assert(state().food === 640 && state().coins === 1200, 'charm-saved cost wrong');
assert(lastStamp === '保护符生效', 'charm stamp missing');

run('state.charms = 0;');
setRandom([0.99, 0.0]);         // destroy
run('amplify(0)');
assert(state().pond[0] === null, 'fish not destroyed');
assert(state().food === 460 && state().coins === 800, 'destroy refund wrong');

run('state.food = 1000; state.coins = 1000; state.pond[0] = {id:"carp", s:40, tier:4, luck:100, born:Date.now()};');
setRandom([0.999]);             // pity -> guaranteed
run('amplify(0)');
assert(state().pond[0].tier === 5, 'pity failed');
assert(state().food === 640 && state().coins === 200, 'pity cost wrong');

run('state.coins = 1000; state.charms = 0; buyCharm(0);');
assert(state().charms === 1 && state().coins === 400, 'charm purchase wrong');

run('state.pond[0] = {id:"carp", tier:10, luck:0, born:Date.now()}; state.food = 1000;');
run('amplify(0)');
assert(state().pond[0].tier === 10 && state().food === 1000, 'max tier upgrade not blocked');

run('state.food = 0; state.pond[0] = {id:"carp", tier:3, feed:10, born:Date.now()}; ensurePond();');
assert(state().food === 10 && state().pond[0].luck === 5, 'feed migration wrong');
run('checkAchievements = __checkAch;');

// ---- M3: market ------------------------------------------------------------
run('state.marketSeed = 123456789;');
const fishIds = run('FISH.map(f => f.id)');
for (const id of fishIds) {
  const m = run(`marketMult(${JSON.stringify(id)}, 1700000000000)`);
  assert(m >= 0.7 && m <= 1.35, 'market multiplier out of range: ' + id);
}
const candles = run('marketCandles("crucian", 1700000000000)');
assert(candles.length === 10, 'market candle count wrong');
assert(candles.filter(c => c.live).length === 1, 'market live candle wrong');
assert(candles.every(c => c.h >= c.l && c.h >= Math.max(c.o, c.c) && c.l <= Math.min(c.o, c.c)), 'candle OHLC invalid');
assert(
  run('marketMult("crucian", 1700000000000)') === run('marketMult("crucian", 1700000000000)'),
  'market not deterministic'
);
const priceA = run('marketMult("carp", 1700000000000)');
const priceB = run('marketMult("carp", 1700000060000)');
assert(Math.abs(priceA - priceB) > 1e-6, 'market price did not change per minute');

let hiNow = 0, loNow = 0, hi = 0, lo = 2;
for (let i = 0; i < 240; i += 1) {
  const now = 1700000000000 + i * 60000;
  const m = run(`marketMult("carp", ${now})`);
  if (m > hi) { hi = m; hiNow = now; }
  if (m < lo) { lo = m; loNow = now; }
}
assert(hi - lo > 0.08, 'market range too flat');
const highVal = run(`saleValue({id:"carp", b:100, v:100}, ${hiNow})`);
const lowVal = run(`saleValue({id:"carp", b:100, v:100}, ${loNow})`);
assert(highVal > lowVal, 'market sale value not responsive');
assert(run('MARKET_VOL[5] > MARKET_VOL[0]'), 'rare fish market volatility not higher');

// ---- M3: shop / bait -------------------------------------------------------
run('state.coins = 1000; state.food = 0; buyFood(100, 450);');
assert(state().food === 100 && state().coins === 550, 'buy food wrong');
run('state.bait = {sel:"worm", shrimp:0, glow:0}; state.coins = 1000; buyBait("shrimp", 10, 60);');
assert(state().bait.shrimp === 10 && state().coins === 940, 'buy bait wrong');

run('state.bait = {sel:"shrimp", shrimp:2, glow:0}; startWaiting();');
assert(state().castBait === 'shrimp' && state().bait.shrimp === 1, 'bait not consumed per cast');
assert(state().waitFor < run('fishTime()'), 'shrimp speed not applied');
run('startWaiting();');
assert(state().bait.sel === 'worm' && state().castBait === 'shrimp', 'bait fallback wrong');
run('startWaiting();');
assert(state().castBait === 'worm', 'worm fallback wrong');

run('state.rod = 1;');
assert(run('fishTime()') === 10, 'base fishing time should be 10s');
run('state.rod = 999;');
assert(run('fishTime()') === 6, 'fastest fishing time should be 6s');
run('state.rod = 5; state.bait = {sel:"shrimp", shrimp:5, glow:0};');
setRandom([0]);
run('startWaiting();');
assert(state().waitFor === 6, 'fishing wait should clamp at 6s');
run('state.rod = 1; state.bait = {sel:"worm", shrimp:0, glow:0};');

// ---- chum: coin sink for rare chances -------------------------------------
assert(run('CHUM.cost === 600 && CHUM.catches === 10 && CHUM.max === 30'), 'chum config wrong');
assert(run('CHUM.rateMax === 2 && CHUM.rareMult === 3 && CHUM.tierMult === 2'), 'chum multipliers wrong');

const twBase = run('tierWeights(false)');
const twChum = run('tierWeights(true)');
assert(twChum[4] === twBase[4] * 2, 'chum did not double tier5 weight');
assert(twChum[3] === twBase[3], 'chum changed tier4 weight');

run('state.chum = 0; state.coins = 1000; buyChum();');
assert(state().chum === 10 && state().coins === 400, 'buy chum wrong');
run('state.chum = 25; state.coins = 1000; buyChum();');
assert(state().chum === 30 && state().coins === 700, 'partial chum purchase wrong');
run('state.chum = 30; state.coins = 1000; buyChum();');
assert(state().chum === 30 && state().coins === 1000, 'full chum purchase charged');

run('state.chum = 2; state.basket = []; state.autoSell = false;');
setRandom([0, 0.999999]);
run('catchFish(FISH_MAP.carp, true)');
assert(state().chum === 1, 'chum not consumed on catch');
assert(state().stats.chumCaught === 1, 'chumCaught not tracked');

run('state.chum = 10; state.autoSell = true; state.rod = 1;');
const offlineChum = run('settleOffline(Date.now() - 60000)');
assert(offlineChum.count > 0 && state().chum === 10, 'offline consumed chum');
run('state.chum = 0; state.autoSell = false;');

// ---- M3: economy -----------------------------------------------------------
const sellCoinsBefore = state().coins;
run('state.food = 0; state.basket = [{id:"carp", b:100, v:100}]; sellBasket();');
assert(state().food === 0, 'selling still gives food');
assert(state().coins > sellCoinsBefore, 'selling gave no coins');

run('state.autoSell = true; ensureMeta();');
assert(state().autoSellOwned === true, 'auto sell ownership not migrated');
run('state.autoSell = false; ensureMeta();');
assert(state().autoSellOwned === true, 'auto sell ownership lost');

// ---- balance / upgrade odds ------------------------------------------------
run('state.rod = 1; state.basketLv = 1;');
assert(run('rodCost()') === 60 && run('basketCost()') === 50, 'starting costs changed unexpectedly');
run('state.rod = 2; state.basketLv = 2;');
assert(run('rodCost()') === 102 && run('basketCost()') === 82, 'cost curve wrong');
run('state.rod = 1; state.basketLv = 1;');
assert(run('TIERS.length') === 10, 'tier ladder should have 10 steps');
assert(run('TIERS.map(t => t.name).join(",")') === '普通,白银,黄金,铂金,钻石,星耀,王者,荣耀,传奇,永恒', 'tier names changed');
assert(run('AMP_CHANCE.every((c, i, a) => i === 0 || c < a[i - 1])'), 'upgrade odds not decreasing');
assert(run('AMP_CHANCE[0] <= 0.6'), 'upgrade odds still too high');
assert(run('AMP_COIN_COST.length === AMP_COST.length'), 'upgrade coin cost length wrong');
assert(run('AMP_COIN_COST.every((c, i, a) => i === 0 || c > a[i - 1])'), 'upgrade coin cost not increasing');
assert(run('AMP_COIN_COST[0] === 60 && AMP_COIN_COST[8] === 40000'), 'upgrade coin cost table wrong');
assert(run('FOOD_PACKS.every(p => p.cost / p.food >= 4)'), 'food packs too cheap');
assert(run('POND_EXPAND[0] >= 1000 && POND_EXPAND.length === 3'), 'pond expansion table wrong');
run('state.pondSlots = 3; state.food = 0; state.charms = 0; ensurePond(); state.coins = 5000; document.getElementById("pondExpand").click();');
assert(state().pondSlots === 4 && state().pond.length === 4 && state().coins === 3800, 'pond expand button not wired');
run('state.coins = 100; document.getElementById("pondExpand").click();');
assert(state().pondSlots === 4 && state().coins === 100, 'poor pond expansion charged anyway');
run('state.coins = 100000; document.getElementById("pondExpand").click(); document.getElementById("pondExpand").click();');
assert(state().pondSlots === 6 && state().pond.length === 6, 'pond expansion did not reach six slots');
run('document.getElementById("pondExpand").click();');
assert(state().pondSlots === 6 && state().pond.length === 6, 'pond expanded past the six-slot cap');

// ---- rod refine ------------------------------------------------------------
run('state.rod = 5; state.rodRefine = 0; state.coins = 1000000; ensureState();');
assert(run('rodRefineLevel()') === 5, 'first refine gate wrong');
assert(run('rodRefineCost()') === 1002, 'first refine cost wrong');
run('state.rod = 4; document.getElementById("refineRod").click();');
assert(state().rodRefine === 0 && state().coins === 1000000, 'refine allowed below rod 5');
run('state.rod = 5; state.coins = 1001; document.getElementById("refineRod").click();');
assert(state().rodRefine === 0 && state().coins === 1001, 'refine charged without enough coins');
run('state.coins = 1002; document.getElementById("refineRod").click();');
assert(state().rodRefine === 1 && state().coins === 0, 'refine purchase wrong');
assert(run('rodStage().rod') === '乌木竿' && run('rodStage().title') === '溪畔钓客', 'refine stage/title wrong');
assert(run('rodRefineLevel()') === 10 && run('rodRefineCost()') === 14230, 'second refine gate/cost wrong');
assert(run('rodStage(9).rod') === '无双竿' && run('rodStage(9).title') === '无双钓神', 'refine overflow fallback wrong');
run('state.rod = 4; state.rodRefine = 3; ensureState();');
assert(state().rodRefine === 0, 'refine stages not capped by rod level');
run('state.rod = 12; state.rodRefine = 99; ensureState();');
assert(state().rodRefine === 2, 'refine stage cap wrong for rod 12');
run('state.rod = 25; state.rodRefine = 5; ensureState();');
assert(state().rodRefine === 5, 'freshly bought refine stage was rolled back on load');

run('state.rod = 1; state.rodRefine = 0; state.castBait = "worm"; state.chum = 0; curWeather = WEATHERS[0];');
const goldenBase = run('fishWeight(FISH_MAP.golden)');
const carpBase = run('fishWeight(FISH_MAP.carp)');
run('state.rodRefine = 3;');
const goldenRefined = run('fishWeight(FISH_MAP.golden)');
const carpRefined = run('fishWeight(FISH_MAP.carp)');
assert(Math.abs(goldenRefined / goldenBase - 1.36) < 1e-9, 'refine rare weight bonus wrong');
assert(Math.abs(carpRefined - carpBase) < 1e-9, 'refine boosted common fish');
run('state.rodRefine = 0; state.rod = 1;');

// ---- pond rate cap ---------------------------------------------------------
run('var __dex2 = state.dexStats; state.dexStats = Object.fromEntries(FISH.map(f => [f.id, {n:1,max:0,first:1}]));');
assert(run('FISH.every(f => slotRate({ id: f.id, s: 9999, tier: 10 }) <= 90.0001)'), 'pond rate exceeded the 90/min cap');
assert(run('slotRate({ id: "frilled", s: 9999, tier: 10 })') >= 89, 'top fish should reach the cap');
assert(run('slotRate({ id: "whaleshark", s: 9999, tier: 10 })') > run('slotRate({ id: "coelacanth", s: 9999, tier: 10 })'), 'rarer fish should still pay more');
assert(run('slotRate({ id: "carp", s: 9999, tier: 10 })') > 12, 'common fish pond rate too low');
run('state.dexStats = __dex2;');
run('state.pond[0].luck = 0;');
assert(Math.abs(run('ampChance(state.pond[0])') - 0.32) < 1e-9, 'tier3 base chance wrong');
run('state.pond[0].luck = 50;');
assert(Math.abs(run('ampChance(state.pond[0])') - 0.57) < 1e-9, 'luck bonus wrong');
run('state.pond[0].luck = 100;');
assert(run('ampChance(state.pond[0])') === 1, 'luck cap wrong');
run('state.pond[0].luck = 0;');

// ---- per-species selling ---------------------------------------------------
run('state.autoSell = false; state.coins = 0; state.basket = [{id:"carp",b:10,v:10,s:20},{id:"carp",b:12,v:12,s:24,tier:2},{id:"eel",b:30,v:30,s:40}];');
const oneSpecies = run('sellFish("carp")');
assert(oneSpecies > 0, 'selected species sale paid nothing');
assert(state().basket.length === 1 && state().basket[0].id === 'eel', 'selected sale removed wrong fish');
assert(state().coins > 0, 'selected sale gave no coins');
assert(run('sellFish("ghost")') === 0 && state().basket.length === 1, 'empty sale mutated basket');

// ---- achievements ----------------------------------------------------------
assert(run('ACHIEVEMENTS.length') === 37, 'achievement count changed unexpectedly');
assert(run('new Set(ACHIEVEMENTS.map(a => a.id)).size') === 37, 'duplicate achievement ids');
assert(run('ACHIEVEMENTS.every(a => ACH_CATEGORIES.includes(a.cat))'), 'achievement category invalid');
assert(run('ACHIEVEMENTS.filter(a => a.get && a.goal).length') >= 20, 'too few progress achievements');
assert(run('ACHIEVEMENTS.some(a => a.id === "dex20") && ACHIEVEMENTS.some(a => a.id === "chum30")'), 'new achievements missing');
assert(run('ACHIEVEMENTS.find(a => a.id === "dex20").goal') === run('FISH.length'), 'dex achievement goal should match fish count');
assert(run('["eternal6","eternal12","eternal23"].every(id => ACHIEVEMENTS.find(a => a.id === id))'), 'eternal achievements missing');
assert(run('ACHIEVEMENTS.find(a => a.id === "eternal23").goal') === run('FISH.length'), 'eternal achievement goal should match fish count');
run(`var __ach0 = state.ach, __coins0 = state.coins, __dexStats4 = state.dexStats, __dex4 = state.dex;
state.ach = {}; state.coins = 1000;
state.dexStats = Object.fromEntries(FISH.slice(0, 6).map(f => [f.id, {n: 1, max: 0, first: 1, bestTier: 10}]));
ensureDexStats(); checkAchievements();`);
assert(state().ach.eternal6 && !state().ach.eternal12, 'eternal achievement threshold wrong');
run('state.ach = __ach0; state.coins = __coins0; state.dexStats = __dexStats4; state.dex = __dex4;');
run('state.ach = {}; state.coins = 20000; ensureDexStats();');
const achBefore = state().coins;
run('checkAchievements()');
assert(state().ach.coin10k && state().ach.coin1k, 'coin achievements not unlocked');
const achRewards = run('ACHIEVEMENTS.reduce((n, a) => n + (state.ach[a.id] ? a.reward : 0), 0)');
assert(state().coins === achBefore + achRewards, 'achievement reward mismatch');
run('state.coins = 5000;');
const progress = run('achProgress(ACHIEVEMENTS.find(a => a.id === "coin10k"))');
assert(progress && progress.cur === 5000 && Math.abs(progress.pct - 50) < 0.01, 'achievement progress wrong');

// ---- robust state + corrupt save ------------------------------------------
run(`state.qualityPaid = true; state.coins = NaN; state.rod = -5; state.basketLv = "x"; state.food = -9; state.charms = "5"; state.chum = 999;
state.pondSlots = 99; state.marketSel = "dragon"; state.lastActive = -1;
state.basket = ["carp", null, {id:"dragon"}, {id:"carp", v:-5, b:"bad", s:-1, q:9}];
state.dex = {nope: 5, carp: "3"};
state.dexStats = {carp: {n: -2, max: "x", bestQ: 8}, nope: {n: 1}};
state.stats = {perfects: -4, bestStreak: "7", bestRarity: 99, weatherCaught: null, baitCaught: {shrimp: -3}, bestTier: 99, ordersDone: 5};
state.pond = [{id:"dragon"}, {id:"carp", tier:99, s:-4, q:4}, null];
state.orders = [{id:"dragon", qty:99}]; state.ordersDay = "2026-1-1"; state.ach = {order1: 1, order10: 1, first: 1};
ensureState();`);
const robust = state();
assert(robust.coins === 0 && robust.rod === 1 && robust.basketLv === 1, 'numeric state not clamped');
assert(robust.food === 0 && robust.charms === 5 && robust.chum === 30 && robust.pondSlots === 6, 'food/charms/chum/slots not normalized');
assert(robust.marketSel === 'crucian', 'unknown market selection kept');
assert(robust.basket.length === 2 && robust.basket.every(it => it.id === 'carp' && it.v >= 1 && it.s >= 0 && it.tier >= 1 && !('q' in it)), 'basket not sanitized');
assert(!('nope' in robust.dex) && !('nope' in robust.dexStats), 'unknown dex entries kept');
assert(robust.dexStats.carp.n === 3 && robust.dexStats.carp.max === 0 && !('bestQ' in robust.dexStats.carp), 'dex record not normalized');
assert(robust.dexStats.carp.bestTier === 10, 'dex best tier not clamped or seeded from pond');
assert(robust.stats.bestTier === 10 && robust.stats.minRate === 7, 'stat caps/minRate wrong');
assert(!('perfects' in robust.stats) && !('bestRarity' in robust.stats) && !('bestStreak' in robust.stats), 'legacy quality stats kept');
assert(robust.stats.weatherCaught.rain === 0 && robust.stats.baitCaught.shrimp === 0, 'counter stats wrong');
assert(!('orders' in robust) && !('ordersDay' in robust) && !('ordersDone' in robust.stats), 'legacy order fields kept');
assert(!('order1' in robust.ach) && !('order10' in robust.ach) && robust.ach.first === 1, 'order achievements not cleaned');
assert(robust.pond.length === 6 && robust.pond.filter(Boolean).length === 1 && robust.pond.filter(Boolean)[0].tier === 10, 'pond slot not sanitized');
assert(robust.pond.filter(Boolean)[0].q === undefined, 'pond quality leaked');

const corruptRaw = '{"coins":oops';
storage.set('pixel_fisher_v1', corruptRaw);
assert(run('load()') === false, 'corrupt save was accepted');
assert(storage.get('pixel_fisher_v1_corrupt') === corruptRaw, 'corrupt save backup missing');

// ---- v8 migration: one-time quality compensation --------------------------
const legacy = {
  saveVer: 7, coins: 1000, rod: 3, basketLv: 2, food: 50, charms: 0, chum: 0,
  basket: [
    { id: 'carp', b: 100, v: 120, s: 40, q: 2 },
    { id: 'crucian', b: 10, v: 12, s: 20, q: 1 },
    { id: 'koi', b: 50, v: 55, s: 60, q: 0 },
  ],
  pond: [
    { id: 'carp', tier: 3, s: 40, q: 2, born: 123 },
    { id: 'koi', tier: 1, s: 50, q: 1, luck: 20, born: 456 },
  ],
  pondSlots: 3,
  dex: { carp: 5, crucian: 2 },
  dexStats: { carp: { n: 5, max: 80, first: 1, bestQ: 2 }, crucian: { n: 2, max: 30, first: 1, bestQ: 1 } },
  stats: { perfects: 3, bestStreak: 4, bestRarity: 5, bestTier: 5, soldCoins: 0, weatherCaught: { sunny: 1 }, baitCaught: { worm: 1 } },
  ach: { first: 1, perfect1: 1, order1: 1 },
  marketSel: 'carp', marketSeed: 42, lastActive: 1700000000000, totalCaught: 7, autoSell: false,
};
storage.set('pixel_fisher_v1', JSON.stringify(legacy));
assert(run('load()') === true, 'legacy save failed to load');
const migrated = state();
assert(migrated.coins === 1199, 'quality compensation amount wrong: ' + migrated.coins);
assert(migrated.qualityPaid === true && migrated.qualityComp === 199, 'quality compensation flag wrong');
assert(migrated.basket.length === 3 && migrated.basket.every(it => !('q' in it)), 'basket quality not stripped');
assert(migrated.pond.filter(Boolean).every(s => !('q' in s)), 'pond quality not stripped');
assert(migrated.dexStats.carp.bestTier === 3 && migrated.dexStats.koi.bestTier === 1, 'legacy pond quality not recorded as best tier');
assert(!('perfect1' in migrated.ach) && migrated.ach.first === 1, 'quality achievement not cleaned');
assert(!('perfects' in migrated.stats) && !('bestRarity' in migrated.stats), 'quality stats not cleaned');
const migratedRaw = JSON.parse(storage.get('pixel_fisher_v1'));
assert(migratedRaw.saveVer === 8 && migratedRaw.coins === 1199, 'migrated save not written as v8');
assert(migratedRaw.qualityPaid === true && !('qualityComp' in migratedRaw), 'migrated save flags wrong');
assert(migratedRaw.lastActive === 1700000000000, 'migration reset offline timestamp');
assert(migratedRaw.basket.every(it => !('q' in it)), 'migrated save kept basket quality');
assert(run('load()') === true, 'migrated save failed to reload');
assert(state().coins === 1199 && state().qualityComp === 0, 'compensation paid twice');

// ---- UI / sprite smoke -----------------------------------------------------
assert(run('FISH.every(f => typeof f.pattern === "string" && f.pattern.length)'), 'fish pattern missing');
run('FISH.forEach(f => drawFishSprite(ctx, 0, 0, 2, f));');
run('FISH.forEach(f => drawFishIcon(ctx, 0, 0, 2, f));');
run('state.basket = [{id:"carp",b:10,v:10,s:40,tier:3}]; renderBasket(true);');
const basketHtml = els.get('basketList').innerHTML;
assert(basketHtml.includes('鲤鱼') && !basketHtml.includes('★'), 'basket still renders quality stars');
run('renderMarket(true); renderDex(true); renderAch(); renderPond(); updateUI();');
assert(els.get('marketRate').textContent.includes('出率'), 'market rate label missing');
assert(els.get('dexGrid').innerHTML.includes('22%'), 'dex rate label missing');
assert(!els.get('dexGrid').innerHTML.includes('稀有'), 'dex still shows old rarity labels');
assert(els.get('dexGrid').innerHTML.includes('dex-best') && els.get('dexGrid').innerHTML.includes('黄金'), 'dex best tier badge missing');
assert(els.get('dexSummary').innerHTML.includes('永恒勋章'), 'dex medal summary missing');
run('state.rod = 5; state.rodRefine = 1; state.coins = 1000000; updateUI();');
assert(els.get('refineRod').disabled === true && els.get('refineRod').textContent === 'Lv.10', 'refine button should be locked at rod 5');
run('state.rod = 10; updateUI();');
assert(els.get('refineRod').disabled === false && els.get('refineStage').textContent.includes('乌木竿'), 'refine shop label/button wrong');

// ---- persistence -----------------------------------------------------------
run('state.chum = 12; state.rod = 15; state.rodRefine = 2;');
run('save()');
const saved = JSON.parse(storage.get('pixel_fisher_v1'));
assert(typeof saved.food === 'number' && Array.isArray(saved.pond), 'save incomplete');
assert(saved.bait && typeof saved.bait.shrimp === 'number', 'bait not saved');
assert(typeof saved.autoSellOwned === 'boolean', 'auto sell ownership not saved');
assert(saved.chum === 12, 'chum not saved');
assert(saved.rodRefine === 2, 'refine stage not saved');
assert(saved.saveVer === 8, 'save version not bumped');
assert(saved.qualityPaid === true && !('qualityComp' in saved), 'quality compensation leaked into save');
assert(!('q' in saved.basket[0]) && saved.basket.every(it => !('q' in it)), 'quality stars leaked into save');
assert(saved.dexStats.carp && !('bestQ' in saved.dexStats.carp), 'dex quality leaked into save');
assert(saved.dexStats.carp.bestTier === 3, 'best tier not saved');
assert(!('perfects' in saved.stats) && !('bestRarity' in saved.stats), 'legacy quality stats leaked into save');
assert(!('orders' in saved) && !('ordersDay' in saved) && !('ordersDone' in saved.stats), 'legacy order fields leaked into save');
assert(typeof saved.marketSeed === 'number' && saved.marketSeed > 0, 'market seed not saved');
assert(!('phase' in saved) && !('fight' in saved) && !('castBait' in saved), 'transient state leaked');

console.log('PASS  caught=' + state().totalCaught + '  23 fish rates ok  weights ok  pond/upgrade ok  rod refine ok  market ok  shop/chum ok  dex/v8 migration ok  save ok');
