// src/net-state.js — 把服务端 room.poll 的 view 适配成「牌桌渲染状态」
//
// [为什么存在] 服务端只发 publicView（别人的 hand 只有 handCount），
//   而渲染层与本地引擎习惯 players[].hand 是数组。
//   这里把别人的 hand 补成等长空数组（只用于 .length 渲染），不泄漏任何牌 id。
//   纯函数、不依赖 wx.*。
function seatId(n) {
  return String.fromCharCode(65 + (n || 0));
}

function toRender(view) {
  if (!view || !view.state) return null;
  var st = view.state;
  var mine = seatId(view.you == null ? 0 : view.you);
  var out = {};
  Object.keys(st).forEach(function (k) { out[k] = st[k]; });
  out.players = (st.players || []).map(function (p) {
    var copy = {};
    Object.keys(p).forEach(function (k) { copy[k] = p[k]; });
    if (p.id === mine) {
      copy.hand = p.hand || [];
    } else {
      var n = p.handCount == null ? 0 : p.handCount;
      var filler = [];
      for (var i = 0; i < n; i++) filler.push(null);
      copy.hand = filler;
    }
    if (copy['底牌'] && copy.id !== mine) copy['底牌'] = null;
    return copy;
  });
  return out;
}

module.exports = { toRender: toRender, seatId: seatId };
