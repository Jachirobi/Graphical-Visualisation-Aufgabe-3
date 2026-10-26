/**
 * Aufgabe 3 – Kolorieren von Oberflächen mit WebGL
 *
 * Das Rennrad aus Aufgabe 2 – jetzt aus gefüllten Dreiecken statt aus Linien.
 * Die Geometrie stammt weiter aus der Handskizze (Fixpunkte in SKIZZE), die Farben aus der
 * von Hand kolorierten Skizze (PALETTE). Jede Ecke eines Dreiecks hat eine eigene Farbe;
 * WebGL interpoliert sie über die Fläche (Farbverlauf). Gezeichnet wird mit EINEM Aufruf:
 *   gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0)
 * Längen: positions = n·2, colors = n·4, indices = Dreiecke·3, jeder Index < n.
 */
(() => {
  "use strict";

  // Geometrie-Werkzeuge
  const TAU = Math.PI * 2;
  const rad = (d) => (d * Math.PI) / 180;
  const pol = (c, r, a) => [c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)];
  const add = (p, v, k = 1) => [p[0] + v[0] * k, p[1] + v[1] * k];
  const unit = (d) => [Math.cos(rad(d)), Math.sin(rad(d))];
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const len = (v) => Math.hypot(v[0], v[1]);
  const norm = (v) => [v[0] / len(v), v[1] / len(v)];
  const perp = (v) => [-v[1], v[0]];
  const deg = (r) => (r * 180) / Math.PI;

  function circle(c, r, n, a0 = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push(pol(c, r, a0 + (i / n) * TAU));
    return pts;
  }

  /** Zahnkranz-Kontur: je Zahn 4 Punkte (Fuß, Flanke, Kopf, Flanke) */
  function toothedOutline(c, rOuter, rInner, teeth, a0 = 0) {
    const pts = [], step = TAU / teeth;
    for (let i = 0; i < teeth; i++) {
      const a = a0 + i * step;
      pts.push(pol(c, rInner, a), pol(c, rOuter, a + step * 0.22), pol(c, rOuter, a + step * 0.5), pol(c, rInner, a + step * 0.72));
    }
    return pts;
  }

  function bezier(p0, p1, p2, n) {
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, u = 1 - t;
      pts.push([u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0], u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1]]);
    }
    return pts;
  }

  /** Catmull-Rom-Spline durch Stützpunkte */
  function spline(P, seg = 8, closed = false) {
    const n = P.length, out = [];
    const get = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
    for (let i = 0; i < (closed ? n : n - 1); i++) {
      const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
      for (let k = 0; k < seg; k++) {
        const t = k / seg, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t +
          (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    if (!closed) out.push(P[n - 1]);
    return out;
  }

  function outerTangent(c1, r1, c2, r2, side) {
    const d = sub(c2, c1), a = Math.atan2(d[1], d[0]) + side * Math.acos((r1 - r2) / len(d));
    const n = [Math.cos(a), Math.sin(a)];
    return [add(c1, n, r1), add(c2, n, r2)];
  }

  function place(o, d, pts) {
    const c = Math.cos(rad(d)), s = Math.sin(rad(d));
    return pts.map(([x, y]) => [o[0] + x * c - y * s, o[1] + x * s + y * c]);
  }

  // Fixpunkte aus der Handskizze (wie Aufgabe 2)
  const K = 40;                                            // 1 Kästchen = 40 mm
  const SKIZZE = {
    A: [0, 0], B: [26, 0], C: [10, -2.1], D: [20.5, 11.7], E: [21.6, 8.4], F: [5.5, 11.8], G: [22.5, 13.5], H: [4.65, 15.2],
  };
  const MASSE = { reifen: 8, felge: 6.25, kettenblatt: 2.75, bremsscheibe: 3, ritzel: 1.35,
    oberrohrHoehe: 11.15, sitzstrebeHoehe: 8.8, vorbauHoehe: 13.5 };
  const mm = (k) => [SKIZZE[k][0] * K, SKIZZE[k][1] * K];

  const R_TIRE = MASSE.reifen * K, R_TIRE_IN = R_TIRE - 24, R_RIM = MASSE.felge * K;
  const REAR = mm("A"), FRONT = mm("B"), BB = mm("C");
  const HT_TOP = mm("D"), HT_BOT = mm("E");
  const HT_DIR = norm(sub(HT_BOT, HT_TOP)), UP = [-HT_DIR[0], -HT_DIR[1]], HT_N = perp(HT_DIR);
  const ST_TOP = mm("F"), ST_DIR = norm(sub(ST_TOP, BB));
  const onSeatTube = (yK) => add(BB, ST_DIR, (yK * K - BB[1]) / ST_DIR[1]);
  const onSteerAxis = (yK) => add(HT_TOP, HT_DIR, (yK * K - HT_TOP[1]) / HT_DIR[1]);
  const SEAT_JUNCTION = onSeatTube(MASSE.sitzstrebeHoehe);
  const TT_REAR = onSeatTube(MASSE.oberrohrHoehe), TT_FRONT = onSteerAxis(MASSE.oberrohrHoehe);
  const POST_TOP = mm("H");
  const STEM_A = onSteerAxis(MASSE.vorbauHoehe), STEM_B = mm("G");
  const VIEW = { x: -400, y: -400, w: 1800, h: 1100 };
  const GROUND_Y = -R_TIRE;

  // Farben aus der kolorierten Skizze
  // Farbton (H) im Foto gemessen; Sättigung/Helligkeit auf Buntstift-Niveau angehoben.
  const PALETTE = {
    magenta: { h: 316, s: 0.56, l: 0.50, name: "Magenta", wo: "Sattel, Oberrohr, Kettenstreben" },
    tuerkis: { h: 198, s: 0.64, l: 0.46, name: "Türkisblau", wo: "Sattelstütze, Steuerrohr" },
    orange:  { h: 25,  s: 0.86, l: 0.56, name: "Orange", wo: "Sitzrohr, Gabel, Vorbau" },
    rot:     { h: 355, s: 0.70, l: 0.54, name: "Rot", wo: "Unterrohr, Sitzstreben" },
    gruen:   { h: 82,  s: 0.60, l: 0.52, name: "Lindgrün", wo: "Naben, Tretlager" },
    felge:   { h: 214, s: 0.58, l: 0.56, name: "Felgenblau", wo: "Felgen" },
    reifen:  { h: 210, s: 0.08, l: 0.20, name: "Reifenschwarz", wo: "Reifen, Lenker, Bremsscheibe" },
    wiese:   { h: 88,  s: 0.55, l: 0.52, name: "Wiesengrün", wo: "Boden" },
    metall:  { h: 210, s: 0.08, l: 0.62, name: "Metallgrau", wo: "Kettenblatt, Ritzel, Kette", ergaenzt: true },
  };

  function hsl2rgb(h, s, l) {
    const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
    const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [f(0), f(8), f(4)];
  }
  /** Farbe aus der Palette, optional heller/dunkler (dl) und mit Deckkraft */
  function col(key, dl = 0, alpha = 1) {
    const p = PALETTE[key];
    return [...hsl2rgb(p.h, p.s, Math.max(0, Math.min(1, p.l + dl))), alpha];
  }
  const hex = (c) => "#" + c.slice(0, 3).map((v) => Math.round(v * 255).toString(16).padStart(2, "0")).join("");
  function cssColor(name) {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    const m = /^#([0-9a-f]{6})$/i.exec(v);
    const n = m ? parseInt(m[1], 16) : 0;
    return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, 1];
  }

  // Mesh-Baukasten
  // positions: 2 Werte je Vertex, colors/flat: 4 Werte je Vertex (RGBA), indices: 3 je Dreieck
  class Mesh {
    constructor() { this.positions = []; this.colors = []; this.flat = []; this.indices = []; this.parts = []; }
    begin(name, group, technique, base) {
      this.cur = { name, group, technique, base, v0: this.positions.length / 2, i0: this.indices.length };
    }
    v(p, c) {
      const i = this.positions.length / 2;
      this.positions.push(p[0], p[1]);
      this.colors.push(...c);                              // Farbe dieser Ecke (für Verläufe)
      this.flat.push(...this.cur.base.slice(0, 3), c[3]);  // Grundfarbe des Teils (einfarbig)
      return i;
    }
    tri(a, b, c) { this.indices.push(a, b, c); }
    end() {
      const c = this.cur;
      c.vertices = this.positions.length / 2 - c.v0;
      c.triangles = (this.indices.length - c.i0) / 3;
      this.parts.push(c);
    }
  }

  // Grundformen aus Dreiecken
  /** Viereck p1..p4 (gegen den Uhrzeigersinn) mit Farbe je Ecke → 2 Dreiecke */
  function quad(m, p, c) {
    const i = p.map((q, k) => m.v(q, c[k]));
    m.tri(i[0], i[1], i[2]); m.tri(i[0], i[2], i[3]);
  }

  /** Scheibe als Dreiecksfächer: Mittelpunkt + n Randpunkte → n Dreiecke */
  function disc(m, c, r, n, cCenter, cEdge, ry = r) {
    const ic = m.v(c, cCenter), first = m.positions.length / 2;
    for (let k = 0; k < n; k++) { const a = (k / n) * TAU; m.v([c[0] + r * Math.cos(a), c[1] + ry * Math.sin(a)], cEdge); }
    for (let k = 0; k < n; k++) m.tri(ic, first + k, first + (k + 1) % n);
  }

  /** Ring als Dreiecksstreifen zwischen zwei Kreisen → 2n Dreiecke */
  function ring(m, c, rIn, rOut, n, cIn, cOut, a0 = 0) {
    const first = m.positions.length / 2;
    for (let k = 0; k < n; k++) {
      const a = a0 + (k / n) * TAU;
      m.v(pol(c, rIn, a), cIn); m.v(pol(c, rOut, a), cOut);
    }
    for (let k = 0; k < n; k++) {
      const i = first + 2 * k, j = first + 2 * ((k + 1) % n);
      m.tri(i, i + 1, j + 1); m.tri(i, j + 1, j);
    }
  }

  /** Beliebige sternförmige Kontur als Fächer vom Mittelpunkt (Sattel, Zahnkranz, Pedal) */
  function fan(m, pts, center, cCenter, cEdgeFn) {
    const ic = m.v(center, cCenter), first = m.positions.length / 2;
    pts.forEach((p, k) => m.v(p, typeof cEdgeFn === "function" ? cEdgeFn(p, k) : cEdgeFn));
    for (let k = 0; k < pts.length; k++) m.tri(ic, first + k, first + (k + 1) % pts.length);
  }

  /** Rohr a→b mit Breite w1/w2 und Zylinder-Schattierung: 4 Längsstreifen, Licht von oben */
  function tube(m, a, b, w1, w2, key) {
    const d = norm(sub(b, a));
    let n = perp(d);
    if (n[1] < 0 || (n[1] === 0 && n[0] > 0)) n = [-n[0], -n[1]];   // n zeigt nach oben (zum Licht)
    const rows = [[-0.5, col(key, -0.16)], [-0.08, col(key, 0)], [0.24, col(key, 0.17)], [0.5, col(key, -0.03)]];
    const ia = rows.map(([t, c]) => m.v(add(a, n, t * w1), c));
    const ib = rows.map(([t, c]) => m.v(add(b, n, t * w2), c));
    for (let k = 0; k < 3; k++) { m.tri(ia[k], ib[k], ib[k + 1]); m.tri(ia[k], ib[k + 1], ia[k + 1]); }
  }

  /** Breite Linie entlang eines Polygonzugs (Lenker, Kette, Bremsleitung) als Dreiecksstreifen */
  function strip(m, pts, w, cA, cB = cA) {
    const first = m.positions.length / 2;
    pts.forEach((p, k) => {
      const q0 = pts[Math.max(0, k - 1)], q1 = pts[Math.min(pts.length - 1, k + 1)];
      const n = perp(norm(sub(q1, q0)));
      m.v(add(p, n, w / 2), cA); m.v(add(p, n, -w / 2), cB);
    });
    for (let k = 0; k < pts.length - 1; k++) {
      const i = first + 2 * k;
      m.tri(i, i + 1, i + 3); m.tri(i, i + 3, i + 2);
    }
  }

  /** Gerades Stück mit Breite (Speiche, Kurbelarm) → 2 Dreiecke */
  function bar(m, a, b, w1, w2, c1, c2 = c1) {
    const n = perp(norm(sub(b, a)));
    quad(m, [add(a, n, -w1 / 2), add(b, n, -w2 / 2), add(b, n, w2 / 2), add(a, n, w1 / 2)], [c1, c2, c2, c1]);
  }

  /** Kettentrum a→b: Glieder abwechselnd hell/dunkel im Abstand der Kettenteilung (12,7 mm) */
  function chainRun(m, a, b) {
    const L = len(sub(b, a)), d = norm(sub(b, a));
    for (let s = 0, k = 0; s < L; s += 12.7, k++) {
      const e = Math.min(L, s + 12.7);
      bar(m, add(a, d, s), add(a, d, e), 9, 9, col("metall", k % 2 ? -0.26 : -0.12));
    }
  }

  // Szene aufbauen (von hinten nach vorn)
  function buildScene() {
    const m = new Mesh();
    const sky = [cssColor("--sky-top"), cssColor("--sky-bottom")];

    // Hintergrund und Boden
    m.begin("Himmel (Verlauf)", "Umgebung", "Viereck", sky[1]);
    quad(m, [[VIEW.x, VIEW.y], [VIEW.x + VIEW.w, VIEW.y], [VIEW.x + VIEW.w, VIEW.y + VIEW.h], [VIEW.x, VIEW.y + VIEW.h]],
      [sky[1], sky[1], sky[0], sky[0]]);
    m.end();

    m.begin("Wiesenstreifen", "Umgebung", "Viereck", col("wiese"));
    quad(m, [[VIEW.x, GROUND_Y - 30], [VIEW.x + VIEW.w, GROUND_Y - 30], [VIEW.x + VIEW.w, GROUND_Y], [VIEW.x, GROUND_Y]],
      [col("wiese", -0.12), col("wiese", -0.12), col("wiese", 0.08), col("wiese", 0.08)]);
    m.end();
    m.begin("Schraffur im Gras", "Umgebung", "Parallelogramme", col("wiese", -0.22));
    for (let x = VIEW.x + 8; x < VIEW.x + VIEW.w; x += 30) {
      quad(m, [[x - 14, GROUND_Y - 25], [x - 10, GROUND_Y - 25], [x + 4, GROUND_Y - 5], [x, GROUND_Y - 5]],
        Array(4).fill(col("wiese", -0.22)));
    }
    m.end();

    m.begin("Schatten unter den Rädern", "Umgebung", "Fächer, transparent", [0, 0, 0, 0.22]);
    [REAR, FRONT].forEach((c) => disc(m, [c[0], GROUND_Y + 2], 330, 48, [0.05, 0.08, 0.05, 0.28], [0.05, 0.08, 0.05, 0], 16));
    disc(m, [BB[0] + 30, GROUND_Y + 2], 160, 32, [0.05, 0.08, 0.05, 0.18], [0.05, 0.08, 0.05, 0], 9);
    m.end();

    // Laufräder
    function wheel(c, label, isRear) {
      m.begin(`${label}: Reifen`, label, "Ring", col("reifen"));
      ring(m, c, R_TIRE_IN, R_TIRE, 144, col("reifen", 0.1), col("reifen", -0.06));
      m.end();
      m.begin(`${label}: Reifenprofil`, label, "Vierecke", col("reifen", 0.22));
      for (let k = 0; k < 120; k++) {
        const a = (k / 120) * TAU, b = a + rad(0.9);
        quad(m, [pol(c, R_TIRE - 17, a), pol(c, R_TIRE - 17, b), pol(c, R_TIRE - 5, b + rad(1.2)), pol(c, R_TIRE - 5, a + rad(1.2))],
          Array(4).fill(col("reifen", 0.24)));
      }
      m.end();
      m.begin(`${label}: Felge`, label, "Ring", col("felge"));
      ring(m, c, R_RIM, R_TIRE_IN, 144, col("felge", -0.12), col("felge", 0.14));
      m.end();
      m.begin(`${label}: Felgenkante`, label, "Ring", col("felge", -0.25));
      ring(m, c, R_RIM - 4, R_RIM, 144, col("felge", -0.28), col("felge", -0.2));
      m.end();
      m.begin(`${label}: 24 Speichen, gekreuzt`, label, "Vierecke", col("reifen", 0.12));
      for (let k = 0; k < 24; k++) {
        const h = (k / 24) * TAU, r = h + rad(k % 2 ? 24 : -24);
        bar(m, pol(c, 26, h), pol(c, R_RIM - 2, r), 3.2, 2.4, col("reifen", 0.18), col("reifen", 0.05));
      }
      m.end();
      m.begin(`${label}: Ventil`, label, "Viereck", col("metall", -0.1));
      const va = rad(-90 + (isRear ? 8 : -8));
      bar(m, pol(c, R_RIM, va), pol(c, R_RIM - 30, va), 8, 6, col("metall", 0.05), col("metall", -0.2));
      m.end();
      if (isRear) {
        const r0 = MASSE.ritzel * K;
        [[1, 34], [0.86, 28], [0.75, 24], [0.64, 20], [0.54, 17]].forEach(([f, z], k) => {
          m.begin(`Ritzel ${z} Zähne`, label, "Fächer (Zahnkranz)", col("metall", 0.04 - k * 0.05));
          fan(m, toothedOutline(c, r0 * f, r0 * f - 5, z, k * 0.11), c, col("metall", 0.14 - k * 0.04), col("metall", -0.06 - k * 0.05));
          m.end();
        });
      } else {
        const rd = MASSE.bremsscheibe * K;
        m.begin("Bremsscheibe", label, "Ring", col("reifen"));
        ring(m, c, rd - 18, rd, 72, col("reifen", 0.16), col("reifen", -0.02));
        m.end();
        m.begin("Bremsscheiben-Spider", label, "Vierecke", col("reifen", 0.1));
        for (let k = 0; k < 6; k++) bar(m, pol(c, 16, (k / 6) * TAU), pol(c, rd - 16, (k / 6) * TAU + rad(18)), 12, 7, col("reifen", 0.2), col("reifen", 0.06));
        m.end();
      }
    }
    wheel(REAR, "Hinterrad", true);
    wheel(FRONT, "Vorderrad", false);

    // Antrieb hinter dem Rahmen: Kette, Schaltwerk, Kettenblatt
    const R_RING = MASSE.kettenblatt * K;
    const U = [26, -66], L = [56, -126];
    m.begin("Kette", "Antrieb", "Vierecke (Glieder)", col("metall", -0.2));
    const [tA, tB] = outerTangent(REAR, MASSE.ritzel * K * 0.8, BB, R_RING, 1);
    chainRun(m, tA, tB);
    const [bA, bB] = outerTangent(L, 14, BB, R_RING, -1);
    chainRun(m, bA, bB);
    chainRun(m, add(L, [-14, 0]), add(U, [14, -2]));
    m.end();
    m.begin("Schaltwerk", "Antrieb", "Fächer", col("reifen", 0.12));
    fan(m, spline([add(U, [-12, 22]), add(U, [22, 12]), add(L, [26, 4]), add(L, [8, -26]), add(L, [-24, -6]), add(U, [-22, -4])], 6, true),
      lerp(U, L, 0.5), col("reifen", 0.24), col("reifen", 0.06));
    [U, L].forEach((p, k) => fan(m, toothedOutline(p, 14, 11, 11, k * 0.2), p, col("metall", 0.12), col("metall", -0.08)));
    m.end();

    m.begin("Kettenblatt, 52 Zähne", "Antrieb", "Ring mit Zähnen", col("metall"));
    {
      const outline = toothedOutline(BB, R_RING, R_RING - 7, 52);
      const first = m.positions.length / 2;
      outline.forEach((p) => {
        const a = Math.atan2(p[1] - BB[1], p[0] - BB[0]);
        m.v(p, col("metall", 0.12));
        m.v(pol(BB, R_RING - 20, a), col("metall", -0.14));
      });
      for (let k = 0; k < outline.length; k++) {
        const i = first + 2 * k, j = first + 2 * ((k + 1) % outline.length);
        m.tri(i, i + 1, j + 1); m.tri(i, j + 1, j);
      }
    }
    m.end();
    m.begin("Kurbelstern", "Antrieb", "Vierecke", col("metall", -0.18));
    for (let k = 0; k < 4; k++) {
      const a = rad(45 + k * 90);
      bar(m, pol(BB, 20, a), pol(BB, R_RING - 18, a), 22, 12, col("metall", -0.08), col("metall", -0.24));
    }
    m.end();

    // Rahmen (Farben wie in der Skizze)
    const DT_FRONT = add(HT_BOT, UP, 22);
    const tubeFrom = (a, b, tA, tB) => { const d = norm(sub(b, a)); return [add(a, d, tA), add(b, d, -tB)]; };
    const frame = [
      ["Kettenstrebe", "magenta", REAR, BB, 14, 22, 18, 26],
      ["Sitzstrebe", "rot", REAR, SEAT_JUNCTION, 14, 10, 14, 18],
      ["Sitzrohr", "orange", BB, ST_TOP, 22, 0, 34, 30],
      ["Unterrohr", "rot", BB, DT_FRONT, 22, 26, 42, 38],
      ["Oberrohr", "magenta", TT_REAR, TT_FRONT, 12, 26, 28, 30],
    ];
    frame.forEach(([name, key, a, b, tA, tB, w1, w2]) => {
      m.begin(name, "Rahmen", "Rohr (6 Dreiecke, Zylinderschattierung)", col(key));
      const [p, q] = tubeFrom(a, b, tA, tB);
      tube(m, p, q, w1, w2, key);
      m.end();
    });

    m.begin("Gabel", "Rahmen", "Streifen zwischen zwei Bézierkurven", col("orange"));
    {
      const crown = add(HT_BOT, HT_DIR, 4), mid = lerp(crown, FRONT, 0.5);
      const front = bezier(add(crown, HT_N, -22), add(mid, HT_N, -17), add(FRONT, HT_N, -12), 24);
      const back = bezier(add(crown, HT_N, 22), add(mid, HT_N, 12), add(FRONT, HT_N, 10), 24);
      const center = bezier(crown, add(mid, HT_N, -3), FRONT, 24);
      const first = m.positions.length / 2;
      for (let k = 0; k <= 24; k++) {
        m.v(front[k], col("orange", 0.12)); m.v(center[k], col("orange", 0.02)); m.v(back[k], col("orange", -0.16));
      }
      for (let k = 0; k < 24; k++) {
        const i = first + 3 * k, j = i + 3;
        m.tri(i, j, j + 1); m.tri(i, j + 1, i + 1); m.tri(i + 1, j + 1, j + 2); m.tri(i + 1, j + 2, i + 2);
      }
    }
    m.end();

    m.begin("Steuerrohr", "Rahmen", "Rohr (6 Dreiecke, Zylinderschattierung)", col("tuerkis"));
    tube(m, add(HT_TOP, UP, 4), add(HT_BOT, HT_DIR, 4), 54, 60, "tuerkis");
    m.end();

    // Sattel und Cockpit
    m.begin("Sattelstütze", "Cockpit", "Rohr (6 Dreiecke, Zylinderschattierung)", col("tuerkis"));
    tube(m, add(ST_TOP, ST_DIR, -6), POST_TOP, 22, 20, "tuerkis");
    m.end();
    const [sx, sy] = POST_TOP;
    m.begin("Sattelgestell", "Cockpit", "Vierecke", col("reifen", 0.1));
    bar(m, [sx - 100, sy + 2], [sx - 70, sy - 8], 5, 5, col("reifen", 0.15));
    bar(m, [sx - 70, sy - 8], [sx + 50, sy - 8], 5, 5, col("reifen", 0.15));
    bar(m, [sx + 50, sy - 8], [sx + 80, sy + 2], 5, 5, col("reifen", 0.15));
    m.end();
    m.begin("Sattel", "Cockpit", "Fächer aus Spline-Kontur", col("magenta"));
    {
      const outline = spline([[sx - 158, sy + 14], [sx - 140, sy + 28], [sx - 40, sy + 27], [sx + 60, sy + 25], [sx + 114, sy + 22],
        [sx + 118, sy + 8], [sx + 40, sy + 2], [sx - 60, sy + 1], [sx - 150, sy + 3]], 6, true);
      // Verlauf von oben (hell) nach unten (dunkel)
      fan(m, outline, [sx - 20, sy + 15], col("magenta", 0.06), (p) => col("magenta", (p[1] - sy - 14) / 14 * 0.16));
    }
    m.end();

    m.begin("Gabelschaft und Vorbau", "Cockpit", "Rohre (Zylinderschattierung)", col("orange"));
    tube(m, add(HT_TOP, UP, 2), add(STEM_A, UP, 16), 36, 36, "orange");
    tube(m, add(STEM_A, norm(sub(STEM_B, STEM_A)), -18), STEM_B, 34, 30, "orange");
    m.end();
    const [bx, by] = STEM_B;
    m.begin("Rennlenker mit Lenkerband", "Cockpit", "Streifen", col("reifen"));
    strip(m, spline([[bx - 6, by], [bx + 20, by - 4], [bx + 34, by - 24], [bx + 34, by - 54], [bx + 22, by - 76], [bx, by - 86], [bx - 24, by - 82]], 8),
      22, col("reifen", 0.16), col("reifen", -0.04));
    m.end();
    m.begin("Schaltbremsgriff", "Cockpit", "Fächer", col("reifen", 0.08));
    fan(m, spline([[bx + 8, by + 2], [bx + 24, by + 16], [bx + 38, by + 6], [bx + 36, by - 14], [bx + 22, by - 8]], 6, true),
      [bx + 26, by + 2], col("reifen", 0.2), col("reifen", 0.02));
    strip(m, bezier([bx + 30, by - 4], [bx + 52, by - 40], [bx + 62, by - 80], 12), 9, col("reifen", 0.14), col("reifen", 0));
    m.end();
    m.begin("Bremsleitung", "Cockpit", "Streifen", col("reifen", 0.05));
    strip(m, bezier([bx + 24, by - 20], [bx + 70, by - 190], add(add(HT_TOP, HT_DIR, 50), HT_N, 30), 18), 4, col("reifen", 0.08));
    m.end();

    m.begin("Bremssattel", "Vorderrad", "Fächer", col("reifen", 0.06));
    {
      const p = pol(FRONT, MASSE.bremsscheibe * K - 8, rad(112));
      fan(m, place(p, 22, [[-30, -12], [30, -12], [34, 0], [30, 12], [-30, 12], [-34, 0]]), p, col("reifen", 0.18), col("reifen", 0));
    }
    m.end();

    // Kurbel und Pedal (vor dem Rahmen)
    const CRANK_END = add(BB, unit(-62), 172);
    m.begin("Kurbelarm und Pedal", "Antrieb", "Rohr + Fächer", col("metall", -0.3));
    tube(m, BB, CRANK_END, 30, 20, "reifen");
    fan(m, place(CRANK_END, 0, [[-48, -9], [48, -9], [52, 0], [48, 9], [-48, 9], [-52, 0]]), CRANK_END, col("reifen", 0.22), col("reifen", 0.02));
    m.end();

    // Naben und Tretlager (grün, liegen wie in der Skizze obenauf)
    [["Nabe hinten", REAR, 30], ["Nabe vorne", FRONT, 30], ["Tretlager", BB, 30]].forEach(([name, c, r]) => {
      m.begin(name, "Naben", "Fächer + Ring", col("gruen"));
      disc(m, c, r, 32, col("gruen", 0.16), col("gruen", -0.1));
      ring(m, c, r - 4, r, 32, col("gruen", -0.14), col("gruen", -0.2));
      disc(m, c, 9, 16, col("metall", 0.2), col("metall", -0.12));
      m.end();
    });

    return m;
  }

  // WebGL
  const canvas = document.getElementById("gl");
  const status = document.getElementById("status");
  const setStatus = (t, err = false) => { status.textContent = t; status.classList.toggle("is-error", err); };
  const $ = (id) => document.getElementById(id);

  const VS = `
    attribute vec2 aPosition;
    attribute vec4 aColor;
    uniform vec4 uView;               // x, y, Breite, Höhe des sichtbaren Bereichs in mm
    varying vec4 vColor;              // wird über das Dreieck interpoliert
    void main() {
      vec2 p = (aPosition - uView.xy) / uView.zw;
      gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
      vColor = aColor;
    }`;
  const FS = `
    precision mediump float;
    varying vec4 vColor;
    uniform vec4 uTint;               // für das Drahtgitter: feste Farbe statt vColor
    uniform float uUseTint;
    void main() { gl_FragColor = mix(vColor, uTint, uUseTint); }`;

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`Shader-Fehler: ${gl.getShaderInfoLog(sh)}`);
    return sh;
  }

  let gl, loc, buf = {}, mesh, counts = {};

  /** Prüft, ob alle Arrays zueinander und zum Draw-Call passen */
  function checkLengths(m) {
    const n = m.positions.length / 2;
    let maxIndex = -1;
    for (const i of m.indices) if (i > maxIndex) maxIndex = i;
    const checks = [
      ["positions = 2 · Vertices", m.positions.length === 2 * n],
      ["colors = 4 · Vertices", m.colors.length === 4 * n && m.flat.length === 4 * n],
      ["indices = 3 · Dreiecke", m.indices.length % 3 === 0],
      ["größter Index < Vertices", maxIndex < n],
      ["Vertices ≤ 65.535 (UNSIGNED_SHORT)", n <= 65535],
    ];
    const failed = checks.filter((c) => !c[1]);
    if (failed.length) throw new Error(`Array-Längen passen nicht: ${failed.map((c) => c[0]).join(", ")}`);
    return { n, maxIndex, triangles: m.indices.length / 3, checks };
  }

  function edgesOf(indices) {
    const seen = new Set(), out = [];
    for (let t = 0; t < indices.length; t += 3) {
      for (const [a, b] of [[indices[t], indices[t + 1]], [indices[t + 1], indices[t + 2]], [indices[t + 2], indices[t]]]) {
        const key = a < b ? a * 65536 + b : b * 65536 + a;
        if (!seen.has(key)) { seen.add(key); out.push(a, b); }
      }
    }
    return out;
  }

  function init() {
    gl = canvas.getContext("webgl", { antialias: true });
    if (!gl) throw new Error("Ihr Browser unterstützt kein WebGL. Bitte aktivieren Sie die Hardwarebeschleunigung.");
    const program = gl.createProgram();
    gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VS));
    gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Programm-Fehler: ${gl.getProgramInfoLog(program)}`);
    gl.useProgram(program);
    loc = {
      pos: gl.getAttribLocation(program, "aPosition"),
      color: gl.getAttribLocation(program, "aColor"),
      view: gl.getUniformLocation(program, "uView"),
      tint: gl.getUniformLocation(program, "uTint"),
      useTint: gl.getUniformLocation(program, "uUseTint"),
    };
    ["position", "color", "flat", "index", "edges"].forEach((k) => (buf[k] = gl.createBuffer()));
    gl.uniform4f(loc.view, VIEW.x, VIEW.y, VIEW.w, VIEW.h);
    gl.enable(gl.BLEND);                                          // für transparente Schatten
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Szene (neu) aufbauen und in die Buffer laden – auch beim Wechsel hell/dunkel */
  function upload() {
    mesh = buildScene();
    counts = checkLengths(mesh);
    const edges = edgesOf(mesh.indices);
    counts.edges = edges.length / 2;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.position);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.positions), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.color);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.colors), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf.flat);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(mesh.flat), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.index);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(mesh.indices), gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.edges);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(edges), gl.STATIC_DRAW);
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    gl.bindBuffer(gl.ARRAY_BUFFER, buf.position);
    gl.enableVertexAttribArray(loc.pos);
    gl.vertexAttribPointer(loc.pos, 2, gl.FLOAT, false, 0, 0);        // 2 Werte = 1 Vertex
    gl.bindBuffer(gl.ARRAY_BUFFER, $("toggle-gradient").checked ? buf.color : buf.flat);
    gl.enableVertexAttribArray(loc.color);
    gl.vertexAttribPointer(loc.color, 4, gl.FLOAT, false, 0, 0);      // 4 Werte = 1 Farbe (RGBA)

    // EIN Draw-Call für alle Flächen: count = Anzahl der Indizes = 3 · Dreiecke
    gl.uniform1f(loc.useTint, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.index);
    gl.drawElements(gl.TRIANGLES, mesh.indices.length, gl.UNSIGNED_SHORT, 0);

    if ($("toggle-mesh").checked) {                                    // Kanten aller Dreiecke zur Kontrolle
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      gl.uniform1f(loc.useTint, 1);
      gl.uniform4fv(loc.tint, dark ? [1, 1, 1, 0.45] : [0.07, 0.1, 0.16, 0.5]);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buf.edges);
      gl.drawElements(gl.LINES, counts.edges * 2, gl.UNSIGNED_SHORT, 0);
    }
    const err = gl.getError();
    if (err !== gl.NO_ERROR) console.error(`WebGL-Fehler 0x${err.toString(16)}`);
  }

  // Kennzahlen, Tabellen, Palette
  const fmt = (v) => v.toLocaleString("de-DE");
  function renderInfo() {
    $("stat-vertices").textContent = fmt(counts.n);
    $("stat-triangles").textContent = fmt(counts.triangles);
    $("stat-indices").textContent = fmt(mesh.indices.length);
    $("len-positions").textContent = fmt(mesh.positions.length);
    $("len-colors").textContent = fmt(mesh.colors.length);
    $("len-indices").textContent = fmt(mesh.indices.length);
    $("len-max").textContent = fmt(counts.maxIndex);
    $("len-n").textContent = fmt(counts.n);
    $("len-tri").textContent = fmt(counts.triangles);
    $("len-check").textContent = counts.checks.map(([t]) => `✓ ${t}`).join("   ");

    const tbody = $("parts-body");
    tbody.textContent = "";
    [...new Set(mesh.parts.map((p) => p.group))].forEach((g) => {
      mesh.parts.filter((p) => p.group === g).forEach((p, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `<td>${i === 0 ? g : ""}</td><td><span class="dot" style="background:${hex(p.base)}" aria-hidden="true"></span>${p.name}</td>` +
          `<td>${p.technique}</td><td class="num">${fmt(p.vertices)}</td><td class="num">${fmt(p.triangles)}</td>`;
        tbody.appendChild(tr);
      });
    });
    $("parts-total-v").textContent = fmt(counts.n);
    $("parts-total-t").textContent = fmt(counts.triangles);

    const pal = $("palette");
    pal.textContent = "";
    Object.values(PALETTE).forEach((p) => {
      const li = document.createElement("li");
      const c = hsl2rgb(p.h, p.s, p.l);
      li.innerHTML = `<span class="chip" style="background:${hex(c)}" aria-hidden="true"></span>` +
        `<span><strong>${p.name}</strong> <code>${hex(c)}</code><br><span class="muted">${p.wo} · ${p.ergaenzt ? "im Code ergänzt (in der Skizze unbemalt)" : `Farbton ${p.h}° aus der Skizze`}</span></span>`;
      pal.appendChild(li);
    });

    $("canvas-desc").textContent =
      `Farbiges Rennrad in Seitenansicht aus ${fmt(counts.triangles)} Dreiecken: Rahmen in Orange, Rot, Magenta und Türkisblau ` +
      "mit Lichtkante auf den Rohren, blaue Hochprofilfelgen, schwarze Reifen mit Profil, grüne Naben, magentafarbener Sattel, " +
      "schwarzer Rennlenker, graue Kette und Kettenblatt, auf einem grünen Wiesenstreifen unter hellem Himmel.";
  }

  // Bedienung
  ["toggle-gradient", "toggle-mesh"].forEach((id) => $(id).addEventListener("change", () => {
    draw();
    const g = $("toggle-gradient").checked, n = $("toggle-mesh").checked;
    setStatus(`${g ? "Farbverläufe" : "Einfarbige Flächen"}${n ? ", Dreiecksnetz sichtbar" : ""}.`);
  }));
  const overlay = $("sketch-overlay");
  $("toggle-sketch").addEventListener("change", (e) => {
    overlay.hidden = !e.target.checked;
    setStatus(e.target.checked ? "Kolorierte Handskizze liegt über der WebGL-Zeichnung." : "");
  });
  overlay.addEventListener("error", () => {
    $("toggle-sketch").checked = false;
    $("toggle-sketch").disabled = true;
    overlay.hidden = true;
    setStatus("Die Datei img/skizze_farbig.jpg fehlt – die Skizze kann nicht überlagert werden.", true);
  });

  // Design hell / dunkel
  const themeSwitch = $("theme-switch");
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* privater Modus */ } },
  };
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    themeSwitch.setAttribute("aria-checked", String(t === "dark"));
    if (gl) { upload(); draw(); }                       // Himmel hängt vom Design ab → Farben neu
  }
  themeSwitch.addEventListener("click", () => {
    const next = themeSwitch.getAttribute("aria-checked") === "true" ? "light" : "dark";
    applyTheme(next);
    store.set("theme", next);
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!store.get("theme")) applyTheme(e.matches ? "dark" : "light");
  });

  // Start
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light");
  try {
    init();
    upload();
    renderInfo();
    draw();
    new ResizeObserver(() => draw()).observe(canvas);
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setStatus("WebGL-Kontext verloren – bitte Seite neu laden.", true); });
    setStatus("");
    console.info(`Dreiecke: ${counts.triangles}, Vertices: ${counts.n}, Indizes: ${mesh.indices.length} – Längen geprüft.`);
  } catch (err) {
    console.error(err);
    setStatus(err.message, true);
  }
})();
