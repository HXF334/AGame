// tools/gen-audio.js —— 生成占位音效/背景音乐（纯 Node，无依赖）
// 用法: node tools/gen-audio.js
// 输出: assets/audio/*.wav  （16bit PCM 单声道）
// 说明: 这些是合成占位素材，正式素材可直接用同名文件替换（保持文件名不变）。
var fs = require('fs');
var path = require('path');

var OUT = path.join(__dirname, '..', 'assets', 'audio');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

var SR = 16000;

function clamp(v) { return v < -1 ? -1 : (v > 1 ? 1 : v); }

function writeWav(name, samples, sr) {
  var n = samples.length;
  var buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24);
  buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(n * 2, 40);
  for (var i = 0; i < n; i++) {
    buf.writeInt16LE(Math.round(clamp(samples[i]) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, name), buf);
  console.log('  ' + name + '  ' + Math.round(buf.length / 1024) + ' KB');
}

function mk(n) { var a = new Float32Array(n); return a; }
function env(t, dur, atk, rel) {
  if (t < 0 || t > dur) return 0;
  var a = t < atk ? t / atk : 1;
  var r = t > dur - rel ? Math.max(0, (dur - t) / rel) : 1;
  return a * r;
}
function rng(seed) { var s = seed >>> 0; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 * 2 - 1; }; }

// 简单低通: 一阶 IIR
function lp(samples, alpha) {
  var y = 0;
  for (var i = 0; i < samples.length; i++) { y += alpha * (samples[i] - y); samples[i] = y; }
  return samples;
}

function tone(freq, dur, amp, sr) {
  var n = Math.round(dur * sr), a = mk(n);
  for (var i = 0; i < n; i++) {
    var t = i / sr;
    a[i] = amp * Math.sin(2 * Math.PI * freq * t) * env(t, dur, 0.005, Math.min(0.08, dur * 0.4));
  }
  return a;
}

function mix(dst, src, offset, gain) {
  var o = Math.round(offset * 16000);
  for (var i = 0; i < src.length && o + i < dst.length; i++) dst[o + i] += src[i] * (gain == null ? 1 : gain);
}

// ---------- 音效 ----------
function sfxDeal() {
  // [2026-11-16 用户] 发牌声要「均衡」：每轮一声短促的啪，不要长噪声+停顿
  var dur = 0.07, n = Math.round(dur * SR), a = mk(n), r = rng(11);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    a[i] = r() * 0.30 * env(t, dur, 0.003, 0.03);
  }
  return lp(a, 0.85);
}

function sfxLiangA() {
  var n = Math.round(0.55 * SR), a = mk(n);
  mix(a, tone(659.25, 0.22, 0.35, SR), 0);
  mix(a, tone(880.0, 0.30, 0.30, SR), 0.13);
  return a;
}

function sfxFanA() {
  var dur = 0.7, n = Math.round(dur * SR), a = mk(n), r = rng(7);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    var f = 90 + 120 * t;
    a[i] = 0.35 * Math.sin(2 * Math.PI * f * t) * env(t, dur, 0.01, 0.3) + r() * 0.08 * env(t, 0.3, 0.02, 0.25);
  }
  return lp(a, 0.35);
}

function sfxPlay() {
  var dur = 0.16, n = Math.round(dur * SR), a = mk(n), r = rng(3);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    a[i] = r() * 0.3 * env(t, dur, 0.002, 0.12) + 0.15 * Math.sin(2 * Math.PI * 1400 * t) * env(t, 0.05, 0.001, 0.04);
  }
  return lp(a, 0.7);
}

function sfxPlayBig() {
  var dur = 0.3, n = Math.round(dur * SR), a = mk(n), r = rng(5);
  mix(a, tone(180, 0.22, 0.35, SR), 0);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    a[i] += r() * 0.12 * env(t, 0.12, 0.002, 0.1);
  }
  return lp(a, 0.4);
}

function sfxBomb() {
  var dur = 0.75, n = Math.round(dur * SR), a = mk(n), r = rng(9);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    var f = 70 * Math.exp(-2.2 * t) + 35;
    a[i] = 0.5 * Math.sin(2 * Math.PI * f * t) * env(t, dur, 0.005, 0.4) + r() * 0.18 * env(t, 0.25, 0.004, 0.2);
  }
  return lp(a, 0.25);
}

function sfxPass() {
  var n = Math.round(0.12 * SR), a = mk(n);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    a[i] = 0.18 * Math.sin(2 * Math.PI * 420 * t) * env(t, 0.12, 0.002, 0.09);
  }
  return a;
}

function sfxCapture() {
  var n = Math.round(0.5 * SR), a = mk(n);
  mix(a, tone(1046.5, 0.22, 0.28, SR), 0);
  mix(a, tone(1318.5, 0.22, 0.26, SR), 0.08);
  mix(a, tone(1568.0, 0.30, 0.26, SR), 0.16);
  return a;
}

function sfxTick() {
  var n = Math.round(0.06 * SR), a = mk(n);
  for (var i = 0; i < n; i++) {
    var t = i / SR;
    a[i] = 0.22 * Math.sin(2 * Math.PI * 1000 * t) * env(t, 0.06, 0.001, 0.04);
  }
  return a;
}

function sfxWin() {
  var dur = 1.7, n = Math.round(dur * SR), a = mk(n);
  var notes = [523.25, 659.25, 783.99, 1046.5];
  for (var i = 0; i < notes.length; i++) mix(a, tone(notes[i], 0.55, 0.26, SR), i * 0.13);
  mix(a, tone(1046.5, 0.7, 0.18, SR), 0.5);
  return a;
}

function sfxLose() {
  var dur = 1.5, n = Math.round(dur * SR), a = mk(n);
  var notes = [392.0, 349.23, 293.66, 220.0];
  for (var i = 0; i < notes.length; i++) mix(a, tone(notes[i], 0.5, 0.24, SR), i * 0.18);
  return a;
}

// ---------- 背景音乐（8s 无缝循环） ----------
function bgm() {
  // [2026-11-15 用户报障] 听不到背景音乐: 原来 12000Hz 非常规采样率 + 振幅 0.055
  //   -> 部分平台解码失败/音量过低; 改为标准 16000Hz 并把振幅提到 0.16。
  var dur = 8, sr = 16000, n = Math.round(dur * sr), a = mk(n);
  // Am - F - C - G，每和弦 2s
  var chords = [
    [220.0, 261.63, 329.63],
    [174.61, 220.0, 261.63],
    [261.63, 329.63, 392.0],
    [196.0, 246.94, 293.66]
  ];
  for (var c = 0; c < chords.length; c++) {
    var start = c * 2, end = start + 2;
    for (var k = 0; k < chords[c].length; k++) {
      var f = chords[c][k];
      for (var i = Math.round(start * sr); i < Math.round(end * sr); i++) {
        var t = i / sr;
        var local = t - start;
        var e = Math.min(1, local / 0.5) * Math.min(1, (end - t) / 0.5); // 交叉淡入淡出
        var trem = 0.85 + 0.15 * Math.sin(2 * Math.PI * 0.25 * t);
        a[i] += 0.16 * e * trem * (Math.sin(2 * Math.PI * f * t) + 0.35 * Math.sin(2 * Math.PI * f * 2 * t));
      }
    }
  }
  // 循环边缘 20ms 淡入淡出，避免爆音
  var fade = Math.round(0.02 * sr);
  for (var i2 = 0; i2 < fade; i2++) { a[i2] *= i2 / fade; a[n - 1 - i2] *= i2 / fade; }
  return { data: a, sr: sr };
}

console.log('生成占位音频 -> ' + OUT);
writeWav('deal.wav', sfxDeal(), SR);
writeWav('liang-a.wav', sfxLiangA(), SR);
writeWav('fan-a.wav', sfxFanA(), SR);
writeWav('play.wav', sfxPlay(), SR);
writeWav('play-big.wav', sfxPlayBig(), SR);
writeWav('bomb.wav', sfxBomb(), SR);
writeWav('pass.wav', sfxPass(), SR);
writeWav('capture.wav', sfxCapture(), SR);
writeWav('tick.wav', sfxTick(), SR);
writeWav('win.wav', sfxWin(), SR);
writeWav('lose.wav', sfxLose(), SR);
var b = bgm();
writeWav('bgm.wav', b.data, b.sr);
console.log('完成。');
