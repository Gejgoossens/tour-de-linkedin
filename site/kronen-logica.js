/* Kronen: puzzelgenerator en redeneermotor.
   Regels: één kroon per rij, per kolom en per kleurvlak; kronen raken elkaar niet, ook niet schuin.
   De motor lost puzzels op met dezelfde stappen als een mens. Daardoor kan hij op elk moment
   de makkelijkste volgende stap aanwijzen (voor hints en voor de analyse achteraf).
   Geen DOM: dit bestand draait ook in Node (zie scripts/test_kronen.js). */
(function(root){
"use strict";

const KLEUREN = [
  { hex:"#B9A6F2", bn:"paarse",    zn:"paars" },
  { hex:"#F5B36B", bn:"oranje",    zn:"oranje" },
  { hex:"#7FBFF5", bn:"blauwe",    zn:"blauw" },
  { hex:"#9AD98A", bn:"groene",    zn:"groen" },
  { hex:"#F29BB8", bn:"roze",      zn:"roze" },
  { hex:"#EFE07A", bn:"gele",      zn:"geel" },
  { hex:"#C9CED6", bn:"grijze",    zn:"grijs" },
  { hex:"#6FD6C8", bn:"turquoise", zn:"turquoise" },
  { hex:"#EF8A7C", bn:"rode",      zn:"rood" },
  { hex:"#C9A27E", bn:"bruine",    zn:"bruin" }
];

const TECHNIEKEN = {
  enkel:      { naam:"Laatste vakje",              zwaarte:0, tip:"Tel per rij, kolom en vlak hoeveel vakjes nog vrij zijn. Is het er één, dan staat daar de kroon." },
  opgesloten: { naam:"Vlak in één rij of kolom",   zwaarte:1, tip:"Zoek vlakken die helemaal binnen één rij of kolom liggen. Die lijn is dan van dat vlak: streep de rest van de lijn weg." },
  claim:      { naam:"Rij of kolom in één vlak",   zwaarte:1, tip:"Kijk per rij en kolom of alle vrije vakjes dezelfde kleur hebben. Dan komt de kroon van die kleur in die lijn: streep de rest van het vlak weg." },
  aanval:     { naam:"Blokkerend vakje",           zwaarte:2, tip:"Kijk bij kleine vlakken (2 of 3 vrije vakjes) welk vakje ernaast ze allemaal tegelijk raakt. Daar kan geen kroon staan." },
  groep:      { naam:"Groep van vlakken",          zwaarte:3, tip:"Zoek twee of drie vlakken die samen in net zoveel rijen of kolommen passen. Die lijnen zijn dan bezet: andere kleuren vallen daar af." },
  fout:       { naam:"Fout herstellen",            zwaarte:0, tip:"Zet pas een kruisje of kroon als je kunt uitleggen waarom. Gokken kost later meer tijd dan het nu oplevert." }
};

/* ---- willekeur met een zaadje, zodat de dagpuzzel voor iedereen gelijk is ---- */
function rng(seed){
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(s){ let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function schud(a, rnd){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---- genereren ---- */
function maakOplossing(n, rnd){
  const kol = [], bezet = new Array(n).fill(false);
  (function zet(r){
    if(r === n) return true;
    for(const c of schud([...Array(n).keys()], rnd)){
      if(bezet[c] || (r > 0 && Math.abs(kol[r - 1] - c) <= 1)) continue;
      bezet[c] = true; kol[r] = c;
      if(zet(r + 1)) return true;
      bezet[c] = false;
    }
    return false;
  })(0);
  return kol;
}

function groei(n, opl, rnd){
  const reg = new Int8Array(n * n).fill(-1), gewicht = [];
  const kleur = schud([...Array(n).keys()], rnd);
  for(let r = 0; r < n; r++){ reg[r * n + opl[r]] = kleur[r]; gewicht[kleur[r]] = Math.pow(rnd(), 2) * 4 + 0.12; }
  for(let vrij = n * n - n; vrij > 0; vrij--){
    const opties = []; let tot = 0;
    for(let i = 0; i < n * n; i++){
      if(reg[i] >= 0) continue;
      const r = (i / n) | 0, c = i % n;
      for(const [dr, dc] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const rr = r + dr, cc = c + dc;
        if(rr < 0 || cc < 0 || rr >= n || cc >= n) continue;
        const g = reg[rr * n + cc];
        if(g >= 0){ tot += gewicht[g]; opties.push([i, g, tot]); }
      }
    }
    const x = rnd() * tot, k = opties.find(o => o[2] >= x) || opties[opties.length - 1];
    reg[k[0]] = k[1];
  }
  return reg;
}

/* ---- redeneren ---- */
/* staat per vakje: 0 leeg, 1 kruisje, 2 kroon */
function raakt(n, a, b, reg){
  const ra = (a / n) | 0, ca = a % n, rb = (b / n) | 0, cb = b % n;
  return ra === rb || ca === cb || reg[a] === reg[b] || (Math.abs(ra - rb) <= 1 && Math.abs(ca - cb) <= 1);
}

function analyse(n, reg, staat){
  const N = n * n, k = new Uint8Array(N);
  const rij = new Int8Array(n).fill(-1), kol = new Int8Array(n).fill(-1), rg = new Int8Array(n).fill(-1);
  for(let i = 0; i < N; i++) if(staat[i] === 2){ rij[(i / n) | 0] = i; kol[i % n] = i; rg[reg[i]] = i; }
  for(let i = 0; i < N; i++){
    if(staat[i] !== 0) continue;
    const r = (i / n) | 0, c = i % n;
    if(rij[r] >= 0 || kol[c] >= 0 || rg[reg[i]] >= 0) continue;
    let vrij = true;
    for(const [dr, dc] of [[1,1],[1,-1],[-1,1],[-1,-1]]){
      const rr = r + dr, cc = c + dc;
      if(rr >= 0 && cc >= 0 && rr < n && cc < n && staat[rr * n + cc] === 2) vrij = false;
    }
    if(vrij) k[i] = 1;
  }
  return { k, rij, kol, rg };
}

function hoortBij(n, reg, cel, soort, i){
  return soort === "rij" ? ((cel / n) | 0) === i : soort === "kol" ? cel % n === i : reg[cel] === i;
}

/* De makkelijkste logische stap vanuit deze stand, of null als de motor er geen ziet.
   Resultaat: { type, plaats:[cellen voor een kroon], weg:[cellen voor een kruisje], basis:[cellen waar je naar moet kijken], ... } */
function stap(n, reg, staat){
  const N = n * n, A = analyse(n, reg, staat);
  const eenheden = [];
  for(const soort of ["reg", "rij", "kol"]){
    const heeft = soort === "reg" ? A.rg : soort === "rij" ? A.rij : A.kol;
    for(let i = 0; i < n; i++){
      if(heeft[i] >= 0) continue;
      const cellen = [], alle = [];
      for(let c = 0; c < N; c++) if(hoortBij(n, reg, c, soort, i)){ alle.push(c); if(A.k[c]) cellen.push(c); }
      eenheden.push({ soort, i, cellen, alle });
    }
  }
  const dood = eenheden.find(e => !e.cellen.length);
  if(dood) return { type:"vast", eenheid:dood, plaats:[], weg:[], basis:dood.alle };

  const enkel = eenheden.find(e => e.cellen.length === 1);
  if(enkel) return { type:"enkel", eenheid:enkel, plaats:[enkel.cellen[0]], weg:[], basis:enkel.alle };

  const regs = eenheden.filter(e => e.soort === "reg");
  function lijnen(kMin, kMax){
    for(let k = kMin; k <= kMax; k++){
      for(const orient of ["rij", "kol"]){
        const heeft = orient === "rij" ? A.rij : A.kol;
        const lijn = c => orient === "rij" ? (c / n) | 0 : c % n;
        for(let a = 0; a + k <= n; a++){
          const b = a + k - 1;
          let open = 0;
          for(let l = a; l <= b; l++) if(heeft[l] < 0) open++;
          if(!open || heeft[a] >= 0 || heeft[b] >= 0) continue;
          const binnen = regs.filter(e => e.cellen.every(c => lijn(c) >= a && lijn(c) <= b));
          const raak = regs.filter(e => e.cellen.some(c => lijn(c) >= a && lijn(c) <= b));
          if(binnen.length === open){
            const set = new Set(binnen.map(e => e.i)), weg = [];
            for(let c = 0; c < N; c++) if(A.k[c] && lijn(c) >= a && lijn(c) <= b && !set.has(reg[c])) weg.push(c);
            if(weg.length) return { type:"opgesloten", orient, a, k, aantal:open, regs:[...set], plaats:[], weg, basis:binnen.flatMap(e => e.cellen) };
          }
          if(raak.length === open){
            const set = new Set(raak.map(e => e.i)), weg = [], basis = [];
            for(let c = 0; c < N; c++) if(A.k[c] && set.has(reg[c])) (lijn(c) >= a && lijn(c) <= b ? basis : weg).push(c);
            if(weg.length) return { type:"claim", orient, a, k, aantal:open, regs:[...set], plaats:[], weg, basis };
          }
        }
      }
    }
    return null;
  }

  let h = lijnen(1, 1);
  if(h) return h;

  for(const e of [...eenheden].sort((x, y) => x.cellen.length - y.cellen.length)){
    const weg = [];
    for(let c = 0; c < N; c++){
      if(!A.k[c] || hoortBij(n, reg, c, e.soort, e.i)) continue;
      if(e.cellen.every(d => raakt(n, c, d, reg))) weg.push(c);
    }
    if(weg.length) return { type:"aanval", eenheid:e, plaats:[], weg, basis:e.cellen };
  }

  return lijnen(2, n - 1);
}

function techniek(h){
  if(!h) return "fout";
  if(h.type === "opgesloten" || h.type === "claim") return h.aantal > 1 ? "groep" : h.type;
  return h.type === "vast" ? "fout" : h.type;
}

/* ---- uitleg in gewone taal ---- */
function hoofd(s){ return s.charAt(0).toUpperCase() + s.slice(1); }
function opsom(a){ return a.length < 2 ? a.join("") : a.slice(0, -1).join(", ") + " en " + a[a.length - 1]; }
function naamEenheid(e){ return e.soort === "reg" ? `het ${KLEUREN[e.i].bn} vlak` : e.soort === "rij" ? `rij ${e.i + 1}` : `kolom ${e.i + 1}`; }
function naamVlakken(regs){ return regs.length === 1 ? `het ${KLEUREN[regs[0]].bn} vlak` : `de vlakken ${opsom(regs.map(g => KLEUREN[g].zn))}`; }
function naamLijnen(h){
  const enk = h.orient === "rij" ? "rij" : "kolom", mv = h.orient === "rij" ? "rijen" : "kolommen";
  return h.k === 1 ? `${enk} ${h.a + 1}` : h.k === 2 ? `${mv} ${h.a + 1} en ${h.a + 2}` : `${mv} ${h.a + 1} t/m ${h.a + h.k}`;
}
function naamCel(n, c){ return `rij ${((c / n) | 0) + 1}, kolom ${c % n + 1}`; }

function beschrijf(h){
  if(h.type === "enkel") return `In ${naamEenheid(h.eenheid)} is nog maar één vakje vrij. Daar moet de kroon komen.`;
  if(h.type === "vast") return `In ${naamEenheid(h.eenheid)} is geen vrij vakje meer over. Er staat dus ergens een kruisje of kroon verkeerd.`;
  if(h.type === "aanval"){
    const wat = h.weg.length === 1 ? "het aangewezen vakje" : "een van de aangewezen vakjes";
    return `Een kroon op ${wat} zou alle vrije vakjes van ${naamEenheid(h.eenheid)} blokkeren. Daar kan dus geen kroon staan.`;
  }
  const L = naamLijnen(h), V = naamVlakken(h.regs), een = h.regs.length === 1 && h.k === 1;
  if(h.type === "opgesloten") return een
    ? `${hoofd(V)} past alleen nog in ${L}. De kroon van ${L} komt dus in dat vlak; de andere vakjes van ${L} vallen af.`
    : `${hoofd(V)} ${h.regs.length === 1 ? "past" : "passen samen"} alleen nog in ${L}. Die lijnen zijn daarmee bezet; andere kleuren vallen daar af.`;
  return een
    ? `In ${L} is alleen nog plek in ${V}. De kroon van dat vlak komt dus in ${L}; de rest van het vlak valt af.`
    : `In ${L} is alleen nog plek in ${V}. De kronen van die kleuren komen dus daar; de rest van die vlakken valt af.`;
}

/* ---- oplossen zoals een mens, om te controleren dat een puzzel zonder gokken kan ---- */
function losOp(n, reg){
  const staat = new Uint8Array(n * n), tel = {};
  let kronen = 0, zwaarte = 0;
  while(kronen < n){
    const h = stap(n, reg, staat);
    if(!h || h.type === "vast") return null;
    const t = techniek(h);
    tel[t] = (tel[t] || 0) + 1; zwaarte += TECHNIEKEN[t].zwaarte;
    for(const c of h.plaats){ staat[c] = 2; kronen++; }
    for(const c of h.weg) staat[c] = 1;
  }
  const opl = [];
  for(let i = 0; i < n * n; i++) if(staat[i] === 2) opl.push(i);
  return { opl, tel, zwaarte };
}

/* Omdat elke stap van de motor waterdicht is, heeft een puzzel die hij oplost precies één oplossing. */
function genereer(n, seed){
  const rnd = rng(seed);
  for(let poging = 0; poging < 20000; poging++){
    const reg = groei(n, maakOplossing(n, rnd), rnd);
    const res = losOp(n, reg);
    if(res && res.zwaarte >= n - 3) return { n, reg:Array.from(reg), opl:res.opl, zwaarte:res.zwaarte, tel:res.tel, seed };
  }
  return null;
}

const api = { KLEUREN, TECHNIEKEN, rng, hash, analyse, stap, techniek, beschrijf, losOp, genereer, naamCel, raakt };
if(typeof module !== "undefined" && module.exports) module.exports = api;
else root.KronenLogica = api;
})(typeof self !== "undefined" ? self : this);
