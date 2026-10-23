// tests/test-forced-check-establishedby.js
// 回归: FORCED_CHECK 的 establishedBy 必须是合法玩家ID, 绝不能是花色名
//
// 背景 (用户 2026-10-23 IDE 截图报障):
//   画面显示「当前: DEFAULT_HEART」「次方: 隐藏DEFAULT_HEART」
//   「主A: ♥ DEFAULT_HEART 双A成功」
//   日志刷屏「PLAYER_NOT_FOUND player DEFAULT_HEART not found」
//   → 双大A 无法选牌也无法出牌。
//
// 根因 (src/transition.js runForcedCheck 兜底分支):
//   全部花色都查不到时, 原实现返回
//     { suit: 'H', establishedBy: 'DEFAULT_HEART', viaMethod: 'DEFAULT_HEART' }
//   'DEFAULT_HEART' 是**花色名**, 不是玩家ID ('A'..'E')。
//   于是 determineFirstPlayer / 各种 lookup 都找不到该玩家,
//   currentPlayer 被设成 'DEFAULT_HEART', 之后每次出牌都 PLAYER_NOT_FOUND。
//
// 修复: 兜底改为查找**实际持有红桃A** 的玩家, 用其真实 ID;
//   再兜底则取第一位有手牌的玩家; 最后才退回 startPlayer。
//
// 本测试不依赖真实牌局, 直接用「每人同花色A 都是2张」的手牌
// 构造出「强制排查全查不到」的场景, 断言 establishedBy 仍是合法 ID。
var { transition } = require('../src/transition.js');
var { ACTIONS, PHASES } = require('../src/phases.js');
var card = require('../src/card.js');

var passed = 0, failed = 0, failures = [];
function check(name, cond, detail) {
  if (cond) passed++; else { failed++; failures.push(name + (detail ? ' | ' + detail : '')); }
}
function section(t) { console.log('\n=== ' + t + ' ==='); }

var IDS = ['A', 'B', 'C', 'D', 'E'];

// 构造: 每种花色的 A 都是 2 张 (同花色成对) -> runForcedCheck 全部 acesInHand.length !== 1
function mkAllPaired() {
  return {
    // FORCED_CHECK 只允许在 LIANG_A 阶段 (引擎报 ILLEGAL_ACTION:
    // "FORCED_CHECK only allowed in LIANG_A, current=FAN_A")
    phase: PHASES.LIANG_A,
    players: IDS.map(function (id, i) {
      var hand = [];
      ['H', 'D', 'C', 'S'].forEach(function (s, k) {
        // 每花色两张 A (k 用于唯一 id)
        hand.push(card.createNormalCard(s, 14, id + 'a' + k + 'x'));
        hand.push(card.createNormalCard(s, 14, id + 'a' + k + 'y'));
      });
      // 补一些非 A 牌, 保证手牌非空 (极端兜底分支才有意义)
      [5, 6, 7, 8, 9, 10, 11, 12, 13].forEach(function (r) {
        hand.push(card.createNormalCard('H', r, id + 'f' + r));
      });
      return { id: id, hand: hand };
    }),
    startPlayerIndex: 0,
    deck: [],
    dealOrder: [],
    主A: null,
    反A: null,
    次方: null,
    mode: null,
    底牌公开: false,
    actions: []
  };
}

// ================= 1. 全成对时兜底必须给合法 ID =================
section('1. 强制排查全查不到 — 兜底 establishedBy 必须是合法玩家ID');

{
  var st = mkAllPaired();
  // 先确认前置状态: 确实没有任何花色满足 "恰好1张A"
  var anySingle = st.players.some(function (p) {
    return ['H', 'D', 'C', 'S'].some(function (s) {
      return p.hand.filter(function (c) { return c.suit === s && c.rank === 14; }).length === 1;
    });
  });
  check('1.0 前提: 确实无任何「恰好1张A」', anySingle === false, 'anySingle=' + anySingle);

  // 直接跑 FORCED_CHECK
  var r = transition(st, { type: ACTIONS.FORCED_CHECK, payload: {} });
  check('1.1 FORCED_CHECK 返回 ok', r && r.ok === true, r && r.error ? JSON.stringify(r.error) : '');

  if (r && r.ok) {
    var eb = r.state.主A && r.state.主A.establishedBy;
    check('1.2 establishedBy 已定义', !!eb, 'eb=' + eb);
    check('1.3 establishedBy 是合法玩家ID', IDS.indexOf(eb) !== -1, 'eb=' + eb);
    check('1.4 establishedBy 不是花色名', eb !== 'DEFAULT_HEART', 'eb=' + eb);
    check('1.5 suit 合法', ['H', 'D', 'C', 'S'].indexOf(r.state.主A.suit) !== -1,
      'suit=' + (r.state.主A && r.state.主A.suit));
    check('1.6 viaMethod 是合法方法名',
      ['FORCED_CHECK', 'LIANG_A'].indexOf(r.state.主A.viaMethod) !== -1,
      'vm=' + (r.state.主A && r.state.主A.viaMethod));
    console.log('   [信息] 兜底结果: suit=' + r.state.主A.suit +
                ' establishedBy=' + eb + ' viaMethod=' + r.state.主A.viaMethod);
  }
}

// ================= 2. 兜底 ID 必须真实持有红桃A =================
section('2. 兜底玩家必须确实持有红桃A');

{
  var st = mkAllPaired();
  var r = transition(st, { type: ACTIONS.FORCED_CHECK, payload: {} });
  if (r && r.ok) {
    var eb = r.state.主A.establishedBy;
    var p = st.players.filter(function (x) { return x.id === eb; })[0];
    check('2.1 兜底玩家存在', !!p, 'eb=' + eb);
    if (p) {
      var heartA = p.hand.filter(function (c) { return c.suit === 'H' && c.rank === 14; });
      check('2.2 该玩家持有红桃A', heartA.length > 0, 'count=' + heartA.length);
    }
  }
}

// ================= 3. 每个 startPlayerIndex 都不能产出非法 ID =================
section('3. 遍历所有起手位置, establishedBy 均合法');

{
  var allOk = true, bad = [];
  for (var idx = 0; idx < 5; idx++) {
    var st = mkAllPaired();
    st.startPlayerIndex = idx;
    var r = transition(st, { type: ACTIONS.FORCED_CHECK, payload: {} });
    if (!r || !r.ok) { allOk = false; bad.push('idx' + idx + ':transition failed'); continue; }
    var eb = r.state.主A && r.state.主A.establishedBy;
    if (IDS.indexOf(eb) === -1) { allOk = false; bad.push('idx' + idx + ':' + eb); }
  }
  check('3.1 全部 5 个起手位置都得到合法 ID', allOk, bad.join(', '));
}

// ================= 4. 兜底后 currentPlayer 必须可用 =================
section('4. 兜底后 determineFirstPlayer 不应返回非法玩家');

{
  var { determineFirstPlayer } = require('../src/transition.js');
  var st = mkAllPaired();
  var r = transition(st, { type: ACTIONS.FORCED_CHECK, payload: {} });
  if (r && r.ok) {
    var fp = determineFirstPlayer(r.state);
    check('4.1 determineFirstPlayer 返回合法 ID 或 null',
      fp === null || IDS.indexOf(fp) !== -1, 'fp=' + fp);
    console.log('   [信息] determineFirstPlayer =', fp);
  }
}

console.log('\n=== 总结 ===');
console.log('checks: ' + (passed + failed) + ' | passed: ' + passed + ' | failed: ' + failed);
if (failed > 0) { console.log('\nFAILED:'); failures.forEach(function (f) { console.log('  - ' + f); }); }
process.exit(failed > 0 ? 1 : 0);