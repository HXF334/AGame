"use strict";
var fs = require("fs");
var path = require("path");
var cp = require("child_process");

// tools/check-items.js — UI 验收清单逐项自动判定
//   每个场景跑**独立进程**(game.js 的模块级状态会串味) -> 录制绘制调用 -> 断言
// 用法: node tools/check-items.js   报告落 tools/shots/item-report.txt (UTF-8)

var HERE = __dirname;
// 报告默认写到系统临时目录: 仓库内不留生成物(commit-gate 会 git add -A)
var SHOTS = process.env.DADA_ACCEPT_OUT || path.join(require("os").tmpdir(), "dada-ui-accept");
var VW = 844, VH = 390;

var SCENES = {};
function sc(name) {
  if (SCENES[name]) return SCENES[name];
  var out = path.join(SHOTS, "scene-" + name + ".json");
  var r = cp.spawnSync(process.execPath, [path.join(HERE, "ui-acceptance-scene.js"), name, out],
    { encoding: "utf8", maxBuffer: 1 << 26, timeout: 120000 });
  if (r.status !== 0) { SCENES[name] = { error: "exit " + r.status }; return SCENES[name]; }
  SCENES[name] = JSON.parse(fs.readFileSync(out, "utf8"));
  return SCENES[name];
}

function textsOf(d, t) {
  return d.ops.texts.filter(function (x) { return x.t === t; });
}
function badgeCounts(d) {
  var c = { "敌": 0, "友": 0, "?": 0 };
  d.ops.texts.forEach(function (x) { if (c[x.t] !== undefined) c[x.t]++; });
  return c;
}
function badgeTotal(d) {
  var n = 0;
  d.ops.texts.forEach(function (x) { if (x.t === "敌" || x.t === "友" || x.t === "?") n++; });
  return n;
}
function fontPx(f) {
  var m = /(\d+(?:\.\d+)?)px/.exec(f || "");
  return m ? parseFloat(m[1]) : 0;
}
function estWidth(s, px) {
  var w = 0;
  for (var i = 0; i < s.length; i++) w += (s.charCodeAt(i) > 0x2e80) ? px : px * 0.55;
  return w;
}
function handOf(d, pid) {
  var p = d.players.filter(function (x) { return x.id === pid; })[0];
  return p ? p.hand : -1;
}
function gongRows(d, style) {
  return d.ops.texts.filter(function (x) { return x.style === style && /贡$/.test(x.t); });
}

var CHECKS = [
  { id: "E1", scene: "play", desc: "手牌全部显示, 无+N截断",
    fn: function (d) {
      var trunc = d.ops.texts.filter(function (x) { return /^\+\d+$/.test(x.t); });
      var hb = d.handHitboxes.length, hand = handOf(d, d.humanPlayer);
      return { ok: trunc.length === 0 && hb === hand,
               detail: "trunc=" + trunc.length + " hitboxes=" + hb + " hand=" + hand };
    } },
  { id: "E23", scene: "play", desc: "每个别人头像旁有敌/友/?标记",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: badgeTotal(d) === 4,
               detail: "badges=" + badgeTotal(d) + " (敌" + c["敌"] + "/友" + c["友"] + "/?=" + c["?"] + ")" };
    } },
  { id: "E24a", scene: "play", desc: "抓方视角: 主A持有者=敌",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: c["敌"] === 1, detail: "敌=" + c["敌"] + " 友=" + c["友"] + " ?=" + c["?"] };
    } },
  { id: "E24b", scene: "observer", desc: "主A持有者视角: 其他人全是?",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: c["?"] === 4 && c["敌"] === 0 && c["友"] === 0,
               detail: "敌=" + c["敌"] + " 友=" + c["友"] + " ?=" + c["?"] };
    } },
  { id: "E31b", scene: "observerLit", desc: "次方亮明后按真阵营表刷新",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: c["敌"] === 3 && c["友"] === 1 && c["?"] === 0,
               detail: "敌=" + c["敌"] + " 友=" + c["友"] + " ?=" + c["?"] };
    } },
  { id: "E28a", scene: "oneV4Holder", desc: "1V4主A持有者: 四人全敌",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: c["敌"] === 4, detail: "敌=" + c["敌"] + " 友=" + c["友"] + " ?=" + c["?"] };
    } },
  { id: "E28b", scene: "oneV4Taker", desc: "1V4抓方彼此=友, 主A=敌",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: c["敌"] === 1 && c["友"] === 3,
               detail: "敌=" + c["敌"] + " 友=" + c["友"] + " ?=" + c["?"] };
    } },
  { id: "E45", scene: "signalC", desc: "三个4取主A的牌 -> 那人被标友(抓方)",
    fn: function (d) {
      var c = badgeCounts(d);
      return { ok: c["友"] === 1 && c["敌"] === 1 && c["?"] === 2,
               detail: "敌=" + c["敌"] + " 友=" + c["友"] + " ?=" + c["?"] };
    } },
  { id: "E32a", scene: "gong", desc: "桌面贡字(大贡)用#f0a500",
    fn: function (d) {
      var g = textsOf(d, "大贡");
      return { ok: g.length >= 1 && g[0].style === "#f0a500",
               detail: "大贡x" + g.length + " style=" + (g[0] ? g[0].style : "-") };
    } },
  { id: "E32b", scene: "settle", desc: "结算按出完顺序显示大贡/二贡/三贡(#ffd98a)",
    fn: function (d) {
      var want = ["大贡", "二贡", "三贡"], bad = [];
      want.forEach(function (t) {
        var g = textsOf(d, t).filter(function (x) { return x.style === "#ffd98a"; });
        if (g.length < 1) bad.push(t + ":缺");
      });
      return { ok: bad.length === 0, detail: bad.length ? bad.join(" ") : "三档贡标签齐全且金色一致" };
    } },
  { id: "E32c", scene: "settle", desc: "贡标签不压分数(按左右边界判定)",
    fn: function (d) {
      var rows = gongRows(d, "#ffd98a");
      var scores = d.ops.texts.filter(function (x) { return /分$/.test(x.t); });
      var bad = [];
      rows.forEach(function (g) {
        var sc2 = scores.filter(function (s) { return Math.abs(s.y - g.y) < 6; })[0];
        if (!sc2) { bad.push(g.t + ":无同行分数"); return; }
        var lw = estWidth(g.t, fontPx(g.font)), sw = estWidth(sc2.t, fontPx(sc2.font));
        var gLeft = g.x - lw, gRight = g.x, sLeft = sc2.x - sw, sRight = sc2.x;
        if (gLeft < sRight && sLeft < gRight) bad.push(g.t + ":重叠");
      });
      return { ok: bad.length === 0 && rows.length >= 3,
               detail: bad.length ? bad.join(";") : ("标签" + rows.length + "个, 与分数无重叠") };
    } },
  { id: "E15", scene: "settle", desc: "结算不显示「头名」(D-039已改为大贡/二贡/三贡/四贡)",
    fn: function (d) {
      var n = textsOf(d, "头名").length;
      return { ok: n === 0, detail: "头名出现" + n + "次(应0)" };
    } },
  { id: "E33a", scene: "taken", desc: "被取的一手牌: 只标最后一张一个「取」",
    fn: function (d) {
      var g = textsOf(d, "取");
      return { ok: g.length === 1 && g[0].style === "#ffe9a8",
               detail: "取x" + g.length + " style=" + (g[0] ? g[0].style : "-") };
    } },
  { id: "E33b", scene: "play", desc: "没被取的牌不出现「取」",
    fn: function (d) {
      var n = textsOf(d, "取").length;
      return { ok: n === 0, detail: "取x" + n };
    } },
  { id: "E47", scene: "settle", desc: "桌面#f0a500 与 结算#ffd98a 两种金色不同是预期",
    fn: function (d) {
      var tbl = textsOf(sc("gong"), "大贡")[0];
      var stl = textsOf(d, "大贡").filter(function (x) { return x.style === "#ffd98a"; })[0];
      return { ok: !!tbl && !!stl && tbl.style === "#f0a500" && stl.style === "#ffd98a" && tbl.style !== stl.style,
               detail: "桌面=" + (tbl ? tbl.style : "-") + " 结算=" + (stl ? stl.style : "-") };
    } },
  { id: "E4", scene: "gate", desc: "亮A四个花色按钮: 间距约8px, 整体放大",
    fn: function (d) {
      var suits = d.buttons.filter(function (b) { return b.kind === "suit"; });
      suits.sort(function (a, b) { return a.x - b.x; });
      var gaps = [], w = [];
      for (var i = 0; i + 1 < suits.length; i++) gaps.push(Math.round(suits[i + 1].x - (suits[i].x + suits[i].w)));
      suits.forEach(function (b) { w.push(Math.round(b.w)); });
      var okGap = gaps.length === 3 && gaps.every(function (g) { return Math.abs(g - 8) <= 1; });
      var okW = suits.length === 4 && w.every(function (x) { return x >= 50; });
      return { ok: suits.length === 4 && okGap && okW,
               detail: "count=" + suits.length + " gaps=" + gaps.join(",") + " w=" + w.join(",") };
    } },
  { id: "E5", scene: "gate", desc: "亮A表盘半径=0.055H(与出牌闹钟同大小)",
    fn: function (d) {
      var want = Math.round(VH * 0.055);
      var hit = d.ops.arcs.filter(function (a) { return a.r === want; });
      return { ok: hit.length >= 1, detail: "want r=" + want + " 命中" + hit.length };
    } },
  { id: "E8", scene: "autoplay", desc: "托管: 半透明「取消托管」压在手牌下半部",
    fn: function (d) {
      var g = textsOf(d, "取消托管");
      if (g.length !== 1) return { ok: false, detail: "取消托管x" + g.length };
      var handTop = d.layout.hand.y, cardH = d.layout.hand.cardH;
      var lo = handTop + cardH * 0.45, hi = handTop + cardH * 1.05;
      return { ok: g[0].y >= lo && g[0].y <= hi && g[0].style === "#ffd98a",
               detail: "y=" + Math.round(g[0].y) + " 手牌区[" + Math.round(lo) + "," + Math.round(hi) + "] style=" + g[0].style };
    } },
  { id: "E22", scene: "autoplay", desc: "托管时画面没有出牌/不出/提示三个按钮",
    fn: function (d) {
      var bad = ["出牌", "不出", "提示"].filter(function (t) { return textsOf(d, t).length > 0; });
      return { ok: bad.length === 0, detail: bad.length ? "仍显示:" + bad.join(",") : "三个按钮均未画" };
    } },
  { id: "B6", scene: "passed", desc: "真人「不出」画在按钮位(不是头像上方)",
    fn: function (d) {
      var ns = textsOf(d, "不出");
      var atBtn = ns.filter(function (x) { return Math.abs(x.y - d.layout.humanPlay.y) < 12; });
      var atSeat = ns.filter(function (x) { return Math.abs(x.y - d.layout.humanPlay.y) >= 12; });
      return { ok: atBtn.length >= 1 && atSeat.length >= 1,
               detail: "不出共" + ns.length + " 按钮位" + atBtn.length + " 头像位" + atSeat.length };
    } },
  { id: "E29", scene: "passed", desc: "各家过牌者头像旁都显示「不出」",
    fn: function (d) {
      var n = textsOf(d, "不出").length;
      return { ok: n >= 2, detail: "不出x" + n };
    } }
];

function main() {
  if (!fs.existsSync(SHOTS)) fs.mkdirSync(SHOTS, { recursive: true });
  var lines = [], pass = 0, fail = 0;
  CHECKS.forEach(function (ck) {
    var d = sc(ck.scene);
    if (d.error) { fail++; lines.push("ERROR " + ck.id + " [" + ck.scene + "] " + d.error); return; }
    var r = ck.fn(d);
    if (r.ok) { pass++; lines.push("PASS " + ck.id + "  " + ck.desc + "  (" + r.detail + ")"); }
    else { fail++; lines.push("FAIL " + ck.id + "  " + ck.desc + "  (" + r.detail + ")"); }
  });
  var head = "UI 验收逐项自动判定\nPASS=" + pass + "  FAIL=" + fail + "  共" + (pass + fail) + " 项\n";
  fs.writeFileSync(path.join(SHOTS, "item-report.txt"), head + lines.join("\n") + "\n", "utf8");
  lines.forEach(function (l) { console.log(l); });
  console.log("SUMMARY PASS=" + pass + " FAIL=" + fail);
  process.exit(0);
}
main();