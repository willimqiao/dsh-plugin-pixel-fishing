/* 像素渔场 · 天气与鱼市行情（确定性曲线，不依赖存档） */

/* ---------------- M3：天气 ---------------- */
function currentWeather(now = Date.now()) {
  return WEATHERS[Math.floor(now / WEATHER_TICK_MS) % WEATHERS.length];
}

function weatherRemaining(now = Date.now()) {
  return WEATHER_TICK_MS - (now % WEATHER_TICK_MS);
}

/* ---------------- M3：鱼市行情 ---------------- */
/* 每分钟一个随机价：价格由存档种子与绝对分钟数确定，同一分钟内稳定，
   跨分钟随机游走；图表只取最近 10 分钟。 */
function hash01(n) {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const MARKET_VOL = [0.7, 0.8, 0.95, 1.1, 1.3, 1.55];
const MARKET_LOOKBACK = 24;

function marketNoise(fish, tick) {
  const seed = Math.floor(Number(state.marketSeed) || 1) | 0;
  const idx = FISH_INDEX[fish.id] || 0;
  const n = (seed ^ Math.imul(tick | 0, 0x9e3779b1) ^ Math.imul(idx + 1, 0x85ebca6b) ^ 0x4a3f) | 0;
  return hash01(n);
}

function marketPriceAt(fish, tick) {
  const vol = MARKET_VOL[fish.rank] || 1;
  let p = 1;
  for (let i = MARKET_LOOKBACK; i >= 0; i -= 1) {
    const shock = (marketNoise(fish, tick - i) - 0.5) * 0.22 * vol;
    p = clamp(p + shock + (1 - p) * 0.06, MARKET_MIN, MARKET_MAX);
  }
  return p;
}

function marketTick(now = Date.now()) {
  return Math.floor(now / MARKET_TICK_MS);
}

function marketMult(fishId, now = Date.now()) {
  const fish = FISH_MAP[fishId];
  if (!fish) return 1;
  return marketPriceAt(fish, marketTick(now));
}

function marketCandles(fishId, now = Date.now()) {
  const fish = FISH_MAP[fishId];
  if (!fish) return [];
  const tick = marketTick(now);
  const out = [];
  for (let k = MARKET_CANDLES - 1; k >= 0; k -= 1) {
    const t = tick - k;
    const o = marketPriceAt(fish, t - 1);
    const c = marketPriceAt(fish, t);
    out.push({ o, h: Math.max(o, c), l: Math.min(o, c), c, live: k === 0 });
  }
  return out;
}

function marketDelta(fishId, now = Date.now()) {
  const candles = marketCandles(fishId, now);
  if (candles.length < 2) return 0;
  const prev = candles[candles.length - 2];
  return prev.c ? candles[candles.length - 1].c / prev.c - 1 : 0;
}

function itemBase(item) {
  const b = Number(item && item.b);
  if (Number.isFinite(b) && b > 0) return b;
  const v = Number(item && item.v);
  if (Number.isFinite(v) && v > 0) return v;
  return item && FISH_MAP[item.id] ? FISH_MAP[item.id].value : 0;
}

function saleValue(item, now = Date.now()) {
  if (!item) return 0;
  return Math.max(1, Math.round(itemBase(item) * marketMult(item.id, now)));
}
