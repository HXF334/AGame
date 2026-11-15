// src/public-view.js — 给「客户端渲染 / 联网同步」用的状态投影
//
// [为什么存在] 联机时服务端绝不能把别人的手牌（以及牌堆顺序）发给客户端。
//   这里做**唯一一份**投影规则：返回给 viewerId 的 state 里
//   - 自己的 hand / 底牌 原样保留；
//   - 别人的 hand 只给张数（handCount），不出现任何牌 id；
//   - deck / dealOrder 一律不出现（洗牌顺序是隐藏信息）；
//   - 别人的底牌在 `底牌公开 !== true` 时隐藏；
//   - 桌面 table / 弃牌 discarded / 出牌流水 plays 是公开信息，原样保留。
//
// 纯函数、不依赖 wx.*，可在无头测试里直接用。
function project(state, viewerId) {
  if (!state) return state;
  var out = {};
  Object.keys(state).forEach(function (k) {
    if (k === 'deck' || k === 'dealOrder') return;   // 洗牌顺序是隐藏信息
    out[k] = state[k];
  });

  var revealBottom = state['底牌公开'] === true;
  out.players = (state.players || []).map(function (p) {
    var copy = {};
    Object.keys(p).forEach(function (k) {
      if (k === 'hand' || k === '底牌') return;
      copy[k] = p[k];
    });
    copy.handCount = (p.hand || []).length;
    if (p.id === viewerId) {
      copy.hand = p.hand;
      copy['底牌'] = p['底牌'];
    } else {
      copy['底牌'] = revealBottom ? p['底牌'] : null;
    }
    return copy;
  });

  out.viewerId = viewerId;
  return out;
}

module.exports = { project: project };
