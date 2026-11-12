/* Het spel: het peloton. Zie docs/SPEL-PLAN.md.
   Opbouw zoals Archero: korte sectoren, bij elke ingelopen groep een kracht die blijft en stapelt,
   elke etappe harder en in een nieuw decor, en opgeveegd betekent opnieuw beginnen.
   Afstanden zijn in meters vanaf de start van de etappe (d). De wereld staat op z = -d en schuift onder het
   peloton door; het peloton blijft rond z = 0, positieve z is achter je (richting bezemwagen). */
(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const kies = a => a[Math.floor(Math.random() * a.length)];
  const schud2 = a => a.slice().sort(() => Math.random() - 0.5);
  const rustig = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const tril = p => { try { if (navigator.vibrate) navigator.vibrate(p); } catch (_) {} };
  const ROMEINS = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

  /* ================= scène ================= */
  const canvas = $('c');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9fd8f0);
  scene.fog = new THREE.Fog(0xd4eef2, 55, 185);
  const cam = new THREE.PerspectiveCamera(60, 1, 0.5, 500);
  const hemel = new THREE.HemisphereLight(0xffffff, 0x9ac27a, 0.95); scene.add(hemel);
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
  const verberg = (mesh, i) => zet(mesh, i, 0, -9, 0, 0.001, 0.001, 0.001);

  /* ================= decors: elke etappe een ander land ================= */
  const THEMA = [
    { naam: 'Provence', lucht: 0x9fd8f0, mist: 0xd4eef2, grond: 0x8fd16a, weg: 0x8b8f9c, licht: 0.95, stam: 0x7a5536, blad: [0x3f9b57, 0x4fb565],
      akker: [0xf6cf3a, 0xa78bdb, 0xdcc56a, 0x6fbf5a], muur: 0xf3e3c3, dak: 0xc9623f, berg: [0x8fa6d6, 0xa5b8e0, 0x7f97cc] },
    { naam: 'De Alpen', lucht: 0xbfe3ff, mist: 0xeaf4fb, grond: 0xeef4f8, weg: 0x7c8494, licht: 1.05, stam: 0x5d4330, blad: [0x2f6b4f, 0x3a7d5c],
      akker: [0xffffff, 0xd6e8f5, 0xc4dcee, 0xe6f0f6], muur: 0x8a5a3a, dak: 0x4a3a34, berg: [0xdfe8f2, 0xc8d6e6, 0xf2f6fa] },
    { naam: 'De Hel van het Noorden', lucht: 0xb4bcc4, mist: 0xc4cad0, grond: 0x8f9a62, weg: 0x6c6660, licht: 0.8, stam: 0x4a3a2c, blad: [0x6a6a3a, 0x7c7a44],
      akker: [0x7a5a3a, 0x8f7a4a, 0x6a7a3a, 0x9a8a5a], muur: 0xa5553f, dak: 0x3f3a3a, berg: [0x9aa2aa, 0x8a9299, 0xa8afb6] },
    { naam: 'Parijs bij nacht', lucht: 0x1b1f4a, mist: 0x2c2f66, grond: 0x25324a, weg: 0x3c4160, licht: 0.6, stam: 0x2a2440, blad: [0x2a4a6a, 0x345a80],
      akker: [0xffd84a, 0xff7ab8, 0x5aa2f0, 0x3a4a7a], muur: 0xe8dcc0, dak: 0x4a5a80, berg: [0x2a2f66, 0x343a78, 0x23275a] },
    { naam: 'De Vulkaan', lucht: 0x3a1420, mist: 0x5a1f22, grond: 0x4a2a2a, weg: 0x2c2428, licht: 0.75, stam: 0x1a1414, blad: [0x2a1a1a, 0x3a2020],
      akker: [0xff5a1a, 0xff8a2a, 0xc92a1a, 0x5a2a2a], muur: 0x3a3030, dak: 0xff5a1a, berg: [0x6a1f1f, 0x8a2a1a, 0x4a1818] }
  ];

  // grond, weg en bergen staan stil; alles wat beweging laat zien zit in de wereld van de etappe
  const grond = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), toon({ color: 0x8fd16a }));
  grond.rotation.x = -Math.PI / 2; grond.position.set(0, -0.02, -200); scene.add(grond);
  const wegVlak = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 600), toon({ color: 0x8b8f9c }));
  wegVlak.rotation.x = -Math.PI / 2; wegVlak.position.set(0, 0, -200); scene.add(wegVlak);
  for (const s of [-1, 1]) {
    const rand = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 600), toon({ color: 0xf4f1e4 }));
    rand.rotation.x = -Math.PI / 2; rand.position.set(s * 5.5, 0.01, -200); scene.add(rand);
  }
  const bergen = [];
  for (let i = 0; i < 9; i++) {
    const h = rnd(35, 70);
    const b = new THREE.Mesh(new THREE.ConeGeometry(rnd(28, 50), h, 5), new THREE.MeshBasicMaterial({ color: 0x8fa6d6, fog: false }));
    b.position.set(-200 + i * 50 + rnd(-10, 10), 14, -330); b.rotation.y = rnd(0, 3); scene.add(b); bergen.push(b);
    const sneeuw = new THREE.Mesh(new THREE.ConeGeometry(9, 12, 5), new THREE.MeshBasicMaterial({ color: 0xf6fbff, fog: false }));
    sneeuw.position.set(b.position.x, 14 + h / 2 - 5.5, -330); sneeuw.rotation.y = b.rotation.y; scene.add(sneeuw);
  }

  const matTex = (function () {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
    g.fillStyle = '#16e0ff'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#ffffff'; g.lineWidth = 14;
    for (let y = 30; y < 150; y += 40) { g.beginPath(); g.moveTo(14, y); g.lineTo(64, y - 34); g.lineTo(114, y); g.stroke(); }
    return new THREE.CanvasTexture(c);
  })();
  function bord(tekst, kleur) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 128;
    const g = c.getContext('2d'); g.fillStyle = kleur; g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#14161a'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'italic 900 88px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText(tekst, 128, 52);
    g.font = '700 26px "Barlow Condensed", "Arial Narrow", sans-serif'; g.fillText('RENNERS', 128, 106);
    return new THREE.CanvasTexture(c);
  }
  const bidonGeo = merge([[new THREE.CylinderGeometry(0.2, 0.2, 0.5, 8), 0x2fc4ff], [new THREE.CylinderGeometry(0.1, 0.16, 0.18, 8).translate(0, 0.34, 0), 0xffffff]]);
  const paalGeo = new THREE.CylinderGeometry(0.16, 0.16, 4.8, 8).translate(0, 2.4, 0), paalMat = toon({ color: 0xf4f1e4 });
  const BASIS_V = 22, WEG = 5.7;

  /* ================= een etappe bouwen =================
     Vier sectoren. Elke sector is een aanloop plus twee of drie hindernisblokken; aan het eind rijdt een groep die je inloopt.
     Alle afstanden rekken mee met de snelheid van de etappe (sc), zodat je net genoeg tijd houdt om te reageren. */
  let W = null;
  function bouw(nr) {
    if (W) {
      scene.remove(W.groep);
      W.groep.traverse(o => {
        if (o.geometry && o.geometry !== paalGeo && o.geometry !== bidonGeo) o.geometry.dispose();
        if (o.material && o.material.map && o.material.map !== matTex) { o.material.map.dispose(); o.material.dispose(); }
      });
    }
    const th = THEMA[(nr - 1) % THEMA.length], v0 = BASIS_V * Math.pow(1.15, nr - 1), sc = Math.pow(v0 / BASIS_V, 0.7);
    const w = { nr, th, v0, sc, winden: [], dorpen: [], poorten: [], matten: [], blokken: [], bidons: [], losserStart: [], fakkels: [], sectorEind: [] };
    const stap = 3.2 * Math.sqrt(sc);
    const slinger = (d0, lenU, fx) => { for (let t = 0; t < lenU * sc; t += stap) w.bidons.push({ d: d0 + t, x0: clamp(fx(t / sc), -4.6, 4.6) }); };
    const blok = (soort, d, x, hw, hl) => w.blokken.push({ soort, d, x, hw, hl });

    function aanloop(d) {
      const a = rnd(-2, 2), f = rnd(0, 6);
      slinger(d + 4 * sc, 58, t => a + Math.sin(t / 9 + f) * 2.5);
      w.losserStart.push({ d: d + 24 * sc, x: rnd(-3.5, 3.5) }, { d: d + 52 * sc, x: rnd(-3.5, 3.5) });
      w.matten.push({ d: d + 36 * sc, x: rnd(-3, 3) });
      w.poorten.push({ d: d + 70 * sc });
      return d + 84 * sc;
    }
    function wind(d) {
      const kant = Math.random() < 0.5 ? 1 : -1;
      w.winden.push({ d, len: 125 * sc, dir: kant });
      slinger(d + 10 * sc, 42, t => kant * (-2 + t / 14)); slinger(d + 72 * sc, 42, t => kant * (1 - t / 14));
      w.losserStart.push({ d: d + 38 * sc, x: kant * 2.5 }, { d: d + 100 * sc, x: -kant * 2 });
      w.matten.push({ d: d + 60 * sc, x: kant * 1.5 });
      return d + 150 * sc;
    }
    function slalom(d, n) {
      const s = Math.random() < 0.5 ? 1 : -1, xs = [-2.7, 2.7, 0, -2.7, 2.7, 0];
      for (let k = 0; k < n; k++) {
        const x = xs[k % 6] * s, dd = d + (12 + k * 19) * sc;
        blok('eiland', dd, x, 0.95, 3);
        const bx = x === 0 ? 2.5 * s : x - Math.sign(x) * 2.1;   // bidons vlak langs de vluchtheuvel
        slinger(dd - 5 * sc, 10, () => bx);
      }
      w.matten.push({ d: d + (12 + n * 19) * sc, x: 0 });
      return d + (26 + n * 19) * sc;
    }
    function autos(d, n) {
      const banen = [-3.9, -1.3, 1.3, 3.9]; let vrij = Math.floor(rnd(0, 4));
      for (let k = 0; k < n; k++) {
        const dd = d + (10 + k * 17) * sc;
        if (k % 2 === 0) vrij = clamp(vrij + kies([-1, 1]), 0, 3);
        const baanVrij = vrij, dicht = schud2([0, 1, 2, 3].filter(b => b !== baanVrij)).slice(0, k % 3 === 2 ? 3 : 2);
        for (const b of dicht) blok('auto', dd, banen[b], 1.05, 2.2);
        slinger(dd - 6 * sc, 12, () => banen[baanVrij]);
      }
      w.matten.push({ d: d + (14 + n * 17) * sc, x: banen[vrij] });
      return d + (28 + n * 17) * sc;
    }
    function chicane(d, n) {
      let gat = rnd(-3, 3), vorig = gat;
      for (let k = 0; k < n; k++) {
        const dd = d + (16 + k * 32) * sc; gat = clamp(gat + kies([-1, 1]) * rnd(2.2, 4), -3.4, 3.4);
        for (let x = -5.1; x <= 5.1; x += 1.28) if (Math.abs(x - gat) > 2.0) blok('baal', dd, x, 0.62, 0.9);
        const van = vorig, naar = gat; slinger(dd - 26 * sc, 26, t => lerp(van, naar, clamp(t / 22, 0, 1)));
        vorig = gat;
      }
      w.matten.push({ d: d + (30 + (n - 1) * 32) * sc, x: gat });
      return d + (34 + n * 32) * sc;
    }
    function dorp(d) {
      w.dorpen.push({ d: d + 28 * sc, len: 66 * sc, tr: 28 * sc });
      slinger(d + 4 * sc, 88, () => 0);
      w.matten.push({ d: d + 104 * sc, x: 0 });
      w.losserStart.push({ d: d + 118 * sc, x: rnd(-2, 2) });
      return d + 124 * sc;
    }
    let d = 30;
    for (let k = 0; k < 4; k++) {
      const g = (nr - 1) * 4 + k, zwaar = Math.min(3, Math.floor(g / 2));
      d = aanloop(d);
      const soorten = g === 0 ? ['slalom', 'wind'] : schud2(['slalom', 'wind', 'autos', 'chicane', 'dorp']).slice(0, 3);
      for (const srt of soorten) {
        if (srt === 'slalom') d = slalom(d, 3 + zwaar); else if (srt === 'wind') d = wind(d); else if (srt === 'autos') d = autos(d, 4 + zwaar);
        else if (srt === 'chicane') d = chicane(d, 2 + Math.min(2, zwaar)); else d = dorp(d);
      }
      w.sectorEind.push(d);
    }
    w.inhoudEind = d + 20; w.lengte = d + 700 * sc;
    w.bidons.sort((a, b) => a.d - b.d);
    w.halveBreedte = function (dd) {
      for (const e of w.dorpen) {
        if (dd > e.d - e.tr && dd < e.d) return 5.2 - 3.1 * ((dd - (e.d - e.tr)) / e.tr);
        if (dd >= e.d && dd <= e.d + e.len) return 2.1;
      }
      return WEG;
    };
    const inDorp = dd => w.dorpen.some(e => dd > e.d - e.tr - 2 && dd < e.d + e.len + 4);

    // ---- vormen ----
    const G = new THREE.Group(); w.groep = G;
    const nStreep = Math.floor(w.lengte / 7);
    const strepen = inst(box(0.22, 0.02, 2.6, 0, 0.01, 0), toon({ color: 0xf4f1e4 }), nStreep);
    for (let i = 0; i < nStreep; i++) zet(strepen, i, 0, 0, -(i * 7 - 30));
    G.add(strepen);

    const boomGeo = merge([[new THREE.CylinderGeometry(0.22, 0.3, 1.4, 6).translate(0, 0.7, 0), th.stam],
      [new THREE.ConeGeometry(1.25, 2.6, 7).translate(0, 2.5, 0), th.blad[0]], [new THREE.ConeGeometry(0.9, 2.0, 7).translate(0, 3.8, 0), th.blad[1]]]);
    const bp = [];
    for (let dd = -25; dd < w.lengte; dd += 3.4) { const s = Math.random() < 0.5 ? -1 : 1, min = inDorp(dd) ? 10 : 7.2; bp.push([s * (min + Math.pow(Math.random(), 2) * 34), dd]); }
    const bomen = inst(boomGeo, toonV, bp.length);
    bp.forEach((p, i) => { const s = rnd(0.8, 1.5); zet(bomen, i, p[0], 0, -p[1], s * rnd(0.6, 1.1), s * rnd(0.9, 1.6), s, rnd(0, 6)); });
    G.add(bomen);

    const nAkker = Math.floor(w.lengte / 24) * 2;
    const akkers = inst(box(1, 0.06, 1, 0, 0.02, 0), toon({ color: 0xffffff }), nAkker);
    for (let i = 0; i < nAkker; i++) {
      const s = i % 2 ? -1 : 1, dd = Math.floor(i / 2) * 24 - 20;
      zet(akkers, i, s * rnd(20, 34), 0, -dd, rnd(14, 22), 1, rnd(14, 20)); akkers.setColorAt(i, new THREE.Color(kies(th.akker)));
    }
    G.add(akkers);

    const huisGeo = merge([[box(5.5, 4, 5.7, 0, 2, 0), th.muur], [new THREE.ConeGeometry(4.3, 2.2, 4).rotateY(Math.PI / 4).translate(0, 5.1, 0), th.dak],
      [box(0.12, 1.1, 0.8, 2.78, 2.3, 1.3), 0x4f8fc9], [box(0.12, 1.1, 0.8, 2.78, 2.3, -1.3), 0x4f8fc9],
      [box(0.12, 1.1, 0.8, -2.78, 2.3, 1.3), 0x4f8fc9], [box(0.12, 1.1, 0.8, -2.78, 2.3, -1.3), 0x4f8fc9]]);
    const hp = [], rp = [];
    for (const e of w.dorpen) {
      for (let z = 3; z < e.len; z += 6) for (const s of [-1, 1]) hp.push([s * 5.15, e.d + z]);
      for (let k = 0; k <= 7; k++) for (const s of [-1, 1]) rp.push([s * (5.6 - 3.0 * k / 7), e.d - e.tr + k * e.tr / 7]);
    }
    const huizen = inst(huisGeo, toonV, hp.length); hp.forEach((p, i) => zet(huizen, i, p[0], 0, -p[1], 1, rnd(0.9, 1.5), 1)); G.add(huizen);
    const randBalen = inst(box(1.1, 0.9, 1.7, 0, 0.45, 0), toon({ color: 0xe6c659 }), rp.length);
    rp.forEach((p, i) => zet(randBalen, i, p[0], 0, -p[1], 1, 1, 1, rnd(-0.3, 0.3))); G.add(randBalen);

    // hindernissen die je kunt raken (en met de juiste kracht kunt slopen)
    const vormen = {
      eiland: merge([[box(1.9, 0.3, 6, 0, 0.15, 0), 0xf4f1e4], [box(1.5, 0.34, 5.6, 0, 0.17, 0), 0x6fbf5a], [box(0.12, 1.7, 0.12, 0, 0.85, 2.4), 0xdfe3ea],
        [new THREE.CylinderGeometry(0.55, 0.55, 0.1, 12).rotateX(Math.PI / 2).translate(0, 1.9, 2.4), 0x2f6fe0]]),
      auto: merge([[box(2.0, 0.8, 4.2, 0, 0.75, 0), 0xe0453a], [box(1.8, 0.7, 2.2, 0, 1.45, 0.2), 0xf4f4f4], [box(1.7, 0.08, 2.6, 0, 1.9, 0.2), 0x2b2b33],
        [box(0.1, 0.7, 1.4, -0.4, 2.3, 0.2), 0x2fc4ff], [box(0.1, 0.7, 1.4, 0.4, 2.3, 0.2), 0xffd400],
        [new THREE.CylinderGeometry(0.38, 0.38, 2.1, 10).rotateZ(Math.PI / 2).translate(0, 0.38, -1.3), 0x2b2b33],
        [new THREE.CylinderGeometry(0.38, 0.38, 2.1, 10).rotateZ(Math.PI / 2).translate(0, 0.38, 1.3), 0x2b2b33]]),
      baal: merge([[new THREE.CylinderGeometry(0.62, 0.62, 1.15, 10).rotateZ(Math.PI / 2).translate(0, 0.62, 0), 0xe6c659]])
    };
    for (const soort of Object.keys(vormen)) {
      const lijst = w.blokken.filter(b => b.soort === soort), m = inst(vormen[soort], toonV, lijst.length);
      lijst.forEach((b, i) => { b.mesh = m; b.i = i; zet(m, i, b.x, 0, -b.d); });
      G.add(m);
    }

    const matMesh = inst(new THREE.PlaneGeometry(3.4, 4.4).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: matTex }), w.matten.length);
    w.matten.forEach((m, i) => zet(matMesh, i, m.x, 0.03, -m.d)); G.add(matMesh);

    w.bidonMesh = inst(bidonGeo, toonV, w.bidons.length); G.add(w.bidonMesh);

    w.poorten.forEach((p, i) => {
      const klein = { t: '+' + kies([1, 2]) }, groot = i % 3 === 2 ? { t: '×2', keer: 2 } : { t: '+' + kies([4, 5]) };
      klein.n = +klein.t.slice(1); if (!groot.keer) groot.n = +groot.t.slice(1);
      const lg = Math.random() < 0.5; p.links = lg ? groot : klein; p.rechts = lg ? klein : groot;
      const g = new THREE.Group(); g.position.z = -p.d;
      for (const x of [-5.6, 0, 5.6]) { const m = new THREE.Mesh(paalGeo, paalMat); m.position.x = x; g.add(m); }
      [[-2.8, p.links], [2.8, p.rechts]].forEach(([x, k]) => {
        const kleur = k === groot ? '#ffd300' : '#c9d6ea';
        const b = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 2.2), new THREE.MeshBasicMaterial({ map: bord(k.t, kleur) })); b.position.set(x, 3.7, 0); g.add(b);
        const mat = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 4), new THREE.MeshBasicMaterial({ color: kleur, transparent: true, opacity: 0.4 }));
        mat.rotation.x = -Math.PI / 2; mat.position.set(x, 0.03, 0); g.add(mat);
      });
      G.add(g);
    });

    // fakkels: hun rook laat zien waar de wind vandaan komt
    for (const wd of w.winden) for (let z = 0; z < wd.len; z += 13) w.fakkels.push({ d: wd.d + z, x: -wd.dir * 6.3, dir: wd.dir, k: w.fakkels.length % 4 });
    const fm = inst(merge([[box(0.14, 1.3, 0.14, 0, 0.65, 0), 0xf4f1e4], [box(0.24, 0.4, 0.24, 0, 1.4, 0), 0xff4d3d]]), toonV, w.fakkels.length);
    w.fakkels.forEach((f, i) => zet(fm, i, f.x, 0, -f.d)); G.add(fm);

    // decor
    scene.background.setHex(th.lucht); scene.fog.color.setHex(th.mist); grond.material.color.setHex(th.grond); wegVlak.material.color.setHex(th.weg);
    hemel.intensity = th.licht; bergen.forEach((b, i) => b.material.color.setHex(th.berg[i % 3]));
    scene.add(G); W = w;
  }
  function zetBidon(i) { const b = W.bidons[i]; if (b.weg) verberg(W.bidonMesh, i); else zet(W.bidonMesh, i, b.x, 0.75, -b.d, 1.5, 1.5, 1.5, 0, 0.35); }

  // finishboog: wordt neergezet zodra de sprint begint
  const boog = new THREE.Group();
  (function () {
    for (const x of [-6, 6]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 6, 8).translate(0, 3, 0), toon({ color: 0x14161a })); m.position.x = x; boog.add(m); }
    const c = document.createElement('canvas'); c.width = 512; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#14161a'; x.fillRect(0, 0, 512, 64); x.fillStyle = '#ffd300'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'italic 900 50px "Barlow Condensed", "Arial Narrow", sans-serif'; x.fillText('ARRIVÉE', 256, 34);
    const b = new THREE.Mesh(new THREE.PlaneGeometry(12.4, 1.5), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), fog: false })); b.position.y = 5.6; boog.add(b);
    const c2 = document.createElement('canvas'); c2.width = 64; c2.height = 16; const y = c2.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { y.fillStyle = (i + j) % 2 ? '#14161a' : '#ffffff'; y.fillRect(i * 4, j * 4, 4, 4); }
    const t = new THREE.CanvasTexture(c2); t.magFilter = THREE.NearestFilter;
    const lijn = new THREE.Mesh(new THREE.PlaneGeometry(11, 2.2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t })); lijn.position.y = 0.03; boog.add(lijn);
    boog.visible = false; scene.add(boog);
  })();

  /* ================= renners ================= */
  const MAXI = 320, VOL = 30;   // elke renner telt: het peloton wordt nooit groter dan dit
  const wiel = z => new THREE.CylinderGeometry(0.3, 0.3, 0.07, 10).rotateZ(Math.PI / 2).translate(0, 0.3, z);
  const basisGeo = merge([[wiel(-0.5), 0x2b2b33], [wiel(0.5), 0x2b2b33], [box(0.06, 0.06, 0.95, 0, 0.55, 0), 0xf2f2f2], [box(0.2, 0.5, 0.22, 0, 0.7, 0.14), 0xe8b48c]]);
  const truiGeo = merge([[new THREE.BoxGeometry(0.36, 0.3, 0.62).rotateX(0.45).translate(0, 1.02, -0.06), 0xffffff], [new THREE.SphereGeometry(0.18, 8, 6).translate(0, 1.24, -0.4), 0xffffff]]);
  const rBasis = inst(basisGeo, toonV, MAXI), rTrui = inst(truiGeo, toon({ color: 0xffffff }), MAXI);
  for (let i = 0; i < MAXI; i++) rTrui.setColorAt(i, new THREE.Color(0xffffff));
  scene.add(rBasis, rTrui);
  const ploegen = [0x2f6fe0, 0xff8a2a, 0xf4f4f4, 0x9a5be0, 0x19b8c9, 0x8a6a4a].map(c => new THREE.Color(c));
  const ROOD = new THREE.Color(0xff2d2d), GEEL = new THREE.Color(0xffd400), GRIJS = new THREE.Color(0xb9c0cc), GEEST = new THREE.Color(0xd8fbff), tmpK = new THREE.Color();
  const pijl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffd400, fog: false })); scene.add(pijl);

  // de drie benoemde renners en hun knop
  const KUNST = [
    { naam: 'De Locomotief', knop: 'Sleuren', kleur: new THREE.Color(0xf0525a), laad: 13, duur: 4 },
    { naam: 'De Waaierkoning', knop: 'Windschild', kleur: new THREE.Color(0x5aa2f0), laad: 15, duur: 5 },
    { naam: 'De Waterdrager', knop: 'Magneet', kleur: new THREE.Color(0x4cc38a), laad: 14, duur: 6 }
  ];

  /* ================= bezemwagen, en wat je krachten laten zien ================= */
  const bus = new THREE.Group();
  bus.add(new THREE.Mesh(merge([[box(2.3, 1.5, 3.8, 0, 1.25, 0), 0xf4f4f4], [box(2.34, 0.4, 3.84, 0, 0.9, 0), 0x2fae6a],
    [box(2.0, 0.6, 0.1, 0, 1.6, -1.92), 0x26384f], [box(1.5, 0.45, 0.9, 0, 2.2, 0.3), 0xe0453a],
    [new THREE.CylinderGeometry(0.42, 0.42, 2.5, 10).rotateZ(Math.PI / 2).translate(0, 0.42, -1.2), 0x2b2b33],
    [new THREE.CylinderGeometry(0.42, 0.42, 2.5, 10).rotateZ(Math.PI / 2).translate(0, 0.42, 1.2), 0x2b2b33]]), toonV));
  const bezem = new THREE.Mesh(merge([[box(0.14, 0.14, 1.9, 0, 0.8, -0.9), 0x8a5a33], [box(3.6, 0.7, 0.5, 0, 0.35, -2.0), 0xe9c545]]), toonV);
  bezem.position.z = -1.6; bus.add(bezem); bus.position.set(0, 0, 12); scene.add(bus);

  const motorGeo = merge([[wiel(-0.75), 0x1a1a22], [wiel(0.75), 0x1a1a22], [box(0.45, 0.5, 1.5, 0, 0.7, 0), 0xffd400], [box(0.5, 0.7, 0.5, 0, 1.3, 0.1), 0x26384f],
    [new THREE.SphereGeometry(0.24, 8, 6).translate(0, 1.85, 0.1), 0xf4f4f4], [box(0.5, 0.7, 0.45, 0, 1.25, 0.65), 0xe0453a], [box(0.3, 0.3, 0.5, 0, 1.75, 0.9), 0x2b2b33]]);
  const motoren = inst(motorGeo, toonV, 4); motoren.count = 0; scene.add(motoren);
  const heli = new THREE.Group();
  heli.add(new THREE.Mesh(merge([[new THREE.SphereGeometry(1.1, 10, 8).scale(1, 0.85, 1.5), 0xe0453a], [box(0.3, 0.3, 2.6, 0, 0.2, 2.3), 0xe0453a], [box(0.1, 1.0, 0.5, 0, 0.7, 3.4), 0xf4f4f4],
    [box(1.5, 0.1, 0.1, 0, -1.0, -0.4), 0x2b2b33], [box(1.5, 0.1, 0.1, 0, -1.0, 0.6), 0x2b2b33]]), toonV));
  const rotor = new THREE.Mesh(merge([[box(6.4, 0.06, 0.3, 0, 1.1, 0), 0x2b2b33], [box(0.3, 0.06, 6.4, 0, 1.1, 0), 0x2b2b33]]), toonV); heli.add(rotor);
  const heliSchaduw = new THREE.Mesh(new THREE.CircleGeometry(1.8, 16).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 }));
  heli.visible = heliSchaduw.visible = false; scene.add(heli, heliSchaduw);
  const veld = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7fefff, transparent: true, opacity: 0.7 }));
  veld.visible = false; scene.add(veld);
  const REGEN = 90, regenMesh = inst(bidonGeo, toonV, REGEN), regen = []; scene.add(regenMesh);
  for (let i = 0; i < REGEN; i++) regen.push({ weg: true });

  /* ================= rook, vuur en stof (één draw call) ================= */
  const NP = 700;
  const pPos = new Float32Array(NP * 3), pKleur = new Float32Array(NP * 3), pMaat = new Float32Array(NP), pAlfa = new Float32Array(NP);
  const deel = []; for (let i = 0; i < NP; i++) deel.push({ leven: 0 });
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('aKleur', new THREE.BufferAttribute(pKleur, 3));
  pGeo.setAttribute('aMaat', new THREE.BufferAttribute(pMaat, 1)); pGeo.setAttribute('aAlfa', new THREE.BufferAttribute(pAlfa, 1));
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
  const STOF = new THREE.Color(0xd9c9a3), CYAAN = new THREE.Color(0x7fefff), VUUR = [0xff5a1a, 0xffb02a, 0xfff2a0].map(c => new THREE.Color(c)), FLITS = new THREE.Color(0xfff7b0);
  function wolk(x, y, z, vx, vy, vz, leven, maat, kleur, alfa) {
    const p = deel[pIdx]; pIdx = (pIdx + 1) % NP;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.leven = p.max = leven; p.maat = maat; p.k = kleur; p.a = alfa || 0.9;
  }
  function plof(x, z, kleur, n, kracht) { const k = kracht || 1; for (let i = 0; i < n; i++) wolk(x + rnd(-0.6, 0.6), 0.6, z + rnd(-0.6, 0.6), rnd(-3, 3) * k, rnd(1, 4) * k, rnd(-3, 3) * k, rnd(0.5, 0.9), rnd(1, 1.8) * k, kleur); }

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
  let laatsteBidon = 0;
  const G = {
    bidon(keten) { const nu = performance.now(); if (nu - laatsteBidon < 28) return; laatsteBidon = nu; piep(520 * Math.pow(2, Math.min(keten, 30) / 12), 0.06, 'square', 0.03); },
    losser() { piep(660, 0.09, 'triangle', 0.08, 990); },
    boost() { ruis(0.6, 0.2, 400, 3600); piep(180, 0.45, 'sawtooth', 0.05, 1100); },
    poort() { piep(523, 0.1, 'triangle', 0.08); piep(784, 0.14, 'triangle', 0.08, 0, 0.08); },
    groep() { [523, 659, 784, 1047].forEach((f, i) => piep(f, 0.18, 'square', 0.05, 0, i * 0.09)); },
    niveau() { [659, 880, 1319].forEach((f, i) => piep(f, 0.16, 'triangle', 0.08, 0, i * 0.07)); },
    klap() { ruis(0.25, 0.25, 900, 120); piep(140, 0.2, 'sawtooth', 0.07, 50); },
    sloop() { ruis(0.3, 0.3, 1600, 200); piep(90, 0.25, 'square', 0.07, 40); },
    toeter() { piep(330, 0.16, 'square', 0.05); piep(262, 0.24, 'square', 0.05, 0, 0.17); },
    rook() { ruis(1.1, 0.2, 200, 2400); [392, 494, 587, 784].forEach((f, i) => piep(f, 0.22, 'sawtooth', 0.04, 0, i * 0.07)); },
    rakelings() { piep(1200, 0.08, 'sine', 0.07, 1800); },
    zap() { piep(1800, 0.05, 'sawtooth', 0.025, 600); },
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
    e.style.left = clamp((v3.x * 0.5 + 0.5) * canvas.clientWidth, 40, canvas.clientWidth - 40) + 'px';
    e.style.top = clamp((-v3.y * 0.5 + 0.5) * canvas.clientHeight, 130, canvas.clientHeight - 160) + 'px';
    void e.offsetWidth; e.classList.add('aan');
  }

  // welke uitleg deze speler al een keer gehad heeft
  let gezien = {};
  try { gezien = JSON.parse(localStorage.getItem('tdl-spel-uitleg') || '{}') || {}; } catch (_) { gezien = {}; }
  function leerde(wat) { gezien[wat] = true; try { localStorage.setItem('tdl-spel-uitleg', JSON.stringify(gezien)); } catch (_) {} }

  /* ================= krachten =================
     Je kiest er één bij elke ingelopen groep. Ze blijven tot je bent opgeveegd en stapelen. */
  const KRACHT = [
    { id: 'geest', t: 'Spooklint', max: 2, s: n => 'Een lichtgevend lint aan ' + (n > 1 ? 'elke kant erbij: vier in totaal.' : 'elke kant pakt alles mee.') },
    { id: 'brander', t: 'Nabrander', max: 2, s: () => 'Boosts zijn feller en langer. Tijdens een boost ram je dwars door alles heen.' },
    { id: 'bliksem', t: 'Bidonbliksem', max: 3, s: n => 'Elke bidon slaat over naar ' + n * 2 + ' andere.' },
    { id: 'motor', t: 'Motor op kop', max: 4, s: () => 'Een motor erbij om achter te zuigen: altijd 8% sneller.' },
    { id: 'heli', t: 'Helikopter', max: 3, s: n => n > 1 ? 'Laat nog meer bidons voor je vallen.' : 'Laat een spoor van bidons voor je vallen.' },
    { id: 'veld', t: 'Magneetveld', max: 3, s: () => 'Bidons in een steeds grotere kring vliegen naar je toe.' },
    { id: 'reus', t: 'Reuzenkopman', max: 3, s: n => 'Je kopman groeit en beukt na elke ingelopen groep ' + n * 2 + ' hindernissen opzij.' },
    { id: 'rook', t: 'Rookmachine', max: 3, s: () => 'De rookknop vult sneller en rook maakt je sneller.' },
    { id: 'jack', t: 'Windjacks', max: 3, s: () => 'Renners houden het veel langer vol in de wind.' },
    { id: 'vuur', t: 'Vuurtempo', max: 3, s: () => 'De tempometer zakt een derde trager.' },
    { id: 'knecht', t: 'Superknechten', max: 99, s: () => 'Vijf renners erbij, nu meteen.' }
  ];
  const sk = id => S.sk[id] || 0;

  /* ================= spelstand ================= */
  let S = null, fase = 'start', peloton = [], gelost = [], lossers = [], groepen = [], schud = 0, stil = 0, sleep = null, bIdx = 0;
  const toetsen = {};

  function nieuweRenner(x, z, kleur, kunst) {
    return { x, z, e: 1, lag: rnd(4.5, 8), kleur: kleur || kies(ploegen), kanteling: 0, fase: rnd(0, 6), kunst: kunst === undefined ? -1 : kunst };
  }
  function voegToe(n) { for (let i = 0; i < n && peloton.length < VOL; i++) peloton.push(nieuweRenner(S.cx + rnd(-2, 2), rnd(11, 15))); }

  function herstart() {
    S = {
      etappe: 1, dist: 0, v: BASIS_V, cx: 0, f: 0, fDoel: 0, fRuw: 0, K: 6, t: 0, windDir: 1, top: 0,
      score: 0, hitte: 0, mult: 1, keten: 0, ketenT: 0, kaartRij: 0, sk: {}, bezem: 28, eetT: 0, reusLading: 0, gevaarT: 0,
      meter: 0.5, rook: 0, boost: 0, boostKeten: 0, sleur: 0, schild: 0, magneet: 0, adem: 0, heliT: 0,
      kunst: KUNST.map(() => ({ laad: 0, levend: true })), spoor: [], voor: 0,
      flits: 0, flitsTitel: '', flitsTekst: '', sprint: null, terug: 0, ladderT: 0, kopVrij: false
    };
    peloton = []; gelost = [];
    for (let i = 0; i < 12; i++) peloton.push(nieuweRenner(rnd(-1, 1), rnd(-2, 4)));
    KUNST.forEach((k, i) => peloton.splice(4 + i * 3, 0, nieuweRenner(rnd(-1, 1), rnd(-1, 3), k.kleur, i)));
    deel.forEach(p => p.leven = 0);
    startEtappe(1);
  }
  function startEtappe(nr) {
    bouw(nr);
    Object.assign(S, { etappe: nr, dist: 0, v: W.v0, spoor: [], sprint: null, terug: 0, kopVrij: false, boost: 0, cx: clamp(S.cx, -3, 3), bezem: 28, reusLading: 2 * (S.sk.reus || 0) });
    gelost = [];
    lossers = W.losserStart.map(l => ({ d: l.d, x: l.x, wakker: false, weg: false, kleur: kies(ploegen), fase: rnd(0, 6) }));
    const namen = ['Groep 4', 'Groep 3', 'Achtervolgers', 'Kop van de koers'], grootte = [4, 5, 7, 3], kleuren = [0xff8a2a, 0x9a5be0, 0x19b8c9, 0xf4f4f4];
    groepen = namen.map((naam, i) => {
      const g = { naam, d: i === 0 ? W.sectorEind[0] * 0.27 : W.sectorEind[i] * 0.52, v: W.v0 * 0.6, n: grootte[i], kleur: new THREE.Color(kleuren[i]), kop: i === 3, gepakt: false, leden: [] };
      for (let k = 0; k < g.n; k++) g.leden.push({ ox: (k % 3 - 1) * 0.75 + rnd(-0.1, 0.1), oz: Math.floor(k / 3) * 1.3 });
      return g;
    });
    W.bidons.forEach((b, i) => { b.x = b.x0; b.weg = false; zetBidon(i); }); W.bidonMesh.instanceMatrix.needsUpdate = true; bIdx = 0;
    regen.forEach(r => r.weg = true);
    $('tint').classList.remove('aan'); $('sprintbalk').hidden = true; bus.visible = true; boog.visible = false;
    flits('Etappe ' + nr, W.th.naam, 2.2); ladder(true);
  }

  // Elke trap van de tempometer kost meer dan de vorige, zodat ×8 alleen met een lange reeks te halen is.
  const TRAP = [0, 10, 24, 42, 64, 90, 120, 155], HITTE_MAX = 175;
  function multVan(h) { let m = 1; while (m < TRAP.length && h >= TRAP[m]) m++; return m; }
  function trapDeel(h) { const m = multVan(h); return m >= TRAP.length ? 1 : (h - TRAP[m - 1]) / (TRAP[m] - TRAP[m - 1]); }
  function flits(titel, tekst, duur) { S.flits = duur || 1.5; S.flitsTitel = titel; S.flitsTekst = tekst || ''; }
  function pak(punten, hitte) {
    const keer = S.rook > 0 ? 2 : 1;
    S.score += punten * S.mult * keer * S.etappe; S.hitte = Math.min(HITTE_MAX, S.hitte + hitte * keer);
    const m = multVan(S.hitte);
    if (m > S.mult) { pop('TEMPO ×' + m, S.cx, -4, 'geel'); if (m >= 4) tril(12); }
    S.mult = m;
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
  function slot(i, n) {
    const rijenL = Math.ceil(n / 3), lx = (i % 3 - 1) * 0.72, lz = Math.floor(i / 3) * 1.25 - (rijenL - 1) * 1.25 / 2;
    const K = S.K, k = i % K, rij = Math.floor(i / K), rijen = Math.ceil(n / K);
    const inRij = Math.min(K, n - rij * K), kk = S.windDir > 0 ? k : inRij - 1 - k;
    const wx = (k - (K - 1) / 2) * 0.9, wz = rij * 1.8 + kk * 0.5 - ((rijen - 1) * 1.8 + (K - 1) * 0.5) / 2;
    const z = lerp(lz, wz, S.f);
    return { x: stuurOp(S.dist - (z - S.voor)) + lerp(lx, wx, S.f), z: z + 1, kop: kk === 0 };
  }
  // de spooklinten rijden naast je en pakken mee, maar kunnen niet botsen
  function geestBanen() { const n = sk('geest'); return n >= 2 ? [-5.2, -2.6, 2.6, 5.2] : n === 1 ? [-2.6, 2.6] : []; }
  const GEEST_LEN = 8;
  function raakt(x, z, rx, rz) {
    for (const r of peloton) if (Math.abs(r.x - x) < rx && Math.abs(r.z - z) < rz) return true;
    const zr = z - (S.voor + 1);
    if (zr > -rz && zr < GEEST_LEN * 1.4 + rz) { const mid = stuurOp(S.dist - Math.max(0, zr)); for (const b of geestBanen()) if (Math.abs(mid + b - x) < rx + 0.2) return true; }
    return false;
  }

  function laatLos(r, val) {
    r.val = val; r.vz = val ? 0 : rnd(4.5, 7); gelost.push(r);
    S.hitte = Math.max(0, S.hitte - 10); S.mult = multVan(S.hitte);
    if (r.kunst >= 0) { S.kunst[r.kunst].levend = false; flits(KUNST[r.kunst].naam + ' lost', 'zijn knop ben je kwijt', 2); }
  }
  // Valpartij: wie botst, neemt iedereen mee die in zijn wiel zit. Hoe harder je rijdt, hoe meer er vallen.
  // Daarna ben je vaart kwijt en zit de bezemwagen dichter op je.
  function valpartij(r) {
    const hard = S.v / W.v0, ver = 2.6 + 3.2 * hard, maxN = Math.round(2 + 3 * hard);
    const mee = peloton.filter(o => o !== r && o.tz >= r.tz - 0.1 && o.tz - r.tz < ver && Math.abs(o.tx - r.tx) < 0.95)
      .sort((a, b) => a.tz - b.tz).slice(0, maxN - 1);
    for (const o of [r].concat(mee)) { peloton.splice(peloton.indexOf(o), 1); laatLos(o, true); plof(o.x, o.z, STOF, 4); }
    S.v *= 0.62; S.bezem -= 4 + mee.length; S.adem = 0.6; S.boost = 0;
    schud = 0.55; stil = Math.max(stil, 0.07);
    pop(mee.length ? 'Valpartij! −' + (mee.length + 1) : 'Au!', r.x, r.z, 'rood'); G.klap(); tril(mee.length ? [40, 30, 60] : 30);
  }
  function sloop(b, z) {
    b.kapot = true; verberg(b.mesh, b.i); b.mesh.instanceMatrix.needsUpdate = true;
    plof(b.x, z, b.soort === 'baal' ? rookKleur[0] : STOF, 10, 1.8);
    for (let i = 0; i < 5; i++) wolk(b.x, 1, z, rnd(-6, 6), rnd(3, 8), rnd(-4, 4), 0.5, 1.2, kies(VUUR));
    pak(80, 3); pop('Beuk!', b.x, z, 'roze'); G.sloop(); tril(18); schud = Math.max(schud, 0.25);
  }
  function pakBidon(b, x, z, viaBliksem) {
    b.weg = true; S.keten++; S.ketenT = S.t;
    pak(10, viaBliksem ? 0 : 1);   // bidons via de bliksem tellen voor de score, niet voor het tempo
    S.meter = Math.min(1, S.meter + 0.006 * (1 + sk('rook')));
    G.bidon(S.keten); wolk(x, 0.9, z, 0, 3, 0, 0.3, 0.9, CYAAN, 0.8);
    if (S.keten % 25 === 0) { pop(S.keten + ' op rij!', x, z, 'geel'); tril(8); }
    if (!viaBliksem && sk('bliksem')) bliksem(x, z);
  }
  function bliksem(x, z) {
    const doelen = [];
    for (let i = bIdx; i < W.bidons.length; i++) { const b = W.bidons[i]; if (b.d > S.dist + 34) break; if (!b.weg) doelen.push({ b, i, x: b.x, z: S.dist - b.d }); }
    for (const r of regen) if (!r.weg) doelen.push({ b: r, x: r.x, z: S.dist - r.d });
    doelen.forEach(t => { t.a = Math.hypot(t.x - x, t.z - z); });
    doelen.sort((p, q) => p.a - q.a);
    doelen.slice(0, sk('bliksem') * 2).forEach(t => {
      if (t.a > 22) return;
      for (let k = 1; k <= 6; k++) wolk(lerp(x, t.x, k / 6) + rnd(-0.25, 0.25), 1 + rnd(-0.2, 0.4), lerp(z, t.z, k / 6), 0, 0, 0, 0.16, 0.55, FLITS, 1);
      pakBidon(t.b, t.x, t.z, true); if (t.i !== undefined) zetBidon(t.i);
    });
    W.bidonMesh.instanceMatrix.needsUpdate = true; G.zap();
  }

  /* ================= één stap ================= */
  function update(dt) {
    S.t += dt;
    if (S.sprint) return updateSprint(dt);
    if (toetsen.ArrowLeft) S.cx -= 11 * dt;
    if (toetsen.ArrowRight) S.cx += 11 * dt;
    S.f += ((sleep ? S.fRuw : S.fDoel) - S.f) * Math.min(1, dt * 9);
    const grens = lerp(4.3, 5.1 - (S.K - 1) / 2 * 0.9, S.f);
    S.cx = clamp(S.cx, -grens, grens);

    let wind = null;
    for (const w of W.winden) {
      if (S.dist >= w.d && S.dist <= w.d + w.len) wind = w;
      else if (w.d > S.dist && w.d - S.dist < 85 * W.sc) S.windDir = w.dir;
    }
    if (wind) S.windDir = wind.dir;
    const beschermd = S.rook > 0 || S.schild > 0, ramt = S.boost > 0 && sk('brander') > 0, onkwetsbaar = S.adem > 0;

    // plekken, beschutting, energie, botsen
    const n = peloton.length; let beschut = 0, gevallen = null;
    S.voor = voorkant(n);
    if (!S.spoor.length || S.dist - S.spoor[S.spoor.length - 1].d > 0.4) { S.spoor.push({ d: S.dist, x: S.cx }); if (S.spoor.length > 160) S.spoor.shift(); }
    const dKop = S.dist - S.voor - 1;   // waar de kop van het peloton nu rijdt
    for (let i = 0; i < n; i++) { const r = peloton[i], s = slot(i, n); r.tx = s.x; r.tz = s.z; r.kop = s.kop; }
    // de reuzenkopman beukt hindernissen opzij voor wie achter hem rijdt
    if (S.reusLading > 0) {
      const br = 0.9 + 0.75 * sk('reus');
      for (const b of W.blokken) if (S.reusLading > 0 && !b.kapot && Math.abs(b.d - dKop) < b.hl + 1.5 && Math.abs(b.x - S.cx) < br + b.hw) { sloop(b, S.dist - b.d); S.reusLading--; }
    }
    for (let i = n - 1; i >= 0; i--) {
      const r = peloton[i];
      r.kanteling = clamp((r.tx - r.x) * 0.35, -0.5, 0.5);
      r.x += (r.tx - r.x) * Math.min(1, dt * r.lag * 1.4); r.z += (r.tz - r.z) * Math.min(1, dt * r.lag);
      let veilig = !wind || beschermd;
      // op de plek in de formatie, niet op de renner zelf: sturen mag de beschutting niet breken
      if (!veilig) for (let j = 0; j < peloton.length; j++) {   // niet n: er kan in deze ronde al iemand gelost zijn
        if (j === i) continue; const o = peloton[j], dx = (r.tx - o.tx) * wind.dir, dz = r.tz - o.tz;
        if (dx > 0.3 && dx < 1.35 && dz > 0.12 && dz < 0.95) { veilig = true; break; }
      }
      if (veilig) { beschut++; r.e = Math.min(1, r.e + dt * 0.4); }
      else if (!(S.f > 0.8 && r.kop)) r.e -= dt / (2.4 * (1 + 0.6 * sk('jack')) * (r.kunst >= 0 ? 2 : 1));
      if (r.e <= 0) { peloton.splice(i, 1); laatLos(r, false); continue; }
      if (onkwetsbaar || gevallen) continue;
      const dr = S.dist - r.z; let klap = Math.abs(r.x) > W.halveBreedte(dr) + 0.12;
      if (!klap) for (const b of W.blokken) if (!b.kapot && Math.abs(dr - b.d) < b.hl + 0.3 && Math.abs(r.x - b.x) < b.hw + 0.2) {
        if (ramt) sloop(b, S.dist - b.d); else { klap = true; b.geraakt = true; b.kapot = true; verberg(b.mesh, b.i); b.mesh.instanceMatrix.needsUpdate = true; }
        break;
      }
      if (klap) gevallen = r;
    }
    if (gevallen) valpartij(gevallen);
    const frac = n ? beschut / n : 0;

    // Snelheid: alles vermenigvuldigt met elkaar. Zo wordt een boost op een hoog tempo echt gevaarlijk snel.
    const sector = groepen.filter(g => g.gepakt).length;
    let doel = W.v0 * (1 + 0.05 * sector) * (wind && !beschermd ? 0.6 + 0.4 * frac : lerp(1, 0.9, S.f));
    doel *= 1 + 0.04 * (S.mult - 1);
    doel *= 1 + 0.08 * sk('motor');
    if (S.boost > 0) doel *= 1.4 + 0.1 * sk('brander');
    if (S.sleur > 0) doel *= 1.2;
    if (S.rook > 0) doel *= 1.15 + 0.07 * sk('rook');
    doel = Math.min(doel, W.v0 * 2.8);
    S.v += (doel - S.v) * Math.min(1, dt * (doel > S.v ? 3.5 : 1.6));
    S.dist += S.v * dt; S.top = Math.max(S.top, S.v);
    // De bezemwagen rijdt het tempo van de etappe. Rijd je trager, dan komt hij dichterbij; op je staart eet hij renners op.
    S.bezem = clamp(S.bezem + (S.v - W.v0 * (1 + 0.05 * sector)) * dt * 0.55, -0.5, 32);
    if (S.bezem <= 0 && peloton.length) {
      S.eetT -= dt;
      if (S.eetT <= 0) {
        S.eetT = 0.38; let a = 0; peloton.forEach((o, k) => { if (o.z > peloton[a].z) a = k; });
        const o = peloton.splice(a, 1)[0]; plof(o.x, o.z, STOF, 8); pop('Opgeveegd', o.x, o.z, 'rood'); G.toeter(); tril(25); schud = Math.max(schud, 0.25);
        S.hitte = Math.max(0, S.hitte - 6);
        if (o.kunst >= 0) { S.kunst[o.kunst].levend = false; flits(KUNST[o.kunst].naam + ' opgeveegd', 'zijn knop ben je kwijt', 2); }
      }
    }
    if (S.bezem < 9) { S.gevaarT -= dt; if (S.gevaarT <= 0) { S.gevaarT = 1.1; G.toeter(); } }

    // tellers
    for (const k of ['boost', 'sleur', 'schild', 'magneet', 'adem']) if (S[k] > 0) S[k] -= dt;
    if (S.boost <= 0) S.boostKeten = 0;
    S.kunst.forEach(k => { if (k.laad > 0) k.laad -= dt; });
    // het tempo zakt altijd, en harder naarmate het hoger staat: je moet blijven pakken om het vast te houden
    if (S.rook <= 0) { S.hitte = Math.max(0, S.hitte - dt * (1 + 0.9 * S.mult) * Math.pow(0.67, sk('vuur'))); S.mult = multVan(S.hitte); }
    S.meter = Math.min(1, S.meter + dt * (wind && frac > 0.75 ? 0.035 : 0.012) * (1 + 0.6 * sk('rook')));
    if (S.t - S.ketenT > 1) S.keten = 0;

    // bidons op de weg
    const straal = Math.max(S.magneet > 0 ? 9 : 0, sk('veld') * 2.6), bereik = 0.9 + S.v * dt; let anders = false;
    while (bIdx < W.bidons.length && S.dist - W.bidons[bIdx].d > 26) bIdx++;
    for (let i = bIdx; i < W.bidons.length; i++) {
      const b = W.bidons[i]; if (b.d > S.dist + 30) break; if (b.weg) continue;
      const z = S.dist - b.d;
      if (straal > 0 && Math.abs(b.x - S.cx) < straal && z > -26) { b.x += (S.cx - b.x) * Math.min(1, dt * 8); anders = true; zetBidon(i); }
      if (z > -20 && z < 20 && raakt(b.x, z, 0.66, bereik)) { pakBidon(b, b.x, z); zetBidon(i); anders = true; }
    }
    if (anders) W.bidonMesh.instanceMatrix.needsUpdate = true;
    // bidons uit de helikopter
    if (sk('heli')) {
      S.heliT -= dt;
      if (S.heliT <= 0) {
        S.heliT = [0, 0.2, 0.13, 0.085][sk('heli')]; const r = regen.find(q => q.weg);
        if (r) { r.weg = false; r.d = S.dist + 42; r.x = clamp(S.cx + Math.sin(S.t * 2.3) * 1.2, -4.6, 4.6); r.y = 8; }
      }
    }
    for (const r of regen) {
      if (r.weg) continue; r.y = Math.max(0.75, r.y - dt * 14); const z = S.dist - r.d;
      if (straal > 0 && Math.abs(r.x - S.cx) < straal) r.x += (S.cx - r.x) * Math.min(1, dt * 8);
      if (r.y < 1.2 && z > -20 && raakt(r.x, z, 0.66, bereik)) pakBidon(r, r.x, z); else if (z > 26) r.weg = true;
    }

    // lossers: renners die uit de groepen voor je zijn gevallen
    for (const l of lossers) {
      if (l.weg) continue;
      if (!l.wakker) { if (l.d - S.dist < 130 * W.sc) l.wakker = true; else continue; }
      l.d += W.v0 * 0.18 * dt; const z = S.dist - l.d, hb = W.halveBreedte(l.d) - 0.7;
      l.x = clamp(l.x, -hb, hb);
      if (S.magneet > 0 && z > -20) l.x += (S.cx - l.x) * Math.min(1, dt * 3);
      if (z > -22 && raakt(l.x, z, 1.0, 1.3 + S.v * dt)) {
        l.weg = true; if (peloton.length < VOL) peloton.push(nieuweRenner(l.x, z, l.kleur)); pak(50, 4); pop('+1', l.x, z); G.losser(); tril(10);
      } else if (z > 24) l.weg = true;
    }

    // boostmatten, poorten, rakelings
    for (const m of W.matten) if (!m.klaar && dKop >= m.d) {
      m.klaar = true;
      if (Math.abs(S.cx - m.x) < 2.2) {
        S.boostKeten = S.boost > 0 ? S.boostKeten + 1 : 1; S.boost = (2.0 + 0.5 * sk('brander')) * (1 + 0.3 * (S.boostKeten - 1));
        pak(30, 4); pop(S.boostKeten > 1 ? 'BOOST ×' + S.boostKeten : 'BOOST', S.cx, S.voor, 'roze'); G.boost(); tril(22); schud = Math.max(schud, 0.3);
        for (let i = 0; i < 20; i++) wolk(S.cx + rnd(-2, 2), 0.5, rnd(-2, 6), rnd(-1, 1), rnd(0.5, 2), 10, 0.5, rnd(0.8, 1.4), sk('brander') ? kies(VUUR) : CYAAN, 0.85);
      }
    }
    for (const p of W.poorten) if (!p.klaar && dKop >= p.d) {
      p.klaar = true; const k = S.cx < 0 ? p.links : p.rechts;
      const erbij = k.keer ? Math.min(6, peloton.length) : k.n;
      voegToe(erbij); pak(40, 5); S.meter = Math.min(1, S.meter + 0.06);
      pop('+' + erbij + ' renners', S.cx, S.voor, 'geel'); G.poort(); tril(15);
    }
    for (const b of W.blokken) if (!b.klaar && S.dist >= b.d + b.hl + 3) {
      b.klaar = true;
      if (!b.kapot && !b.geraakt && b.soort !== 'baal' && peloton.some(r => Math.abs(r.x - b.x) < b.hw + 1.1)) {
        pak(60, 4); S.meter = Math.min(1, S.meter + 0.04); pop('Rakelings!', b.x, 2, 'roze'); G.rakelings(); tril(10);
      }
    }

    // groepen voor ons; geel blijft net buiten bereik tot het laatste rechte stuk
    for (const g of groepen) {
      if (g.gepakt) continue;
      g.d += g.v * dt;
      if (g.kop && !S.kopVrij) { if (S.dist >= W.inhoudEind) { S.kopVrij = true; g.v = W.v0 * 0.4; } else g.d = Math.max(g.d, S.dist + 34); }
      if (S.dist >= g.d - 2.5) {
        g.gepakt = true; stil = 0.09; schud = 0.45; G.groep(); tril([20, 30, 40]);
        const erbij = g.kop ? g.n - 1 : g.n;
        g.leden.slice(0, erbij).forEach(l => { if (peloton.length < VOL) peloton.push(nieuweRenner(l.ox + (g.x || 0), -(g.d - S.dist) - l.oz, g.kleur)); });
        pak(500, 15); S.meter = Math.min(1, S.meter + 0.15);
        for (let i = 0; i < 24; i++) wolk(rnd(-4, 4), rnd(0.5, 2), rnd(-8, 2), rnd(-3, 3), rnd(2, 5), rnd(-2, 2), rnd(0.8, 1.4), rnd(1.5, 3), rookKleur[i % 4], 0.85);
        S.reusLading = 2 * sk('reus'); S.bezem = Math.min(32, S.bezem + 6);
        ladder(true);
        if (g.kop) { flits('Geel ingelopen', 'tik om te sprinten', 1.6); return startSprint(); }
        S.kaartRij++;
      }
    }

    // rook, vuur en fakkels
    if (S.rook > 0) {
      S.rook -= dt;
      // rook langs de kanten en achter je, zodat je je eigen renners blijft zien
      for (let i = 0; i < 4; i++) { const kant = Math.random() < 0.5 ? -1 : 1; wolk(kant * rnd(4.5, 9), rnd(0.3, 1.5), rnd(-30, 10), rnd(-1, 1), rnd(1.2, 3), rnd(-2, 2), rnd(1.2, 2), rnd(2.2, 4), rookKleur[i % 2], 0.75); }
      if (S.rook <= 0) $('tint').classList.remove('aan');
    }
    if (S.boost > 0 || S.sleur > 0) for (let i = 0; i < 3; i++) wolk(S.cx + rnd(-2.5, 2.5), 0.4, rnd(2, 9), rnd(-0.5, 0.5), rnd(0.3, 1.5), 12, 0.4, rnd(0.7, 1.4), sk('brander') || S.sleur > 0 ? kies(VUUR) : CYAAN, 0.8);
    if (sk('rook') && Math.random() < dt * 14) wolk(S.cx + rnd(-2, 2), 0.5, rnd(4, 9), rnd(-1, 1), rnd(1, 2.5), 2, 1.4, rnd(1.4, 2.6), rookKleur[Math.floor(S.t * 2) % 4], 0.7);
    for (const f of W.fakkels) {
      const z = S.dist - f.d;
      if (z > -95 && z < 12 && Math.random() < dt * 7) wolk(f.x, 1.5, z, f.dir * rnd(5, 9), rnd(0.3, 1.4), 0, rnd(1.6, 2.4), rnd(1.1, 1.7), rookKleur[f.k], 0.85);
    }

    // gelosten en bezemwagen
    let prooi = null, staart = 0; for (const o of peloton) staart = Math.max(staart, o.z);
    const busZ = staart + 3.2 + Math.max(0, S.bezem) * 0.9; S.busZ = busZ;
    for (let i = gelost.length - 1; i >= 0; i--) {
      const r = gelost[i];
      r.z += (r.val ? S.v : r.vz) * dt;
      if (!r.val) r.x += Math.sin(S.t * 5 + r.fase) * dt * 1.2;
      r.kanteling = r.val ? 1.45 : Math.sin(S.t * 6 + r.fase) * 0.25;
      if (!prooi || r.z > prooi.z) prooi = r;
      if (r.z > busZ - 2.4) { gelost.splice(i, 1); if (busZ < 26) { plof(r.x, busZ - 2.4, STOF, 8); schud = Math.max(schud, 0.2); G.toeter(); tril(20); } }
    }
    bus.position.x += ((prooi && busZ < 26 ? prooi.x : stuurOp(S.dist - 30)) - bus.position.x) * Math.min(1, dt * 3);
    bus.position.y = Math.abs(Math.sin(S.t * 9)) * 0.06; bezem.rotation.y = Math.sin(S.t * 10) * 0.22;

    if (!peloton.length) return einde();
    if (S.kaartRij > 0) { S.kaartRij--; toonKaarten('niveau'); }
  }

  /* ================= de sprint ================= */
  function startSprint() {
    const vb = clamp(S.v, W.v0 * 0.9, W.v0 * 1.6), q = vb / 19;
    S.sprint = { ik: S.dist + 5, geel: S.dist + 5 + 3 * q, fin: S.dist + 150 * q, kracht: 0, t: 0, vb, q };
    S.rook = 0; S.boost = 0; $('tint').classList.remove('aan'); $('sprintbalk').hidden = false; boog.visible = true; G.knop();
  }
  function sprintTik() { const sp = S.sprint; if (!sp) return; sp.kracht += 1.1; G.tik(Math.min(12, sp.kracht * 2)); tril(5); }
  function updateSprint(dt) {
    const sp = S.sprint; sp.t += dt; sp.kracht *= Math.exp(-1.8 * dt);
    const vIk = sp.vb + (0.1 * S.mult + sp.kracht) * sp.q, vGeel = sp.vb + Math.min(4.8, sp.t * 5) * sp.q;
    sp.ik += vIk * dt; sp.geel += vGeel * dt; S.v = vIk; S.dist = sp.ik - 5; S.terug += (vIk - sp.vb * 0.95) * dt; S.top = Math.max(S.top, vIk);
    const n = peloton.length;
    for (let i = 0; i < n; i++) { const r = peloton[i], s = slot(i, n); r.x += (s.x - r.x) * Math.min(1, dt * 4); r.z += (s.z - r.z) * Math.min(1, dt * 4); r.kanteling = 0; }
    for (const s of [-1, 1]) if (Math.random() < dt * 30) wolk(s * 6.3, 1.5, rnd(-90, 0), rnd(-0.6, 0.6), rnd(2, 4), 0, rnd(1.6, 2.4), rnd(1.2, 1.9), kies(rookKleur), 0.85);
    wolk(-0.8 + rnd(-0.3, 0.3), 0.4, -4, 0, 0.6, 9, 0.3, 0.7, STOF, 0.6);
    $('sprintVul').style.setProperty('--p', clamp(sp.kracht / 6 * 100, 0, 100) + '%');
    if (sp.ik >= sp.fin || sp.geel >= sp.fin) {
      const gewonnen = sp.ik >= sp.geel;
      if (gewonnen) {
        S.score += 2000 * S.mult * S.etappe; G.winst(); tril([40, 40, 40, 40, 120]);
        for (let i = 0; i < 90; i++) wolk(rnd(-7, 7), rnd(0.5, 2), rnd(-16, 6), rnd(-2, 2), rnd(2, 6), rnd(-2, 2), rnd(1.5, 3), rnd(2, 4), rookKleur[i % 4], 0.85);
      } else G.verlies();
      $('sprintbalk').hidden = true; toonKaarten(gewonnen ? 'zege' : 'tweede');
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
    W.groep.position.z = S.dist;
    let i = 0;
    const renner = (x, z, kleur, kantel, schaal) => {
      if (i >= MAXI || z < -185 || z > 30) return;
      zet(rBasis, i, x, 0, z, schaal, schaal, schaal, 0, kantel); rTrui.setMatrixAt(i, dummy.matrix); rTrui.setColorAt(i, kleur); i++;
    };
    const reus = S.reusLading > 0 ? 1 + 0.9 * sk('reus') : 1;
    peloton.forEach((r, k) => renner(r.x, r.z + S.terug, tmpK.copy(r.kleur).lerp(ROOD, clamp(1 - r.e, 0, 1) * 0.9), r.kanteling, (r.kunst >= 0 ? 1.7 : 1.35) * (k === 0 ? reus : 1)));
    for (const r of gelost) renner(r.x, r.z + S.terug, tmpK.copy(r.kleur).lerp(ROOD, 0.8), r.kanteling, r.kunst >= 0 ? 1.7 : 1.35);
    if (!S.sprint) for (const b of geestBanen()) for (let k = 0; k < GEEST_LEN; k++) {
      const z = S.voor + 1 + k * 1.4, x = stuurOp(S.dist - k * 1.4) + b;
      renner(x, z, tmpK.copy(GEEST).lerp(CYAAN, 0.5 + 0.5 * Math.sin(S.t * 9 + k)), 0, 1.35);
      if (Math.random() < 0.04) wolk(x, 0.8, z, 0, 1.5, 4, 0.3, 0.6, CYAAN, 0.6);
    }
    for (const l of lossers) if (l.wakker && !l.weg) renner(l.x + Math.sin(S.t * 3 + l.fase) * 0.15, S.dist - l.d, tmpK.copy(l.kleur).lerp(GRIJS, 0.35), Math.sin(S.t * 4 + l.fase) * 0.15, 1.35);
    let geelZ = null, geelX = 0;
    for (const g of groepen) {
      if (g.gepakt) continue;
      const z0 = S.dist - g.d; g.x = Math.sin(S.t * 0.6 + g.n) * 1.0;
      const hb = W.halveBreedte(g.d) - 2.0, gx = clamp(g.x, -Math.max(0, hb), Math.max(0, hb));
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
      boog.position.z = S.dist - S.sprint.fin;
    }
    pijl.visible = geelZ !== null && geelZ > -185; if (pijl.visible) pijl.position.set(geelX, 3.1 + Math.sin(S.t * 5) * 0.2, geelZ);
    rBasis.count = rTrui.count = i;
    rBasis.instanceMatrix.needsUpdate = rTrui.instanceMatrix.needsUpdate = true; rTrui.instanceColor.needsUpdate = true;
    bus.position.z = (S.busZ || 30) + S.terug; bus.visible = bus.position.z < 30;

    // wat je krachten laten zien
    const nm = S.sprint ? 0 : sk('motor'); motoren.count = nm;
    for (let k = 0; k < nm; k++) zet(motoren, k, S.cx + (k - (nm - 1) / 2) * 1.5, 0, S.voor - 3.5 - (k % 2) * 1.6, 1.3, 1.3, 1.3, 0, Math.sin(S.t * 3 + k) * 0.06);
    motoren.instanceMatrix.needsUpdate = true;
    heli.visible = heliSchaduw.visible = sk('heli') > 0 && !S.sprint;
    if (heli.visible) {
      heli.position.set(S.cx * 0.8 + Math.sin(S.t * 1.3) * 1.5, 9 + Math.sin(S.t * 2) * 0.4, -36); heli.rotation.z = Math.sin(S.t * 1.3) * 0.12;
      rotor.rotation.y += 0.9; heliSchaduw.position.set(heli.position.x, 0.04, -36);
    }
    const straal = Math.max(S.magneet > 0 ? 9 : 0, sk('veld') * 2.6); veld.visible = straal > 0 && !S.sprint;
    if (veld.visible) { const s = straal * (1 + Math.sin(S.t * 8) * 0.04); veld.scale.set(s, 1, s); veld.position.set(S.cx, 0.05, S.voor + 1); }
    regen.forEach((r, k) => { if (r.weg) verberg(regenMesh, k); else zet(regenMesh, k, r.x, r.y, S.dist - r.d, 1.5, 1.5, 1.5, 0, S.t * 6 + k); });
    regenMesh.instanceMatrix.needsUpdate = true;

    // hoe harder, hoe wijder het beeld en hoe feller de strepen
    const s = rustig ? 0 : schud, hard = clamp(S.v / W.v0 - 1, 0, 2.2);
    cam.fov = Math.min(104, basisFov + (rustig ? 0 : hard * 13)); cam.updateProjectionMatrix();
    pMat.uniforms.uSchaal.value = renderer.domElement.height / (2 * Math.tan(cam.fov * Math.PI / 360));
    cam.position.set(rnd(-s, s), 13 - hard * 1.2 + rnd(-s, s), 19); cam.lookAt(0, 0, -6);
    $('vaart').style.opacity = rustig ? 0 : clamp((hard - 0.3) * 0.75, 0, 0.75);
    renderer.render(scene, cam);
  }

  /* ================= hud ================= */
  // De koers als één smalle balk bovenaan: wij links, de groepen als stippen, de streep rechts.
  function ladder(nieuw) {
    const L = W.inhoudEind + 160 * W.sc, pos = d => clamp(d / L * 100, 0, 100) + '%';
    if (nieuw) {
      const el = $('stippen'); el.textContent = '';
      groepen.forEach(g => { const i = document.createElement('i'); if (g.kop) i.className = 'geel'; el.append(i); g.stip = i; });
    }
    let volgende = null;
    for (const g of groepen) { if (g.stip) { g.stip.hidden = g.gepakt; g.stip.style.left = pos(g.d); } if (!g.gepakt && !volgende) volgende = g; }
    $('ikStip').style.left = pos(S.dist);
    $('nog').textContent = 'Etappe ' + S.etappe + (S.sprint ? ' · sprint' : volgende ? ' · ' + (volgende.kop ? 'Geel' : volgende.naam) + ' over ' + Math.max(0, Math.round(volgende.d - S.dist)) + ' m' : '');
    $('aantal').textContent = peloton.length;
  }

  function hud(dt) {
    $('score').textContent = Math.round(S.score).toLocaleString('nl-NL');
    $('mult').textContent = '×' + S.mult; $('hitte').style.setProperty('--h', (trapDeel(S.hitte) * 100) + '%');
    $('tempo').classList.toggle('heet', S.mult >= 4);
    $('kmu').textContent = Math.round(S.v * 3.6) + ' km/u'; $('kmu').classList.toggle('hard', S.v > W.v0 * 1.45);
    S.ladderT -= dt; if (S.ladderT <= 0) { S.ladderT = 0.1; ladder(false); }
    const rk = $('rook'); rk.style.setProperty('--m', Math.round(S.meter * 100)); rk.classList.toggle('klaar', S.meter >= 1 && S.rook <= 0 && !S.sprint);
    KUNST.forEach((k, i) => {
      const st = S.kunst[i], el = $('k' + i), actief = [S.sleur, S.schild, S.magneet][i] > 0;
      el.style.setProperty('--m', st.levend ? Math.round(clamp(1 - st.laad / k.laad, 0, 1) * 100) : 0);
      el.classList.toggle('klaar', st.levend && st.laad <= 0 && !actief); el.classList.toggle('actief', actief); el.classList.toggle('weg', !st.levend);
    });

    // Eén kleine regel boven de knoppen. Uitleg over wind, dorp en hindernissen komt alleen de allereerste keer.
    let titel = '', tekst = '';
    const d = S.dist, ver = 110 * W.sc;
    $('app').classList.toggle('gevaar', S.bezem < 9 && !S.sprint && fase === 'spel');
    if (S.flits > 0) { titel = S.flitsTitel; tekst = S.flitsTekst; }
    else if (!S.sprint && S.bezem < 9) { titel = 'Bezemwagen!'; tekst = 'rijd harder'; }
    else if (!S.sprint) {
      const w = W.winden.find(x => x.d + x.len > d), e = W.dorpen.find(x => x.d + x.len > d), v = W.blokken.find(x => x.d > d - 10);
      if (!gezien.wind && w && d > w.d - ver) { if (d > w.d + w.len - 12) leerde('wind'); else { titel = w.dir > 0 ? 'Zijwind van links' : 'Zijwind van rechts'; tekst = 'veeg omlaag: waaier'; } }
      if (!gezien.blok && v && v.d - d < ver) { if (v.d - d < 4) leerde('blok'); else { titel = 'Hindernissen'; tekst = 'veeg omhoog: lint'; } }
      if (!gezien.dorp && e && d > e.d - ver) { if (d > e.d + e.len - 12) leerde('dorp'); else { titel = 'Dorp'; tekst = 'lint, en naar het midden'; } }
    }
    const b = $('banner'); b.classList.toggle('weg', !titel);
    if (titel) { $('bTitel').textContent = titel; $('bTekst').textContent = tekst; }
  }

  /* ================= kaarten: een nieuwe kracht kiezen ================= */
  function toonKaarten(soort) {
    fase = 'kaart'; sleep = null;
    const dubbel = soort === 'zege';
    $('kTitel').textContent = soort === 'zege' ? 'Etappezege!' : soort === 'tweede' ? 'Tweede' : 'Groep ingelopen';
    $('kTekst').textContent = soort === 'zege' ? 'Je klopt geel op de streep. Kies je prijs: hij telt dubbel.'
      : soort === 'tweede' ? 'Geel was net sneller. Kies een troostprijs.' : 'Kies een kracht. Hij blijft tot je bent opgeveegd.';
    const keuze = schud2(KRACHT.filter(k => sk(k.id) < k.max)).slice(0, 3), el = $('kaarten');
    el.textContent = '';
    keuze.forEach(k => {
      const nu = sk(k.id), straks = Math.min(k.max, nu + (dubbel ? 2 : 1));
      const b = document.createElement('button'); b.type = 'button'; b.className = 'kaart' + (dubbel ? ' goud' : '');
      const st = document.createElement('strong'); st.textContent = k.t;
      if (k.max < 99) { const em = document.createElement('em'); em.textContent = ROMEINS[straks]; st.append(em); }
      const sp = document.createElement('span'); sp.textContent = k.s(straks);
      b.append(st, sp);
      b.addEventListener('click', () => {
        S.sk[k.id] = k.max < 99 ? straks : nu + 1;
        if (k.id === 'knecht') voegToe(dubbel ? 10 : 5);
        if (k.id === 'reus') S.reusLading = 2 * S.sk.reus;
        $('kaartBlad').hidden = true; G.niveau(); tril(20); fase = 'spel';
        // even onkwetsbaar na het kiezen, zodat je niet blind een hindernis in rijdt
        if (soort === 'niveau') { S.adem = 0.8; S.bezem = Math.max(S.bezem, 6); pop(k.t + (k.max < 99 ? ' ' + ROMEINS[straks] : ''), S.cx, -3, 'geel'); } else startEtappe(S.etappe + 1);
      });
      el.append(b);
    });
    $('kaartBlad').hidden = false;
  }

  function einde() {
    fase = 'eind'; sleep = null;
    let best = 0; try { best = +localStorage.getItem('tdl-spel-best') || 0; } catch (_) {}
    const score = Math.round(S.score), record = score > best;
    if (record) { best = score; try { localStorage.setItem('tdl-spel-best', String(best)); } catch (_) {} }
    $('eTitel').textContent = 'Opgeveegd';
    $('eTekst').textContent = 'De bezemwagen heeft je hele peloton te pakken in etappe ' + S.etappe + ', ' + W.th.naam + '.' + (record && score > 0 ? ' Nieuw record.' : '');
    $('eScore').textContent = score.toLocaleString('nl-NL'); $('eBest').textContent = best.toLocaleString('nl-NL');
    $('eEtappe').textContent = S.etappe; $('eTop').textContent = Math.round(S.top * 3.6) + ' km/u';
    $('eind').hidden = false; $('tint').classList.remove('aan'); $('sprintbalk').hidden = true; G.verlies();
  }

  /* ================= knoppen en besturing ================= */
  function meerRook() {
    if (fase !== 'spel' || S.sprint || S.meter < 1 || S.rook > 0) return;
    S.meter = 0; S.rook = 5 + sk('rook'); schud = 0.3; $('tint').classList.add('aan');
    for (const r of peloton) r.e = 1;
    for (let i = 0; i < 60; i++) { const kant = i % 2 ? -1 : 1; wolk(kant * rnd(4, 10), rnd(0.3, 2), rnd(-30, 12), rnd(-2, 2), rnd(1, 4), rnd(-3, 3), rnd(1.2, 2.2), rnd(2.5, 4.5), rookKleur[i % 2], 0.85); }
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
    S.cx += (e.clientX - sleep.x) * (22 / canvas.clientWidth);
    S.fRuw = clamp(S.fRuw + (e.clientY - sleep.y) / 80, 0, 1);
    sleep.x = e.clientX; sleep.y = e.clientY;
  });
  const los = () => { if (sleep && S) { S.fDoel = S.fRuw > 0.5 ? 1 : 0; S.fRuw = S.fDoel; } sleep = null; };
  canvas.addEventListener('pointerup', los); canvas.addEventListener('pointercancel', los);
  addEventListener('keydown', e => {
    toetsen[e.key] = true; if (fase !== 'spel') return;
    if (e.key === ' ') { e.preventDefault(); if (S.sprint) { if (!e.repeat) sprintTik(); } else meerRook(); }
    if (e.key === 'ArrowDown') S.fDoel = 1;
    if (e.key === 'ArrowUp') S.fDoel = 0;
    if (e.key === '1' || e.key === '2' || e.key === '3') kunst(+e.key - 1);
  });
  addEventListener('keyup', e => { toetsen[e.key] = false; });
  document.addEventListener('contextmenu', e => e.preventDefault());

  function geluidKnop() { const b = $('geluid'); b.textContent = geluidAan ? 'Geluid aan' : 'Geluid uit'; b.setAttribute('aria-pressed', String(geluidAan)); }
  $('geluid').addEventListener('click', () => { geluidAan = !geluidAan; try { localStorage.setItem('tdl-spel-geluid', geluidAan ? 'aan' : 'uit'); } catch (_) {} geluidKnop(); });
  geluidKnop();

  const start = () => { startGeluid(); herstart(); fase = 'spel'; $('start').hidden = true; $('eind').hidden = true; };
  $('startKnop').addEventListener('click', start); $('opnieuw').addEventListener('click', start);

  /* ================= lus ================= */
  function maat() {
    const w = canvas.clientWidth, h = canvas.clientHeight; if (!w || !h) return;
    renderer.setSize(w, h, false); cam.aspect = w / h;
    basisFov = w < h ? Math.min(80, 2 * Math.atan(Math.tan(22 * Math.PI / 180) / cam.aspect) * 180 / Math.PI) : 52;
  }
  addEventListener('resize', maat); maat();
  herstart();
  let vorigeT = performance.now();
  function lus(nu) {
    let dt = Math.min(0.05, (nu - vorigeT) / 1000); vorigeT = nu;
    const echt = dt;
    if (stil > 0) { stil -= dt; dt = 0; }
    if (fase === 'spel' && dt > 0) {
      // bij hoge snelheid in kleinere stapjes rekenen, zodat je niet door een hindernis heen schiet
      const stappen = clamp(Math.ceil(S.v * dt / 1.4), 1, 5);
      try { for (let k = 0; k < stappen && fase === 'spel'; k++) update(dt / stappen); }
      catch (fout) { console.error(fout); }   // één fout in een stap mag het spel niet laten bevriezen
    }
    if (S.flits > 0) S.flits -= echt;
    schud = Math.max(0, schud - echt * 1.2);
    updateRook(fase === 'kaart' ? 0 : echt, fase === 'spel' ? S.v : 0);
    try { teken(); hud(echt); } catch (fout) { console.error(fout); }
    requestAnimationFrame(lus);
  }
  requestAnimationFrame(lus);

  // voor de tests en voor afstellen in de console
  window.__spel = { get S() { return S; }, get W() { return W; }, get peloton() { return peloton; }, get groepen() { return groepen; }, get fase() { return fase; },
    KRACHT, sprintTik, kunst, meerRook };
})();
