/* 像素渔场 · 像素场景、精灵与粒子绘制 */

/* ---------------- Canvas ---------------- */
const cvs = document.getElementById('game');
let ctx = cvs.getContext('2d');
ctx.imageSmoothingEnabled = false;

// 天气过渡只溶解背景，人物和鱼竿仍逐帧实时绘制
const bgCanvas = document.createElement('canvas');
bgCanvas.width = W;
bgCanvas.height = H;
const bgCtx = bgCanvas.getContext('2d');
bgCtx.imageSmoothingEnabled = false;
const prevBg = document.createElement('canvas');
prevBg.width = W;
prevBg.height = H;
const prevBgCtx = prevBg.getContext('2d');
prevBgCtx.imageSmoothingEnabled = false;
const WEATHER_FADE = 1.6;
let lastSceneWeather = '';
let weatherFade = 0;

let leap = null;
let leapIn = 12 + Math.random() * 16;

function px(x, y, w, h, c) {
  ctx.fillStyle = c;
  ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
}
function line(x0, y0, x1, y1, c) {
  ctx.fillStyle = c;
  const steps = Math.max(1, Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    ctx.fillRect(Math.round(x0 + (x1 - x0) * t), Math.round(y0 + (y1 - y0) * t), 1, 1);
  }
}
function rectLines(x, y, w, h, c, step) {
  ctx.fillStyle = c;
  for (let i = 0; i < w; i += step) ctx.fillRect((x + i) | 0, y | 0, Math.min(step - 1, w - i), h);
}

function ditherRow(y, color, phase = 0, step = 2, x0 = 0, x1 = W) {
  ctx.fillStyle = color;
  const off = ((phase % step) + step) % step;
  for (let x = x0 + off; x < x1; x += step) ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

function ditherSeam(y, top, bottom, phase = 0) {
  ditherRow(y - 1, bottom, phase, 2);
  ditherRow(y, top, phase + 1, 2);
  ditherRow(y + 1, top, phase, 4);
}

/* 鱼精灵：9x6 网格，按 pattern 增加花纹 */
function drawFishSprite(g, x, y, s, fish) {
  if (!fish) return;
  const c = fish.colors;
  const long = fish.shape === 'long' || fish.pattern === 'long';
  const R = (gx, gy, gw, gh, col) => {
    g.fillStyle = col;
    g.fillRect(x + gx * s, y + gy * s, gw * s, gh * s);
  };
  const A = fish.accent || c.fin;

  // 尾巴 / 背鳍 / 腹鳍
  R(0, 1, 2, 1, c.fin);
  R(0, 4, 2, 1, c.fin);
  R(1, 2, 1, 2, c.fin);
  R(0, 0, 1, 1, c.fin);

  // 身体
  if (long) {
    R(2, 2, 5, 2, c.body);
    R(2, 1, 4, 1, c.body);
    R(2, 4, 4, 1, c.belly);
    R(1, 2, 1, 1, c.body);
  } else {
    R(2, 1, 5, 4, c.body);
    R(3, 0, 3, 1, c.body);
    R(1, 2, 1, 2, c.body);
    R(3, 3, 3, 1, c.belly);
    R(3, 1, 2, 1, c.belly);
  }
  R(3, 0, 2, 1, c.fin);

  // 眼睛 / 嘴
  R(6, 2, 1, 1, '#0a0a12');
  R(5, 2, 1, 1, '#ffffff');
  R(6, 3, 1, 1, c.fin);

  switch (fish.pattern) {
    case 'scales':
      R(3, 2, 1, 1, c.fin);
      R(5, 2, 1, 1, c.fin);
      R(4, 3, 1, 1, c.fin);
      R(6, 3, 1, 1, c.belly);
      break;
    case 'spots':
      R(3, 1, 1, 1, A);
      R(5, 1, 1, 1, A);
      R(4, 2, 1, 1, A);
      R(3, 3, 1, 1, A);
      break;
    case 'stripes':
      R(3, 1, 1, 3, A);
      R(5, 1, 1, 3, A);
      break;
    case 'whiskers':
      R(7, 3, 1, 1, A);
      R(7, 4, 1, 1, A);
      R(7, 1, 1, 1, A);
      break;
    case 'spines':
      R(2, 0, 1, 1, A);
      R(3, 0, 1, 1, A);
      R(6, 0, 1, 1, A);
      R(2, 4, 1, 1, A);
      R(6, 4, 1, 1, A);
      break;
    case 'long':
      R(4, 2, 1, 1, c.fin);
      R(6, 2, 1, 1, c.fin);
      R(3, 3, 1, 1, c.belly);
      break;
    case 'koi':
      R(2, 2, 2, 1, A);
      R(5, 2, 1, 1, A);
      R(4, 3, 1, 1, A);
      R(6, 1, 1, 1, A);
      break;
    case 'glow':
      R(7, 0, 1, 1, fish.light || '#ffe066');
      R(6, 0, 1, 1, c.fin);
      R(6, 1, 1, 1, fish.light || '#ffe066');
      break;
    case 'bill':
      R(7, 2, 2, 1, c.body);
      R(8, 2, 1, 1, c.belly);
      break;
    case 'shine':
      R(4, 1, 2, 1, '#fff6c0');
      R(3, 3, 1, 1, '#fffbe0');
      R(6, 3, 1, 1, c.fin);
      break;
    case 'stars':
      R(3, 2, 1, 1, '#ffffff');
      R(5, 1, 1, 1, '#ffffff');
      R(4, 3, 1, 1, '#d0f0ff');
      R(6, 3, 1, 1, '#ffffff');
      break;
    case 'flat':
      R(2, 1, 1, 1, A);
      R(4, 2, 1, 1, A);
      R(5, 3, 1, 1, A);
      R(3, 3, 1, 1, c.fin);
      R(2, 3, 1, 1, A);
      break;
    case 'shark':
      R(5, 1, 1, 1, A);
      R(5, 2, 1, 1, A);
      R(5, 3, 1, 1, A);
      R(3, 0, 3, 1, c.fin);
      break;
    case 'sail':
      R(2, 0, 5, 1, A);
      R(3, 0, 1, 1, c.fin);
      R(5, 0, 1, 1, c.fin);
      R(4, 1, 1, 1, A);
      break;
    case 'tuna':
      R(3, 4, 1, 1, '#ffd24a');
      R(4, 4, 1, 1, '#ffd24a');
      R(5, 3, 1, 1, c.belly);
      R(2, 2, 1, 1, c.belly);
      break;
    default:
      break;
  }
}

/* 图标用高精细鱼：22×12 网格，带描边、明暗、鳍条和纹样 */
function shadeHex(hex, amt) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex || '#888888';
  const n = parseInt(h, 16);
  const f = v => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
  const r = f((n >> 16) & 255);
  const g2 = f((n >> 8) & 255);
  const b = f(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g2 << 8) | b).toString(16).slice(1);
}

function drawFishIcon(g, x, y, s, fish) {
  if (!fish) return;
  const c = fish.colors;
  const A = fish.accent || c.fin;
  const long = fish.shape === 'long' || fish.pattern === 'long';
  const OUT = shadeHex(c.fin, -0.5);
  const DARK = shadeHex(c.fin, -0.3);
  const HI = shadeHex(c.body, 0.2);
  const SH = shadeHex(c.body, -0.2);
  const R = (gx, gy, gw, gh, col) => {
    g.fillStyle = col;
    g.fillRect(x + gx * s, y + gy * s, gw * s, gh * s);
  };

  /* 尾巴先画，身体盖住根部 */
  if (long) {
    R(2, 2, 4, 1, OUT);
    R(0, 3, 6, 3, OUT);
    R(1, 6, 5, 1, OUT);
    R(2, 7, 3, 1, OUT);
    R(3, 2, 2, 1, c.fin);
    R(1, 3, 4, 2, c.fin);
    R(2, 5, 3, 1, c.fin);
    R(2, 6, 2, 1, c.fin);
    R(1, 3, 1, 1, DARK);
    R(3, 3, 1, 1, DARK);
    R(2, 5, 1, 1, DARK);
  } else {
    R(2, 1, 3, 1, OUT);
    R(0, 2, 6, 2, OUT);
    R(1, 4, 5, 1, OUT);
    R(1, 7, 5, 1, OUT);
    R(0, 8, 6, 2, OUT);
    R(2, 10, 3, 1, OUT);
    R(3, 1, 1, 1, c.fin);
    R(1, 2, 4, 2, c.fin);
    R(2, 4, 3, 1, c.fin);
    R(2, 7, 3, 1, c.fin);
    R(1, 8, 4, 2, c.fin);
    R(3, 10, 1, 1, c.fin);
    R(4, 4, 2, 3, c.fin);
    R(2, 2, 1, 1, DARK);
    R(2, 8, 1, 1, DARK);
    R(4, 8, 1, 1, DARK);
  }

  /* 背鳍 */
  if (long) {
    R(8, 2, 9, 1, OUT);
    R(9, 2, 7, 1, c.fin);
    R(11, 2, 1, 1, DARK);
    R(14, 2, 1, 1, DARK);
  } else {
    R(8, 0, 4, 1, OUT);
    R(6, 1, 8, 1, OUT);
    R(9, 0, 2, 1, c.fin);
    R(7, 1, 6, 1, c.fin);
    R(8, 1, 1, 1, DARK);
    R(11, 1, 1, 1, DARK);
  }

  /* 身体：外层描边 + 内层填色 */
  const rows = long
    ? [[6, 11, 3], [4, 15, 4], [3, 17, 5], [3, 17, 6], [4, 15, 7], [6, 11, 8]]
    : [[6, 9, 2], [5, 12, 3], [4, 15, 4], [4, 16, 5], [4, 16, 6], [4, 15, 7], [5, 12, 8], [6, 9, 9]];
  for (const [bx, bw, by] of rows) R(bx, by, bw, 1, OUT);
  const fills = long
    ? [[7, 9, 3], [5, 13, 4], [4, 15, 5], [4, 15, 6], [5, 13, 7], [7, 9, 8]]
    : [[7, 7, 2], [6, 10, 3], [5, 13, 4], [5, 14, 5], [5, 14, 6], [5, 13, 7], [6, 10, 8], [7, 7, 9]];
  for (const [bx, bw, by] of fills) R(bx, by, bw, 1, c.body);

  if (long) {
    R(7, 4, 9, 1, HI);
    R(5, 7, 11, 1, c.belly);
    R(6, 8, 9, 1, c.belly);
    R(4, 8, 1, 1, SH);
  } else {
    R(8, 2, 6, 1, HI);
    R(6, 3, 4, 1, HI);
    R(6, 6, 11, 1, c.belly);
    R(6, 7, 10, 1, c.belly);
    R(7, 8, 8, 1, c.belly);
    R(5, 8, 1, 1, SH);
    R(4, 7, 1, 1, SH);
  }
  R(14, 4, 1, long ? 3 : 4, DARK);

  /* 专属纹样 */
  switch (fish.pattern) {
    case 'scales':
      R(6, 4, 1, 1, DARK); R(9, 4, 1, 1, DARK); R(12, 4, 1, 1, DARK);
      R(7, 5, 1, 1, DARK); R(10, 5, 1, 1, DARK); R(13, 5, 1, 1, DARK);
      R(6, 6, 1, 1, DARK); R(9, 6, 1, 1, DARK); R(12, 6, 1, 1, DARK);
      R(7, 7, 1, 1, DARK); R(10, 7, 1, 1, DARK); R(13, 7, 1, 1, DARK);
      R(5, 5, 1, 1, HI); R(8, 6, 1, 1, HI); R(11, 7, 1, 1, HI);
      break;
    case 'spots':
      R(7, 4, 2, 2, A);
      R(11, 3, 1, 1, A); R(13, 5, 1, 2, A);
      R(9, 7, 2, 1, A); R(6, 6, 1, 1, A);
      R(5, 5, 9, 1, shadeHex(c.body, -0.1));
      break;
    case 'stripes':
      R(7, 3, 1, 5, A); R(10, 3, 1, 5, A); R(13, 4, 1, 4, A);
      R(8, 4, 1, 1, DARK); R(11, 5, 1, 1, DARK);
      break;
    case 'whiskers':
      R(20, 5, 1, 1, A); R(21, 4, 1, 1, A);
      R(20, 7, 1, 1, A); R(21, 8, 1, 1, A);
      R(19, 7, 1, 1, DARK);
      break;
    case 'spines':
      R(7, 1, 1, 1, A); R(10, 0, 1, 1, A); R(13, 1, 1, 1, A);
      R(8, 10, 1, 1, A); R(12, 10, 1, 1, A); R(15, 9, 1, 1, A);
      R(5, 4, 1, 1, DARK); R(12, 7, 1, 1, DARK);
      break;
    case 'long':
      R(7, 5, 8, 1, shadeHex(c.body, -0.12));
      R(6, 6, 2, 1, HI); R(11, 6, 2, 1, HI);
      break;
    case 'koi':
      R(7, 3, 3, 1, A); R(6, 4, 2, 2, A);
      R(11, 3, 2, 1, A); R(12, 5, 2, 1, A);
      R(9, 7, 2, 1, A); R(13, 7, 1, 1, A);
      R(14, 2, 1, 1, shadeHex(A, -0.25));
      break;
    case 'glow': {
      const light = fish.light || '#ffe066';
      R(12, 5, 1, 1, light); R(9, 4, 1, 1, light); R(7, 7, 1, 1, light);
      R(5, 5, 1, 1, '#fff8c0');
      R(16, 2, 1, 2, OUT);
      R(16, 0, 2, 2, light);
      R(17, 0, 1, 1, '#fffbe0');
      break;
    }
    case 'bill':
      R(20, 6, 2, 1, c.body);
      R(20, 7, 2, 1, OUT);
      R(21, 6, 1, 1, OUT);
      break;
    case 'shine':
      R(7, 2, 5, 1, '#fff6c0'); R(9, 1, 1, 1, '#fffbe0');
      R(6, 4, 1, 1, '#ffffff'); R(12, 6, 1, 1, '#fff6c0'); R(10, 7, 1, 1, '#fffbe0');
      break;
    case 'stars':
      R(8, 3, 1, 1, '#ffffff'); R(7, 4, 1, 1, '#ffffff');
      R(9, 4, 1, 1, '#ffffff'); R(8, 5, 1, 1, '#ffffff');
      R(12, 5, 1, 1, '#ffffff'); R(11, 6, 1, 1, '#d0f0ff');
      R(13, 6, 1, 1, '#d0f0ff'); R(6, 7, 1, 1, '#ffffff');
      R(10, 4, 1, 1, '#d0f0ff');
      break;
    case 'flat':
      R(7, 4, 2, 1, A); R(10, 3, 1, 1, A); R(12, 5, 1, 2, A);
      R(8, 6, 1, 1, A); R(13, 4, 1, 1, DARK); R(11, 7, 1, 1, HI);
      break;
    case 'shark':
      R(6, 4, 1, 1, DARK); R(6, 5, 1, 1, DARK); R(6, 6, 1, 1, DARK);
      R(5, 2, 1, 1, HI); R(4, 4, 1, 1, c.belly);
      R(8, 0, 1, 1, OUT); R(12, 0, 1, 1, OUT);
      break;
    case 'sail':
      R(8, 0, 1, 1, A); R(9, 0, 2, 1, A); R(11, 1, 1, 1, A);
      R(13, 1, 1, 1, A); R(10, 0, 1, 1, '#fff0a0'); R(12, 1, 1, 1, A);
      break;
    case 'tuna':
      R(5, 4, 1, 1, '#ffd24a'); R(5, 6, 1, 1, '#ffd24a'); R(6, 7, 1, 1, '#ffd24a');
      R(10, 3, 1, 1, HI); R(12, 4, 1, 1, HI); R(14, 5, 1, 1, HI);
      R(16, 7, 1, 1, HI);
      break;
    default:
      break;
  }

  /* 胸鳍 / 腹鳍 */
  if (long) {
    R(9, 9, 7, 1, OUT);
    R(10, 9, 5, 1, c.fin);
    R(11, 9, 1, 1, DARK);
  } else {
    R(9, 10, 3, 1, OUT);
    R(10, 10, 1, 1, c.fin);
    R(11, 6, 4, 1, OUT);
    R(11, 7, 3, 1, OUT);
    R(12, 8, 2, 1, OUT);
    R(12, 6, 2, 1, c.fin);
    R(12, 7, 1, 1, c.fin);
    R(13, 7, 1, 1, DARK);
  }

  /* 眼睛 / 嘴最后画 */
  R(16, 4, 2, 2, '#ffffff');
  R(17, 4, 1, 2, '#141420');
  R(16, 4, 1, 1, '#e8f6ff');
  R(19, 6, 1, 1, OUT);
  R(19, 7, 1, 1, DARK);
}

/* ---------------- 场景绘制 ---------------- */
let bobDip = 0;
let shake = 0;
const particles = [];

function weatherId() {
  return curWeather ? curWeather.id : 'sunny';
}

const SKY_BANDS = {
  sunny: ['#1d3f6e', '#2a5487', '#3a6ca1', '#5589bb', '#74a4ce', '#93c0dc'],
  rain: ['#1a2536', '#232f44', '#2d3c54', '#3a4d67', '#4a607a', '#5b748d'],
  night: ['#060a16', '#0a1022', '#0e1730', '#142040', '#1a2a4c', '#22375a'],
};
const WATER_BANDS = {
  sunny: ['#5a95c0', '#4a86b4', '#3d79a8', '#326c9a', '#2a5f88', '#24557a'],
  rain: ['#38657f', '#315d76', '#2a546d', '#234a62', '#1d4056', '#18384c'],
  night: ['#163150', '#122a48', '#0e2340', '#0b1c34', '#09182d', '#071426'],
};

function drawHill(x, baseY, w, h, color) {
  ctx.fillStyle = color;
  for (let row = 0; row < h; row++) {
    const half = Math.round((w / 2) * (1 - row / h) * 0.9) + 2;
    ctx.fillRect(x - half, baseY - row, half * 2, 1);
  }
}

function drawSky(t) {
  const w = weatherId();
  const bands = SKY_BANDS[w] || SKY_BANDS.sunny;
  for (let i = 0; i < bands.length; i++) {
    px(0, i * 18, W, i === bands.length - 1 ? 108 - i * 18 : 18, bands[i]);
  }
  for (let i = 1; i < bands.length; i++) ditherSeam(i * 18, bands[i - 1], bands[i], i);

  // 远处山影
  const hillA = w === 'night' ? '#101e33' : w === 'rain' ? '#2c4458' : '#4a7d8c';
  const hillB = w === 'night' ? '#0b1728' : w === 'rain' ? '#223648' : '#396877';
  drawHill(38, 108, 50, 16, hillA);
  drawHill(88, 108, 38, 11, hillA);
  drawHill(190, 108, 58, 14, hillA);
  drawHill(250, 108, 44, 18, hillA);
  drawHill(70, 108, 62, 9, hillB);
  drawHill(220, 108, 70, 10, hillB);
  drawHill(300, 108, 40, 8, hillB);

  if (w === 'sunny') drawSun(t);
  else if (w === 'night') drawNightSky(t);
  else drawRainSky(t);

  const cloudTop = w === 'night' ? '#283450' : w === 'rain' ? '#6d7d96' : '#eef7ff';
  const cloudShade = w === 'night' ? '#1a2440' : w === 'rain' ? '#4d5c75' : '#c4d9ec';
  drawCloud(16 + ((t * 4) % 400) - 60, 20, cloudTop, cloudShade);
  drawCloud(148 + ((t * 2.4) % 440) - 70, 44, cloudTop, cloudShade);
  drawCloud(246 + ((t * 3.2) % 430) - 60, 8, cloudTop, cloudShade);

  if (w === 'sunny') drawBirds(t);
  if (w === 'rain') drawRainClouds(t);

  if (w === 'sunny') {
    ctx.globalAlpha = 0.24;
    for (let i = 0; i < 4; i++) {
      const x = ((t * 4.5 + i * 79) % (W + 40)) - 20;
      const y = 38 + ((i * 27) % 56) + Math.sin(t * 0.9 + i) * 5;
      px(x, y, 1, 1, '#fff4c8');
    }
    ctx.globalAlpha = 1;
  }

  drawHorizonHaze(t, w);
  ctx.globalAlpha = w === 'night' ? 0.25 : 0.35;
  rectLines(0, 107, W, 1, w === 'night' ? '#5a7aa8' : '#cfe8f8', 2);
  ctx.globalAlpha = 1;
  drawSailboat(t, w);
}

function disc(cx, cy, r, color) {
  ctx.fillStyle = color;
  for (let dy = -r; dy <= r; dy++) {
    const half = Math.floor(Math.sqrt(r * r - dy * dy));
    ctx.fillRect(cx - half, cy + dy, half * 2 + 1, 1);
  }
}

function drawSun(t) {
  ctx.globalAlpha = 0.06;
  disc(252, 24, 17, '#ffe89a');
  ctx.globalAlpha = 0.1;
  disc(252, 24, 13, '#ffe89a');
  ctx.globalAlpha = 1;
  disc(252, 24, 9, '#ffe89a');
  disc(252, 24, 7, '#fff2b8');
  disc(252, 24, 5, '#fffbe8');
  ctx.globalAlpha = 0.35;
  px(249, 21, 2, 2, '#ffffff');
  ctx.globalAlpha = 1;
}

function drawNightSky(t) {
  for (let i = 0; i < 42; i++) {
    const sx = (i * 47 + 13) % W;
    const sy = 4 + (i * 29) % 92;
    const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.2 + i * 1.7));
    ctx.globalAlpha = tw;
    px(sx, sy, 1, 1, i % 7 === 0 ? '#b8d0ff' : '#e6efff');
    if (i % 11 === 0 && tw > 0.8) {
      px(sx - 1, sy, 3, 1, '#9fbce8');
      px(sx, sy - 1, 1, 3, '#9fbce8');
    }
  }
  ctx.globalAlpha = 1;

  // 弯月
  ctx.globalAlpha = 0.06;
  disc(252, 24, 16, '#cfe0ff');
  ctx.globalAlpha = 0.12;
  disc(252, 24, 12, '#dce8ff');
  ctx.globalAlpha = 1;
  for (let dy = -8; dy <= 8; dy += 1) {
    for (let dx = -8; dx <= 8; dx += 1) {
      const outer = dx * dx + dy * dy <= 64;
      const bite = (dx - 4) * (dx - 4) + (dy + 1) * (dy + 1) <= 49;
      if (outer && !bite) px(252 + dx, 24 + dy, 1, 1, '#eef2ff');
    }
  }
  px(248, 21, 2, 1, 'rgba(186,202,232,0.7)');
  px(246, 26, 1, 1, 'rgba(186,202,232,0.55)');
  px(251, 30, 1, 1, 'rgba(186,202,232,0.6)');

  if (Math.sin(t * 0.31 + 1.2) > 0.992) {
    const sx = 60 + ((t * 30) % 160);
    const sy = 16 + ((t * 10) % 40);
    ctx.globalAlpha = 0.7;
    line(sx, sy, sx + 14, sy + 5, '#ffffff');
    line(sx + 2, sy, sx + 10, sy + 3, '#cfe0ff');
    ctx.globalAlpha = 1;
  }
}

function drawRainSky(t) {
  ctx.globalAlpha = 0.12;
  rectLines(228, 14, 56, 2, '#b8d0e8', 3);
  ctx.globalAlpha = 0.08;
  rectLines(236, 20, 40, 2, '#b8d0e8', 3);
  ctx.globalAlpha = 1;
}

function drawRainClouds(t) {
  ctx.globalAlpha = 0.35;
  drawCloud(60 + ((t * 1.2) % 360) - 60, 12, '#8b9ab0', '#5b6a82');
  drawCloud(220 + ((t * 1.8) % 380) - 70, 34, '#7c8ca4', '#4f5f78');
  ctx.globalAlpha = 1;
}

function drawCloud(x, y, top = '#e8f4ff', bottom = '#c8dcf0') {
  x = Math.round(x);
  px(x + 4, y + 2, 24, 6, top);
  px(x + 8, y, 14, 3, top);
  px(x + 2, y + 4, 28, 4, top);
  px(x + 1, y + 8, 26, 2, bottom);
  px(x + 6, y + 6, 14, 2, bottom);
  ctx.globalAlpha = 0.5;
  px(x + 6, y + 1, 6, 1, '#ffffff');
  ctx.globalAlpha = 1;
}

function drawHorizonHaze(t, w) {
  const haze = w === 'night' ? '#5b7ba6' : w === 'rain' ? '#a7bac8' : '#e4f3fb';
  ctx.globalAlpha = w === 'night' ? 0.08 : 0.12;
  for (let y = 98; y < 107; y += 2) ditherRow(y, haze, y, 2);
  ctx.globalAlpha = 1;
}

function sailboatPos(t) {
  return {
    x: 198 + Math.round(Math.sin(t * 0.09) * 3),
    y: 99 + Math.round(Math.sin(t * 0.75) * 1),
  };
}

function drawSailboat(t, w) {
  const p = sailboatPos(t);
  const x = p.x;
  const y = p.y;
  const hull = w === 'night' ? '#0a1420' : w === 'rain' ? '#2d4050' : '#31505f';
  const sail = w === 'night' ? '#657a99' : w === 'rain' ? '#a9b7c4' : '#f1ead8';
  const shade = w === 'night' ? '#3d526f' : w === 'rain' ? '#8698a8' : '#d6cbb5';

  px(x + 1, y + 4, 12, 1, hull);
  px(x, y + 5, 14, 2, hull);
  px(x + 2, y + 7, 10, 1, hull);
  px(x + 2, y + 8, 10, 1, hull);
  px(x + 7, y - 6, 1, 12, hull);

  for (let i = 0; i < 6; i++) {
    const sw = Math.max(1, 5 - Math.floor(i * 0.8));
    px(x + 8, y - 5 + i, sw, 1, i % 3 === 0 ? shade : sail);
  }
  for (let i = 0; i < 4; i++) {
    const sw = 1 + Math.floor(i * 0.5);
    px(x + 6 - sw, y - 4 + i, sw, 1, shade);
  }

  if (w !== 'sunny') {
    ctx.globalAlpha = 0.35 + 0.2 * Math.sin(t * 2.1);
    px(x + 2, y + 5, 1, 1, '#ffd67a');
    ctx.globalAlpha = 1;
  }
}

function drawBirds(t) {
  for (let i = 0; i < 3; i++) {
    const bx = ((t * 7 + i * 95) % 380) - 30;
    const by = 26 + i * 13 + Math.sin(t * 1.2 + i) * 2;
    const flap = Math.sin(t * 7 + i * 2) > 0;
    px(bx, by, 3, 1, '#304a62');
    px(bx + 4, by, 3, 1, '#304a62');
    if (flap) {
      px(bx + 1, by - 1, 1, 1, '#304a62');
      px(bx + 5, by - 1, 1, 1, '#304a62');
    } else {
      px(bx + 1, by + 1, 1, 1, '#304a62');
      px(bx + 5, by + 1, 1, 1, '#304a62');
    }
  }
}

function drawWater(t) {
  const w = weatherId();
  const bands = WATER_BANDS[w] || WATER_BANDS.sunny;
  for (let i = 0; i < bands.length; i++) {
    px(0, 108 + i * 12, W, i === bands.length - 1 ? H - 168 : 12, bands[i]);
  }
  for (let i = 1; i < bands.length; i++) ditherSeam(108 + i * 12, bands[i - 1], bands[i], i);

  // 天际反光
  ctx.globalAlpha = w === 'night' ? 0.18 : 0.28;
  rectLines(0, 109, W, 1, w === 'night' ? '#7fa8d8' : '#bfe4f8', 2);
  ctx.globalAlpha = w === 'night' ? 0.16 : 0.26;
  ditherRow(108, w === 'night' ? '#a8c8ee' : '#dff4ff', 0, 2);
  ctx.globalAlpha = 1;

  const ripple = w === 'rain'
    ? 'rgba(200,230,255,0.34)'
    : w === 'night' ? 'rgba(130,180,240,0.20)' : 'rgba(190,230,255,0.30)';

  for (let i = 0; i < 22; i++) {
    const y = 112 + i * 3;
    const speed = 4 + (i % 4) * 2.2;
    const x = ((i * 61 + t * speed) % (W + 40)) - 20;
    const ww = 4 + (i % 3) * 4;
    px(x, y, ww, 1, ripple);
    if (i % 5 === 0) px(x + ww + 6, y, 3, 1, ripple);
  }

  // 太阳 / 月亮的水面光柱
  if (w !== 'rain') {
    const glow = w === 'night' ? 'rgba(210,230,255,' : 'rgba(255,238,170,';
    for (let i = 0; i < 12; i++) {
      const y = 111 + i * 6;
      const off = Math.sin(t * 1.8 + i * 0.8) * 4;
      ctx.globalAlpha = (w === 'night' ? 0.22 : 0.3) * (1 - i / 14);
      px(240 + off + (i % 3) * 3, y, 8 - (i % 3) * 2, 1, glow + '0.9)');
    }
    ctx.globalAlpha = w === 'night' ? 0.1 : 0.12;
    for (let y = 112; y < 168; y += 3) {
      const off = Math.sin(t * 1.6 + y * 0.18) * 5;
      ditherRow(y, glow + '1)', y, 3, 234 + off, 258 + off);
    }
    ctx.globalAlpha = 1;
  }

  // 水面闪光
  for (let i = 0; i < 14; i++) {
    const tw = Math.sin(t * 2.1 + i * 2.3);
    if (tw < 0.72) continue;
    const x = (i * 53 + 19) % W;
    const y = 116 + (i * 31) % 58;
    ctx.globalAlpha = (tw - 0.72) * 2.6;
    px(x, y, 1, 1, w === 'night' ? '#a8c8f0' : '#eaf8ff');
  }
  ctx.globalAlpha = 1;

  // 近处更粗的浪纹，让水面有前后层次
  const near = w === 'rain' ? 'rgba(200,230,255,0.18)' : w === 'night' ? 'rgba(130,180,240,0.12)' : 'rgba(190,230,255,0.16)';
  for (let i = 0; i < 7; i++) {
    const y = 150 + i * 4;
    const x = ((t * (12 + i * 3) + i * 71) % (W + 80)) - 40;
    const len = 6 + i * 3;
    px(x, y, len, 1, near);
    if (i % 2 === 0) px(x + len + 3, y, 2, 1, near);
  }

  // 远处小船的倒影
  const bp = sailboatPos(t);
  ctx.globalAlpha = w === 'night' ? 0.12 : 0.16;
  const boatRef = w === 'night' ? '#8fb0d8' : '#16394a';
  px(bp.x + 2, 109, 9, 1, boatRef);
  px(bp.x + 4, 111, 5, 1, boatRef);
  px(bp.x + 5, 113, 3, 1, boatRef);
  ctx.globalAlpha = 1;

  if (w === 'rain') {
    ctx.globalAlpha = 0.055;
    for (let i = 0; i < 3; i++) {
      const off = ((t * 4 + i * 90) % (W + 90)) - 45;
      ditherRow(113 + i * 8, '#cfe2ee', i, 2, off, off + 70);
      ditherRow(114 + i * 8, '#cfe2ee', i + 1, 3, off, off + 70);
    }
    ctx.globalAlpha = 1;
  }

  if (w === 'rain') {
    for (let i = 0; i < 18; i++) {
      const rx = (i * 67 + t * 22) % W;
      const ry = 112 + (i * 17) % 64;
      const ph = (t * 1.4 + i * 0.4) % 1;
      ctx.globalAlpha = 0.3 * (1 - ph);
      px(rx - 2 - ph * 4, ry, 5 + ph * 8, 1, '#cfeaff');
      px(rx - ph * 2, ry + 1, 3 + ph * 4, 1, '#cfeaff');
    }
    ctx.globalAlpha = 1;
  }

  if (w === 'night') {
    for (let i = 0; i < 10; i++) {
      const fx = (i * 71 + Math.sin(t * 0.7 + i) * 14) % W;
      const fy = 116 + Math.sin(t * 1.1 + i * 1.9) * 6 + (i % 4) * 12;
      ctx.globalAlpha = 0.3 + 0.5 * Math.abs(Math.sin(t * 2 + i));
      px(fx, fy, 1, 1, '#c8ff9a');
      px(fx - 1, fy, 3, 1, 'rgba(140,255,120,0.18)');
    }
    ctx.globalAlpha = 1;
  }

  drawWeeds(t, w);
  drawFishShadows(t, w);
}

function drawWeeds(t, w) {
  const dark = w === 'night' ? '#0a2434' : w === 'rain' ? '#1e4a4a' : '#1f5a50';
  const mid = w === 'night' ? '#0f3446' : w === 'rain' ? '#2a5e54' : '#2b7260';
  const clumps = [[300, 12], [312, 9], [288, 7], [24, 6], [44, 5], [116, 4]];
  for (const [bx, n] of clumps) {
    for (let i = 0; i < n; i++) {
      const sway = Math.sin(t * 1.3 + i * 0.9 + bx) * 3;
      const x = bx + i * 2 - n;
      const h = 10 + (i % 4) * 5;
      line(x, 178, x + sway, 178 - h, i % 2 ? dark : mid);
      if (i % 3 === 0) px(x + sway, 178 - h - 1, 2, 1, mid);
    }
  }

  for (let i = 0; i < 5; i++) {
    const bx = ((t * 5 + i * 47) % (W - 40)) + 20;
    const by = 160 + (i % 3) * 5;
    const ph = (t * 0.8 + i * 0.37) % 1;
    ctx.globalAlpha = 0.35 * (1 - ph);
    px(bx, by, 2, 2, '#bfe8ff');
    ctx.globalAlpha = 1;
  }
}

function drawFishShadows(t, w) {
  const color = w === 'night' ? 'rgba(120,170,230,0.14)' : 'rgba(8,32,52,0.26)';
  for (let i = 0; i < 5; i++) {
    const dir = i % 2 === 0 ? 1 : -1;
    const span = 460;
    let x = (t * (7 + i * 2) + i * 97) % span - 60;
    if (dir < 0) x = W + 20 - x;
    const y = 150 + (i * 7) % 26;
    px(x, y, 8, 2, color);
    px(x - 2, y - 1, 2, 1, color);
    px(x - 2, y + 2, 2, 1, color);
    px(x + 4, y - 1, 2, 1, color);
  }
}

function drawRain(t) {
  if (weatherId() !== 'rain') return;
  for (let i = 0; i < 60; i += 1) {
    const x = (i * 37 + t * 190) % (W + 40) - 20;
    const y = (i * 23 + t * 430) % (H + 20) - 10;
    ctx.globalAlpha = 0.22 + (i % 3) * 0.08;
    px(x, y, 1, 4 + (i % 2) * 2, '#bfe0ff');
  }
  ctx.globalAlpha = 1;
}

function drawDock(t) {
  const w = weatherId();
  const wood = w === 'night' ? '#4a3428' : w === 'rain' ? '#5c4230' : '#8a5f3f';
  const woodHi = w === 'night' ? '#624632' : w === 'rain' ? '#75553c' : '#b07c52';
  const woodDark = w === 'night' ? '#2c1e16' : w === 'rain' ? '#3a2a1e' : '#5c3e28';

  // 水面阴影
  ctx.globalAlpha = 0.22;
  px(0, 148, 126, 7, '#061826');
  ctx.globalAlpha = 1;

  // 支柱
  for (const gx of [14, 58, 100]) {
    px(gx, 142, 8, 30, woodDark);
    px(gx + 1, 142, 2, 30, wood);
    px(gx + 6, 142, 1, 30, '#241812');
    for (let i = 0; i < 5; i++) {
      ctx.globalAlpha = 0.18 - i * 0.03;
      px(gx + 2, 172 + i * 2, 5 - i, 1, '#9fd0e8');
    }
    ctx.globalAlpha = 1;
  }

  const postRim = w === 'night' ? 'rgba(160,196,240,0.16)' : w === 'rain' ? 'rgba(190,214,228,0.12)' : 'rgba(255,232,176,0.22)';
  for (const gx of [14, 58, 100]) px(gx + 7, 143, 1, 27, postRim);
  if (w !== 'sunny') {
    ctx.globalAlpha = 0.14;
    px(107, 143, 1, 27, '#ffd27a');
    ctx.globalAlpha = 1;
  }

  // 桥面
  px(0, 132, 124, 13, wood);
  px(0, 132, 124, 2, woodHi);
  px(0, 143, 124, 2, woodDark);
  for (let i = 1; i < 10; i++) {
    px(i * 13, 134, 1, 9, woodDark);
    px(i * 13 - 1, 134, 1, 1, woodHi);
  }
  for (let i = 0; i < 10; i += 2) {
    px(4 + i * 13, 138, 7, 1, 'rgba(70,44,28,0.35)');
    px(3 + i * 13, 134, 1, 1, '#d8b088');
    px(9 + i * 13, 141, 1, 1, '#3a2418');
  }

  if (w !== 'sunny') drawLanternPool(t);

  // 缆绳
  px(104, 128, 8, 2, '#b8a070');
  px(106, 130, 2, 3, '#8a7048');
  px(112, 132, 3, 1, '#8a7048');
  for (let i = 0; i < 4; i++) px(4 + i * 3, 135 + (i % 2), 3, 1, '#c8b080');

  // 木桶
  px(86, 124, 12, 10, w === 'night' ? '#3a2a20' : '#6b4a30');
  px(86, 124, 12, 2, w === 'night' ? '#583f2d' : '#966b48');
  px(86, 128, 12, 1, '#3a2618');
  px(85, 127, 14, 1, '#a88a58');
  px(85, 132, 14, 1, '#a88a58');

  if (w !== 'sunny') {
    ctx.globalAlpha = 0.34;
    px(97, 125, 1, 8, '#ffd27a');
    px(96, 132, 1, 2, '#ffd27a');
    ctx.globalAlpha = 1;
  }

  // 提灯
  drawLantern(112, 118, t, w);
  if (w !== 'sunny') drawLanternMoths(t);
}

function drawLanternPool(t) {
  const flick = 0.82 + 0.12 * Math.sin(t * 6.7) + 0.06 * Math.sin(t * 15.3);
  ctx.globalAlpha = 0.08 * flick;
  px(90, 132, 34, 15, '#ffb84d');
  ctx.globalAlpha = 0.12 * flick;
  px(97, 132, 27, 14, '#ffcf66');
  ctx.globalAlpha = 0.17 * flick;
  px(104, 132, 15, 12, '#ffe08a');
  ctx.globalAlpha = 0.1 * flick;
  for (let x = 92; x < 124; x += 4) px(x, 147, 2, 1, '#ffcf66');
  ctx.globalAlpha = 1;
}

function drawLanternMoths(t) {
  for (let i = 0; i < 2; i++) {
    const a = t * (0.9 + i * 0.4) + i * 2.2;
    const x = 112 + Math.cos(a) * (7 + i * 3);
    const y = 121 + Math.sin(a * 1.4) * (3 + i * 2);
    ctx.globalAlpha = 0.3 + 0.35 * Math.abs(Math.sin(t * 3 + i * 2));
    px(x, y, 1, 1, '#fff0a8');
  }
  ctx.globalAlpha = 1;
}

function drawLantern(x, y, t, w) {
  const lit = w === 'night' || w === 'rain';
  if (lit) {
    ctx.globalAlpha = 0.05;
    disc(x, y - 1, 20, '#ffb84d');
    ctx.globalAlpha = 0.08;
    disc(x, y - 1, 14, '#ffd67a');
    ctx.globalAlpha = 0.12;
    disc(x, y - 1, 9, '#ffcf66');
    ctx.globalAlpha = 1;
  }
  px(x - 1, y - 8, 4, 2, '#4a3a2a');
  px(x, y - 6, 2, 2, '#8a7048');
  px(x - 3, y - 4, 8, 8, lit ? '#ffcf5a' : '#7a6a52');
  px(x - 2, y - 3, 6, 6, lit ? '#fff0a8' : '#8f8068');
  px(x - 1, y - 2, 2, 3, lit ? '#ffe066' : '#6a5c48');
  px(x - 2, y + 4, 6, 1, '#3a2a1e');
  if (lit) {
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(t * 9);
    px(x, y - 1, 2, 2, '#fffbe0');
    ctx.globalAlpha = 1;
  }
}

function drawLanternReflection(t, w) {
  if (w === 'sunny') return;
  const flick = 0.85 + 0.15 * Math.sin(t * 5.2);
  ctx.globalAlpha = 0.06 * flick;
  px(94, 147, 36, 27, '#ffb84d');
  for (let i = 0; i < 9; i++) {
    const y = 148 + i * 3;
    const width = Math.max(1, 5 - Math.floor(i / 3));
    const off = Math.round(Math.sin(t * 2.7 + i * 0.9) * (1 + i * 0.35));
    ctx.globalAlpha = (0.26 - i * 0.023) * flick;
    px(112 + off - width, y, width * 2, 1, '#ffd67a');
    ctx.globalAlpha = (0.12 - i * 0.009) * flick;
    px(112 + off - width + 1, y + 1, Math.max(1, width * 2 - 2), 1, '#ffbe55');
  }
  ctx.globalAlpha = 1;
}

function drawDockRain(t) {
  if (weatherId() !== 'rain') return;
  for (let i = 0; i < 10; i++) {
    const cycle = 0.65 + (i % 4) * 0.16;
    const p = ((t + i * 0.29) % cycle) / cycle;
    if (p > 0.3) continue;
    const x = 8 + ((i * 31 + 7) % 110);
    const y = 133 + ((i * 5) % 12);
    const k = p / 0.3;
    ctx.globalAlpha = (1 - k) * 0.4;
    px(x, y, 1, 1, '#dff4ff');
    if (i % 2 === 0) {
      px(x - 1 - k * 2, y, 1, 1, '#bfe4ff');
      px(x + 1 + k * 2, y, 1, 1, '#bfe4ff');
    }
  }
  ctx.globalAlpha = 0.13;
  for (let i = 0; i < 5; i++) px(9 + i * 21, 134, 5, 1, '#a8d8f0');
  ctx.globalAlpha = 1;
}

function drawFisher(t) {
  const fx = 46;
  const fy = 132;
  const w = weatherId();
  const fighting = state.phase === PHASE.FIGHT;
  const biting = state.phase === PHASE.BITE;
  const alert = fighting || biting;
  const breathe = Math.sin(t * 1.7) > 0 ? 0 : 1;
  const lean = fighting ? -2 : 0;
  const gold = dexCount() >= 12;
  const shirt = gold ? '#c8901e' : w === 'night' ? '#a83a42' : '#cc4a4a';
  const shirtHi = gold ? '#e8b83a' : w === 'night' ? '#c84e56' : '#e05a5a';
  const skin = w === 'night' ? '#d8ae86' : '#f2c79a';
  const skinHi = w === 'night' ? '#e6c09a' : '#ffd9b0';
  const pants = w === 'night' ? '#32324e' : '#3e3e60';

  // 影子
  ctx.globalAlpha = 0.26;
  px(fx + 1, fy, 24, 2, '#000000');
  ctx.globalAlpha = 1;

  // 鞋
  px(fx + 3, fy - 3, 7, 3, '#29293e');
  px(fx + 11, fy - 3, 7, 3, '#29293e');
  px(fx + 3, fy - 3, 7, 1, '#3c3c58');

  // 腿
  px(fx + 4, fy - 12, 5, 9, pants);
  px(fx + 12, fy - 12, 5, 9, pants);
  px(fx + 4, fy - 12, 1, 9, '#4e4e72');

  // 身体
  px(fx + 3 + lean, fy - 25, 14, 14, shirt);
  px(fx + 3 + lean, fy - 25, 14, 3, shirtHi);
  px(fx + 3 + lean, fy - 14, 14, 2, gold ? '#9a6a10' : '#9e3636');
  // 背带
  px(fx + 6 + lean, fy - 25, 2, 11, gold ? '#f2d060' : '#8a2a2a');
  px(fx + 12 + lean, fy - 25, 2, 11, gold ? '#f2d060' : '#8a2a2a');
  px(fx + 8 + lean, fy - 22, 1, 1, '#ffd24a');

  // 围巾
  const wind = Math.sin(t * 2.6) * 2;
  px(fx + 2 + lean, fy - 29, 15, 3, '#e8d8b0');
  px(fx + 15 + lean, fy - 27, 4, 2, '#d8c8a0');
  px(fx + 18 + lean, fy - 27 + Math.round(wind / 2), 3, 2, '#c8b890');
  px(fx + 20 + lean, fy - 26 + Math.round(wind), 2, 1, '#b8a880');

  // 头
  const headY = fy - 40 - breathe;
  px(fx + 5 + lean, headY, 9, 10, skin);
  px(fx + 5 + lean, headY, 9, 2, skinHi);
  px(fx + 13 + lean, headY + 3, 2, 2, skin);
  px(fx + 13 + lean, headY + 6, 1, 1, '#d8a078');
  // 眼睛
  const blink = Math.sin(t * 0.9 + 1) > 0.985;
  if (!blink) {
    px(fx + 11 + lean, headY + 3, 2, 2, '#1a1a2a');
    px(fx + 12 + lean, headY + 3, 1, 1, '#e8f0ff');
  } else {
    px(fx + 11 + lean, headY + 4, 2, 1, '#1a1a2a');
  }
  px(fx + 12 + lean, headY + 7, 2, 1, '#c88a6a');

  // 帽子
  px(fx + 3 + lean, headY - 2, 13, 3, '#e8d8b0');
  px(fx + 4 + lean, headY - 5, 10, 4, '#f2e2c4');
  px(fx + 6 + lean, headY - 3, 6, 1, '#d8c8a0');

  // 手臂（搏鱼时双手收线）
  if (fighting) {
    px(fx + 15 + lean, fy - 24, 8, 3, shirt);
    px(fx + 21 + lean, fy - 25, 4, 3, skin);
    px(fx + 14 + lean, fy - 20, 7, 3, shirt);
    px(fx + 19 + lean, fy - 19, 4, 3, skin);
  } else {
    px(fx + 15 + lean, fy - 23, 7, 3, shirt);
    px(fx + 20 + lean, fy - 23, 4, 3, skin);
    px(fx + 22 + lean, fy - 24, 2, 2, skinHi);
  }

  if (alert && !fighting) {
    ctx.globalAlpha = 0.4 + 0.4 * Math.sin(t * 12);
    px(fx + 18, headY + 2, 2, 2, '#ffd24a');
    ctx.globalAlpha = 1;
  }
  if (gold && Math.sin(t * 3.1) > 0.7) {
    px(fx + 8, fy - 22, 1, 1, '#fff3a8');
    px(fx + 14, fy - 18, 1, 1, '#fff3a0');
  }

  const rim = w === 'night' ? 'rgba(255,214,128,0.42)' : w === 'rain' ? 'rgba(255,214,128,0.36)' : 'rgba(255,234,166,0.5)';
  px(fx + 14 + lean, headY + 1, 1, 7, rim);
  px(fx + 17 + lean, fy - 24, 1, 9, rim);
  if (w === 'night') {
    ctx.globalAlpha = 0.16;
    px(fx + 4 + lean, headY + 1, 1, 7, '#a8ccff');
    px(fx + 2 + lean, fy - 24, 1, 9, '#a8ccff');
    ctx.globalAlpha = 1;
  }
}

function rodTip(t) {
  const fighting = state.phase === PHASE.FIGHT;
  if (fighting) {
    return {
      x: 136 + Math.sin(t * 11) * 2,
      y: 84 + Math.sin(t * 13) * 2 + (state.fight ? state.fight.tension * 0.05 : 0),
    };
  }
  return { x: 148 + Math.sin(t * 1.4) * 1.5, y: 64 + Math.cos(t * 1.7) * 1.5 };
}

function bobberPos(t) {
  const phase = state.phase;
  const tip = rodTip(t);
  const restY = 147 + Math.sin(t * 2.2) * 1.6 + bobDip * 7;
  const restX = 136 + Math.sin(t * 0.8) * 1.2;

  if (phase === PHASE.WAIT && state.phaseT < 0.42) {
    const k = Math.max(0, state.phaseT / 0.42);
    const ease = k * k * (3 - 2 * k);
    return {
      x: tip.x + (restX - tip.x) * ease,
      y: tip.y + (restY - tip.y) * ease - Math.sin(k * Math.PI) * 34,
      air: k < 1,
    };
  }
  if (phase === PHASE.FIGHT) {
    return { x: 138 + Math.sin(t * 7) * 5, y: restY + 1, air: false };
  }
  return { x: restX, y: restY, air: false };
}

function drawRod(t) {
  const p = bobberPos(t);
  const tip = rodTip(t);
  const handX = 68;
  const handY = 112;

  // 竿身
  line(handX - 6, 118, handX + 4, 114, '#6a4a2a');
  line(handX - 6, 119, handX + 4, 115, '#8a6238');
  line(handX + 4, 114, tip.x, tip.y, '#c8a878');
  line(handX + 5, 115, tip.x, tip.y + 1, '#a88858');
  px(tip.x - 1, tip.y - 1, 2, 2, '#f2e2c4');

  // 绕线轮
  px(handX + 1, 116, 4, 4, '#8a8fa8');
  px(handX + 2, 117, 2, 2, '#c8d0e0');
  px(handX + 9, 114, 1, 1, '#d8e0f0');

  // 鱼线
  const lineColor = state.phase === PHASE.FIGHT
    ? 'rgba(255,255,255,0.72)' : 'rgba(235,245,255,0.42)';
  const steps = Math.max(2, Math.abs(p.y - tip.y));
  ctx.fillStyle = lineColor;
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const x = tip.x + (p.x - tip.x) * k;
    const y = tip.y + (p.y - tip.y) * k;
    ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
  }

  if (p.air) return;

  // 浮标
  const by = Math.round(p.y);
  const bx = Math.round(p.x);
  if (state.castBait === 'glow' && (state.phase === PHASE.WAIT || state.phase === PHASE.BITE)) {
    ctx.globalAlpha = 0.14;
    px(bx - 5, by - 11, 12, 12, '#ffe066');
    ctx.globalAlpha = 0.3;
    px(bx - 3, by - 9, 8, 8, '#ffe066');
    ctx.globalAlpha = 1;
  }
  px(bx - 1, by - 7, 4, 2, '#d8d8e0');
  px(bx, by - 5, 3, 3, '#e84a4a');
  px(bx, by - 2, 3, 3, '#f8f8ff');
  px(bx, by - 6, 1, 1, '#8a2a2a');

  // 涟漪
  const rip = Math.sin(t * 2.2) * 0.5 + 0.5;
  ctx.globalAlpha = 0.24 + rip * 0.2;
  px(bx - 6 - rip * 3, by + 2, 12 + rip * 6, 1, '#d8f2ff');
  ctx.globalAlpha = 0.12 + rip * 0.1;
  px(bx - 9 - rip * 4, by + 4, 18 + rip * 8, 1, '#d8f2ff');
  ctx.globalAlpha = 1;

  if (state.phase === PHASE.BITE) {
    for (let i = 0; i < 5; i++) {
      const a = t * 9 + i * 1.26;
      const dx = Math.cos(a) * (5 + i * 1.2);
      const dy = -Math.abs(Math.sin(a)) * (4 + i);
      px(bx + dx, by + dy, 1, 1, '#eaf8ff');
    }
  }
}

function drawParticles() {
  for (const p of particles) {
    const lr = Math.max(0, Math.min(1, p.life / (p.maxLife || 0.4)));
    if (p.kind === 'fish') {
      ctx.globalAlpha = lr;
      drawFishSprite(ctx, p.x, p.y, 2, p.fish);
      if (Math.sin(p.life * 24) > 0.4) px(p.x + 6, p.y + 2, 1, 1, '#fff8c8');
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = lr;
      px(p.x, p.y, p.size || 1, p.size || 1, p.color || '#ffd24a');
    } else if (p.kind === 'ring') {
      const k = 1 - lr;
      ctx.globalAlpha = lr * 0.55;
      const w = Math.round(4 + k * 14);
      px(p.x - w / 2, p.y, w, 1, '#dff4ff');
    } else if (p.kind === 'bubble') {
      ctx.globalAlpha = lr * 0.5;
      px(p.x, p.y, 1, 1, '#cfeaff');
    } else {
      ctx.globalAlpha = lr;
      px(p.x, p.y, 2, 2, p.color || '#cfeaff');
    }
  }
  ctx.globalAlpha = 1;
}

function drawFightBar() {
  const f = state.fight;
  if (!f) return;
  const x = 44, w = 232, y = 46, h = 10;

  px(x - 3, y - 4, w + 6, h + 9, 'rgba(8,12,22,0.82)');
  px(x - 1, y - 2, w + 2, h + 4, '#34406a');
  px(x, y, w, h, '#161d2e');

  // 安全区
  const lo = x + ((f.center - f.half) / 100) * w;
  const hi = x + ((f.center + f.half) / 100) * w;
  const zoneW = Math.max(2, hi - lo);
  px(lo, y, zoneW, h, f.shrink > 0 ? '#9af0aa' : '#5fcf7a');
  px(lo, y, zoneW, 2, '#b8ffc8');
  px(lo, y + h - 2, zoneW, 2, '#3a9a5a');

  // 刻度
  for (let i = 1; i < 10; i++) px(x + (w / 10) * i, y, 1, h, 'rgba(10,18,28,0.18)');

  // 张力指针
  const tx = x + (f.tension / 100) * w;
  px(tx - 1, y - 3, 2, h + 6, '#ffffff');
  px(tx - 2, y - 4, 4, 2, '#ffd24a');
  px(tx - 2, y + h + 2, 4, 2, '#ffd24a');

  // 进度
  px(x, y + 15, w, 5, '#161d2e');
  px(x, y + 15, (f.progress / 100) * w, 5, '#4aa8ff');
  px(x, y + 15, Math.max(1, (f.progress / 100) * w), 1, '#9fd8ff');
  for (let i = 1; i < 4; i++) px(x + (w / 4) * i, y + 15, 1, 5, 'rgba(8,12,22,0.35)');

  if (f.tension > 82) {
    ctx.strokeStyle = `rgba(255,90,74,${0.3 + 0.35 * Math.sin(f.elapsed * 14)})`;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.lineWidth = 1;
  }

  if (f.fish) {
    const fx = 112 + Math.sin(f.elapsed * 9) * 5;
    const fy = 148 + Math.sin(f.elapsed * 13) * 2;
    ctx.globalAlpha = 0.25;
    px(fx - 4, fy + 8, 22, 2, '#061826');
    ctx.globalAlpha = 1;
    drawFishSprite(ctx, fx, fy, 2, f.fish);
  }
}

function drawBiteMark(t) {
  const y = 122 + Math.sin(t * 14) * 2;
  ctx.globalAlpha = 0.35;
  px(123, y - 2, 14, 18, '#ffd24a');
  ctx.globalAlpha = 1;
  px(127, y - 3, 3, 10, '#3a2a00');
  px(128, y - 3, 2, 10, '#ffd24a');
  px(127, y + 1, 3, 1, '#3a2a00');
  px(127, y + 8, 1, 2, '#ffd24a');
  px(129, y + 8, 1, 2, '#ffd24a');
  px(127, y + 11, 3, 1, '#ffd24a');
}

/* 主循环调用的特效入口 */
function spawnSplash(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    particles.push({
      kind: i === 0 ? 'ring' : 'splash',
      x: x + (Math.random() - 0.5) * 12,
      y: y + (Math.random() - 0.5) * 3,
      vx: (Math.random() - 0.5) * 34,
      vy: -28 - Math.random() * 46,
      gravity: 180,
      life: 0.3 + Math.random() * 0.35,
      maxLife: 0.65,
      color: color || '#dff4ff',
    });
  }
}

function spawnSpark(x, y, n, color) {
  for (let i = 0; i < n; i++) {
    particles.push({
      kind: 'spark',
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 12,
      vx: (Math.random() - 0.5) * 18,
      vy: -8 - Math.random() * 22,
      gravity: -4,
      life: 0.5 + Math.random() * 0.6,
      maxLife: 1.1,
      size: Math.random() > 0.6 ? 2 : 1,
      color: color || '#ffd24a',
    });
  }
}

function updateAmbient(dt) {
  if (leap) {
    leap.age += dt;
    if (leap.age >= leap.dur) {
      spawnSplash(leap.x + leap.dir * 13, leap.y, 5, '#dff4ff');
      leap = null;
      leapIn = 18 + Math.random() * 22;
    }
    return;
  }
  leapIn -= dt;
  if (leapIn > 0) return;
  const x = 178 + Math.random() * 96;
  const y = 136 + Math.random() * 26;
  leap = { x, y, age: 0, dur: 1.05 + Math.random() * 0.3, dir: Math.random() < 0.5 ? -1 : 1, h: 14 + Math.random() * 10 };
  spawnSplash(x - leap.dir * 13, y, 4, '#dff4ff');
}

function drawLeap() {
  if (!leap) return;
  const k = Math.min(1, leap.age / leap.dur);
  const x = leap.x + leap.dir * (k - 0.5) * 26;
  const y = leap.y - Math.sin(k * Math.PI) * leap.h;
  const c = weatherId() === 'night' ? 'rgba(160,200,240,0.7)' : 'rgba(8,34,52,0.8)';
  ctx.globalAlpha = 0.5 + 0.5 * Math.sin(k * Math.PI);
  px(x - 1, y, 4, 1, c);
  px(x + 3, y - 1, 1, 1, c);
  px(x - 2, y + 1, 2, 1, c);
  px(x + 4, y + 1, 2, 1, c);
  px(x, y - 1, 1, 1, 'rgba(230,248,255,0.5)');
  ctx.globalAlpha = 1;
}

function drawForeground(t, w) {
  const dark = w === 'night' ? '#06121c' : w === 'rain' ? '#0f2429' : '#13302e';
  const mid = w === 'night' ? '#0a2030' : w === 'rain' ? '#183a3c' : '#1c4039';
  const clumps = [[286, 4, 12], [302, 6, 22], [318, 5, 28]];
  for (const [bx, n, baseH] of clumps) {
    for (let i = 0; i < n; i++) {
      const sway = Math.sin(t * 1.2 + i * 1.1 + bx) * (2 + (i % 3));
      const x = bx + i * 2 - n;
      const h = baseH + (i % 4) * 5;
      line(x, H, x + sway, H - h, i % 2 ? mid : dark);
      if (i % 2 === 0) px(x + sway, H - h - 1, 2, 1, mid);
      if (i % 3 === 0) px(x + sway - 2, H - h + 6, 3, 1, dark);
    }
  }
}

function render(t, dt = 1 / 60) {
  const w = weatherId();
  if (lastSceneWeather && w !== lastSceneWeather) {
    prevBgCtx.clearRect(0, 0, W, H);
    prevBgCtx.drawImage(bgCanvas, 0, 0);
    weatherFade = WEATHER_FADE;
  }
  lastSceneWeather = w;
  if (weatherFade > 0) weatherFade = Math.max(0, weatherFade - dt);
  updateAmbient(dt);

  const liveCtx = ctx;
  ctx = bgCtx;
  try {
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, W, H);
    drawSky(t);
    drawWater(t);
    drawDock(t);
    drawDockRain(t);
    drawLanternReflection(t, w);
    drawRain(t);
  } finally {
    ctx = liveCtx;
  }

  ctx.clearRect(0, 0, W, H);
  ctx.save();
  if (shake > 0.3) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  ctx.drawImage(bgCanvas, 0, 0);

  if (weatherFade > 0) {
    const k = weatherFade / WEATHER_FADE;
    ctx.globalAlpha = k * k * (3 - 2 * k);
    ctx.drawImage(prevBg, 0, 0);
    ctx.globalAlpha = 1;
  }

  drawFisher(t);
  drawRod(t);
  drawLeap();
  drawParticles();
  drawForeground(t, w);
  ctx.restore();

  if (state.phase === PHASE.FIGHT) drawFightBar();
  else if (state.phase === PHASE.BITE) drawBiteMark(t);
}
