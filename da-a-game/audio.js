// audio.js —— 音效与背景音乐（只在 wx 环境生效；Node 测试可注入假 wx）
// 设计:
//   - 每种音效一个 InnerAudioContext（短音复用，避免每次 new）
//   - BGM 单独一个 context，loop=true
//   - 音效/音乐各有独立开关，持久化在本地存储
//   - 首次触摸后 unlock()，再启动 BGM（规避自动播放限制）
var FILES = {
  deal: 'assets/audio/deal.wav',
  liangA: 'assets/audio/liang-a.wav',
  fanA: 'assets/audio/fan-a.wav',
  play: 'assets/audio/play.wav',
  playBig: 'assets/audio/play-big.wav',
  bomb: 'assets/audio/bomb.wav',
  pass: 'assets/audio/pass.wav',
  capture: 'assets/audio/capture.wav',
  tick: 'assets/audio/tick.wav',
  win: 'assets/audio/win.wav',
  lose: 'assets/audio/lose.wav'
};
var BGM_SRC = 'assets/audio/bgm.wav';
var SFX_VOL = { deal: 0.5, liangA: 0.7, fanA: 0.75, play: 0.6, playBig: 0.7, bomb: 0.8, pass: 0.45, capture: 0.7, tick: 0.5, win: 0.6, lose: 0.6 };
var THROTTLE_MS = 90;

function createManager(wxObj, storage) {
  var store = storage || { get: function () { return null; }, set: function () {} };
  var sfxOn = store.get('dada_sfx') !== '0';
  var bgmOn = store.get('dada_bgm') !== '0';
  var unlocked = false;
  var ctxMap = {};
  var bgmCtx = null;
  var lastPlay = {};
  var canAudio = !!(wxObj && typeof wxObj.createInnerAudioContext === 'function');

  function persist() {
    store.set('dada_sfx', sfxOn ? '1' : '0');
    store.set('dada_bgm', bgmOn ? '1' : '0');
  }

  function getCtx(name) {
    if (!canAudio) return null;
    if (ctxMap[name]) return ctxMap[name];
    try {
      var c = wxObj.createInnerAudioContext();
      c.autoplay = false;
      c.loop = false;
      c.volume = SFX_VOL[name] == null ? 0.6 : SFX_VOL[name];
      c.src = FILES[name];
      ctxMap[name] = c;
    } catch (e) { return null; }
    return ctxMap[name];
  }

  function play(name) {
    if (!sfxOn || !canAudio) return false;
    var f = FILES[name];
    if (!f) return false;
    var now = Date.now();
    if (lastPlay[name] && now - lastPlay[name] < THROTTLE_MS) return false;
    lastPlay[name] = now;
    var c = getCtx(name);
    if (!c) return false;
    try {
      c.stop();
      c.play();
      return true;
    } catch (e) { return false; }
  }

  function startBgm() {
    if (!bgmOn || !unlocked || !canAudio) return;
    if (!bgmCtx) {
      try {
        bgmCtx = wxObj.createInnerAudioContext();
        bgmCtx.autoplay = false;
        bgmCtx.loop = true;
        bgmCtx.volume = 0.35;
        bgmCtx.src = BGM_SRC;
      } catch (e) { bgmCtx = null; return; }
    }
    try { bgmCtx.play(); } catch (e) {}
  }

  function stopBgm() {
    if (!bgmCtx) return;
    try { bgmCtx.stop(); } catch (e) {}
  }

  return {
    play: play,
    unlock: function () {
      if (unlocked) return;
      unlocked = true;
      startBgm();
    },
    startBgm: startBgm,
    stopBgm: stopBgm,
    setSfx: function (on) { sfxOn = !!on; persist(); },
    setBgm: function (on) { bgmOn = !!on; persist(); if (bgmOn) startBgm(); else stopBgm(); },
    toggleSfx: function () { sfxOn = !sfxOn; persist(); return sfxOn; },
    toggleBgm: function () { bgmOn = !bgmOn; persist(); if (bgmOn) startBgm(); else stopBgm(); return bgmOn; },
    sfxOn: function () { return sfxOn; },
    bgmOn: function () { return bgmOn; },
    canAudio: function () { return canAudio; }
  };
}

module.exports = { createManager: createManager, FILES: FILES, BGM_SRC: BGM_SRC };
