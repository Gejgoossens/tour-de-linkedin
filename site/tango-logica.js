/* Tango: puzzelgenerator en redeneermotor.
   Regels (zoals LinkedIn ze geeft): vul elk vakje met een zon of een maan. Elke rij en elke kolom
   heeft evenveel zonnen als manen (drie om drie op het 6×6-bord). Nooit meer dan twee dezelfde
   naast elkaar, horizontaal of verticaal. Een = tussen twee vakjes: die twee zijn gelijk.
   Een × tussen twee vakjes: die twee zijn verschillend.
   De motor lost puzzels op met dezelfde stappen als een mens. Daardoor kan hij op elk moment
   de makkelijkste volgende stap aanwijzen (voor hints en voor de analyse achteraf).
   Geen DOM: dit bestand draait ook in Node (zie scripts/test_tango.js). */
(function(root){
"use strict";

const N = 6, NN = 36, ZON = 1, MAAN = 2;
const GELIJK = 1, KRUIS = 2;

const TECHNIEKEN = {
  paar:     { naam:"Twee naast elkaar",    zwaarte:0, tip:"Zoek twee dezelfde symbolen naast elkaar. Aan beide kanten daarvan komt het andere symbool, want drie op rij mag niet." },
  gat:      { naam:"Gat tussen twee",      zwaarte:0, tip:"Zoek twee dezelfde symbolen met precies één leeg vakje ertussen. In dat gat komt het andere symbool." },
  teken:    { naam:"Teken volgen",         zwaarte:0, tip:"Loop na elke zet de = en × langs. Staat aan één kant een symbool, dan weet je de andere kant meteen: = is hetzelfde, × is het andere." },
  tel:      { naam:"Drie is vol",          zwaarte:1, tip:"Tel per rij en kolom. Staan er al drie zonnen, dan zijn alle lege vakjes in die lijn manen, en andersom." },
  tekentel: { naam:"Tekenpaar meetellen",  zwaarte:3, tip:"Een × op twee lege vakjes is altijd één zon en één maan; een = is twee keer hetzelfde. Tel zo'n paar mee in de rij of kolom waar het in ligt, ook als je nog niet weet wat er komt." },
  lijn:     { naam:"Lijn doorrekenen",     zwaarte:5, tip:"Pak de rij of kolom met de minste lege vakjes en probeer per leeg vakje beide symbolen. Loopt één van de twee vast op drie op rij of op de telling, dan is het de andere." },
  gevolg:   { naam:"Vooruitdenken",        zwaarte:9, tip:"Als geen enkele lijn op zichzelf iets oplevert: kies een vakje naast een teken of in een bijna volle lijn, en denk één symbool een paar stappen door. Loopt het vast, dan is het de andere." },
  fout:     { naam:"Fout herstellen",      zwaarte:0, tip:"Zet pas een symbool als je kunt uitleggen waarom. Een gok die niet klopt kost later meer tijd dan hij nu oplevert." }
};

/* ---- willekeur met een zaadje, zodat de dagpuzzel voor iedereen gelijk is ---- */
function rng(seed){
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function hash(s){ let h = 2166136261; for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function schud(a, rnd){ for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

/* ---- het bord ---- */
/* lijnen 0-5 zijn de rijen, 6-11 de kolommen; elk een lijst van zes vakjes */
const LIJNEN = [];
for(let r = 0; r < N; r++) LIJNEN.push([0, 1, 2, 3, 4, 5].map(c => r * N + c));
for(let c = 0; c < N; c++) LIJNEN.push([0, 1, 2, 3, 4, 5].map(r => r * N + c));
/* de 14 geldige invullingen van één lijn: drie om drie, nooit drie op rij */
const PATRONEN = [];
for(let m = 0; m < 64; m++){
  const p = [0, 1, 2, 3, 4, 5].map(k => (m >> k) & 1 ? ZON : MAAN);
  if(p.filter(v => v === ZON).length !== 3) continue;
  if([0, 1, 2, 3].some(k => p[k] === p[k + 1] && p[k] === p[k + 2])) continue;
  PATRONEN.push(p);
}
const plekIn = (li, cel) => li < N ? cel % N : (cel / N) | 0;

/* tekens per lijn, als posities binnen die lijn: [k, t, index] betekent teken tussen plek k en k+1 */
function tekensPerLijn(tekens){
  const uit = LIJNEN.map(() => []);
  tekens.forEach(([a, b, t], i) => {
    if(b === a + 1) uit[(a / N) | 0].push([a % N, t, i]);
    else uit[N + a % N].push([(a / N) | 0, t, i]);
  });
  return uit;
}

/* Overtredingen van de regels in deze stand. Voor de rode strepen op het bord en voor de motor.
   Resultaat: [{ soort:"drie"|"tel"|"teken", cellen, lijn, waarde, teken }] */
function fouten(tekens, st){
  const uit = [];
  for(let li = 0; li < 12; li++){
    const L = LIJNEN[li], tel = [0, 0, 0];
    for(let k = 0; k < N; k++) tel[st[L[k]]]++;
    for(let k = 0; k + 2 < N; k++){
      const v = st[L[k]];
      if(v && v === st[L[k + 1]] && v === st[L[k + 2]]) uit.push({ soort:"drie", cellen:[L[k], L[k + 1], L[k + 2]], lijn:li, waarde:v });
    }
    for(const v of [ZON, MAAN]) if(tel[v] > 3) uit.push({ soort:"tel", cellen:L.filter(c => st[c] === v), lijn:li, waarde:v });
  }
  tekens.forEach(([a, b, t], i) => {
    if(st[a] && st[b] && (st[a] === st[b]) !== (t === GELIJK)) uit.push({ soort:"teken", cellen:[a, b], teken:i, t });
  });
  return uit;
}

/* welke invullingen van lijn li passen nog bij de stand en bij de tekens in die lijn? */
function passend(li, st, tpl){
  const L = LIJNEN[li];
  return PATRONEN.filter(p => {
    for(let k = 0; k < N; k++) if(st[L[k]] && st[L[k]] !== p[k]) return false;
    for(const [k, t] of tpl[li]) if((p[k] === p[k + 1]) !== (t === GELIJK)) return false;
    return true;
  });
}

/* ---- redeneren ---- */
/* De eenvoudige stappen: paar, gat, teken, tel en tekenpaar. `alleen` beperkt het zoeken tot één lijn
   (voor de uitleg van "lijn doorrekenen"); `tot` is de zwaarste soort die mee mag doen. */
const VOLGORDE = ["paar", "gat", "teken", "tel", "tekentel"];
function eenvoudig(tekens, tpl, st, alleen, tot){
  const lijnen = alleen === undefined ? [...Array(12).keys()] : [alleen];
  const max = tot === undefined ? VOLGORDE.length : VOLGORDE.indexOf(tot) + 1;

  for(const li of lijnen){
    const L = LIJNEN[li];
    for(let k = 0; k < N; k++){
      if(st[L[k]]) continue;
      for(const [a, b] of [[k - 2, k - 1], [k + 1, k + 2]]){
        if(a < 0 || b >= N) continue;
        const v = st[L[a]];
        if(v && v === st[L[b]]) return { type:"paar", cel:L[k], waarde:3 - v, basis:[L[a], L[b]], lijn:li, v };
      }
    }
  }
  if(max < 2) return null;
  for(const li of lijnen){
    const L = LIJNEN[li];
    for(let k = 1; k < N - 1; k++){
      const v = st[L[k - 1]];
      if(!st[L[k]] && v && v === st[L[k + 1]]) return { type:"gat", cel:L[k], waarde:3 - v, basis:[L[k - 1], L[k + 1]], lijn:li, v };
    }
  }
  if(max < 3) return null;
  for(let i = 0; i < tekens.length; i++){
    const [a, b, t] = tekens[i];
    if(alleen !== undefined && !(LIJNEN[alleen].includes(a) && LIJNEN[alleen].includes(b))) continue;
    if(!st[a] === !st[b]) continue;
    const van = st[a] ? a : b, naar = st[a] ? b : a;
    return { type:"teken", cel:naar, waarde:t === GELIJK ? st[van] : 3 - st[van], basis:[van], teken:i, t, v:st[van] };
  }
  if(max < 4) return null;
  for(const li of lijnen){
    const L = LIJNEN[li], tel = [0, 0, 0];
    for(let k = 0; k < N; k++) tel[st[L[k]]]++;
    if(!tel[0]) continue;
    for(const v of [ZON, MAAN]) if(tel[v] === 3) return { type:"tel", cel:L.find(c => !st[c]), waarde:3 - v, basis:L.filter(c => st[c] === v), lijn:li, v };
  }
  if(max < 5) return null;
  for(const li of lijnen){
    const L = LIJNEN[li], tel = [0, 0, 0];
    for(let k = 0; k < N; k++) tel[st[L[k]]]++;
    const open = tpl[li].filter(([k]) => !st[L[k]] && !st[L[k + 1]]);
    /* een =-paar direct naast hetzelfde symbool zou drie op rij geven */
    for(const [k, t] of open){
      if(t !== GELIJK) continue;
      for(const b of [k - 1, k + 2]){
        if(b < 0 || b >= N || !st[L[b]]) continue;
        return { type:"tekentel", vorm:"naast", cel:L[k], waarde:3 - st[L[b]], basis:[L[b]], paar:[L[k], L[k + 1]], lijn:li, v:st[L[b]] };
      }
    }
    /* ×-paren die elkaar niet overlappen leveren elk precies één zon en één maan */
    const kruis = [], bezet = new Set();
    for(const [k, t] of open) if(t === KRUIS && !bezet.has(k) && !bezet.has(k + 1)){ kruis.push(k); bezet.add(k); bezet.add(k + 1); }
    for(const v of [ZON, MAAN]){
      /* een =-paar van v zou de telling over de drie tillen */
      for(const [k, t] of open){
        if(t !== GELIJK) continue;
        const los = kruis.filter(x => x !== k && x !== k + 1 && x + 1 !== k).length;
        if(tel[v] + los + 2 > 3) return { type:"tekentel", vorm:"gelijk", cel:L[k], waarde:3 - v, basis:L.filter(c => st[c] === v), paar:[L[k], L[k + 1]], kruis:los, lijn:li, v, al:tel[v] };
      }
      if(kruis.length && tel[v] + kruis.length === 3){
        const vrij = L.find((c, k) => !st[c] && !bezet.has(k));
        if(vrij !== undefined) return { type:"tekentel", vorm:"kruis", cel:vrij, waarde:3 - v, basis:L.filter(c => st[c] === v), paar:kruis.flatMap(k => [L[k], L[k + 1]]), kruis:kruis.length, lijn:li, v, al:tel[v] };
      }
    }
  }
  return null;
}

/* Loopt de stand vast? Eerst de overtredingen die je ziet, daarna lijnen waar niets meer in past. */
function zichtbaar(tekens, st, alleen){
  return fouten(tekens, st).find(x => alleen === undefined || x.lijn === alleen
    || (x.soort === "teken" && x.cellen.every(c => LIJNEN[alleen].includes(c)))) || null;
}
function dood(tpl, st, alleen){
  for(let li = 0; li < 12; li++){
    if(alleen !== undefined && li !== alleen) continue;
    if(passend(li, st, tpl).length) continue;
    const L = LIJNEN[li];
    return { soort:"dood", cellen:L, lijn:li, zon:3 - L.filter(c => st[c] === ZON).length, maan:3 - L.filter(c => st[c] === MAAN).length, metTeken:tpl[li].length > 0 };
  }
  return null;
}
function tegenspraak(tekens, tpl, st){ return zichtbaar(tekens, st) || dood(tpl, st); }

/* Stel dat `cel` de waarde w krijgt: leidt dat met eenvoudige stappen tot een tegenspraak?
   Geeft { keten:[stappen], einde:tegenspraak } of null. */
function weerleg(tekens, tpl, st, cel, w, alleen, metLijn, maxKeten){
  const sim = Uint8Array.from(st), keten = [];
  sim[cel] = w;
  for(;;){
    const f = zichtbaar(tekens, sim, alleen);
    if(f) return { keten, einde:f };
    let h = null;
    if(keten.length < maxKeten){
      h = eenvoudig(tekens, tpl, sim, alleen);
      if(!h && metLijn) h = lijnStap(tekens, tpl, sim);
    }
    if(h){ sim[h.cel] = h.waarde; keten.push(h); continue; }
    const d = dood(tpl, sim, alleen);
    return d ? { keten, einde:d } : null;
  }
}

/* lijn doorrekenen: een vakje dat in elke nog passende invulling van de lijn hetzelfde is */
function lijnStap(tekens, tpl, st){
  const volg = [...Array(12).keys()].map(li => [li, LIJNEN[li].filter(c => !st[c]).length]).filter(x => x[1]).sort((a, b) => a[1] - b[1]);
  for(const [li] of volg){
    const L = LIJNEN[li], pas = passend(li, st, tpl);
    if(!pas.length) continue;
    for(let k = 0; k < N; k++){
      if(st[L[k]]) continue;
      const v = pas[0][k];
      if(pas.every(p => p[k] === v)) return { type:"lijn", cel:L[k], waarde:v, lijn:li, aantal:pas.length, basis:L.filter(c => st[c]) };
    }
  }
  return null;
}

/* De makkelijkste logische stap vanuit deze stand, of null als de motor er geen ziet.
   Resultaat: { type, cel, waarde, basis:[vakjes waar je naar moet kijken], ... }
   type "vast" betekent: de stand klopt niet meer. */
function stap(p, st, zonderGevolg){
  const tekens = p.tekens, tpl = p._tpl || (p._tpl = tekensPerLijn(tekens));
  const t = tegenspraak(tekens, tpl, st);
  if(t) return { type:"vast", einde:t, basis:t.cellen };

  let h = eenvoudig(tekens, tpl, st);
  if(h) return h;

  h = lijnStap(tekens, tpl, st);
  if(h){
    /* de uitleg: waarom loopt het andere symbool vast binnen deze lijn? */
    const w = weerleg(tekens, tpl, st, h.cel, 3 - h.waarde, h.lijn, false, 5);
    if(w){ h.keten = w.keten; h.einde = w.einde; }
    return h;
  }

  if(zonderGevolg) return null;
  /* vooruitdenken over meerdere lijnen: eerst met alleen eenvoudige stappen, dan ook met lijnstappen */
  for(const metLijn of [false, true]){
    let best = null;
    for(let c = 0; c < NN; c++){
      if(st[c]) continue;
      for(const w of [ZON, MAAN]){
        const r = weerleg(tekens, tpl, st, c, w, undefined, metLijn, best ? best.keten.length - 1 : 7);
        if(r && (!best || r.keten.length < best.keten.length)) best = { type:"gevolg", cel:c, waarde:3 - w, keten:r.keten, einde:r.einde, basis:r.keten.map(k => k.cel), metLijn };
      }
    }
    if(best) return best;
  }
  return null;
}

function techniek(h){ return !h || h.type === "vast" ? "fout" : h.type; }

/* ---- uitleg in gewone taal ---- */
const EV = ["", "zon", "maan"], MV = ["", "zonnen", "manen"];
const TELWOORD = ["nul", "één", "twee", "drie", "vier", "vijf", "zes"];
function naamCel(c){ return `rij ${((c / N) | 0) + 1}, kolom ${c % N + 1}`; }
function naamLijn(li){ return li < N ? `rij ${li + 1}` : `kolom ${li - N + 1}`; }
function naamTeken(t){ return t === GELIJK ? "=" : "×"; }

function naamEinde(e){
  if(e.soort === "drie") return `staan er drie ${MV[e.waarde]} naast elkaar in ${naamLijn(e.lijn)}`;
  if(e.soort === "tel") return `staan er ${TELWOORD[e.cellen.length]} ${MV[e.waarde]} in ${naamLijn(e.lijn)}, en dat is er één te veel`;
  if(e.soort === "teken") return `klopt de ${naamTeken(e.t)} tussen ${naamCel(e.cellen[0])} en ${naamCel(e.cellen[1])} niet meer`;
  const nog = [e.zon > 0 ? `${TELWOORD[e.zon]} ${e.zon === 1 ? "zon" : "zonnen"}` : "", e.maan > 0 ? `${TELWOORD[e.maan]} ${e.maan === 1 ? "maan" : "manen"}` : ""].filter(x => x).join(" en ");
  if(e.zon < 0 || e.maan < 0 || !nog) return `klopt ${naamLijn(e.lijn)} niet meer`;
  return `${e.zon + e.maan === 1 ? "moet" : "moeten"} er in ${naamLijn(e.lijn)} nog ${nog} bij, en dat lukt niet zonder drie op rij${e.metTeken ? " of een teken te breken" : ""}`;
}
function kortWaarom(k){
  if(k.type === "paar") return `anders staan er drie ${MV[k.v]} naast elkaar`;
  if(k.type === "gat") return `het ligt tussen twee ${MV[k.v]}`;
  if(k.type === "teken") return `door de ${naamTeken(k.t)}`;
  if(k.type === "tel") return `${naamLijn(k.lijn)} heeft al drie ${MV[k.v]}`;
  if(k.type === "tekentel") return `door het tekenpaar in ${naamLijn(k.lijn)}`;
  return `${naamLijn(k.lijn)} kan niet anders`;
}
function naamKeten(keten){
  return keten.map((k, i) => `${i ? "Daarna" : "Dan"} moet ${naamCel(k.cel)} een ${EV[k.waarde]} zijn (${kortWaarom(k)}).`).join(" ");
}

function beschrijf(h){
  const w = EV[h.waarde], L = h.lijn === undefined ? "" : naamLijn(h.lijn);
  if(h.type === "vast") return `Deze stand klopt niet meer: er ${naamEinde(h.einde)}. Er staat dus ergens een symbool verkeerd.`;
  if(h.type === "paar") return `In ${L} staan twee ${MV[h.v]} naast elkaar. Een derde ernaast mag niet, dus op het omlijnde vakje komt een ${w}.`;
  if(h.type === "gat") return `In ${L} staat aan beide kanten van het omlijnde vakje een ${EV[h.v]}. Met nog een ${EV[h.v]} ertussen zijn het er drie op rij, dus hier komt een ${w}.`;
  if(h.type === "teken") return h.t === GELIJK
    ? `Tussen het omlijnde vakje en de ${EV[h.v]} ernaast staat een =. Die twee vakjes zijn gelijk, dus hier komt ook een ${w}.`
    : `Tussen het omlijnde vakje en de ${EV[h.v]} ernaast staat een ×. Die twee vakjes zijn verschillend, dus hier komt een ${w}.`;
  if(h.type === "tel") return `In ${L} staan al drie ${MV[h.v]}. Meer mogen er niet in, dus elk leeg vakje in ${L} is een ${w}.`;
  if(h.type === "tekentel"){
    if(h.vorm === "naast") return `Het =-paar in ${L} ligt direct naast een ${EV[h.v]}. Was het paar ook ${EV[h.v]}, dan stonden er drie op rij. Beide vakjes van het paar zijn dus een ${w}.`;
    if(h.vorm === "gelijk") return `In ${L} ${h.al === 1 ? `staat al één ${EV[h.v]}` : `staan al ${TELWOORD[h.al]} ${MV[h.v]}`}${h.kruis ? ` en het ×-paar levert er nog één` : ""}. Het =-paar is twee keer hetzelfde; twee ${MV[h.v]} erbij is er één te veel. Beide vakjes van het =-paar zijn dus een ${w}.`;
    const paren = h.kruis === 1 ? "ligt een ×-paar op twee lege vakjes. Zo'n paar is altijd één zon en één maan" : `liggen ${TELWOORD[h.kruis]} ×-paren op lege vakjes. Elk paar is altijd één zon en één maan`;
    return `In ${L} ${paren}. ${h.al ? `Samen met de ${h.al === 1 ? EV[h.v] : `${TELWOORD[h.al]} ${MV[h.v]}`} die er al ${h.al === 1 ? "staat" : "staan"} zijn dat drie ${MV[h.v]}` : `Dat zijn samen al drie ${MV[h.v]}`}, dus het omlijnde vakje is een ${w}.`;
  }
  if(h.type === "lijn"){
    if(h.einde) return `Reken ${L} door. Stel dat op het omlijnde vakje een ${EV[3 - h.waarde]} komt. ${h.keten.length ? naamKeten(h.keten) + " Nu" : "Dan"} ${naamEinde(h.einde)}. Hier komt dus een ${w}.`;
    return `Reken ${L} door: er ${h.aantal === 1 ? "past nog maar één invulling" : `passen nog maar ${TELWOORD[h.aantal] || h.aantal} invullingen`} met drie zonnen, drie manen en nooit drie op rij. In ${h.aantal === 1 ? "die invulling" : "elk daarvan"} staat op het omlijnde vakje een ${w}.`;
  }
  if(h.type === "gevolg") return `Stel dat op het omlijnde vakje een ${EV[3 - h.waarde]} komt. ${h.keten.length ? naamKeten(h.keten) + " Nu" : "Dan"} ${naamEinde(h.einde)}. Het omlijnde vakje is dus een ${w}.`;
  return "";
}

/* ---- oplossen zoals een mens, om te controleren dat een puzzel zonder gokken kan ---- */
function losOp(p, zonderGevolg){
  const st = Uint8Array.from(p.giv), tel = {}, volg = [];
  let zwaarte = 0, leeg = 0, langst = 0;
  for(let i = 0; i < NN; i++) if(!st[i]) leeg++;
  while(leeg){
    const h = stap(p, st, zonderGevolg);
    if(!h || h.type === "vast") return null;
    tel[h.type] = (tel[h.type] || 0) + 1; zwaarte += TECHNIEKEN[h.type].zwaarte; volg.push(h.type);
    if(h.type === "gevolg") langst = Math.max(langst, h.keten.length);
    st[h.cel] = h.waarde; leeg--;
  }
  if(fouten(p.tekens, st).length) return null;
  return { opl:Array.from(st), tel, zwaarte, volg, langst };
}

/* ---- genereren ---- */
function maakOplossing(rnd){
  const rijen = [];
  (function zet(r){
    if(r === N) return true;
    for(const pat of schud(PATRONEN.slice(), rnd)){
      let kan = true;
      for(let c = 0; c < N && kan; c++){
        if(r >= 2 && rijen[r - 1][c] === pat[c] && rijen[r - 2][c] === pat[c]) kan = false;
        let zelfde = 1;
        for(let q = 0; q < r; q++) if(rijen[q][c] === pat[c]) zelfde++;
        if(zelfde > 3) kan = false;
      }
      if(!kan) continue;
      rijen[r] = pat;
      if(zet(r + 1)) return true;
    }
    return false;
  })(0);
  return rijen.flat();
}

/* LinkedIn-borden zijn ontworpen: de voorgevulde vakjes en de tekens vormen rijtjes, hoekjes en
   diagonalen, vaak gespiegeld of een halve slag gedraaid. Dat doen we na met een symmetrie. */
const SPIEGELS = {
  draai: c => NN - 1 - c,
  links: c => ((c / N) | 0) * N + (N - 1 - c % N),
  boven: c => (N - 1 - ((c / N) | 0)) * N + c % N,
  schuin: c => (c % N) * N + ((c / N) | 0),
  geen: c => c
};
function kiesSpiegel(rnd){
  const x = rnd();
  return x < .38 ? "draai" : x < .52 ? "links" : x < .66 ? "boven" : x < .78 ? "schuin" : "geen";
}
function maakGegevens(doel, spiegel, rnd){
  const S = SPIEGELS[spiegel], set = new Set();
  for(let poging = 0; poging < 60 && set.size < doel; poging++){
    let r = Math.floor(rnd() * N), c = Math.floor(rnd() * N);
    const schuin = rnd() < .2;
    const [dr, dc] = schuin ? [[1, 1], [1, -1]][Math.floor(rnd() * 2)] : [[0, 1], [1, 0]][Math.floor(rnd() * 2)];
    const lang = rnd() < .1 ? 6 : 1 + Math.floor(rnd() * 3);
    for(let k = 0; k < lang && set.size < doel; k++){
      if(r < 0 || c < 0 || r >= N || c >= N) break;
      set.add(r * N + c); set.add(S(r * N + c));
      r += dr; c += dc;
    }
  }
  return set;
}
function maakTekens(doel, spiegel, gegeven, opl, rnd){
  const S = SPIEGELS[spiegel], kan = [], gekozen = new Map();
  for(let c = 0; c < NN; c++){
    if(gegeven.has(c)) continue;
    if(c % N < N - 1 && !gegeven.has(c + 1)) kan.push([c, c + 1]);
    if(c + N < NN && !gegeven.has(c + N)) kan.push([c, c + N]);
  }
  if(!kan.length) return [];
  const sleutel = (a, b) => Math.min(a, b) * 64 + Math.max(a, b);
  const voegToe = (a, b) => {
    for(const [x, y] of [[a, b], [S(a), S(b)]]){
      if(gegeven.has(x) || gegeven.has(y)) return;
      gekozen.set(sleutel(x, y), [Math.min(x, y), Math.max(x, y)]);
    }
  };
  for(let poging = 0; poging < 200 && gekozen.size < doel; poging++){
    let e;
    if(gekozen.size && rnd() < .65){
      /* aansluiten op een teken dat er al ligt: zo ontstaan de groepjes die LinkedIn ook maakt */
      const basis = [...gekozen.values()][Math.floor(rnd() * gekozen.size)];
      const buren = kan.filter(([a, b]) => !gekozen.has(sleutel(a, b)) && (basis.includes(a) || basis.includes(b)
        || (b - a === basis[1] - basis[0] && Math.abs(a - basis[0]) === (b - a === 1 ? N : 1))));
      if(!buren.length) continue;
      e = buren[Math.floor(rnd() * buren.length)];
    } else e = kan[Math.floor(rnd() * kan.length)];
    /* = en × komen bij LinkedIn ongeveer even vaak voor; in een oplossing zijn ongelijke buren in de meerderheid */
    if(opl[e[0]] !== opl[e[1]] && rnd() < .4) continue;
    voegToe(e[0], e[1]);
  }
  return [...gekozen.values()].sort((x, y) => x[0] - y[0] || x[1] - y[1]).map(([a, b]) => [a, b, opl[a] === opl[b] ? GELIJK : KRUIS]);
}

/* ---- een puzzel per weekdag, opgebouwd zoals LinkedIn dat doet ----
   Het bord is altijd 6×6. Wat per dag verandert is hoeveel vakjes er voorgevuld zijn, hoeveel
   tekens er liggen en welke stappen je nodig hebt. De grenzen komen uit echte LinkedIn-puzzels
   (27 oktober t/m 11 november 2026, opgelost met deze motor) en uit de telling van HintSheet over
   37 borden: maandag en dinsdag lukken met alleen de basisstappen, vanaf donderdag moet je lijnen
   doorrekenen, en in het weekend staan er weinig symbolen en veel tekens. Bij LinkedIn raakt een
   teken aan het begin nooit een voorgevuld vakje; hier dus ook niet. */
const DAGEN = [
  { naam:"Maandag",   kort:"Ma", giv:[6, 9],  tek:[2, 4], lijn:[0, 0], zw:[6, 16],  label:"makkelijk",     klein:"licht" },
  { naam:"Dinsdag",   kort:"Di", giv:[5, 8],  tek:[3, 5], lijn:[0, 0], zw:[8, 18],  label:"makkelijk",     klein:"licht" },
  { naam:"Woensdag",  kort:"Wo", giv:[6, 10], tek:[3, 6], lijn:[0, 2], zw:[10, 22], label:"gemiddeld",     klein:"middel" },
  { naam:"Donderdag", kort:"Do", giv:[6, 8],  tek:[4, 6], lijn:[1, 4], zw:[16, 30], label:"gemiddeld",     klein:"middel" },
  { naam:"Vrijdag",   kort:"Vr", giv:[6, 10], tek:[4, 6], lijn:[3, 5], zw:[22, 34], label:"pittig",        klein:"pittig" },
  { naam:"Zaterdag",  kort:"Za", giv:[4, 7],  tek:[6, 8], lijn:[2, 4], zw:[20, 34], label:"moeilijk",      klein:"zwaar" },
  { naam:"Zondag",    kort:"Zo", giv:[4, 6],  tek:[6, 8], lijn:[3, 6], zw:[26, 46], label:"heel moeilijk", klein:"zwaar" }
];
const tussen = (x, [a, b]) => x < a ? a - x : x > b ? x - b : 0;

function genereerDag(dag, seed, pogingen){
  const rnd = rng(seed), D = DAGEN[dag];
  let best = null;
  for(let poging = 0; poging < (pogingen || 4000); poging++){
    const opl = maakOplossing(rnd), spiegel = kiesSpiegel(rnd);
    const nGiv = D.giv[0] + Math.floor(rnd() * (D.giv[1] - D.giv[0] + 1));
    const nTek = D.tek[0] + Math.floor(rnd() * (D.tek[1] - D.tek[0] + 1));
    const gegeven = maakGegevens(nGiv, spiegel, rnd);
    if(tussen(gegeven.size, D.giv)) continue;
    const tekens = maakTekens(nTek, rnd() < .7 ? spiegel : kiesSpiegel(rnd), gegeven, opl, rnd);
    if(tussen(tekens.length, D.tek)) continue;
    const giv = opl.map((v, i) => gegeven.has(i) ? v : 0);
    const p = { n:N, dag, giv, tekens, opl, seed };
    const res = losOp(p, true);
    if(!res) continue;
    const lijn = res.tel.lijn || 0;
    const mis = tussen(lijn, D.lijn) * 10 + tussen(res.zwaarte, D.zw);
    Object.assign(p, { zwaarte:res.zwaarte, tel:res.tel, raak:!mis });
    delete p._tpl;
    if(!mis) return p;
    if(!best || mis < best.mis){ best = p; best.mis = mis; }
  }
  return best;
}

const api = { DAGEN, genereerDag, maakOplossing, N, ZON, MAAN, GELIJK, KRUIS, TECHNIEKEN, LIJNEN, PATRONEN, rng, hash, schud, fouten, stap, techniek, beschrijf, losOp, naamCel, naamLijn, tekensPerLijn };
if(typeof module !== "undefined" && module.exports) module.exports = api;
else root.TangoLogica = api;
})(typeof self !== "undefined" ? self : this);
