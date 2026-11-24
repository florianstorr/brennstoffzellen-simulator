// Plausibilitätstests für das Zellmodell. Ausführen mit: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/model.js');

const BASE = { T: 70, pa: 1.5, pc: 1.5, o2: false, RH: 1, tm: 51, Pt: 0.4 };
const with_ = (o) => Object.assign({}, BASE, o);
const U = (s, j) => M.voltage(M.params(s), j).U;

test('Standardpotential bei 25 °C ist 1,229 V', () => {
  const p = M.params(with_({ T: 25, RH: 0, pa: 1, pc: 1, o2: true }));
  assert.ok(Math.abs(p.E0 - 1.229) < 1e-3);
});

test('Sättigungsdampfdruck bei 70 °C ≈ 0,312 bar', () => {
  assert.ok(Math.abs(M.psat(70) - 0.312) < 0.003);
});

test('Referenzfall Luft, 70 °C: Kennlinie im üblichen Bereich', () => {
  const ocv = U(BASE, 0), u1 = U(BASE, 1.0);
  assert.ok(ocv > 0.9 && ocv < 1.0, `Leerlauf ${ocv}`);
  assert.ok(u1 > 0.55 && u1 < 0.7, `U(1 A/cm²) ${u1}`);
  const best = M.maxPower(M.curve(M.params(BASE)));
  assert.ok(best.P > 0.6 && best.P < 0.9, `Pmax ${best.P}`);
});

test('Spannung fällt monoton mit der Stromdichte', () => {
  const pts = M.curve(M.params(BASE));
  for (let i = 1; i < pts.length; i++) assert.ok(pts[i].U < pts[i - 1].U);
});

test('Reiner Sauerstoff liefert mehr Spannung als Luft', () => {
  assert.ok(U(with_({ o2: true }), 1.0) > U(BASE, 1.0));
});

test('Trockene Membran erhöht den ohmschen Verlust', () => {
  const nass = M.params(BASE).Ri, trocken = M.params(with_({ RH: 0.3 })).Ri;
  assert.ok(trocken > 3 * nass);
});

test('Weniger Platin senkt die Spannung', () => {
  assert.ok(U(with_({ Pt: 0.2 }), 0.2) < U(BASE, 0.2));
});

test('Energiebilanz: U + Verluste + reversible Wärme = 1,481 V', () => {
  const p = M.params(BASE), v = M.voltage(p, 0.8);
  const sum = v.U + v.act + v.ohm + v.conc + (M.CONST.HHV - p.EN);
  assert.ok(Math.abs(sum - M.CONST.HHV) < 1e-12);
});

test('Faraday: 60 Zellen, 100 cm², 1 A/cm² ≈ 41,8 NL/min H₂', () => {
  const k = M.stack(0.62, 1.0, 60, 100);
  assert.ok(Math.abs(k.H2_NLmin - 41.8) < 0.1, `${k.H2_NLmin}`);
});
