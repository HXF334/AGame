// test-audio.js
// [2026-11-15 用户] 「音效和背景音乐都要，各有自己的开关。」
// 覆盖: audio.js 的播放/节流/开关/持久化/BGM 解锁; UI 顶栏两个开关按钮存在。
var path = require('path');
var audio = require(path.join(__dirname, '..', 'audio.js'));

var pass = 0, fail = 0;
function check(name, ok, extra) {
  if (ok) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' | ' + extra : '')); }
}

function fakeWx() {
  var store = {};
  var made = [];
  return {
    made: made, store: store,
    createInnerAudioContext: function () {
      var c = {
        src: '', loop: false, volume: 1, playing: false, playCount: 0, stopCount: 0,
        play: function () { this.playing = true; this.playCount++; },
        stop: function () { this.playing = false; this.stopCount++; },
        pause: function () { this.playing = false; }
      };
      made.push(c);
      return c;
    }
  };
}

console.log('\n=== 1. 音效管理 ===');
var wx1 = fakeWx();
var store1 = {};
var mgr = audio.createManager(wx1, {
  get: function (k) { return store1[k]; },
  set: function (k, v) { store1[k] = v; }
});
check('1.1 默认音效与音乐都开', mgr.sfxOn() === true && mgr.bgmOn() === true);
check('1.2 音效可播放且指向对应文件', mgr.play('play') === true && wx1.made[0] && wx1.made[0].src === audio.FILES.play);
check('1.3 同一音效 90ms 内不重复叠加', mgr.play('play') === false);
check('1.4 不同音效不受前一个节流影响', mgr.play('bomb') === true);

var off = mgr.toggleSfx();
check('1.5 关闭音效后不再播放', off === false && mgr.play('pass') === false);
check('1.6 音效开关已持久化', store1['dada_sfx'] === '0');

mgr.toggleSfx();
check('1.7 重新开启后恢复播放', mgr.sfxOn() === true && mgr.play('pass') === true);

console.log('\n=== 2. 背景音乐 ===');
var wx2 = fakeWx();
var mgr2 = audio.createManager(wx2, { get: function () { return null; }, set: function () {} });
mgr2.unlock();
var bgmCtx = wx2.made.filter(function (c) { return c.src === audio.BGM_SRC; })[0];
check('2.1 解锁后启动 BGM', !!bgmCtx && bgmCtx.playing === true, 'ctx=' + !!bgmCtx);
check('2.2 BGM 循环播放且音量较低', bgmCtx && bgmCtx.loop === true && bgmCtx.volume <= 0.3);

mgr2.toggleBgm();
check('2.3 关闭音乐后 BGM 停止', mgr2.bgmOn() === false && bgmCtx.playing === false);
mgr2.toggleBgm();
check('2.4 重新打开后 BGM 恢复', mgr2.bgmOn() === true && bgmCtx.playing === true);

console.log('\n=== 3. 无音频能力时安全降级 ===');
var mgr3 = audio.createManager({}, { get: function () { return null; }, set: function () {} });
check('3.1 无 createInnerAudioContext 时不崩', mgr3.canAudio() === false);
check('3.2 播放请求返回 false', mgr3.play('play') === false);
check('3.3 unlock 不崩', (mgr3.unlock(), true));

console.log('\n=== 4. 顶栏开关按钮 ===');
var g = require(path.join(__dirname, '..', 'game.js'));
var texts = g.__renderTexts();
check('4.1 顶栏画出「音」按钮', texts.indexOf('音') >= 0);
check('4.2 顶栏画出「乐」按钮', texts.indexOf('乐') >= 0);
var m = g.uiLayout();
check('4.3 两个按钮都在托管机器人左侧',
  m.sound.iconX < m.autoPlay.iconX && m.music.iconX < m.autoPlay.iconX);
check('4.4 两个按钮不重叠', Math.abs(m.sound.iconX - m.music.iconX) >= m.sound.iconR + m.music.iconR);

console.log('\n=== 结果: ' + pass + ' 通过, ' + fail + ' 失败 ===');
process.exit(fail ? 1 : 0);
