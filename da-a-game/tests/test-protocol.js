// [2026-11-16 用户] 联网对战 P0：protocol 信封校验
var assert = require('assert');
var protocol = require('../src/protocol.js');
var version = require('../src/version.js');
var checks = 0;
function ok(name, cond) { checks++; assert.ok(cond, name); }

var env = protocol.makeAction('PLAY', { playerId: 'B', cardIds: ['H-4-1'] }, 3, 1000);
ok('makeAction type', env.type === 'PLAY');
ok('makeAction seq', env.baseSeq === 3);
ok('makeAction v', env.v === version.PROTOCOL_VERSION);
ok('valid envelope', protocol.validateEnvelope(env).ok === true);

ok('reject null', protocol.validateEnvelope(null).code === 'BAD_ENVELOPE');
ok('reject bad protocol', protocol.validateEnvelope({ v: 99, type: 'PASS', payload: {} }).code === 'BAD_VERSION');
ok('reject unknown type', protocol.validateEnvelope(protocol.makeAction('DROP', {}, 0)).code === 'BAD_TYPE');
ok('reject PLAY without cards', protocol.validateEnvelope(protocol.makeAction('PLAY', { playerId: 'B' }, 0)).code === 'BAD_PAYLOAD');
ok('reject negative seq', protocol.validateEnvelope({ v: 1, type: 'PASS', payload: {}, baseSeq: -1 }).code === 'BAD_SEQ');
ok('accept PASS without payload', protocol.validateEnvelope({ v: 1, type: 'PASS', baseSeq: 0 }).ok === true);

ok('actionKey stable', protocol.actionKey(env) === protocol.actionKey(Object.assign({}, env)));
ok('actionKey includes seq', protocol.actionKey(env) !== protocol.actionKey(Object.assign({}, env, { baseSeq: 4 })));
ok('actions whitelist', protocol.ACTIONS.join(',') === 'PLAY,PASS,PUSH_WIND');

console.log('protocol: ' + checks + ' checks passed');
