/*
 * Stationäres 0D-Modell einer PEM-Brennstoffzelle (H2/O2 bzw. H2/Luft).
 *
 *   U = E_N − η_akt − η_ohm − η_konz
 *
 * Läuft im Browser (window.FCModel) und in Node (module.exports).
 */
(function (root) {
  'use strict';

  var CONST = {
    R: 8.314462618,   // J/(mol·K)
    F: 96485.332,     // C/mol
    B: 0.07,          // V, empirischer Stofftransport-Koeffizient
    JN: 0.002,        // A/cm², interner Strom durch H2-Crossover
    ALPHA: 1,         // Durchtrittsfaktor Kathode (ORR)
    EA: 66000,        // J/mol, Aktivierungsenergie ORR an Pt
    J0_REF: 1e-6,     // A/cm² bei 80 °C, 0,4 mg/cm² Pt, p(O2) = 0,21 bar
    RC: 0.03,         // Ω·cm², Kontaktwiderstand
    HHV: 1.481,       // V, Brennwert-Spannung (ΔH = −286 kJ/mol)
    LHV: 1.253        // V, Heizwert-Spannung (ΔH = −242 kJ/mol)
  };

  /** Sättigungsdampfdruck von Wasser in bar (Buck-Gleichung), T in °C. */
  function psat(Tc) {
    return 0.61121 * Math.exp((18.678 - Tc / 234.5) * (Tc / (257.14 + Tc))) / 100;
  }

  /**
   * Zustandsabhängige Größen.
   * s = { T [°C], pa [bar], pc [bar], o2 [bool], RH [0..1], tm [µm], Pt [mg/cm²] }
   */
  function params(s) {
    var R = CONST.R, F = CONST.F;
    var TK = s.T + 273.15;
    var ps = psat(s.T);
    var pw = Math.min(ps * s.RH, 0.9 * Math.min(s.pa, s.pc));
    var pH2 = Math.max(s.pa - pw, 0.01);
    var pO2 = Math.max((s.o2 ? 1 : 0.21) * (s.pc - pw), 0.005);

    // Nernst-Spannung, flüssiges Produktwasser
    var E0 = 1.229 - 0.000846 * (TK - 298.15);
    var EN = E0 + R * TK / (2 * F) * Math.log(pH2 * Math.sqrt(pO2));

    // Austauschstromdichte der Kathode (Arrhenius, Pt-Beladung, O2-Partialdruck)
    var j0 = CONST.J0_REF * (s.Pt / 0.4) *
             Math.exp(-CONST.EA / R * (1 / TK - 1 / 353.15)) *
             Math.sqrt(pO2 / 0.21);

    // Membran: Springer-Modell für Nafion
    var a = s.RH;
    var lam = 0.043 + 17.18 * a - 39.85 * a * a + 36 * a * a * a;
    var sigma = Math.max(0.005139 * lam - 0.00326, 1e-4) * Math.exp(1268 * (1 / 303 - 1 / TK)); // S/cm
    var Ri = s.tm * 1e-4 / sigma + CONST.RC; // Ω·cm²

    // Grenzstromdichte, sättigt bei hohem O2-Partialdruck
    var jL = 4.5 * pO2 / (pO2 + 0.37);

    return { TK: TK, psat: ps, pw: pw, pH2: pH2, pO2: pO2, E0: E0, EN: EN,
             j0: j0, lam: lam, sigma: sigma, Ri: Ri, jL: jL };
  }

  /** Zellspannung und Verluste bei Stromdichte j [A/cm²]. */
  function voltage(p, j) {
    var b = CONST.R * p.TK / (CONST.ALPHA * CONST.F);
    var act = b * Math.asinh((j + CONST.JN) / (2 * p.j0));
    var ohm = j * p.Ri;
    var conc = j < p.jL ? CONST.B * Math.log(p.jL / (p.jL - j)) : Infinity;
    return { U: p.EN - act - ohm - conc, act: act, ohm: ohm, conc: conc, b: b };
  }

  /** Kennlinie bis kurz vor die Grenzstromdichte oder bis U ≤ 0. */
  function curve(p, n) {
    n = n || 320;
    var pts = [], jEnd = p.jL * 0.995;
    for (var i = 0; i <= n; i++) {
      var j = jEnd * i / n, v = voltage(p, j);
      if (!(v.U > 0)) break;
      pts.push({ j: j, U: v.U, P: j * v.U });
    }
    return pts;
  }

  /** Punkt maximaler Leistungsdichte einer Kennlinie. */
  function maxPower(pts) {
    var best = { j: 0, U: 0, P: 0 };
    pts.forEach(function (q) { if (q.P > best.P) best = q; });
    return best;
  }

  /** Stack-Größen nach Faraday. N Zellen, A in cm². */
  function stack(U, j, N, A) {
    var I = j * A;
    var nH2 = N * I / (2 * CONST.F); // mol/s
    return {
      I: I,
      U: N * U,
      Pel: N * U * I,
      Q: N * I * (CONST.HHV - U),
      nH2: nH2,
      H2_NLmin: nH2 * 22.414 * 60,
      H2_gh: nH2 * 2.016 * 3600,
      O2_NLmin: nH2 / 2 * 22.414 * 60,
      H2O_gh: nH2 * 18.015 * 3600
    };
  }

  var api = { CONST: CONST, psat: psat, params: params, voltage: voltage,
              curve: curve, maxPower: maxPower, stack: stack };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FCModel = api;
})(typeof window !== 'undefined' ? window : globalThis);
