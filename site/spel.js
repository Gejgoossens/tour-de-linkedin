/* Het spel, fase 1: één etappe. Zie docs/SPEL-PLAN.md.
   Afstanden zijn in meters vanaf de start (d). De wereld staat op z = -d en schuift onder het peloton door;
   het peloton zelf blijft rond z = 0, positieve z is achter je (richting bezemwagen). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const kies = a => a[Math.floor(Math.random() * a.length)];
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tril = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} };

  /* ================= scène ================= */
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd8f0);
  scene.fog = new THREE.Fog(0xd4eef2, 55, 185);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.5, 500);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9ac27a, 0.95));
  const zon = new THREE.DirectionalLight(0xfff0c8, 0.75); zon.position.set(-6, 12, 5); scene.add(zon);

  const grad = new THREE.DataTexture(new Uint8Array([120, 190, 255]), 3, 1, THREE.LuminanceFormat);
  grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true;
  const toon = o => new THREE.MeshToonMaterial(Object.assign({ gradientMap: grad }, o));
  const toonV = toon({ vertexColors: true });

  // voegt losse vormen samen tot één geometrie met een kleur per vorm
  function merge(parts) {
    const P = [], N = [], C = [];
    for (const [g0, kleur] of parts) {
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position.array, n = g.attributes.normal.array, c = new THREE.Color(kleur);
      for (let i = 0; i < p.length; i += 3) { P.push(p[i], p[i + 1], p[i + 2]); N.push(n[i], n[i + 1], n[i + 2]); C.push(c.r, c.g, c.b); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    return g;
  }
  const box = (w, h, d, x, y, z) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  const dummy = new THREE.Object3D();
  function inst(geo, mat, n) { const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n)); m.count = n; m.frustumCulled = false; return m; }
  function zet(mesh, i, x, y, z, sx, sy, sz, ry, rz) {
    dummy.position.set(x, y, z); dummy.scale.set(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz);
    dummy.rotation.set(0, ry || 0, rz || 0); dummy.updateMatrix(); mesh.setMatrixAt(i, dummy.matrix);
  }

  /* ================= parcours ================= */
  const FIN = 2660, SPRINT = 170, LENGTE = FIN + 160, WEG = 5.4;
  const winden = [], dorpen = [], poorten = [], kaartPunten = [], matten = [], eilanden = [], bidons = [], losserStart = [];
  function slinger(d0, len, fx) { for (let t = 0; t < len; t += 3.2) bidons.push({ d: d0 + t, x0: clamp(fx(t), -4.6, 4.6) }); }
  function blokAanloop(d) {
    const a = rnd(-2, 2), fase = rnd(0, 6);
    slinger(d + 5, 72, t => a + Math.sin(t / 10 + fase) * 2.4);
    losserStart.push({ d: d + 30, x: rnd(-3.5, 3.5) }, { d: d + 68, x: rnd(-3.5, 3.5) });
    matten.push({ d: d + 48, x: rnd(-3, 3) });
    poorten.push({ d: d + 95 });
    return d + 115;
  }
  function blokWind(d, kant) {
    winden.push({ d, len: 150, dir: kant });
    slinger(d + 12, 48, t => kant * (-2 + t / 16)); slinger(d + 88, 48, t => kant * (1 - t / 16));
    losserStart.push({ d: d + 42, x: kant * 2.5 }, { d: d + 80, x: 0 }, { d: d + 128, x: -kant * 2 });
    matten.push({ d: d + 70, x: kant * 1.5 });
    return d + 180;
  }
  function blokSlalom(d) {
    const s = Math.random() < 0.5 ? 1 : -1, xs = [-2.7, 2.7, 0, -2.7];
    for (let k = 0; k < 4; k++) {
      const x = xs[k] * s, dd = d + 12 + k * 21;
      eilanden.push({ d: dd, x });
      const bx = x === 0 ? 2.5 * s : x - Math.sign(x) * 2.1;   // bidons vlak langs de vluchtheuvel
      slinger(dd - 6, 12, () => bx);
    }
    poorten.push({ d: d + 98 });
    return d + 115;
  }
  function blokDorp(d) {
    dorpen.push({ d: d + 28, len: 75 });
    slinger(d + 4, 96, () => 0);
    matten.push({ d: d + 115, x: 0 });
    losserStart.push({ d: d + 132, x: rnd(-2, 2) });
    return d + 143;
  }
  (function () {
    let d = 45, kant = 1;
    for (let c = 0; c < 4; c++) {
      d = blokAanloop(d); d = blokWind(d, kant); kant = -kant; d = blokSlalom(d); d = blokDorp(d);
      kaartPunten.push({ d: d - 6 });
    }
    d = blokAanloop(d); blokSlalom(d);
    bidons.sort((a, b) => a.d - b.d);
  })();

  function halveBreedte(d) {
    for (const e of dorpen) {
      if (d > e.d - 28 && d < e.d) return 5.2 - 3.1 * ((d - (e.d - 28)) / 28);
      if (d >= e.d && d <= e.d + e.len) return 2.1;
    }
    return 5.7;
  }
  const inDorp = d => dorpen.some(e => d > e.d - 30 && d < e.d + e.len + 4);

  const wereld = new THREE.Group(); scene.add(wereld);

  // grond, weg en bergen staan stil; alles wat beweging laat zien zit in `wereld`
  const grond = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), toon({ color: 0x8fd16a }));
  grond.rotation.x = -Math.PI / 2; grond.position.set(0, -0.02, -200); scene.add(grond);
  const weg = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 600), toon({ color: 0x8b8f9c }));
  weg.rotation.x = -Math.PI / 2; weg.position.set(0, 0, -200); scene.add(weg);
  for (const s of [-1, 1]) {
    const rand = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 600), toon({ color: 0xf4f1e4 }));
    rand.rotation.x = -Math.PI / 2; rand.position.set(s * 5.5, 0.01, -200); scene.add(rand);
  }
  const bergKleuren = [0x8fa6d6, 0xa5b8e0, 0x7f97cc];
  for (let i = 0; i < 9; i++) {
    const h = rnd(35, 70);
    const b = new THREE.Mesh(new THREE.ConeGeometry(rnd(28, 50), h, 5), new THREE.MeshBasicMaterial({ color: bergKleuren[i % 3], fog: false }));
    b.position.set(-200 + i * 50 + rnd(-10, 10), 14, -330); b.rotation.y = rnd(0, 3); scene.add(b);
    const sneeuw = new THREE.Mesh(new THREE.ConeGeometry(9, 12, 5), new THREE.MeshBasicMaterial({ color: 0xf6fbff, fog: false }));
    sneeuw.position.set(b.position.x, 14 + h / 2 - 5.5, -330); sneeuw.rotation.y = b.rotation.y; scene.add(sneeuw);
  }

  const nStreep = Math.floor(LENGTE / 7);
  const strepen = inst(box(0.22, 0.02, 2.6, 0, 0.01, 0), toon({ color: 0xf4f1e4 }), nStreep);
  for (let i = 0; i < nStreep; i++) zet(strepen, i, 0, 0, -(i * 7 - 30));
  wereld.add(strepen);

  const boomGeo = merge([
    [new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6).translate(0, 0.7, 0), 0x7a5536],
    [new THREE.ConeGeometry(1.25, 2.6, 7).translate(0, 2.5, 0), 0x3f9b57],
    [new THREE.ConeGeometry(0.9, 2.0, 7).translate(0, 3.8, 0), 0x4fb565]
  ]);
  const bomenPos = [];
  for (let d = -25; d < LENGTE; d += 3.2) {
    const s = Math.random() < 0.5 ? -1 : 1, min = inDorp(d) ? 10 : 7.2;
    bomenPos.push([s * (min + Math.pow(Math.random(), 2) * 34), d]);
  }
  const bomen = inst(boomGeo, toonV, bomenPos.length);
  bomenPos.forEach((p, i) => { const s = rnd(0.8, 1.5); zet(bomen, i, p[0], 0, -p[1], s * rnd(0.6, 1.1), s * rnd(0.9, 1.6), s, rnd(0, 6)); });
  wereld.add(bomen);

  const akkerKleuren = [0xf6cf3a, 0xa78bdb, 0xdcc56a, 0x6fbf5a];
  const nAkker = Math.floor(LENGTE / 24) * 2;
  const akkers = inst(box(1, 0.06, 1, 0, 0.02, 0), toon({ color: 0xffffff }), nAkker);
  for (let i = 0; i < nAkker; i++) {
    const s = i % 2 ? -1 : 1, d = Math.floor(i / 2) * 24 - 20;
    zet(akkers, i, s * rnd(20, 34), 0, -d, rnd(14, 22), 1, rnd(14, 20));
    akkers.setColorAt(i, new THREE.Color(kies(akkerKleuren)));
  }
  wereld.add(akkers);

  const huisGeo = merge([
    [box(5.5, 4, 5.7, 0, 2, 0), 0xf3e3c3],
    [new THREE.ConeGeometry(4.3, 2.2, 4).rotateY(Math.PI / 4).translate(0, 5.1, 0), 0xc9623f],
    [box(0.12, 1.1, 0.8, 2.78, 2.3, 1.3), 0x4f8fc9], [box(0.12, 1.1, 0.8, 2.78, 2.3, -1.3), 0x4f8fc9],
    [box(0.12, 1.1, 0.8, -2.78, 2.3, 1.3), 0x4f8fc9], [box(0.12, 1.1, 0.8, -2.78, 2.3, -1.3), 0x4f8fc9],
    [box(0.12, 1.9, 1.0, 2.78, 0.95, 0), 0x7a4a2e], [box(0.12, 1.9, 1.0, -2.78, 0.95, 0), 0x7a4a2e]
  ]);
  const huisPos = [], baalPos = [];
  for (const e of dorpen) {
    for (let z = 3; z < e.len; z += 6) for (const s of [-1, 1]) huisPos.push([s * 5.15, e.d + z]);
    for (let k = 0; k <= 7; k++) for (const s of [-1, 1]) baalPos.push([s * (5.6 - 3.0 * k / 7), e.d - 28 + k * 4]);
  }
  const huizen = inst(huisGeo, toonV, huisPos.length);
  huisPos.forEach((p, i) => zet(huizen, i, p[0], 0, -p[1], 1, rnd(0.9, 1.5), 1));
  wereld.add(huizen);
  const balen = inst(box(1.1, 0.9, 1.7, 0, 0.45, 0), toon({ color: 0xe6c659 }), baalPos.length);
  baalPos.forEach((p, i) => zet(balen, i, p[0], 0, -p[1], 1, 1, 1, rnd(-0.3, 0.3)));
  wereld.add(balen);

  // vluchtheuvels
  const eilandGeo = merge([
    [box(1.9, 0.3, 6, 0, 0.15, 0), 0xf4f1e4], [box(1.5, 0.34, 5.6, 0, 0.17, 0), 0x6fbf5a],
    [box(0.12, 1.7, 0.12, 0, 0.85, 2.4), 0xdfe3ea],
    [new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12).rotateX(Math.PI / 2).translate(0, 1.9, 2.4), 0x2f6fe0]
  ]);
  const eilandMesh = inst(eilandGeo, toonV, eilanden.length);
  eilanden.forEach((e, i) => zet(eilandMesh, i, e.x, 0, -e.d));
  wereld.add(eilandMesh);

  // boostmatten
  const matTex = (function () {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#16e0ff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ffffff'; g.lineWidth = 14; g.lineJoin = 'miter';
    for (let y = 30; y < 150; y += 40) { g.beginPath(); g.moveTo(14, y); g.lineTo(64, y - 34); g.lineTo(114, y); g.stroke(); }
    return new THREE.CanvasTexture(c);
  })();
  const matMesh = inst(new THREE.PlaneGeometry(3.4, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: matTex }), matten.length);
  matten.forEach((m, i) => zet(matMesh, i, m.x, 0.03, -m.d));
  wereld.add(matMesh);

  // bidons
  const bidonGeo = merge([
    [new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8).translate(0, 0, 0), 0x2fc4ff],
    [new THREE.CylinderGeometry(0.1, 0.16, 0.18, 8).translate(0, 0.34, 0), 0xffffff]
  ]);
  const bidonMesh = inst(bidonGeo, toonV, bidons.length);
  wereld.add(bidonMesh);
  function zetBidon(i) { const b = bidons[i]; if (b.weg) zet(bidonMesh, i, 0, -5, 0, 0.001, 0.001, 0.001); else zet(bidonMesh, i, b.x, 0.75, -b.d, 1.5, 1.5, 1.5, 0, 0.35); }

  // poorten
  function bord(tekst, kleur) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = kleur; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#14161a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 900 88px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText(tekst, 128, 52);
    g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('RENNERS', 128, 106);
    return new THREE.CanvasTexture(c);
  }
  const paalGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.8, 8).translate(0, 2.4, 0), paalMat = toon({ color: 0xf4f1e4 });
  poorten.forEach((p, i) => {
    const klein = { t: '+' + kies([2, 3, 4]), n: 0 }, groot = i % 3 === 2 ? { t: '×2', keer: 2 } : { t: '+' + kies([7, 8, 10]) };
    klein.n = +klein.t.slice(1); if (!groot.keer) groot.n = +groot.t.slice(1);
    const linksGroot = Math.random() < 0.5; p.links = linksGroot ? groot : klein; p.rechts = linksGroot ? klein : groot;
    const g = new THREE.Group(); g.position.z = -p.d;
    for (const x of [-5.6, 0, 5.6]) { const m = new THREE.Mesh(paalGeo, paalMat); m.position.x = x; g.add(m); }
    [[-2.8, p.links], [2.8, p.rechts]].forEach(([x, k]) => {
      const kleur = k === groot ? '#ffd300' : '#c9d6ea';
      const b = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.2), new THREE.MeshBasicMaterial({ map: bord(k.t, kleur) }));
      b.position.set(x, 3.7, 0); g.add(b);
      const mat = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4), new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.4 }));
      mat.rotation.x = -Math.PI / 2; mat.position.set(x, 0.03, 0); g.add(mat);
    });
    wereld.add(g);
  });

  // fakkels: hun rook laat zien waar de wind vandaan komt; in de laatste kilometer staan ze aan beide kanten
  const fakkels = [];
  for (const w of winden) for (let z = 0; z < w.len; z += 13) fakkels.push({ d: w.d + z, x: -w.dir * 6.3, dir: w.dir, k: fakkels.length % 4 });
  for (let d = FIN - SPRINT; d < FIN; d += 9) for (const s of [-1, 1]) fakkels.push({ d, x: s * 6.3, dir: 0, k: fakkels.length % 4 });
  const fakkelMesh = inst(merge([[box(0.14, 1.3, 0.14, 0, 0.65, 0), 0xf4f1e4], [box(0.24, 0.4, 0.24, 0, 1.4, 0), 0xff4d3d]]), toonV, fakkels.length);
  fakkels.forEach((f, i) => zet(fakkelMesh, i, f.x, 0, -f.d));
  wereld.add(fakkelMesh);

  // rode vod en finish
  (function () {
    const boog = (d, kleur, tekst) => {
      const g = new THREE.Group(); g.position.z = -d;
      for (const x of [-6, 6]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8).translate(0, 3, 0), toon({ color: kleur })); m.position.x = x; g.add(m); }
      const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = kleur === 0xe0453a ? '#e0453a' : '#14161a'; x.fillRect(0, 0, 512, 64);
      x.fillStyle = '#ffffff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = 'italic 900 50px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillText(tekst, 256, 34);
      const b = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
      b.position.y = 5.6; g.add(b); wereld.add(g);
    };
    boog(FIN - SPRINT, 0xe0453a, 'LAATSTE KILOMETER');
    boog(FIN, 0x14161a, 'ARRIVÉE');
    const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#14161a' : '#ffffff'; x.fillRect(i * 4, j * 4, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter;
    const lijn = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t }));
    lijn.position.set(0, 0.03, -FIN); wereld.add(lijn);
  })();

  /* ================= renners ================= */
  const MAXI = 240;
  const wiel = z => new THREE.CylinderGeometry(0.3, 0.3, 0.07, 10).rotateZ(Math.PI / 2).translate(0, 0.3, z);
  const basisGeo = merge([[wiel(-0.5), 0x2b2b33], [wiel(0.5), 0x2b2b33], [box(0.06, 0.06, 0.95, 0, 0.55, 0), 0xf2f2f2],
    [box(0.2, 0.5, 0.22, 0, 0.7, 0.14), 0xe8b48c]]);
  const truiGeo = merge([[new THREE.BoxGeometry(0.36, 0.3, 0.62).rotateX(0.45).translate(0, 1.02, -0.06), 0xffffff],
    [new THREE.SphereGeometry(0.18, 8, 6).translate(0, 1.24, -0.4), 0xffffff]]);
  const rBasis = inst(basisGeo, toonV, MAXI), rTrui = inst(truiGeo, toon({ color: 0xffffff }), MAXI);
  for (let i = 0; i < MAXI; i++) rTrui.setColorAt(i, new THREE.Color(0xffffff));
  scene.add(rBasis, rTrui);
  const ploegen = [0x2f6fe0, 0xff8a2a, 0xf4f4f4, 0x9a5be0, 0x19b8c9, 0x8a6a4a].map(c => new THREE.Color(c));
  const ROOD = new THREE.Color(0xff2d2d), GEEL = new THREE.Color(0xffd400), GRIJS = new THREE.Color(0xb9c0cc), tmpK = new THREE.Color();
  const pijl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd400, fog: false }));
  scene.add(pijl);

  // de drie benoemde renners en hun knop
  const KUNST = [
    { naam: 'De Locomotief', knop: 'Sleuren', kleur: new THREE.Color(0xf0525a), laad: 14, duur: 4 },
    { naam: 'De Waaierkoning', knop: 'Windschild', kleur: new THREE.Color(0x5aa2f0), laad: 16, duur: 5 },
    { naam: 'De Waterdrager', knop: 'Magneet', kleur: new THREE.Color(0x4cc38a), laad: 15, duur: 6 }
  ];

  /* ================= bezemwagen ================= */
  const bus = new THREE.Group();
  bus.add(new THREE.Mesh(merge([
    [box(2.3, 1.5, 3.8, 0, 1.25, 0), 0xf4f4f4], [box(2.34, 0.4, 3.84, 0, 0.9, 0), 0x2fae6a],
    [box(2.0, 0.6, 0.1, 0, 1.6, -1.92), 0x26384f], [box(1.5, 0.45, 0.9, 0, 2.2, 0.3), 0xe0453a],
    [new THREE.CylinderGeometry(0.42, 0.42, 2.5, 10).rotateZ(Math.PI / 2).translate(0, 0.42, -1.2), 0x2b2b33],
    [new THREE.CylinderGeometry(0.42, 0.42, 2.5, 10).rotateZ(Math.PI / 2).translate(0, 0.42, 1.2), 0x2b2b33]
  ]), toonV));
  const bezem = new THREE.Mesh(merge([[box(0.14, 0.14, 1.9, 0, 0.8, -0.9), 0x8a5a33], [box(3.6, 0.7, 0.5, 0, 0.35, -2.0), 0xe9c545]]), toonV);
  bezem.position.z = -1.6; bus.add(bezem);
  bus.position.set(0, 0, 12); scene.add(bus);

  /* ================= rook en stof (één draw call) ================= */
  const NP = 560;
  const pPos = new Float32Array(NP * 3), pKleur = new Float32Array(NP * 3), pMaat = new Float32Array(NP), pAlfa = new Float32Array(NP);
  const deel = []; for (let i = 0; i < NP; i++) deel.push({ leven: 0 });
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('aKleur', new THREE.BufferAttribute(pKleur, 3));
  pGeo.setAttribute('aMaat', new THREE.BufferAttribute(pMaat, 1));
  pGeo.setAttribute('aAlfa', new THREE.BufferAttribute(pAlfa, 1));
  const pMat = new THREE.ShaderMaterial({
    uniforms: { uSchaal: { value: 600 } }, transparent: true, depthWrite: false,
    vertexShader: 'attribute vec3 aKleur;attribute float aMaat;attribute float aAlfa;uniform float uSchaal;varying vec3 vK;varying float vA;' +
      'void main(){vK=aKleur;vA=aAlfa;vec4 mv=modelViewMatrix*vec4(position,1.0);gl_PointSize=aMaat*uSchaal/-mv.z;gl_Position=projectionMatrix*mv;}',
    fragmentShader: 'varying vec3 vK;varying float vA;void main(){vec2 p=gl_PointCoord-0.5;float d=length(p);if(d>0.5)discard;' +
      'float licht=p.y<-0.08&&d<0.42?1.08:(p.y>0.16?0.86:1.0);gl_FragColor=vec4(vK*licht,smoothstep(0.5,0.45,d)*vA);}'
  });
  const punten = new THREE.Points(pGeo, pMat); punten.frustumCulled = false; scene.add(punten);
  let pIdx = 0;
  const rookKleur = [0xffd84a, 0xff7ab8, 0xfafafa, 0xffa25a].map(c => new THREE.Color(c));
  const STOF = new THREE.Color(0xd9c9a3), CYAAN = new THREE.Color(0x7fefff);
  function wolk(x, y, z, vx, vy, vz, leven, maat, kleur, alfa) {
    const p = deel[pIdx]; pIdx = (pIdx + 1) % NP;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.leven = p.max = leven; p.maat = maat; p.k = kleur; p.a = alfa || 0.9;
  }
  function plof(x, z, kleur, n) { for (let i = 0; i < n; i++) wolk(x + rnd(-0.6, 0.6), 0.6, z + rnd(-0.6, 0.6), rnd(-3, 3), rnd(1, 4), rnd(-3, 3), rnd(0.5, 0.9), rnd(1, 1.8), kleur); }

  /* ================= geluid (gemaakt in de browser) ================= */
  let ac = null, geluidAan = true;
  try { geluidAan = localStorage.getItem('tdl-spel-geluid') !== 'uit'; } catch (_) {}
  function startGeluid() { try { if (!ac) ac = new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume(); } catch (_) { ac = null; } }
  function piep(f, duur, soort, vol, naar, wacht) {
    if (!ac || !geluidAan) return;
    const t = ac.currentTime + (wacht || 0), o = ac.createOscillator(), g = ac.createGain();
    o.type = soort || 'square'; o.frequency.setValueAtTime(f, t); if (naar) o.frequency.exponentialRampToValueAtTime(naar, t + duur);
    g.gain.setValueAtTime(vol || 0.05, t); g.gain.exponentialRampToValueAtTime(0.0008, t + duur);
    o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + duur + 0.02);
  }
  let ruisBuf = null;
  function ruis(duur, vol, f0, f1) {
    if (!ac || !geluidAan) return;
    if (!ruisBuf) { ruisBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate); const d = ruisBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const t = ac.currentTime, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
    s.buffer = ruisBuf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + duur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + duur);
    s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + duur + 0.02);
  }
  const G = {
    bidon(keten) { piep(520 * Math.pow(2, Math.min(keten, 24) / 12), 0.07, 'square', 0.035); },
    losser() { piep(660, 0.09, 'triangle', 0.08, 990); },
    boost() { ruis(0.5, 0.16, 400, 3200); piep(220, 0.35, 'sawtooth', 0.04, 880); },
    poort() { piep(523, 0.1, 'triangle', 0.08); piep(784, 0.14, 'triangle', 0.08, 0, 0.08); },
    groep() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.18, 'square', 0.05, 0, i * 0.09)); },
    klap() { ruis(0.25, 0.25, 900, 120); piep(140, 0.2, 'sawtooth', 0.07, 50); },
    toeter() { piep(330, 0.16, 'square', 0.05); piep(262, 0.24, 'square', 0.05, 0, 0.17); },
    rook() { ruis(1.1, 0.2, 200, 2400); [392, 494, 587, 784].forEach((f, i) => piep(f, 0.22, 'sawtooth', 0.04, 0, i * 0.07)); },
    rakelings() { piep(1200, 0.08, 'sine', 0.07, 1800); },
    knop() { piep(300, 0.2, 'sawtooth', 0.06, 900); },
    tik(k) { piep(300 + k * 40, 0.05, 'square', 0.04); },
    winst() { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => piep(f, 0.3, 'square', 0.05, 0, i * 0.11)); },
    verlies() { [392, 330, 262, 196].forEach((f, i) => piep(f, 0.3, 'triangle', 0.07, 0, i * 0.16)); }
  };

  /* ================= zwevende getallen ================= */
  const pops = []; let popIdx = 0;
  for (let i = 0; i < 14; i++) { const e = document.createElement('div'); e.className = 'pop'; $('pops').append(e); pops.push(e); }
  const v3 = new THREE.Vector3();
  function pop(tekst, x, z, klasse) {
    v3.set(x, 1.8, z).project(cam);
    const e = pops[popIdx]; popIdx = (popIdx + 1) % pops.length;
    e.textContent = tekst; e.className = 'pop ' + (klasse || '');
    e.style.left = ((v3.x * 0.5 + 0.5) * canvas.clientWidth) + 'px'; e.style.top = ((-v3.y * 0.5 + 0.5) * canvas.clientHeight) + 'px';
    void e.offsetWidth; e.classList.add('aan');
  }

  // welke uitleg deze speler al een keer gehad heeft
  let gezien = {};
  try { gezien = JSON.parse(localStorage.getItem('tdl-spel-uitleg') || '{}') || {}; } catch (_) { gezien = {}; }
  function leerde(wat) { gezien[wat] = true; try { localStorage.setItem('tdl-spel-uitleg', JSON.stringify(gezien)); } catch (_) {} }

  /* ================= spelstand ================= */
  const KAARTEN = [
    { t: 'Superknechten', s: 'Zes renners sluiten aan vanuit de volgwagens.', doe: s => voegToe(6) },
    { t: 'Dubbele dorst', s: 'Elke bidon jaagt het tempo twee keer zo hard op.', doe: s => { s.bidonHitte *= 2; } },
    { t: 'Rookbidons', s: 'Elke bidon vult de rookmeter een beetje.', doe: s => { s.bidonRook += 0.02; } },
    { t: 'Magneetbenen', s: 'Bidons in de buurt vliegen altijd naar je toe.', doe: s => { s.magneetStraal += 2.2; } },
    { t: 'Kettingreactie', s: 'Een boost duurt de helft langer.', doe: s => { s.boostDuur *= 1.5; } },
    { t: 'Windjacks', s: 'Renners houden het 60% langer vol in de wind.', doe: s => { s.jack *= 1.6; } },
    { t: 'Korte adem', s: 'De knoppen van je renners laden 30% sneller.', doe: s => { s.laadSnel *= 1.3; } },
    { t: 'Vuurtempo', s: 'De tempometer zakt half zo snel.', doe: s => { s.hitteZak *= 0.5; } },
    { t: 'Rookgordijn', s: 'Meer rook! duurt drie seconden langer.', doe: s => { s.rookDuur += 3; } },
    { t: 'Brede schouders', s: 'Elke waaier wordt twee renners breder.', doe: s => { s.K += 2; } }
  ];
  let S = null, fase = 'start', peloton = [], gelost = [], lossers = [], groepen = [], schud = 0, stil = 0, sleep = null, bIdx = 0;
  const toetsen = {};

  function nieuweRenner(x, z, kleur, kunst) {
    return { x, z, e: 1, lag: rnd(3.5, 7), kleur: kleur || kies(ploegen), kanteling: 0, fase: rnd(0, 6), kunst: kunst === undefined ? -1 : kunst };
  }
  const VOL = 60;
  function voegToe(n) { for (let i = 0; i < n && peloton.length < VOL; i++) peloton.push(nieuweRenner(S.cx + rnd(-2, 2), rnd(11, 15))); }

  function herstart() {
    S = {
      dist: 0, v: 17, cx: 0, f: 0, fDoel: 0, fRuw: 0, K: 6, t: 0, windDir: 1,
      score: 0, doorWind: 0, doorKlap: 0, hitte: 0, mult: 1, topMult: 1, laatstPak: 0, keten: 0, ketenT: 0, bidons: 0,
      meter: 0.5, rook: 0, boost: 0, boostKeten: 0, sleur: 0, schild: 0, magneet: 0,
      jack: 1, bidonHitte: 1, bidonRook: 0, magneetStraal: 0, boostDuur: 2.2, laadSnel: 1, hitteZak: 1, rookDuur: 5,
      kunst: KUNST.map(() => ({ laad: 0, levend: true })),
      spoor: [], voor: 0, flits: 0, flitsTitel: '', flitsTekst: '', flitsGroot: false, sprint: null, terug: 0, ladderT: 0
    };
    peloton = []; gelost = [];
    for (let i = 0; i < 12; i++) peloton.push(nieuweRenner(rnd(-1, 1), rnd(-2, 4)));
    KUNST.forEach((k, i) => peloton.splice(4 + i * 3, 0, nieuweRenner(rnd(-1, 1), rnd(-1, 3), k.kleur, i)));
    lossers = losserStart.map(l => ({ d: l.d, x: l.x, wakker: false, weg: false, kleur: kies(ploegen), fase: rnd(0, 6) }));
    groepen = [
      { naam: 'Groep 3', d: 200, v: 12.5, n: 5, kleur: new THREE.Color(0xff8a2a) },
      { naam: 'Achtervolgers', d: 500, v: 13.2, n: 7, kleur: new THREE.Color(0x9a5be0) },
      { naam: 'Kop van de koers', d: 830, v: 13.6, n: 3, kleur: new THREE.Color(0x19b8c9), kop: true }
    ];
    for (const g of groepen) { g.gepakt = false; g.leden = []; for (let i = 0; i < g.n; i++) g.leden.push({ ox: (i % 3 - 1) * 0.75 + rnd(-0.1, 0.1), oz: Math.floor(i / 3) * 1.3, fase: rnd(0, 6) }); }
    poorten.forEach(p => p.klaar = false); kaartPunten.forEach(k => k.klaar = false); matten.forEach(m => m.klaar = false);
    eilanden.forEach(e => { e.klaar = false; e.geraakt = false; });
    bidons.forEach((b, i) => { b.x = b.x0; b.weg = false; zetBidon(i); }); bidonMesh.instanceMatrix.needsUpdate = true; bIdx = 0;
    deel.forEach(p => p.leven = 0);
    $('tint').classList.remove('aan'); $('sprintbalk').hidden = true; bus.visible = true;
    $('rijen').textContent = '';
  }

  // Elke trap van de tempometer kost meer dan de vorige, zodat ×8 alleen met een lange reeks te halen is.
  const TRAP = [0, 10, 24, 42, 64, 90, 120, 155], HITTE_MAX = 175;
  function multVan(h) { let m = 1; while (m < TRAP.length && h >= TRAP[m]) m++; return m; }
  function trapDeel(h) { const m = multVan(h); return m >= TRAP.length ? 1 : (h - TRAP[m - 1]) / (TRAP[m] - TRAP[m - 1]); }
  function flits(titel, tekst, groot, duur) { S.flits = duur || 1.5; S.flitsTitel = titel; S.flitsTekst = tekst || ''; S.flitsGroot = !!groot; }
  function pak(punten, hitte) {
    const keer = S.rook > 0 ? 2 : 1;
    S.score += punten * S.mult * keer; S.hitte = Math.min(HITTE_MAX, S.hitte + hitte * keer); S.laatstPak = S.t;
    const m = multVan(S.hitte);
    if (m > S.mult) { pop('TEMPO ×' + m, S.cx, -4, 'geel'); if (m >= 4) tril(12); }
    S.mult = m; S.topMult = Math.max(S.topMult, m);
  }

  function slot(i, n) {
    const rijenL = Math.ceil(n / 3), lx = (i % 3 - 1) * 0.72, lz = Math.floor(i / 3) * 1.25 - (rijenL - 1) * 1.25 / 2;
    const K = S.K, k = i % K, rij = Math.floor(i / K), rijen = Math.ceil(n / K);
    const inRij = Math.min(K, n - rij * K), kk = S.windDir > 0 ? k : inRij - 1 - k;
    const wx = (k - (K - 1) / 2) * 0.9, wz = rij * 1.8 + kk * 0.5 - ((rijen - 1) * 1.8 + (K - 1) * 0.5) / 2;
    const z = lerp(lz, wz, S.f);
    return { x: stuurOp(S.dist - (z - S.voor)) + lerp(lx, wx, S.f), z: z + 1, kop: kk === 0 };
  }
  // Je stuurt de kop; wie erachter rijdt volgt hetzelfde spoor, zoals een slang. `spoor` onthoudt waar de kop stuurde.
  function voorkant(n) {
    const rijenL = Math.ceil(n / 3), rijen = Math.ceil(n / S.K);
    return lerp(-(rijenL - 1) * 1.25 / 2, -((rijen - 1) * 1.8 + (S.K - 1) * 0.5) / 2, S.f);
  }
  function stuurOp(d) {
    const sp = S.spoor;
    for (let i = sp.length - 1; i >= 0; i--) if (sp[i].d <= d) {
      const a = sp[i], b = sp[i + 1]; if (!b) return S.cx;
      return lerp(a.x, b.x, clamp((d - a.d) / (b.d - a.d || 1), 0, 1));
    }
    return sp.length ? sp[0].x : S.cx;
  }
  // staat er een renner van het peloton op deze plek?
  function raakt(x, z, rx, rz) { for (const r of peloton) if (Math.abs(r.x - x) < rx && Math.abs(r.z - z) < rz) return true; return false; }

  function laatLos(r, val) {
    r.val = val; r.vz = val ? 0 : rnd(4.5, 7); gelost.push(r);
    S.hitte = Math.max(0, S.hitte - 10); S.mult = multVan(S.hitte);
    if (r.kunst >= 0) { S.kunst[r.kunst].levend = false; flits(KUNST[r.kunst].naam + ' lost', 'zijn knop ben je kwijt', false, 2); }
  }

  /* ================= één stap ================= */
  function update(dt) {
    S.t += dt;
    if (S.sprint) return updateSprint(dt);
    if (toetsen.ArrowLeft) S.cx -= 9 * dt;
    if (toetsen.ArrowRight) S.cx += 9 * dt;
    S.f += ((sleep ? S.fRuw : S.fDoel) - S.f) * Math.min(1, dt * 8);
    const grens = lerp(4.3, 5.1 - (S.K - 1) / 2 * 0.9, S.f);
    S.cx = clamp(S.cx, -grens, grens);

    let wind = null;
    for (const w of winden) {
      if (S.dist >= w.d && S.dist <= w.d + w.len) wind = w;
      else if (w.d > S.dist && w.d - S.dist < 85) S.windDir = w.dir;
    }
    if (wind) S.windDir = wind.dir;
    const beschermd = S.rook > 0 || S.schild > 0;

    // plekken, beschutting, energie, botsen
    const n = peloton.length; let beschut = 0;
    S.voor = voorkant(n);
    if (!S.spoor.length || S.dist - S.spoor[S.spoor.length - 1].d > 0.4) { S.spoor.push({ d: S.dist, x: S.cx }); if (S.spoor.length > 110) S.spoor.shift(); }
    const dKop = S.dist - S.voor - 1;   // waar de kop van het peloton nu rijdt
    for (let i = 0; i < n; i++) { const r = peloton[i], s = slot(i, n); r.tx = s.x; r.tz = s.z; r.kop = s.kop; }
    for (let i = n - 1; i >= 0; i--) {
      const r = peloton[i];
      r.kanteling = clamp((r.tx - r.x) * 0.35, -0.5, 0.5);
      r.x += (r.tx - r.x) * Math.min(1, dt * r.lag * 1.3); r.z += (r.tz - r.z) * Math.min(1, dt * r.lag);
      let veilig = !wind || beschermd;
      if (!veilig) for (let j = 0; j < n; j++) {
        // op de plek in de formatie, niet op de renner zelf: sturen mag de beschutting niet breken
        if (j === i) continue; const o = peloton[j], dx = (r.tx - o.tx) * wind.dir, dz = r.tz - o.tz;
        if (dx > 0.3 && dx < 1.35 && dz > 0.12 && dz < 0.95) { veilig = true; break; }
      }
      if (veilig) { beschut++; r.e = Math.min(1, r.e + dt * 0.3); }
      else if (!(S.f > 0.8 && r.kop)) r.e -= dt / (3.4 * S.jack * (r.kunst >= 0 ? 2 : 1));
      if (r.e <= 0) { peloton.splice(i, 1); laatLos(r, false); S.doorWind++; continue; }
      const dr = S.dist - r.z; let klap = Math.abs(r.x) > halveBreedte(dr) + 0.12;
      if (!klap) for (const e of eilanden) if (Math.abs(dr - e.d) < 3.3 && Math.abs(r.x - e.x) < 1.15) { klap = true; e.geraakt = true; break; }
      if (klap) {
        peloton.splice(i, 1); laatLos(r, true); S.doorKlap++; plof(r.x, r.z, STOF, 6); schud = 0.35; stil = Math.max(stil, 0.05);
        pop('Au!', r.x, r.z, 'rood'); G.klap(); tril(30);
      }
    }
    const frac = n ? beschut / n : 0;

    // snelheid: vorm en wind, plus tempo, boost, sleuren en rook
    let doel = wind && !beschermd ? 11 + 7 * frac : lerp(18, 16, S.f);
    doel += (S.mult - 1) * 0.8;
    if (S.boost > 0) doel += 5; if (S.sleur > 0) doel += 5; if (S.rook > 0) doel += 3;
    S.v += (doel - S.v) * Math.min(1, dt * 2.2);
    const vorige = S.dist; S.dist += S.v * dt;

    // tellers
    for (const k of ['boost', 'sleur', 'schild', 'magneet']) if (S[k] > 0) S[k] -= dt;
    if (S.boost <= 0) S.boostKeten = 0;
    S.kunst.forEach((k, i) => { if (k.laad > 0) k.laad -= dt * S.laadSnel; });
    // het tempo zakt altijd, en harder naarmate het hoger staat: je moet blijven pakken om het vast te houden
    if (S.rook <= 0) { S.hitte = Math.max(0, S.hitte - dt * (1 + 0.7 * S.mult) * S.hitteZak); S.mult = multVan(S.hitte); }
    S.meter = Math.min(1, S.meter + dt * (wind && frac > 0.75 ? 0.035 : 0.012));
    if (S.t - S.ketenT > 1) S.keten = 0;

    // bidons
    const straal = S.magneet > 0 ? 9 : S.magneetStraal; let bidonAnders = false;
    while (bIdx < bidons.length && S.dist - bidons[bIdx].d > 14) bIdx++;
    for (let i = bIdx; i < bidons.length; i++) {
      const b = bidons[i]; if (b.d > S.dist + 26) break; if (b.weg) continue;
      const z = S.dist - b.d;
      if (straal > 0 && Math.abs(b.x - S.cx) < straal && z > -24) { b.x += (S.cx - b.x) * Math.min(1, dt * 7); bidonAnders = true; zetBidon(i); }
      if (z > -9 && z < 9 && raakt(b.x, z, 0.62, 0.8)) {
        b.weg = true; zetBidon(i); bidonAnders = true; S.bidons++; S.keten++; S.ketenT = S.t;
        pak(10, S.bidonHitte); S.meter = Math.min(1, S.meter + 0.006 + S.bidonRook);
        G.bidon(S.keten); wolk(b.x, 0.9, z, 0, 3, 0, 0.3, 0.9, CYAAN, 0.8);
        if (S.keten % 10 === 0) { pop(S.keten + ' op rij!', b.x, z, 'geel'); tril(8); }
        $('bidons').classList.remove('tik'); void $('bidons').offsetWidth; $('bidons').classList.add('tik');
      }
    }
    if (bidonAnders) bidonMesh.instanceMatrix.needsUpdate = true;

    // lossers: renners die uit de groepen voor je zijn gevallen
    for (const l of lossers) {
      if (l.weg) continue;
      if (!l.wakker) { if (l.d - S.dist < 120) l.wakker = true; else continue; }
      l.d += 4 * dt; const z = S.dist - l.d, hb = halveBreedte(l.d) - 0.7;
      l.x = clamp(l.x, -hb, hb);
      if (S.magneet > 0 && z > -20) l.x += (S.cx - l.x) * Math.min(1, dt * 3);
      if (z > -1.5 && raakt(l.x, z, 1.0, 1.3)) {
        l.weg = true; if (peloton.length < VOL) peloton.push(nieuweRenner(l.x, z, l.kleur)); pak(50, 4); pop('+1', l.x, z); G.losser(); tril(10);
      } else if (z > 10) { l.weg = true; plof(l.x, 9.6, STOF, 6); G.toeter(); }
    }

    // boostmatten, poorten, vluchtheuvels, bevoorrading
    for (const m of matten) if (!m.klaar && dKop >= m.d) {
      m.klaar = true;
      if (Math.abs(S.cx - m.x) < 2.2) {
        S.boostKeten = S.boost > 0 ? S.boostKeten + 1 : 1; S.boost = S.boostDuur * (1 + 0.3 * (S.boostKeten - 1));
        pak(30, 4); pop(S.boostKeten > 1 ? 'BOOST ×' + S.boostKeten : 'BOOST', S.cx, S.voor, 'roze'); G.boost(); tril(18); schud = Math.max(schud, 0.15);
        for (let i = 0; i < 14; i++) wolk(S.cx + rnd(-2, 2), 0.5, rnd(-2, 6), rnd(-1, 1), rnd(0.5, 2), 8, 0.5, rnd(0.8, 1.4), CYAAN, 0.8);
      }
    }
    for (const p of poorten) if (!p.klaar && dKop >= p.d) {
      p.klaar = true; const k = S.cx < 0 ? p.links : p.rechts;
      const erbij = k.keer ? Math.min(15, peloton.length) : k.n;
      voegToe(erbij); pak(40, 5); S.meter = Math.min(1, S.meter + 0.06);
      pop('+' + erbij + ' renners', S.cx, S.voor, 'geel'); G.poort(); tril(15);
    }
    for (const e of eilanden) if (!e.klaar && S.dist >= e.d + 5) {
      e.klaar = true;
      if (!e.geraakt && peloton.some(r => Math.abs(r.x - e.x) < 2.1)) { pak(60, 5); S.meter = Math.min(1, S.meter + 0.05); pop('Rakelings!', e.x, 2, 'roze'); G.rakelings(); tril(10); }
    }
    for (const k of kaartPunten) if (!k.klaar && S.dist >= k.d) { k.klaar = true; toonKaarten(); }

    // groepen voor ons
    for (const g of groepen) {
      if (g.gepakt) continue;
      g.d += g.v * dt;
      if (S.dist >= g.d - 2.5) {
        g.gepakt = true; stil = 0.09; schud = 0.4; G.groep(); tril([20, 30, 40]);
        const erbij = g.kop ? g.n - 1 : g.n;
        g.leden.slice(0, erbij).forEach(l => peloton.length < VOL && peloton.push(nieuweRenner(l.ox + (g.x || 0), -(g.d - S.dist) - l.oz, g.kleur)));
        pak(500, 15); S.meter = Math.min(1, S.meter + 0.15);
        for (let i = 0; i < 24; i++) wolk(rnd(-4, 4), rnd(0.5, 2), rnd(-8, 2), rnd(-3, 3), rnd(2, 5), rnd(-2, 2), rnd(0.8, 1.4), rnd(1.5, 3), rookKleur[i % 4], 0.85);
        flits(g.kop ? 'Geel ingelopen' : g.naam + ' ingelopen', g.kop ? 'nu nog de sprint winnen' : '+' + erbij + ' renners', false, 1.8);
        ladder(true);
      }
    }

    // rook
    if (S.rook > 0) {
      S.rook -= dt;
      for (let i = 0; i < 5; i++) wolk(S.cx + rnd(-8, 8), rnd(0.3, 1.5), rnd(-16, 12), rnd(-1.5, 1.5), rnd(1.2, 3), rnd(-2, 2), rnd(1.2, 2), rnd(2.2, 4), rookKleur[i % 2], 0.8);
      if (S.rook <= 0) $('tint').classList.remove('aan');
    }
    if (S.boost > 0 || S.sleur > 0) for (let i = 0; i < 2; i++) wolk(S.cx + rnd(-3, 3), 0.4, rnd(2, 8), 0, rnd(0.3, 1), 10, 0.35, rnd(0.6, 1.1), S.sleur > 0 ? rookKleur[3] : CYAAN, 0.7);
    for (const f of fakkels) {
      const z = S.dist - f.d;
      if (z > -95 && z < 12 && Math.random() < dt * 7) wolk(f.x, 1.5, z, f.dir ? f.dir * rnd(5, 9) : rnd(-0.6, 0.6), f.dir ? rnd(0.3, 1.4) : rnd(2, 4), 0, rnd(1.6, 2.4), rnd(1.1, 1.7), rookKleur[f.k], 0.85);
    }

    // gelosten en bezemwagen
    let prooi = null;
    for (let i = gelost.length - 1; i >= 0; i--) {
      const r = gelost[i];
      r.z += (r.val ? S.v : r.vz) * dt;
      if (!r.val) r.x += Math.sin(S.t * 5 + r.fase) * dt * 1.2;
      r.kanteling = r.val ? 1.45 : Math.sin(S.t * 6 + r.fase) * 0.25;
      if (!prooi || r.z > prooi.z) prooi = r;
      if (r.z > 9.6) { gelost.splice(i, 1); plof(r.x, 9.4, STOF, 8); schud = Math.max(schud, 0.2); G.toeter(); tril(20); pop('Opgeveegd', r.x, 7, 'rood'); }
    }
    bus.position.x += ((prooi ? prooi.x : S.cx * 0.5) - bus.position.x) * Math.min(1, dt * 3);
    bus.position.y = Math.abs(Math.sin(S.t * 9)) * 0.06;
    bezem.rotation.y = Math.sin(S.t * 10) * 0.22;

    // einde of sprint
    const kop = groepen[2];
    if (!peloton.length) return einde(false, 'Opgeveegd', 'De bezemwagen heeft je hele peloton opgeveegd.');
    if (!kop.gepakt && kop.d >= FIN) return einde(false, 'Geel wint', 'Het peloton komt op ' + tijd(kop.d - S.dist) + ' binnen. Je kwam ' + Math.round(kop.d - S.dist) + ' meter tekort.');
    if (kop.gepakt && S.dist >= FIN - SPRINT) startSprint();
    void vorige;
  }

  /* ================= de sprint ================= */
  function startSprint() {
    S.sprint = { ik: S.dist + 5, geel: S.dist + 8, kracht: 0, t: 0, tikken: 0 };
    S.rook = 0; $('tint').classList.remove('aan'); $('sprintbalk').hidden = false;
    S.flits = 0; G.knop();
  }
  function sprintTik() { const sp = S.sprint; if (!sp) return; sp.kracht += 1.1; sp.tikken++; G.tik(Math.min(12, sp.kracht * 2)); tril(5); }
  function updateSprint(dt) {
    const sp = S.sprint; sp.t += dt; sp.kracht *= Math.exp(-1.8 * dt);
    const vIk = 19 + 0.1 * S.mult + sp.kracht, vGeel = Math.min(23.8, 19 + sp.t * 5);
    sp.ik += vIk * dt; sp.geel += vGeel * dt; S.v = vIk; S.dist = sp.ik - 5; S.terug += (vIk - 18.5) * dt;
    const n = peloton.length;
    for (let i = 0; i < n; i++) { const r = peloton[i], s = slot(i, n); r.x += (s.x - r.x) * Math.min(1, dt * 4); r.z += (s.z - r.z) * Math.min(1, dt * 4); r.kanteling = 0; }
    for (const f of fakkels) { const z = S.dist - f.d; if (z > -95 && z < 12 && Math.random() < dt * 8) wolk(f.x, 1.5, z, rnd(-0.6, 0.6), rnd(2, 4), 0, rnd(1.6, 2.4), rnd(1.2, 1.9), rookKleur[f.k], 0.85); }
    wolk(-0.8 + rnd(-0.3, 0.3), 0.4, -4, 0, 0.6, 9, 0.3, 0.7, STOF, 0.6);
    $('sprintVul').style.setProperty('--p', clamp(sp.kracht / 6 * 100, 0, 100) + '%');
    if (sp.ik >= FIN || sp.geel >= FIN) {
      if (sp.ik >= sp.geel) { S.score += 2000 * S.mult; einde(true, 'Etappezege!', 'Je klopt geel op de streep met ' + (sp.ik - sp.geel).toFixed(1).replace('.', ',') + ' meter.'); }
      else einde(false, 'Tweede', 'Geel klopt je op de streep met ' + (sp.geel - sp.ik).toFixed(1).replace('.', ',') + ' meter. Sneller tikken.');
    }
  }

  /* ================= tekenen ================= */
  function updateRook(dt, v) {
    for (let i = 0; i < NP; i++) {
      const p = deel[i];
      if (p.leven > 0) {
        p.leven -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += (p.vz + v) * dt;
        const t = 1 - p.leven / p.max;
        pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
        pKleur[i * 3] = p.k.r; pKleur[i * 3 + 1] = p.k.g; pKleur[i * 3 + 2] = p.k.b;
        pMaat[i] = p.maat * (0.6 + t * 1.3); pAlfa[i] = p.a * Math.min(1, (1 - t) * 3);
      } else pMaat[i] = 0;
    }
    for (const k in pGeo.attributes) pGeo.attributes[k].needsUpdate = true;
  }

  let basisFov = 60;
  function teken() {
    wereld.position.z = S.dist;
    let i = 0;
    const renner = (x, z, kleur, kantel, schaal) => {
      if (i >= MAXI || z < -185 || z > 30) return;
      zet(rBasis, i, x, 0, z, schaal, schaal, schaal, 0, kantel); rTrui.setMatrixAt(i, dummy.matrix); rTrui.setColorAt(i, kleur); i++;
    };
    for (const r of peloton) renner(r.x, r.z + S.terug, tmpK.copy(r.kleur).lerp(ROOD, clamp(1 - r.e, 0, 1) * 0.9), r.kanteling, r.kunst >= 0 ? 1.7 : 1.35);
    for (const r of gelost) renner(r.x, r.z + S.terug, tmpK.copy(r.kleur).lerp(ROOD, 0.8), r.kanteling, r.kunst >= 0 ? 1.7 : 1.35);
    for (const l of lossers) if (l.wakker && !l.weg) renner(l.x + Math.sin(S.t * 3 + l.fase) * 0.15, S.dist - l.d, tmpK.copy(l.kleur).lerp(GRIJS, 0.35), Math.sin(S.t * 4 + l.fase) * 0.15, 1.35);
    let geelZ = null, geelX = 0;
    for (const g of groepen) {
      if (g.gepakt) continue;
      const z0 = S.dist - g.d; g.x = Math.sin(S.t * 0.6 + g.n) * 1.0;
      const hb = halveBreedte(g.d) - 1.2, gx = clamp(g.x, -Math.max(0, hb - 0.8), Math.max(0, hb - 0.8));
      g.leden.forEach((l, k) => {
        const isGeel = g.kop && k === 0;
        renner(gx + l.ox, z0 + l.oz, isGeel ? GEEL : g.kleur, 0, isGeel ? 1.7 : 1.35);
        if (isGeel) { geelZ = z0 + l.oz; geelX = gx + l.ox; }
      });
    }
    if (S.sprint) {
      const k = S.kunst.findIndex(x => x.levend);
      renner(-0.8, S.dist - S.sprint.ik, k >= 0 ? KUNST[k].kleur : ploegen[2], Math.sin(S.t * 22) * 0.12, 1.7);
      geelZ = S.dist - S.sprint.geel; geelX = 0.8; renner(geelX, geelZ, GEEL, Math.sin(S.t * 20 + 1) * 0.12, 1.7);
    }
    pijl.visible = geelZ !== null && geelZ > -185; if (pijl.visible) pijl.position.set(geelX, 3.1 + Math.sin(S.t * 5) * 0.2, geelZ);
    rBasis.count = rTrui.count = i;
    rBasis.instanceMatrix.needsUpdate = rTrui.instanceMatrix.needsUpdate = true; rTrui.instanceColor.needsUpdate = true;
    bus.position.z = 12 + S.terug; bus.visible = S.terug < 14;

    const s = rustig ? 0 : schud;
    cam.fov = basisFov + (rustig ? 0 : clamp((S.v - 17) * 0.6, 0, 9)); cam.updateProjectionMatrix();
    pMat.uniforms.uSchaal.value = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
    cam.position.set(rnd(-s, s), 13 + rnd(-s, s), 19); cam.lookAt(0, 0, -6);
    renderer.render(scene, cam);
  }

  /* ================= hud ================= */
  function tijd(m) { const s = Math.max(0, Math.round(m / 4.6)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }
  let ladderSleutel = '';
  function ladder(nu) {
    const open = groepen.filter(g => !g.gepakt).sort((a, b) => b.d - a.d), voor = open.length ? open[0].d : S.dist;
    const rijen = open.map((g, i) => ({ id: g.naam, naam: g.naam, sub: g.kop ? 'Geel + ' + (g.n - 1) : g.n + ' renners', gat: i ? '+' + tijd(voor - g.d) : '' }));
    rijen.push({ id: 'wij', naam: open.length ? 'Peloton' : 'Kop van de koers', sub: (open.length ? '' : 'Peloton, ') + peloton.length + ' renners', gat: open.length ? '+' + tijd(voor - S.dist) : '', wij: true });
    const sleutel = rijen.map(r => r.id + r.sub + r.gat).join('|');
    if (sleutel === ladderSleutel && !nu) return; ladderSleutel = sleutel;
    const el = $('rijen'); el.textContent = '';
    for (const r of rijen) {
      const d = document.createElement('div'); d.className = 'lrij' + (r.wij ? ' wij' : '');
      const l = document.createElement('span'); l.textContent = r.naam; const sm = document.createElement('small'); sm.textContent = r.sub; l.append(sm);
      const b = document.createElement('b'); b.textContent = r.gat; d.append(l, b); el.append(d);
    }
    $('nog').textContent = 'Nog ' + Math.max(0, (FIN - S.dist) / 50).toFixed(1).replace('.', ',') + ' km';
  }

  function hud(dt) {
    $('score').textContent = Math.round(S.score).toLocaleString('nl-NL');
    $('mult').textContent = '×' + S.mult; $('hitte').style.setProperty('--h', (trapDeel(S.hitte) * 100) + '%');
    $('tempo').classList.toggle('heet', S.mult >= 4);
    $('bidons').textContent = S.bidons + ' bidons';
    S.ladderT -= dt; if (S.ladderT <= 0) { S.ladderT = 0.25; ladder(false); }
    const rk = $('rook'); rk.style.setProperty('--m', Math.round(S.meter * 100)); rk.classList.toggle('klaar', S.meter >= 1 && S.rook <= 0 && !S.sprint);
    KUNST.forEach((k, i) => {
      const st = S.kunst[i], el = $('k' + i), actief = [S.sleur, S.schild, S.magneet][i] > 0;
      el.style.setProperty('--m', st.levend ? Math.round(clamp(1 - st.laad / k.laad, 0, 1) * 100) : 0);
      el.classList.toggle('klaar', st.levend && st.laad <= 0 && !actief); el.classList.toggle('actief', actief); el.classList.toggle('weg', !st.levend);
    });

    // Eén kleine regel boven de knoppen. Uitleg over wind, dorp en vluchtheuvels komt alleen de allereerste keer.
    let titel = '', tekst = '';
    const d = S.dist;
    if (S.flits > 0) { titel = S.flitsTitel; tekst = S.flitsTekst; }
    else if (!S.sprint) {
      const w = winden[0], e = dorpen[0], v = eilanden[0];
      if (!gezien.wind) { if (d > w.d + w.len) leerde('wind'); else if (d > w.d - 110) { titel = w.dir > 0 ? 'Zijwind van links' : 'Zijwind van rechts'; tekst = 'veeg omlaag: waaier'; } }
      if (!gezien.eiland) { if (d > v.d + 70) leerde('eiland'); else if (d > v.d - 110) { titel = 'Vluchtheuvels'; tekst = 'veeg omhoog: lint'; } }
      if (!gezien.dorp) { if (d > e.d + e.len) leerde('dorp'); else if (d > e.d - 130) { titel = 'Dorp'; tekst = 'lint, en naar het midden'; } }
    }
    const b = $('banner'); b.classList.toggle('weg', !titel);
    if (titel) { $('bTitel').textContent = titel; $('bTekst').textContent = tekst; }
  }

  function toonKaarten() {
    fase = 'kaart'; sleep = null;
    const keuze = KAARTEN.slice().sort(() => Math.random() - 0.5).slice(0, 3), el = $('kaarten');
    el.textContent = '';
    keuze.forEach(k => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kaart';
      const st = document.createElement('strong'); st.textContent = k.t; const sp = document.createElement('span'); sp.textContent = k.s;
      b.append(st, sp);
      b.addEventListener('click', () => { k.doe(S); $('kaartBlad').hidden = true; fase = 'spel'; G.poort(); });
      el.append(b);
    });
    $('kaartBlad').hidden = false;
  }

  function einde(gewonnen, titel, tekst) {
    fase = 'eind'; sleep = null;
    let best = 0; try { best = +localStorage.getItem('tdl-spel-best') || 0; } catch (_) {}
    const score = Math.round(S.score), record = score > best;
    if (record) { best = score; try { localStorage.setItem('tdl-spel-best', String(best)); } catch (_) {} }
    $('eTitel').textContent = titel; $('eTekst').textContent = tekst + (record && score > 0 ? ' Nieuw record.' : '');
    $('eScore').textContent = score.toLocaleString('nl-NL'); $('eBest').textContent = best.toLocaleString('nl-NL');
    $('eBidons').textContent = S.bidons; $('eTempo').textContent = '×' + S.topMult;
    $('eind').hidden = false; $('tint').classList.remove('aan'); $('sprintbalk').hidden = true;
    if (gewonnen) { G.winst(); tril([40, 40, 40, 40, 120]); for (let i = 0; i < 90; i++) wolk(rnd(-7, 7), rnd(0.5, 2), rnd(-16, 6), rnd(-2, 2), rnd(2, 6), rnd(-2, 2), rnd(1.5, 3), rnd(2, 4), rookKleur[i % 4], 0.85); }
    else G.verlies();
  }

  /* ================= knoppen en besturing ================= */
  function meerRook() {
    if (fase !== 'spel' || S.sprint || S.meter < 1 || S.rook > 0) return;
    S.meter = 0; S.rook = S.rookDuur; schud = 0.3; $('tint').classList.add('aan');
    for (const r of peloton) r.e = 1;
    for (let i = 0; i < 70; i++) wolk(S.cx + rnd(-9, 9), rnd(0.3, 2), rnd(-18, 12), rnd(-3, 3), rnd(1, 4), rnd(-3, 3), rnd(1.2, 2.2), rnd(2.5, 4.5), rookKleur[i % 2], 0.85);
    G.rook(); tril([20, 40, 60]);
  }
  function kunst(i) {
    if (fase !== 'spel' || S.sprint) return;
    const st = S.kunst[i], k = KUNST[i]; if (!st.levend || st.laad > 0) return;
    st.laad = k.laad; S[['sleur', 'schild', 'magneet'][i]] = k.duur;
    if (i === 1) for (const r of peloton) r.e = 1;
    pop(k.knop + '!', S.cx, -3, 'geel'); G.knop(); tril(15);
  }
  KUNST.forEach((k, i) => $('k' + i).addEventListener('click', () => kunst(i)));
  $('rook').addEventListener('click', meerRook);

  canvas.addEventListener('pointerdown', e => {
    if (fase !== 'spel') return;
    if (S.sprint) return sprintTik();
    sleep = { x: e.clientX, y: e.clientY }; S.fRuw = S.fDoel; try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
  });
  canvas.addEventListener('pointermove', e => {
    if (!sleep || fase !== 'spel') return;
    S.cx += (e.clientX - sleep.x) * (21 / canvas.clientWidth);
    S.fRuw = clamp(S.fRuw + (e.clientY - sleep.y) / 90, 0, 1);
    sleep.x = e.clientX; sleep.y = e.clientY;
  });
  const los = () => { if (sleep && S) { S.fDoel = S.fRuw > 0.5 ? 1 : 0; S.fRuw = S.fDoel; } sleep = null; };
  canvas.addEventListener('pointerup', los); canvas.addEventListener('pointercancel', los);
  addEventListener('keydown', e => {
    toetsen[e.key] = true; if (fase !== 'spel') return;
    if (e.key === ' ') { e.preventDefault(); if (S.sprint) { if (!e.repeat) sprintTik(); } else meerRook(); }
    if (e.key === 'ArrowDown') S.fDoel = 1; if (e.key === 'ArrowUp') S.fDoel = 0;
    if (e.key === '1' || e.key === '2' || e.key === '3') kunst(+e.key - 1);
  });
  addEventListener('keyup', e => { toetsen[e.key] = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());

  function geluidKnop() { const b = $('geluid'); b.textContent = geluidAan ? 'Geluid aan' : 'Geluid uit'; b.setAttribute('aria-pressed', String(geluidAan)); }
  $('geluid').addEventListener('click', () => { geluidAan = !geluidAan; try { localStorage.setItem('tdl-spel-geluid', geluidAan ? 'aan' : 'uit'); } catch (_) {} geluidKnop(); });
  geluidKnop();

  const start = () => { startGeluid(); herstart(); fase = 'spel'; $('start').hidden = true; $('eind').hidden = true; ladder(true); };
  $('startKnop').addEventListener('click', start); $('opnieuw').addEventListener('click', start);

  /* ================= lus ================= */
  function maat() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    basisFov = w < h ? Math.min(80, 2 * Math.atan(Math.tan(22 * Math.PI / 180) / cam.aspect) * 180 / Math.PI) : 52;
  }
  addEventListener('resize', maat); maat();
  herstart(); ladder(true);
  let vorigeT = performance.now();
  function lus(nu) {
    let dt = Math.min(0.05, (nu - vorigeT) / 1000); vorigeT = nu;
    const echt = dt;
    if (stil > 0) { stil -= dt; dt = 0; }
    if (fase === 'spel' && dt > 0) update(dt);
    if (S.flits > 0) S.flits -= echt;
    schud = Math.max(0, schud - echt * 1.2);
    if (fase === 'start') { S.t += echt; for (const f of fakkels) { const z = -f.d; if (z > -95 && Math.random() < echt * 5) wolk(f.x, 1.5, z, f.dir * rnd(5, 9), rnd(0.3, 1.4), 0, 2, rnd(1.1, 1.7), rookKleur[f.k], 0.85); } }
    updateRook(dt || (fase === 'spel' ? 0 : echt), fase === 'spel' ? S.v : 0);
    teken(); hud(echt);
    requestAnimationFrame(lus);
  }
  requestAnimationFrame(lus);

  // voor de tests in scripts/ en voor afstellen in de console
  window.__spel = { get S() { return S; }, get peloton() { return peloton; }, get groepen() { return groepen; }, get fase() { return fase; },
    winden, dorpen, eilanden, matten, poorten, bidons, FIN, SPRINT, sprintTik, kunst, meerRook };
})();
