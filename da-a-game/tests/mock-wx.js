// tests/mock-wx.js — 微信小游戏运行时的最小 mock
// 目的: 让 game.js 能在 node 里无头加载并驱动真实 UI 代码路径,
//       从而在无法使用微信开发者工具时仍能验证逻辑/状态同步/事件处理。
//       本 mock 只提供接口, 不做任何视觉断言 (画不出像素)。
//
// 依据: game.js 对 wx 的依赖面极小 —— 仅 wx.createCanvas / wx.onTouchStart,
//       canvas ctx 9 个方法 (fillRect/fillStyle/fillText/font/lineWidth/
//       strokeRect/strokeStyle/textAlign/textBaseline)。

var CTX_METHODS = [
  'fillRect', 'strokeRect', 'fillText', 'clearRect', 'beginPath', 'closePath',
  'moveTo', 'lineTo', 'arc', 'fill', 'stroke', 'save', 'restore', 'translate',
  'rotate', 'scale', 'setTransform', 'drawImage', 'measureText', 'createLinearGradient'
];

function makeCtx(calls) {
  var ctx = {};
  CTX_METHODS.forEach(function (m) {
    ctx[m] = function () {
      calls.push({ fn: m, args: Array.prototype.slice.call(arguments) });
      if (m === 'measureText') return { width: 10 };
      if (m === 'createLinearGradient') return { addColorStop: function () {} };
    };
  });
  // 属性赋值不做任何事 (fillStyle/font/...)
  return ctx;
}

function install(opts) {
  var o = opts || {};
  var calls = o.calls || [];
  var touchHandlers = o.touchHandlers || [];

  var canvas = {
    width: o.width || 800,
    height: o.height || 400,
    getContext: function (type) {
      if (type !== '2d') return null;
      return makeCtx(calls);
    },
    addEventListener: function () {},
    removeEventListener: function () {},
    requestAnimationFrame: function (cb) { setImmediate(cb); return 1; },
    cancelAnimationFrame: function () {}
  };

  global.wx = {
    createCanvas: function () { return canvas; },
    onTouchStart: function (cb) { touchHandlers.push(cb); },
    onTouchMove: function (cb) { touchHandlers.push(cb); },
    onTouchEnd: function (cb) { touchHandlers.push(cb); },
    getSystemInfoSync: function () {
      return { windowWidth: canvas.width, windowHeight: canvas.height, pixelRatio: 2, platform: 'devtools' };
    },
    getSystemInfo: function () { return { windowWidth: canvas.width, windowHeight: canvas.height }; },
    createImage: function () { return { src: '', onload: function () {} }; },
    vibrateShort: function () {},
    showToast: function () {},
    setStorageSync: function () {}, getStorageSync: function () { return ''; },
    removeStorageSync: function () {},
    getFileSystemManager: function () {
      return { writeFileSync: function () {}, readFileSync: function () { return ''; }, accessSync: function () {} };
    }
  };

  return { canvas: canvas, calls: calls, touchHandlers: touchHandlers };
}

// 模拟一次触摸 (用相对坐标, 由调用方换算成实际坐标)
function fireTouch(handlers, x, y) {
  var evt = {
    touches: [{ clientX: x, clientY: y, x: x, y: y }],
    changedTouches: [{ clientX: x, clientY: y, x: x, y: y }],
    timeStamp: Date.now()
  };
  handlers.forEach(function (cb) { if (cb) cb(evt); });
}

function uninstall() {
  try { delete global.wx; } catch (e) { global.wx = undefined; }
}

module.exports = { install: install, fireTouch: fireTouch, uninstall: uninstall, CTX_METHODS: CTX_METHODS };