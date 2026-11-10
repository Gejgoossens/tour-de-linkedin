/* Tour de LinkedIn: data ophalen, klassementen berekenen en renderen. Instellingen staan in config.js. */
const CFG = window.TOUR_CONFIG || {};
const STRAFSECONDEN = CFG.STRAFSECONDEN ?? 10;
const ALLEEN_VOLLEDIG = !!CFG.ALLEEN_VOLLEDIG;
const START_DATUM = CFG.START_DATUM || "";
const TRUIEN = {
  Wend:    { kleur:"blauw",  naam:"Blauwe trui" },
  Zip:     { kleur:"groen",  naam:"Groene trui" },
  Patches: { kleur:"oranje", naam:"Oranje trui" },
  Tango:   { kleur:"wit",    naam:"Witte trui" },
  Queens:  { kleur:"bol",    naam:"Bolletjestrui" }
};
const EXTRA_KLEUREN = ["paars","turkoois"];
const KLEUR = {
  geel:["#FFD300","#6B5500"], groen:["#1E8A4C","#0E3F22"], blauw:["#2563C9","#0F2E5C"],
  oranje:["#F07A1A","#6A300A"], wit:["#FFFFFF","#6B7078"], bol:["#FFFFFF","#8E1B28"],
  paars:["#6D4BC4","#2E1C5E"], turkoois:["#1A9C9C","#0B4545"]
};
const SHIRT = "M10 4 L13 3 Q16 7 19 3 L22 4 L30 10 L26 15 L23 13 L23 29 L9 29 L9 13 L6 15 L2 10 Z";

function truiSvg(kleur, size){
  if(kleur === "lantaarn"){
    return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true"><path d="M12 5 Q16 1 20 5" fill="none" stroke="#A3A9B3" stroke-width="1.6"/><rect x="10" y="6" width="12" height="3" rx="1" fill="#A3A9B3"/><rect x="11" y="9" width="10" height="15" rx="2" fill="#D7263D" stroke="#7A1420" stroke-width="1.2"/><rect x="10" y="24" width="12" height="3" rx="1" fill="#A3A9B3"/></svg>`;
  }
  const [f, s] = KLEUR[kleur] || KLEUR.wit;
  let dots = "";
  if(kleur === "bol") [[12,10],[20,10],[16,17],[12,23],[20,23]].forEach(([x,y]) => dots += `<circle cx="${x}" cy="${y}" r="2.3" fill="#D7263D"/>`);
  return `<svg viewBox="0 0 32 32" width="${size}" height="${size}" aria-hidden="true"><path d="${SHIRT}" fill="${f}" stroke="${s}" stroke-width="1.3" stroke-linejoin="round"/>${dots}</svg>`;
}

function parseCSV(text){
  return text.trim().split(/\r?\n/).map(line => {
    const out = []; let cur = "", q = false;
    for(let i = 0; i < line.length; i++){
      const c = line[i];
      if(q){ if(c === '"' && line[i+1] === '"'){ cur += '"'; i++; } else if(c === '"') q = false; else cur += c; }
      else if(c === '"') q = true;
      else if(c === "," || c === ";"){ out.push(cur); cur = ""; }
      else cur += c;
    }
    out.push(cur);
    return out.map(s => s.trim());
  });
}
function normDatum(d){
  const m = d.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  return m ? `${m[3]}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}` : d;
}
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function fmt(sec){
  sec = Math.round(sec);
  const h = Math.floor(sec/3600), m = Math.floor(sec%3600/60), s = sec%60;
  return h ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
}
function isoWeek(ds){
  const d = new Date(ds + "T12:00:00");
  const t = new Date(d); t.setDate(d.getDate() - ((d.getDay()+6)%7) + 3);
  const jan4 = new Date(t.getFullYear(), 0, 4, 12);
  const w = 1 + Math.round(((t - jan4)/86400000 - 3 + ((jan4.getDay()+6)%7)) / 7);
  return { key:`${t.getFullYear()}-${String(w).padStart(2,"0")}`, nr:w, maand:`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}` };
}
const maandKey = ds => ds.slice(0, 7); // een Tour loopt van de 1e t/m de laatste dag van de maand
const maandNaam = key => new Date(key + "-15T12:00:00").toLocaleDateString("nl-NL", { month:"long" });
const maandJaar = key => new Date(key + "-15T12:00:00").toLocaleDateString("nl-NL", { month:"long", year:"numeric" });
const datumNL = ds => new Date(ds + "T12:00:00").toLocaleDateString("nl-NL", { weekday:"long", day:"numeric", month:"long" });
const datumKort = ds => new Date(ds + "T12:00:00").toLocaleDateString("nl-NL", { day:"numeric", month:"short" });
const namen = a => a.length === 1 ? a[0] : a.slice(0,-1).join(", ") + " en " + a[a.length-1];

/* ===== data inlezen (lang formaat: Datum, Speler, Spel, Tijd, IngevoerdOp) ===== */
/* Spelers-tab uit de Sheet ([{Naam, Startnummer, Actief}]); leeg zolang we uit de CSV lezen */
let spelerLijst = [];
let bronMelding = "";

async function haalApi(){
  const url = CFG.APPS_SCRIPT_URL + (CFG.APPS_SCRIPT_URL.includes("?") ? "&" : "?") + "action=scores";
  const r = await fetch(url, { cache:"no-store" });
  if(!r.ok) throw new Error(`Apps Script gaf status ${r.status}`);
  const j = await r.json();
  if(j.ok === false) throw new Error(j.fout || "Apps Script gaf een fout");
  spelerLijst = j.spelers || [];
  return (j.scores || []).map(s => ({ datum:s.Datum, speler:s.Speler, spel:s.Spel, tijd:s.Tijd, op:s.IngevoerdOp || "" }));
}

async function haalCsv(){
  for(const url of CFG.CSV_BRONNEN || ["data/scores.csv"]){
    let r;
    try{ r = await fetch(url, { cache:"no-store" }); }catch(err){ continue; }
    if(!r.ok) continue;
    const rijen = parseCSV(await r.text());
    const kop = rijen[0].map(k => k.toLowerCase());
    const k = n => kop.indexOf(n);
    return rijen.slice(1).map(c => ({ datum:c[k("datum")], speler:c[k("speler")], spel:c[k("spel")], tijd:c[k("tijd")], op:c[k("ingevoerdop")] || "" }));
  }
  throw new Error("geen scorebestand gevonden");
}

/* eerst de Google Sheet; lukt dat niet, dan de CSV uit de repo (kan achterlopen) */
async function haalRijen(){
  bronMelding = "";
  if(CFG.APPS_SCRIPT_URL){
    try{ return await haalApi(); }
    catch(err){
      console.error(err);
      bronMelding = "De Google Sheet is nu niet bereikbaar. Je ziet een oudere kopie van de scores.";
    }
  }
  return haalCsv();
}

let spelers = [], etappes = [], alleSpellen = [], eerste = {}, laatsteStart = "", laatkomers = [];
let resultaten = [], ritTijden = [], ritVan = new Map();
/* ingevoerde tijden per "datum|speler|spel", gebruikt door het invoerscherm */
let tijdVan = new Map();

function verwerk(invoer){
  /* opschonen; bij dubbele (datum, speler, spel) wint de laatst ingevoerde */
  const uniek = new Map();
  invoer.forEach((r, i) => {
    const datum = normDatum(String(r.datum || "").trim().slice(0, 10));
    const speler = String(r.speler || "").trim(), spel = String(r.spel || "").trim();
    const leeg = r.tijd === "" || r.tijd == null;
    const tijd = Number(String(r.tijd ?? "").replace(",", "."));
    if(!/^\d{4}-\d\d-\d\d$/.test(datum) || !speler || !spel) return;
    if(START_DATUM && datum < START_DATUM) return;
    const key = `${datum}|${speler}|${spel}`;
    const vorig = uniek.get(key);
    const rij = { datum, speler, spel, tijd: leeg || !(tijd > 0) ? null : tijd, op:String(r.op || ""), i };
    if(!vorig || rij.op > vorig.op || (rij.op === vorig.op && i > vorig.i)) uniek.set(key, rij);
  });
  const lijst = [...uniek.values()].filter(r => r.tijd !== null);
  tijdVan = new Map(lijst.map(r => [`${r.datum}|${r.speler}|${r.spel}`, r.tijd]));

  /* volgorde uit config.js, nieuwe namen/spellen achteraan (spelers op volgorde van eerste dag) */
  const volgorde = (voorkeur, gezien) => [...voorkeur.filter(x => gezien.includes(x)), ...gezien.filter(x => !voorkeur.includes(x))];
  const opDatum = lijst.slice().sort((a, b) => a.datum.localeCompare(b.datum));
  spelers = volgorde(spelerLijst.length ? spelerLijst.map(s => s.Naam) : CFG.SPELERS || [], [...new Set(opDatum.map(r => r.speler))]);
  alleSpellen = volgorde(CFG.SPELLEN || [], [...new Set(lijst.map(r => r.spel))]);

  const perDag = new Map();
  lijst.forEach(r => {
    if(!perDag.has(r.datum)) perDag.set(r.datum, new Map());
    const d = perDag.get(r.datum);
    if(!d.has(r.spel)) d.set(r.spel, {});
    d.get(r.spel)[r.speler] = r.tijd;
  });
  etappes = [...perDag.keys()].sort().map(datum => {
    const d = perDag.get(datum);
    const spellen = alleSpellen.filter(s => d.has(s)).map(spel => {
      const raw = {};
      spelers.forEach(p => raw[p] = d.get(spel)[p] ?? null);
      return { spel, raw };
    });
    return { datum, spellen };
  });

  /* een speler doet mee vanaf zijn eerste gespeelde dag */
  eerste = {};
  etappes.forEach(e => e.spellen.forEach(g => spelers.forEach(p => { if(g.raw[p] !== null && !eerste[p]) eerste[p] = e.datum; })));

  /* straftijd: langzaamste tijd van die dag voor dat spel + STRAFSECONDEN (ook bij vakantie) */
  etappes.forEach(e => {
    const mee = spelers.filter(p => eerste[p] <= e.datum);
    if(ALLEEN_VOLLEDIG) e.spellen = e.spellen.filter(g => mee.every(p => g.raw[p] !== null));
    e.spellen.forEach(g => {
      const slechtst = Math.max(...spelers.map(p => g.raw[p]).filter(v => v !== null));
      g.eff = {};
      spelers.forEach(p => g.eff[p] = g.raw[p] !== null ? g.raw[p] : slechtst + STRAFSECONDEN);
    });
  });
  etappes = etappes.filter(e => e.spellen.length);
  const perMaand = {};
  etappes.forEach((e, i) => {
    e.nr = i + 1;
    const mk = maandKey(e.datum);
    e.tourNr = perMaand[mk] = (perMaand[mk] || 0) + 1;
    e.totaal = {};
    spelers.forEach(p => e.totaal[p] = e.spellen.reduce((a, g) => a + g.eff[p], 0));
  });

  laatsteStart = Object.values(eerste).sort().slice(-1)[0];
  laatkomers = spelers.filter(p => eerste[p] === laatsteStart);

  resultaten = [];
  etappes.forEach(e => e.spellen.forEach(g => spelers.forEach(p => {
    if(g.raw[p] !== null) resultaten.push({ p, spel:g.spel, t:g.raw[p], datum:e.datum, nr:e.nr });
  })));
  ritTijden = [];
  etappes.forEach(e => spelers.forEach(p => {
    if(e.spellen.every(g => g.raw[p] !== null)) ritTijden.push({ p, t:e.spellen.reduce((a, g) => a + g.raw[p], 0), datum:e.datum, nr:e.nr });
  }));
  ritVan = new Map(ritTijden.map(r => [r.p + "|" + r.nr, r.t]));
  if(window.Stat) Stat.bereken({ etappes, spelers, spellen:alleSpellen, eerste, straf:STRAFSECONDEN,
    kleurVan:p => kleurVan(p), trui:(sp, size) => truiSvg(truiVoor(sp).kleur, size), bib:p => spelers.indexOf(p) + 1 });
}

function truiVoor(spel){
  if(TRUIEN[spel]) return TRUIEN[spel];
  const i = alleSpellen.filter(s => !TRUIEN[s]).indexOf(spel);
  return { kleur:EXTRA_KLEUREN[i % EXTRA_KLEUREN.length], naam:`Trui van ${spel}` };
}
function som(lijst, spel){
  const t = {}; spelers.forEach(p => t[p] = 0);
  lijst.forEach(e => e.spellen.forEach(g => { if(!spel || g.spel === spel) spelers.forEach(p => t[p] += g.eff[p]); }));
  return t;
}
const deelnemers = lijst => lijst.length ? spelers.filter(p => eerste[p] && eerste[p] <= lijst[0].datum) : spelers.slice();
const buiten = lijst => spelers.filter(p => !deelnemers(lijst).includes(p));
function rangschik(t, wie = spelers){
  const a = wie.map(p => ({ p, t:t[p] })).sort((x,y) => x.t - y.t || spelers.indexOf(x.p) - spelers.indexOf(y.p));
  let pos = 0;
  a.forEach((r, i) => { if(i === 0 || r.t !== a[i-1].t) pos = i + 1; r.pos = pos; });
  return a;
}
function ritzeges(lijst){
  const z = {}; spelers.forEach(p => z[p] = 0);
  lijst.forEach(e => rangschik(e.totaal, deelnemers([e])).filter(r => r.pos === 1).forEach(r => z[r.p]++));
  return z;
}
function spelzeges(lijst, spel){
  const z = {}; spelers.forEach(p => z[p] = 0);
  lijst.forEach(e => e.spellen.filter(g => g.spel === spel).forEach(g => {
    const v = spelers.map(p => g.raw[p]).filter(v => v !== null);
    const best = Math.min(...v);
    spelers.forEach(p => { if(g.raw[p] === best) z[p]++; });
  }));
  return z;
}
function categorie(gem){
  if(gem >= 60) return "HC";
  if(gem >= 40) return "1e cat.";
  if(gem >= 25) return "2e cat.";
  if(gem >= 15) return "3e cat.";
  return "4e cat.";
}
function gemiddelde(g){
  const v = spelers.map(p => g.raw[p]).filter(v => v !== null);
  return v.reduce((a,b) => a+b, 0) / v.length;
}

function profielSvg(e){
  const W = Math.max(320, Math.round(document.getElementById("hero").clientWidth || 700));
  const H = 172, basis = 118, top = 34, n = e.spellen.length;
  const gem = e.spellen.map(gemiddelde);
  const max = Math.max(...gem);
  const stap = W / n;
  const hoogte = gem.map(v => 14 + (basis - top - 14) * (v / max));
  const pts = [[0, basis - 6]];
  e.spellen.forEach((g, i) => {
    const x = stap * (i + .5);
    pts.push([x - stap*.32, basis - hoogte[i]*.25 - 4], [x - stap*.1, basis - hoogte[i]*.8], [x, basis - hoogte[i]], [x + stap*.14, basis - hoogte[i]*.72]);
  });
  pts.push([W, basis - 8]);
  const lijn = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const z = gem.indexOf(max), zx = stap * (z + .5), zy = basis - hoogte[z];
  const labels = e.spellen.map((g, i) => {
    const x = stap * (i + .5);
    return `<text x="${x}" y="${basis + 27}" text-anchor="middle" fill="#FFFFFF" font-size="${W < 520 ? 16 : 19}">${esc(g.spel)}</text><text x="${x}" y="${basis + 46}" text-anchor="middle" fill="#FFD300" font-size="${W < 520 ? 13 : 15}">${categorie(gem[i])}${W < 520 ? "" : ", " + fmt(gem[i])}</text>`;
  }).join("");
  return `<svg class="profiel" viewBox="0 0 ${W} ${H}" role="img" aria-label="Rittenprofiel van de etappe, ${esc(e.spellen[z].spel)} was het zwaarste spel">
    <path d="${lijn} L ${W} ${H} L 0 ${H} Z" fill="#23262B" opacity=".1"/>
    <rect x="0" y="${basis}" width="${W}" height="${H-basis}" fill="#23262B"/>
    <path class="lijn" d="${lijn}"/>
    <line x1="${zx}" y1="${zy}" x2="${zx}" y2="${zy-24}" stroke="#23262B" stroke-width="2"/>
    <rect x="${zx}" y="${zy-24}" width="17" height="11" fill="#D7263D"/>
    ${labels}</svg>`;
}

/* ===== statistieken ===== */
const DAGEN = ["Ma","Di","Wo","Do","Vr","Za","Zo"];
const DAGEN_LANG = ["maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag","zondag"];
const weekdag = ds => (new Date(ds + "T12:00:00").getDay() + 6) % 7;
/* gevalideerd categorisch palet (vaste volgorde); in grafieken staan namen erbij, dus kleur is nooit het enige kenmerk */
const SPELER_KLEUR = ["#3987e5","#d95926","#199e70","#c98500","#d55181","#9085e9","#e66767","#4fa83d"];
const kleurVan = p => SPELER_KLEUR[spelers.indexOf(p) % SPELER_KLEUR.length];
const gem = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
const spreiding = a => { const m = gem(a); return a.length > 1 ? Math.sqrt(gem(a.map(v => (v - m) ** 2))) : 0; };
const verschil = (v, ref) => `${Math.round(Math.abs(v / ref - 1) * 100)}% ${v < ref ? "sneller" : "trager"}`;
const bibG = p => `<span class="bib">${spelers.indexOf(p) + 1}</span>`;

let statSpeler = "";
const SUB_KEY = "tdl-stat-sub";
let statSub = (() => { try{ return localStorage.getItem(SUB_KEY) === "peloton" ? "peloton" : "ik"; }catch(err){ return "ik"; } })();
/* Statistieken: "Ik" (persoonlijk, statistiek.js) of "Peloton" (vorm, puzzelkalender en de groepsstatistieken) */
function renderStatView(){
  document.querySelectorAll("#statSub [data-sub]").forEach(b => {
    b.setAttribute("aria-pressed", b.dataset.sub === statSub);
    b.onclick = () => { statSub = b.dataset.sub; try{ localStorage.setItem(SUB_KEY, statSub); }catch(err){} renderStatView(); b.focus(); };
  });
  document.getElementById("statIk").hidden = statSub !== "ik";
  document.getElementById("statPeloton").hidden = statSub !== "peloton";
  if(statSub === "ik"){ if(window.Stat) Stat.renderIk(document.getElementById("statIk")); }
  else { if(window.Stat) Stat.renderPeloton(document.getElementById("p-vorm"), document.getElementById("p-kal")); renderStats(); }
}

function verloopSvg(f){
  const box = document.getElementById("s-verloop");
  const W = Math.max(300, Math.round(box.clientWidth - 38)), H = 240, L = 42, R = 8, T = 10, B = 30;
  if(!ritTijden.length) return `<div class="leeg">Nog geen volledige etappes.</div>`;
  const n = etappes.length;
  const xs = etappes.map((e, i) => L + (W - L - R) * (n === 1 ? .5 : i / (n - 1)));
  const vals = ritTijden.map(r => r.t);
  const stapOpties = [30, 60, 120, 300, 600];
  let y0 = Math.min(...vals), y1 = Math.max(...vals);
  const stap = stapOpties.find(s => (y1 - y0) / s <= 5) || 900;
  y0 = Math.floor(y0 / stap) * stap; y1 = Math.ceil(y1 / stap) * stap; if(y1 === y0) y1 += stap;
  const y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
  let grid = "";
  for(let v = y0; v <= y1; v += stap) grid += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#2E333B"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#A3A9B3">${fmt(v)}</text>`;
  const elk = Math.max(1, Math.ceil(n / Math.floor((W - L) / 34)));
  const xl = etappes.map((e, i) => i % elk === 0 || i === n - 1 ? `<text x="${xs[i]}" y="${H - 10}" text-anchor="middle" font-size="12" fill="#A3A9B3">${e.nr}</text>` : "").join("");
  const volgorde = spelers.filter(p => p !== f).concat(f ? [f] : []);
  const lijnen = volgorde.map(p => {
    let d = "", vorig = false, punten = "";
    etappes.forEach((e, i) => {
      const t = ritVan.get(p + "|" + e.nr);
      if(t === undefined){ vorig = false; return; }
      d += (vorig ? "L" : "M") + xs[i].toFixed(1) + " " + y(t).toFixed(1) + " ";
      punten += `<circle cx="${xs[i].toFixed(1)}" cy="${y(t).toFixed(1)}" r="${p === f ? 3.5 : 2.5}" fill="${kleurVan(p)}"/>`;
      vorig = true;
    });
    const op = f && p !== f ? .15 : 1;
    return `<g opacity="${op}"><path class="teken" pathLength="1" d="${d}" fill="none" stroke="${kleurVan(p)}" stroke-width="${p === f ? 3 : 2}" stroke-linejoin="round"/>${punten}</g>`;
  }).join("");
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Etappetijd per speler per etappe">${grid}${xl}${lijnen}
    <text x="${W - R}" y="${H - 10}" text-anchor="end" font-size="12" fill="#A3A9B3"> </text></svg>`;
}

function renderStats(){
  const f = statSpeler;
  const filter = document.getElementById("statFilter");
  filter.innerHTML = ["", ...spelers].map(p => `<button data-sp="${esc(p)}" aria-pressed="${p === f}">${p ? esc(p) : "Iedereen"}</button>`).join("");
  filter.querySelectorAll("button").forEach(b => b.onclick = () => {
    statSpeler = b.dataset.sp; renderStats();
    document.querySelector(`#statFilter [data-sp="${CSS.escape(statSpeler)}"]`).focus();
  });

  /* snelste tijden */
  document.getElementById("s-records").innerHTML = `
    <h2>${f ? "Snelste tijden van " + esc(f) : "Snelste tijden"}</h2>
    <p class="toel">Top 5 per spel. Alleen echt gespeelde tijden, geen straftijden.</p>
    <div class="recs">${alleSpellen.map(sp => {
      const alle = resultaten.filter(r => r.spel === sp).sort((a, b) => a.t - b.t || a.datum.localeCompare(b.datum));
      const lijst = alle.filter(r => !f || r.p === f).slice(0, 5);
      const rec = alle[0];
      const extra = f && lijst.length && rec ? `<p class="d rec-noot">${lijst[0].t === rec.t ? "Houdt het groepsrecord" : `Groepsrecord: ${esc(rec.p)}, ${fmt(rec.t)}`}</p>` : "";
      return `<div class="rec"><h3>${truiSvg(truiVoor(sp).kleur, 20)} ${esc(sp)}</h3>
        ${lijst.length ? `<ol>${lijst.map((r, i) => `<li><span class="d">${i && r.t === lijst[i - 1].t ? "" : i + 1}</span><span>${f ? "" : esc(r.p) + " "}<span class="d">${datumKort(r.datum)}</span></span><b>${fmt(r.t)}</b></li>`).join("")}</ol>` : `<div class="leeg">Nog geen tijden.</div>`}
        ${extra}</div>`;
    }).join("")}</div>`;

  /* weekdagen */
  const nDag = DAGEN.map((_, d) => etappes.filter(e => weekdag(e.datum) === d).length);
  const rijen = alleSpellen.map(sp => ({ label:sp, w:DAGEN.map((_, d) => gem(resultaten.filter(r => r.spel === sp && weekdag(r.datum) === d && (!f || r.p === f)).map(r => r.t))) }));
  const ritRij = { label:"Etappe", som:true, w:DAGEN.map((_, d) => gem(ritTijden.filter(r => weekdag(r.datum) === d && (!f || r.p === f)).map(r => r.t))) };
  const cel = (v, rij) => {
    if(v === null) return `<td class="d">–</td>`;
    const vs = rij.w.filter(x => x !== null), mn = Math.min(...vs), mx = Math.max(...vs);
    const t = mx > mn ? (v - mn) / (mx - mn) : 0;
    const pct = Math.round((1 - t) * 85 + 5);
    return `<td class="${v === mn && vs.length > 1 ? "best" : ""}" style="background:color-mix(in srgb, #FFD300 ${pct}%, #1E2127);color:${pct > 45 ? "#14161A" : "#F2F3F5"}">${fmt(v)}</td>`;
  };
  const geldig = ritRij.w.map((v, i) => ({ v, i })).filter(x => x.v !== null).sort((a, b) => a.v - b.v);
  let conclusie = "";
  if(geldig.length > 1){
    const s = geldig[0], l = geldig[geldig.length - 1];
    conclusie = `${f ? esc(f) + " is" : "Jullie zijn"} het snelst op ${DAGEN_LANG[s.i]}, gemiddeld ${fmt(s.v)} per etappe, en het traagst op ${DAGEN_LANG[l.i]} met ${fmt(l.v)}.`;
    if(Math.min(...nDag.filter(x => x > 0)) < 4) conclusie += " Met nog maar een paar dagen per weekdag is dit vooral een eerste indruk.";
  }
  document.getElementById("s-weekdag").innerHTML = `
    <h2>Gemiddelde per weekdag</h2>
    <p class="toel">Hoe geler, hoe sneller binnen die rij. Omkaderd is de snelste dag. Onder de dag staat hoe vaak die dag gespeeld is.</p>
    <div class="scroll"><table class="tbl"><thead><tr><th></th>${DAGEN.map((d, i) => `<th>${d}<small>${nDag[i]}×</small></th>`).join("")}</tr></thead>
    <tbody>${[...rijen, ritRij].map(r => `<tr${r.som ? ' class="som"' : ""}><td>${esc(r.label)}</td>${r.w.map(v => cel(v, r)).join("")}</tr>`).join("")}</tbody></table></div>
    ${conclusie ? `<p class="conclusie">${conclusie}</p>` : ""}`;

  /* spelersprofielen */
  const groepGem = {}; alleSpellen.forEach(sp => groepGem[sp] = gem(resultaten.filter(r => r.spel === sp).map(r => r.t)));
  const rz = ritzeges(etappes);
  const sz = {}; alleSpellen.forEach(sp => sz[sp] = spelzeges(etappes, sp));
  const profiel = p => {
    const rt = ritTijden.filter(r => r.p === p);
    const eigen = alleSpellen.map(sp => { const v = gem(resultaten.filter(r => r.spel === sp && r.p === p).map(r => r.t)); return { sp, v, ratio: v === null ? null : v / groepGem[sp] }; }).filter(x => x.v !== null);
    const sorted = eigen.slice().sort((a, b) => a.ratio - b.ratio);
    const gewonnen = alleSpellen.reduce((a, sp) => a + sz[sp][p], 0);
    const beste = rt.slice().sort((a, b) => a.t - b.t)[0];
    let vorm = "";
    if(rt.length >= 5){
      const g3 = gem(rt.slice(-3).map(r => r.t)), ga = gem(rt.map(r => r.t));
      vorm = Math.abs(g3 / ga - 1) < .03 ? "Vorm: stabiel, de laatste 3 ritten zitten rond het eigen gemiddelde." : `Vorm: laatste 3 ritten ${verschil(g3, ga)} dan normaal.`;
    }
    const sterk = sorted[0], zwak = sorted[sorted.length - 1];
    return `<div class="prof"><div class="kop2">${bibG(p)} ${esc(p)}</div>
      <div class="mini">
        <div><b>${rt.length ? fmt(gem(rt.map(r => r.t))) : "–"}</b><span>Gemiddelde etappe</span></div>
        <div><b>${beste ? fmt(beste.t) : "–"}</b><span>Beste etappe${beste ? ", " + datumKort(beste.datum) : ""}</span></div>
        <div><b>${rz[p]}</b><span>Ritzeges</span></div>
        <div><b>${gewonnen}</b><span>Keer snelst in een spel</span></div>
      </div>
      ${sterk ? `<p>Sterkste spel: <b>${esc(sterk.sp)}</b>, ${sterk.ratio > 1 ? "al is dat nog " : ""}${verschil(sterk.v, groepGem[sterk.sp])} dan gemiddeld.</p>` : ""}
      ${zwak && zwak !== sterk ? `<p>Minst sterke spel: <b>${esc(zwak.sp)}</b>, ${zwak.ratio < 1 ? "maar ook daar " : ""}${verschil(zwak.v, groepGem[zwak.sp])} dan gemiddeld.</p>` : ""}
      ${rt.length > 1 ? `<p>Wisselvalligheid: gemiddeld ${fmt(spreiding(rt.map(r => r.t)))} afwijking per etappe.</p>` : ""}
      ${vorm ? `<p>${vorm}</p>` : ""}
    </div>`;
  };
  const perSpel = f ? `<div class="scroll"><table class="tbl vrij"><thead><tr><th>Spel</th><th>${esc(f)}</th><th>Groep</th><th>Verschil</th><th>Keer snelst</th></tr></thead><tbody>${alleSpellen.map(sp => {
      const v = gem(resultaten.filter(r => r.spel === sp && r.p === f).map(r => r.t));
      return `<tr><td>${esc(sp)}</td><td>${v === null ? "–" : fmt(v)}</td><td>${fmt(groepGem[sp])}</td><td>${v === null ? "–" : verschil(v, groepGem[sp])}</td><td>${sz[sp][f]}</td></tr>`;
    }).join("")}</tbody></table></div>` : "";
  document.getElementById("s-spelers").innerHTML = `
    <h2>${f ? "Profiel van " + esc(f) : "Spelersprofielen"}</h2>
    <p class="toel">"Gemiddeld" is het gemiddelde van de hele groep in dat spel.</p>
    <div class="profielen">${(f ? [f] : spelers).map(profiel).join("")}</div>${perSpel}`;

  /* onderling */
  const tegen = (a, b) => etappes.reduce((w, e) => {
    const ta = ritVan.get(a + "|" + e.nr), tb = ritVan.get(b + "|" + e.nr);
    return w + (ta !== undefined && tb !== undefined && ta < tb ? 1 : 0);
  }, 0);
  document.getElementById("s-onderling").innerHTML = `
    <h2>Onderling</h2>
    <p class="toel">Lees per rij: hoe vaak die speler sneller was dan de speler in de kolom, op etappes die ze allebei volledig speelden.</p>
    <div class="scroll"><table class="tbl matrix"><thead><tr><th></th>${spelers.map(p => `<th>${esc(p)}</th>`).join("")}</tr></thead><tbody>
    ${spelers.map(a => `<tr${f === a ? ' class="gekozen"' : ""}><td>${esc(a)}</td>${spelers.map(b => {
      if(a === b) return `<td class="d">–</td>`;
      const w = tegen(a, b), l = tegen(b, a);
      return `<td class="${w > l ? "voor" : ""}">${w}–${l}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table></div>`;

  /* verloop */
  const box = document.getElementById("s-verloop");
  box.innerHTML = `<h2>Verloop</h2><p class="toel">Etappetijd per speler. Een onderbroken lijn betekent dat die dag niet volledig gespeeld is.</p><div id="grafiek"></div>
    <div class="legenda">${spelers.map(p => `<span style="opacity:${f && p !== f ? .4 : 1}"><i style="background:${kleurVan(p)}"></i>${esc(p)}</span>`).join("")}</div>`;
  document.getElementById("grafiek").innerHTML = verloopSvg(f);

  /* opvallend */
  const feiten = [];
  const snelsteRit = ritTijden.slice().sort((a, b) => a.t - b.t)[0];
  if(snelsteRit) feiten.push(`Snelste etappe ooit: <b>${esc(snelsteRit.p)}</b> in ${fmt(snelsteRit.t)}, op ${datumNL(snelsteRit.datum)}.`);
  const traagst = resultaten.slice().sort((a, b) => b.t - a.t)[0];
  if(traagst) feiten.push(`Langste worsteling: <b>${esc(traagst.p)}</b> deed ${fmt(traagst.t)} over ${esc(traagst.spel)}, op ${datumNL(traagst.datum)}.`);
  etappes.forEach(e => e.spellen.forEach(g => {
    const v = spelers.map(p => g.raw[p]).filter(x => x !== null);
    if(v.length === spelers.length && v.every(x => x === v[0])) feiten.push(`Fotofinish: op ${datumNL(e.datum)} deed iedereen ${esc(g.spel)} in precies ${fmt(v[0])}.`);
  }));
  const perRit = etappes.map(e => ({ e, g:gem(ritTijden.filter(r => r.nr === e.nr).map(r => r.t)) })).filter(x => x.g !== null).sort((a, b) => a.g - b.g);
  if(perRit.length > 1){
    const m = perRit[0], z = perRit[perRit.length - 1];
    feiten.push(`Makkelijkste etappe: nummer ${m.e.nr} op ${datumNL(m.e.datum)}, gemiddeld ${fmt(m.g)}.`);
    feiten.push(`Zwaarste etappe: nummer ${z.e.nr} op ${datumNL(z.e.datum)}, gemiddeld ${fmt(z.g)}.`);
  }
  const gaten = etappes.map(e => {
    const v = ritTijden.filter(r => r.nr === e.nr).sort((a, b) => a.t - b.t);
    return v.length > 1 ? { e, w:v[0], l:v[v.length - 1], d:v[v.length - 1].t - v[0].t } : null;
  }).filter(Boolean).sort((a, b) => b.d - a.d);
  if(gaten[0]) feiten.push(`Grootste gat in één etappe: ${fmt(gaten[0].d)} tussen ${esc(gaten[0].w.p)} en ${esc(gaten[0].l.p)} in etappe ${gaten[0].e.nr}.`);
  const zwaarsteSpel = alleSpellen.slice().sort((a, b) => groepGem[b] - groepGem[a])[0];
  if(zwaarsteSpel) feiten.push(`Het zwaarste spel is ${esc(zwaarsteSpel)}, met gemiddeld ${fmt(groepGem[zwaarsteSpel])} per poging.`);
  document.getElementById("s-opvallend").innerHTML = `<h2>Opvallend</h2>${feiten.map(t => `<div class="feit">${t}</div>`).join("")}`;
}

/* ===== Tour-verloop: achterstand op de gele trui per etappe ===== */
const isoDatum = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/* alle dagen van een Tour: de 1e t/m de laatste dag van de maand */
function tourDagen(mk){
  const [j, m] = mk.split("-").map(Number);
  const d = new Date(j, m - 1, 1, 12), dagen = [];
  while(d.getMonth() === m - 1){ dagen.push(isoDatum(d)); d.setDate(d.getDate() + 1); }
  return dagen;
}

/* stand na elke etappe: cumulatieve tijd, achterstand op de leider en positie */
function tourStanden(lijst, wie){
  const cum = {}; wie.forEach(p => cum[p] = 0);
  return lijst.map(e => {
    wie.forEach(p => cum[p] += e.totaal[p]);
    const rang = rangschik({ ...cum }, wie);
    const gap = {}; rang.forEach(r => gap[r.p] = r.t - rang[0].t);
    return { e, rang, gap };
  });
}

let tourHover = null;
function tourGrafiek(mk, lijst, wie){
  const box = document.getElementById("tourGrafiek");
  const laatste = lijst[lijst.length - 1].datum;
  const dagen = tourDagen(mk).filter(ds => ds <= laatste); // alleen tot en met de getoonde etappe
  const standen = tourStanden(lijst, wie);
  const smal = box.clientWidth < 520;
  const W = Math.max(300, Math.round(box.clientWidth)), H = smal ? 230 : 260;
  const L = 46, R = smal ? 104 : 116, T = 12, B = 28;
  const achter = v => v ? `+${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}` : "0:00"; // in minuten, ook boven het uur
  const xVan = ds => L + (W - L - R) * (dagen.length === 1 ? .5 : dagen.indexOf(ds) / (dagen.length - 1));
  const maxGap = Math.max(1, ...standen.flatMap(s => wie.map(p => s.gap[p])));
  const stap = [10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600].find(s => maxGap / s <= 4) || 7200;
  const yMax = Math.ceil(maxGap / stap) * stap;
  const y = v => T + (H - T - B) * (v / yMax);

  let grid = "";
  for(let v = 0; v <= yMax; v += stap) grid += `<line x1="${L}" x2="${W - R + 4}" y1="${y(v)}" y2="${y(v)}" stroke="#2E333B"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="#A3A9B3">${achter(v)}</text>`;
  /* weken: dun lijntje en datum bij elke maandag */
  /* x-as: elke dag zolang het past, anders alleen de maandagen */
  const perDag = (W - L - R) / Math.max(1, dagen.length - 1) >= 26;
  const xl = dagen.map((ds, i) => perDag || weekdag(ds) === 0
    ? `${weekdag(ds) === 0 && i ? `<line x1="${xVan(ds)}" x2="${xVan(ds)}" y1="${T}" y2="${H - B}" stroke="#262A31"/>` : ""}<text x="${xVan(ds)}" y="${H - 8}" text-anchor="middle" font-size="12" fill="#A3A9B3">${i === 0 || (!smal && weekdag(ds) === 0) ? datumKort(ds) : Number(ds.slice(8))}</text>` : "").join("");
  const toekomst = "";

  const lijnen = wie.slice().reverse().map(p => {
    const pts = standen.map(s => [xVan(s.e.datum), y(s.gap[p])]);
    const d = pts.map((q, i) => (i ? "L" : "M") + q[0].toFixed(1) + " " + q[1].toFixed(1)).join(" ");
    const eind = pts[pts.length - 1];
    return `<g data-p="${esc(p)}"><path class="teken" pathLength="1" d="${d}" fill="none" stroke="${kleurVan(p)}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      <circle class="eindpunt" cx="${eind[0].toFixed(1)}" cy="${eind[1].toFixed(1)}" r="4" fill="${kleurVan(p)}" stroke="#1E2127" stroke-width="2"/></g>`;
  }).join("");

  /* eindlabels: naam + achterstand, uit elkaar geschoven zodat ze niet overlappen */
  const nu = standen[standen.length - 1];
  const labels = nu.rang.map(r => ({ p:r.p, gap:nu.gap[r.p], y0:y(nu.gap[r.p]) }));
  labels.forEach((l, i) => l.y = i ? Math.max(l.y0, labels[i - 1].y + 15) : l.y0);
  const over = labels.length ? labels[labels.length - 1].y - (H - B + 4) : 0;
  if(over > 0) labels.forEach(l => l.y = Math.max(T, l.y - over));
  for(let i = labels.length - 2; i >= 0; i--) labels[i].y = Math.min(labels[i].y, labels[i + 1].y - 15);
  const lx = xVan(laatste) + 10;
  const eindLabels = labels.map(l => `<g class="eindpunt"><line x1="${lx}" x2="${lx + 10}" y1="${l.y}" y2="${l.y}" stroke="${kleurVan(l.p)}" stroke-width="3" stroke-linecap="round"/>
    <text x="${lx + 15}" y="${l.y + 4}" font-size="${smal ? 12 : 13}" fill="#F2F3F5"><tspan font-weight="600">${esc(l.p)}</tspan><tspan fill="#A3A9B3"> ${l.gap ? achter(l.gap) : "geel"}</tspan></text></g>`).join("");

  box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Achterstand op de gele trui na elke etappe van de Tour van ${maandNaam(mk)}">
    ${toekomst}${grid}${xl}${lijnen}${eindLabels}
    <line class="tv-kruis" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#F2F3F5" stroke-width="1" visibility="hidden"/></svg>
    <div class="tv-tip" hidden></div>`;

  /* hover en toetsenbord: kruisdraad springt naar de dichtstbijzijnde etappe */
  const svg = box.querySelector("svg"), kruis = box.querySelector(".tv-kruis"), tip = box.querySelector(".tv-tip");
  const xs = standen.map(s => xVan(s.e.datum));
  const toon = i => {
    if(i == null){ kruis.setAttribute("visibility", "hidden"); tip.hidden = true; tourHover = null; return; }
    tourHover = i;
    const s = standen[i], x = xs[i];
    kruis.setAttribute("x1", x); kruis.setAttribute("x2", x); kruis.setAttribute("visibility", "visible");
    tip.innerHTML = `<div class="tv-tip-kop">Etappe ${s.e.tourNr}, ${datumKort(s.e.datum)}</div>` + s.rang.map(r =>
      `<div class="tv-tip-rij"><span class="d">${r.pos}</span><i style="background:${kleurVan(r.p)}"></i><span>${esc(r.p)}</span><b>${s.gap[r.p] ? achter(s.gap[r.p]) : fmt(r.t)}</b></div>`).join("");
    tip.hidden = false;
    const schaal = box.clientWidth / W, links = x * schaal;
    tip.style.left = (links + tip.offsetWidth + 16 > box.clientWidth ? links - tip.offsetWidth - 10 : links + 10) + "px";
  };
  svg.addEventListener("pointermove", ev => {
    const r = svg.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
    let best = 0; xs.forEach((v, i) => { if(Math.abs(v - x) < Math.abs(xs[best] - x)) best = i; });
    toon(best);
  });
  svg.addEventListener("pointerleave", () => toon(null));
  box.onkeydown = ev => {
    if(ev.key !== "ArrowLeft" && ev.key !== "ArrowRight" && ev.key !== "Escape") return;
    ev.preventDefault();
    if(ev.key === "Escape") return toon(null);
    const i = tourHover == null ? standen.length - 1 : tourHover + (ev.key === "ArrowRight" ? 1 : -1);
    toon(Math.max(0, Math.min(standen.length - 1, i)));
  };
  box.onblur = () => toon(null);
  return { dagen, standen };
}

/* ===== omroep: bewegend peloton en live-balk ===== */
function omroep(e, mk, tour, tourRang, wieTour, ritRang, winnaars){
  const leider = tourRang[0], laatste = tourRang.length > 1 ? tourRang[tourRang.length - 1] : null;
  const queens = alleSpellen.includes("Queens") ? rangschik(som(tour, "Queens"), wieTour)[0].p : null;
  if(window.Peloton) Peloton.zet([
    ...tourRang.map(r => ({ naam:r.p, bib:spelers.indexOf(r.p) + 1, kleur:kleurVan(r.p), gap:r.t - leider.t,
      geel:r.p === leider.p, bol:r.p === queens && r.p !== leider.p, lantaarn:laatste && r.p === laatste.p })),
    ...spelers.filter(p => !wieTour.includes(p)).map(p => ({ naam:p, bib:spelers.indexOf(p) + 1, kleur:kleurVan(p), gap:0, buiten:true }))
  ]);

  const isLaatste = sel === etappes.length - 1;
  const live = document.getElementById("liveLabel");
  live.classList.toggle("herhaling", !isLaatste);
  live.querySelector("span").textContent = isLaatste ? "Live" : "Herhaling";
  const items = [
    `Tour van ${maandNaam(mk)} · na ${tour.length} ${tour.length === 1 ? "etappe" : "etappes"}`,
    ...tourRang.map((r, i) => i === 0 ? `<b>${r.pos} ${esc(r.p)}</b> geel` : `${r.pos} ${esc(r.p)} +${fmt(r.t - leider.t)}${laatste && r.p === laatste.p ? " · rode lantaarn" : ""}`),
    `<span class="sep">◆</span> Etappe ${e.tourNr}: <b>${esc(namen(winnaars))}</b> ${winnaars.length > 1 ? "winnen" : "wint"} in ${fmt(ritRang[0].t)}`,
    ...e.spellen.map(g => {
      const best = Math.min(...spelers.map(p => g.raw[p]).filter(v => v !== null));
      return `${esc(g.spel)}: ${esc(namen(spelers.filter(p => g.raw[p] === best)))} ${fmt(best)}`;
    })
  ];
  const nogNiet = deelnemers([e]).filter(p => e.spellen.every(g => g.raw[p] === null));
  if(isLaatste && nogNiet.length) items.push(`<span class="sep">◆</span> Nog geen tijden van ${esc(namen(nogNiet))}`);
  const loop = document.getElementById("tickerLoop");
  const html = items.map(t => `<span>${t}</span>`).join("");
  if(loop.dataset.html !== html){
    loop.dataset.html = html;
    loop.innerHTML = html + html; // twee keer, zodat de lus naadloos doorloopt
    loop.style.setProperty("--duur", Math.max(20, loop.scrollWidth / 2 / 70) + "s");
  }
  document.getElementById("ticker").setAttribute("aria-label", `Tour van ${maandNaam(mk)}: ${tourRang.map(r => `${r.pos} ${r.p}`).join(", ")}`);
}

/* ===== huldiging: per spel de binnenkomst, dan de rode lantaarn en het podium van de dag ===== */
const GRAPPEN = [
  "De bezemwagen stond al met draaiende motor te wachten.",
  "Onderweg nog even een terrasje gepakt?",
  "De verzorgers waren al naar huis, de lichten gingen bijna uit.",
  "De finishfoto moest uit het archief komen.",
  "Zelfs de bezemwagen keek op zijn horloge.",
  "Er was al een zoekactie gestart. Gelukkig met goede afloop.",
  "Het publiek was naar huis, op één trouwe fan na.",
  "De jury twijfelde even of dit nog dezelfde etappe was.",
  "Morgen gewoon iets eerder vertrekken."
];
/* rode lantaarn van de dag: de laatste(n), alleen als die niet ook op het podium staan */
function rodeLantaarn(ritRang){
  if(ritRang.length < 4) return null;
  const laatst = ritRang[ritRang.length - 1].pos;
  return laatst > 3 ? ritRang.filter(r => r.pos === laatst) : null;
}
function huldigingData(i){
  const e = etappes[i], mk = maandKey(e.datum), wie = deelnemers([e]);
  const ritRang = rangschik(e.totaal, wie);
  const rij = p => ({ p, bib:spelers.indexOf(p) + 1, kleur:kleurVan(p) });
  const tour = etappes.slice(0, i + 1).filter(x => maandKey(x.datum) === mk), wieTour = deelnemers(tour);
  const geel = rangschik(som(tour), wieTour)[0].p;
  const geelNieuw = tour.length > 1 && rangschik(som(tour.slice(0, -1)), wieTour)[0].p !== geel;
  const lantaarn = rodeLantaarn(ritRang);
  const hash = [...e.datum].reduce((a, ch) => a * 31 + ch.charCodeAt(0) >>> 0, 7);
  return {
    kop:`Tour van ${maandNaam(mk)} · etappe ${e.tourNr} · ${datumNL(e.datum)}`,
    spellen:e.spellen.map(g => ({
      spel:g.spel, trui:truiSvg(truiVoor(g.spel).kleur, 48), truiNaam:truiVoor(g.spel).naam,
      uitslag:rangschik(g.eff, wie).map(r => ({ ...rij(r.p), t:r.t, pos:r.pos, straf:g.raw[r.p] === null }))
    })),
    lantaarn:lantaarn && { wie:lantaarn.map(r => rij(r.p)), achter:lantaarn[0].t - ritRang[0].t, grap:GRAPPEN[hash % GRAPPEN.length], icoon:truiSvg("lantaarn", 64) },
    podium:ritRang.map(r => ({ ...rij(r.p), t:r.t, pos:r.pos, gap:r.t - ritRang[0].t })),
    weetje:(() => { const w = window.Stat && Stat.weetjeVoorHuldiging(e.datum); return w && { ...w, rij:w.wie && spelers.includes(w.wie) ? rij(w.wie) : null }; })(),
    slot:tour.length === 1 ? `${geel} trekt de eerste gele trui van de Tour van ${maandNaam(mk)} aan.`
      : geelNieuw ? `${geel} neemt de gele trui over.` : `${geel} blijft in het geel.`
  };
}
/* Automatisch afspelen bij het eerste bezoek: de laatste etappe die af is (een eerdere dag,
   of vandaag als iedereen al iets gespeeld heeft). Komen er later tijden bij, dan speelt hij opnieuw. */
const HULD_KEY = "tdl-huldiging";
function huldigingAuto(){
  if(!window.Huldiging || Huldiging.bezig() || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const dlg = document.getElementById("invoer");
  if(dlg && dlg.open){ dlg.addEventListener("close", huldigingAuto, { once:true }); return; }
  const nu = new Date(), vandaag = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
  let i = etappes.length - 1;
  while(i >= 0){
    const e = etappes[i];
    if(e.datum < vandaag) break;
    if(e.datum === vandaag && e.spellen.length === alleSpellen.length && deelnemers([e]).every(p => e.spellen.some(g => g.raw[p] !== null))) break;
    i--;
  }
  if(i < 0) return;
  const e = etappes[i];
  const sleutel = `${e.datum}|${e.spellen.reduce((a, g) => a + spelers.filter(p => g.raw[p] !== null).length, 0)}`;
  let gezien = null;
  try{ gezien = localStorage.getItem(HULD_KEY); }catch(err){}
  if(gezien === sleutel) return;
  try{ localStorage.setItem(HULD_KEY, sleutel); }catch(err){}
  Huldiging.speel(huldigingData(i));
}

/* ===== renderen ===== */
function render(){
  kies.value = sel;
  document.getElementById("vorige").disabled = sel === 0;
  document.getElementById("volgende").disabled = sel === etappes.length - 1;

  const e = etappes[sel];
  const tot = etappes.slice(0, sel + 1);
  const mk = maandKey(e.datum), wk = isoWeek(e.datum).key;
  const tour = tot.filter(x => maandKey(x.datum) === mk);
  const week = tot.filter(x => isoWeek(x.datum).key === wk);

  const wieTour = deelnemers(tour);
  const tourRang = rangschik(som(tour), wieTour);
  const spellenTour = [...new Set(tour.flatMap(x => x.spellen.map(g => g.spel)))];
  const draagt = {}; spelers.forEach(p => draagt[p] = []);
  const truien = [{ kleur:"geel", naam:"Gele trui", sub:"Algemeen klassement", drager:tourRang[0].p, tijd:tourRang[0].t, dag:null, naar:"ak" }];
  draagt[tourRang[0].p].push("geel");
  spellenTour.forEach(s => {
    const r = rangschik(som(tour, s), wieTour);
    const info = truiVoor(s);
    const g = e.spellen.find(x => x.spel === s);
    let dag = null;
    if(g){
      const best = Math.min(...spelers.map(p => g.raw[p]).filter(v => v !== null));
      dag = { wie: spelers.filter(p => g.raw[p] === best), tijd: best };
    }
    truien.push({ kleur:info.kleur, naam:info.naam, sub:s, drager:r[0].p, tijd:r[0].t, dag, naar:s });
    draagt[r[0].p].push(info.kleur);
  });
  if(tourRang.length > 1){
    const l = tourRang[tourRang.length - 1];
    truien.push({ kleur:"lantaarn", naam:"Rode lantaarn", sub:"Laatste in het klassement", drager:l.p, tijd:l.t, dag:null });
    draagt[l.p].push("lantaarn");
  }
  const icoontjes = p => draagt[p].length ? `<span class="truitjes">${draagt[p].map(k => truiSvg(k, 18)).join("")}</span>` : "";
  const bib = p => `<span class="bib">${spelers.indexOf(p) + 1}</span>`;
  const buitenRijen = (wie, label) => wie.map(p => `
      <div class="renner buiten">
        <span class="pos">–</span>
        ${bib(p)}
        <div><div class="naam"><s>${esc(p)}</s></div>
          <div class="sub2">${label}, doet mee sinds ${datumKort(eerste[p] || etappes[etappes.length - 1].datum)}</div></div>
        <span class="tijd"></span>
      </div>`).join("");

  // hero
  const ritRang = rangschik(e.totaal, deelnemers([e]));
  const winnaars = ritRang.filter(r => r.pos === 1).map(r => r.p);
  const tweede = ritRang.find(r => r.pos > 1);
  const geel = tourRang[0].p;
  const geelNieuw = tour.length > 1 && rangschik(som(tour.slice(0, -1)), wieTour)[0].p !== geel;
  let detail = `In <b>${fmt(ritRang[0].t)}</b>`;
  if(tweede) detail += `, ${fmt(tweede.t - ritRang[0].t)} sneller dan ${esc(tweede.p)}`;
  detail += ". " + (tour.length === 1
    ? `${esc(geel)} trekt de eerste gele trui van de Tour van ${maandNaam(mk)} aan.`
    : geelNieuw ? `${esc(geel)} neemt de gele trui over.` : `${esc(geel)} blijft in het geel.`);
  const nu = new Date(), vandaagIso = `${nu.getFullYear()}-${String(nu.getMonth() + 1).padStart(2, "0")}-${String(nu.getDate()).padStart(2, "0")}`;
  const nogNiet = deelnemers([e]).filter(p => e.spellen.every(g => g.raw[p] === null));
  const lantaarn = rodeLantaarn(ritRang);
  if(lantaarn) detail += ` Rode lantaarn voor ${esc(namen(lantaarn.map(r => r.p)))}, +${fmt(lantaarn[0].t - ritRang[0].t)}.`;
  document.getElementById("weetje").innerHTML = window.Stat ? Stat.weetjeHtml(e.datum, e.datum === vandaagIso && nogNiet.length > 0) : "";
  if(e.datum === vandaagIso && nogNiet.length) detail += ` Voorlopige uitslag: nog geen tijden van ${esc(namen(nogNiet))}.`;
  const podPlek = p => `<div class="pod p${p}">${ritRang.filter(r => r.pos === p).map(r => `
      <span class="pod-naam">${esc(r.p)}</span><span class="pod-tijd">${p === 1 ? fmt(r.t) : "+" + fmt(r.t - ritRang[0].t)}</span>`).join("")}
      <div class="pod-blok">${p}</div></div>`;
  document.getElementById("hero").innerHTML = `
    <div class="finish"></div>
    <div class="hero-in">
      <div class="hero-kopregel">
        <p class="kop">Tour van ${maandNaam(mk)}, etappe ${e.tourNr} · ${datumNL(e.datum)}</p>
        <button type="button" class="huld-knop" id="huldKnop"><span aria-hidden="true">&#9654;</span> Huldiging</button>
      </div>
      <div class="podium" aria-label="Podium: ${esc(ritRang.filter(r => r.pos <= 3).map(r => `${r.pos} ${r.p}`).join(", "))}">${[2, 1, 3].map(podPlek).join("")}</div>
      <p class="detail">${detail}</p>
    </div>
    ${profielSvg(e)}`;
  document.getElementById("huldKnop").onclick = () => window.Huldiging && Huldiging.speel(huldigingData(sel));

  // omroep: peloton op volgorde van het klassement en de live-balk
  omroep(e, mk, tour, tourRang, wieTour, ritRang, winnaars);

  // tour: verloop van het algemeen klassement over de maand
  const dagen = tourDagen(mk);
  const gereden = new Set(etappes.map(x => x.datum));
  const kalender = dagen.map((ds, i) => `<span style="--i:${i}" class="${ds === e.datum ? "nu" : ds < e.datum ? (gereden.has(ds) ? "af" : "mis") : "nog"}${weekdag(ds) === 0 ? " ma" : ""}" title="${datumKort(ds)}"></span>`).join("");
  document.getElementById("tourSectie").innerHTML = `
    <h2>Tour van ${maandNaam(mk)}</h2>
    <div class="tv-kalender" aria-hidden="true">${kalender}</div>
    <p class="toel">Etappe ${e.tourNr} van ${dagen.length}, ${datumKort(dagen[0])} t/m ${datumKort(dagen[dagen.length - 1])}. De lijnen tonen de achterstand op de gele trui na elke etappe: hoe lager, hoe verder achter.</p>
    <div id="tourGrafiek" class="tv-grafiek" tabindex="0" aria-describedby="tourUitleg"></div>
    <p id="tourUitleg" class="d tv-uitleg">Wijs een etappe aan (of gebruik de pijltjestoetsen) voor de stand op die dag.</p>`;
  tourGrafiek(mk, tour, wieTour);

  // uitslag: tabel zoals de foto's in de groepsapp (spellen als rijen, spelers als kolommen, tijden in seconden)
  const wieRit = spelers.filter(p => deelnemers([e]).includes(p));
  const uiterst = waarden => {
    const v = waarden.filter(x => x !== null);
    const mn = Math.min(...v), mx = Math.max(...v);
    return { mn, mx: mx > mn ? mx : null };
  };
  const posVan = {}; ritRang.forEach(r => posVan[r.p] = r);
  const heeftStraf = e.spellen.some(g => wieRit.some(p => g.raw[p] === null));
  const cel = (v, u, extra = "") => {
    const kl = [v === u.mn ? "snel" : v === u.mx ? "traag" : "", extra].filter(Boolean).join(" ");
    return `<td${kl ? ` class="${kl}"` : ""}>${Math.round(v)}${extra === "straf" ? "*" : ""}</td>`;
  };
  const rijenSpel = e.spellen.map(g => {
    const u = uiterst(wieRit.map(p => g.raw[p]));
    return `<tr><th scope="row">${esc(g.spel)}</th>${wieRit.map(p => g.raw[p] === null
      ? `<td class="straf" title="Niet gespeeld: langzaamste tijd + ${STRAFSECONDEN} s">${Math.round(g.eff[p])}*</td>`
      : cel(g.raw[p], u)).join("")}</tr>`;
  }).join("");
  const uTot = uiterst(wieRit.map(p => e.totaal[p]));
  document.getElementById("uitslag").innerHTML = `
    <h2>Uitslag etappe ${e.tourNr}</h2>
    <p class="toel">Tijden in seconden. <b class="lg-snel">Vet</b> is de snelste tijd, <span class="lg-traag">rood</span> de langzaamste.${heeftStraf ? ` * is een straftijd (niet gespeeld).` : ""}</p>
    <div class="scroll"><table class="uitslag-tbl">
      <thead><tr><th></th>${wieRit.map(p => `<th scope="col">${esc(p)}${icoontjes(p)}</th>`).join("")}</tr></thead>
      <tbody>${rijenSpel}</tbody>
      <tfoot>
        <tr class="tot"><th scope="row">Totaal</th>${wieRit.map(p => cel(e.totaal[p], uTot)).join("")}</tr>
        <tr class="plek"><th scope="row">Plaats</th>${wieRit.map(p => `<td>${posVan[p].pos}${posVan[p].pos === 1 ? "" : `<small>+${Math.round(posVan[p].t - ritRang[0].t)}</small>`}</td>`).join("")}</tr>
      </tfoot>
    </table></div>
    ${buitenRijen(buiten([e]), "Nog niet gestart")}`;

  // truien
  document.getElementById("truien").innerHTML = `
    <h2>Truien</h2>
    <p class="toel">Dragers na etappe ${e.tourNr}, gerekend over de Tour van ${maandNaam(mk)}. Tik op een trui voor het klassement.</p>
    <div class="truien">${truien.map(t => `
      <${t.naar ? `button type="button" data-naar="${esc(t.naar)}" aria-label="Bekijk klassement ${esc(t.naam)}"` : "div"} class="trui">
        ${truiSvg(t.kleur, 52)}
        <div>
          <div class="t-naam">${t.naam}</div>
          <div class="t-spel">${esc(t.sub)}</div>
          <div class="t-drager">${esc(t.drager)}, ${fmt(t.tijd)}</div>
          ${t.dag ? `<div class="t-dag">Vandaag snelst: ${esc(namen(t.dag.wie))}, ${fmt(t.dag.tijd)}</div>` : ""}
        </div>
      </${t.naar ? "button" : "div"}>`).join("")}</div>`;

  // klassement
  const sets = {
    week:{ lijst:week, titel:`Week ${isoWeek(e.datum).nr}` },
    tour:{ lijst:tour, titel:`Tour van ${maandNaam(mk)}` },
    alles:{ lijst:tot, titel:"Aller tijden" }
  };
  const sindsLijst = tot.filter(x => x.datum >= laatsteStart);
  if(laatsteStart > etappes[0].datum && sindsLijst.length) sets.sinds = { lijst:sindsLijst, titel:`Sinds ${namen(laatkomers)} ${laatkomers.length > 1 ? "meedoen" : "meedoet"}` };
  if(!sets[tab]) tab = "tour";
  const spellenTot = [...new Set(tot.flatMap(x => x.spellen.map(g => g.spel)))];
  if(klas !== "ak" && !spellenTot.includes(klas)) klas = "ak";
  const cur = sets[tab];
  const spelFilter = klas === "ak" ? undefined : klas;
  const rang = rangschik(som(cur.lijst, spelFilter), deelnemers(cur.lijst));
  const zeges = spelFilter ? spelzeges(cur.lijst, spelFilter) : ritzeges(cur.lijst);
  const zegeTekst = n => spelFilter
    ? (n ? `${n} keer snelst` : "Nog nooit snelst")
    : (n ? n + (n === 1 ? " ritzege" : " ritzeges") : "Nog geen ritzege");
  const truiKnop = (k, label, kleur) => `<button data-klas="${esc(k)}" aria-pressed="${k === klas}">${truiSvg(kleur, 18)} ${esc(label)}</button>`;
  const titel = klas === "ak" ? "Algemeen klassement" : `${truiVoor(klas).naam}, ${klas}`;
  document.getElementById("klassement").innerHTML = `
    <h2>Klassement</h2>
    <div class="tabs truikeuze" role="group" aria-label="Kies trui">
      ${truiKnop("ak", "Algemeen", "geel")}
      ${spellenTot.map(sp => truiKnop(sp, sp, truiVoor(sp).kleur)).join("")}
    </div>
    <div class="tabs" role="group" aria-label="Kies periode">
      ${Object.entries(sets).map(([k, v]) => `<button data-tab="${k}" aria-pressed="${k === tab}">${v.titel}</button>`).join("")}
    </div>
    <p class="toel">${titel}, ${cur.lijst.length} ${cur.lijst.length === 1 ? "etappe" : "etappes"} gereden.</p>
    ${rang.map((r, i) => `
      <div class="renner" style="--i:${i}">
        <span class="pos${r.pos === 1 ? " een" : ""}">${r.pos}</span>
        ${bib(r.p)}
        <div><div class="naam">${esc(r.p)} ${icoontjes(r.p)}</div>
          <div class="sub2">${zegeTekst(zeges[r.p])}</div></div>
        <span class="tijd">${fmt(r.t)}<small>${r.pos === 1 ? "&nbsp;" : "+" + fmt(r.t - rang[0].t)}</small></span>
      </div>`).join("")}
    ${buitenRijen(buiten(cur.lijst), "Buiten klassement")}`;
  document.querySelectorAll("#klassement [data-tab]").forEach(b => b.onclick = () => {
    tab = b.dataset.tab; render();
    document.querySelector(`#klassement [data-tab="${tab}"]`).focus();
  });
  document.querySelectorAll("#klassement [data-klas]").forEach(b => b.onclick = () => {
    klas = b.dataset.klas; render();
    document.querySelector(`#klassement [data-klas="${CSS.escape(klas)}"]`).focus();
  });
  document.querySelectorAll("#truien [data-naar]").forEach(b => b.onclick = () => {
    klas = b.dataset.naar; tab = "tour"; render();
    document.getElementById("klassement").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  });

  // erelijst
  const groepeer = fn => {
    const m = new Map();
    tot.forEach(x => { const k = fn(x); if(!m.has(k)) m.set(k, []); m.get(k).push(x); });
    return [...m.entries()].sort((a,b) => b[0].localeCompare(a[0]));
  };
  const winnaarVan = l => namen(rangschik(som(l), deelnemers(l)).filter(r => r.pos === 1).map(r => r.p));
  const lijst = (items, label, huidig) => `<ol>${items.slice(0, 8).map(([k, l]) => `
      <li><span>${label(k, l)}${k === huidig ? ' <span class="bezig">(bezig)</span>' : ""}</span><b>${esc(winnaarVan(l))}</b></li>`).join("")}</ol>`;
  document.getElementById("erelijst").innerHTML = `
    <h2>Erelijst</h2>
    <div class="ere">
      <div><h3>Weekwinnaars</h3>${lijst(groepeer(x => isoWeek(x.datum).key), (k, l) => `Week ${isoWeek(l[0].datum).nr}`, wk)}</div>
      <div><h3>Tourwinnaars</h3>${lijst(groepeer(x => maandKey(x.datum)), k => { const t = maandJaar(k); return t[0].toUpperCase() + t.slice(1); }, mk)}</div>
    </div>`;
}

/* ===== opstarten ===== */
let sel = 0;
let tab = "tour";
let klas = "ak";
let view = "tour";
const kies = document.getElementById("kies");
kies.onchange = () => { sel = Number(kies.value); render(); };
document.getElementById("vorige").onclick = () => { if(sel > 0){ sel--; render(); } };
document.getElementById("volgende").onclick = () => { if(sel < etappes.length-1){ sel++; render(); } };

function toonView(v){
  view = v;
  document.getElementById("tourView").hidden = v !== "tour";
  document.getElementById("statView").hidden = v !== "stats";
  document.querySelector(".nav").hidden = v !== "tour";
  document.querySelectorAll("[data-view]").forEach(b => b.setAttribute("aria-pressed", b.dataset.view === v));
  try{ history.replaceState(null, "", v === "stats" ? "#statistieken" : "#tour"); }catch(err){}
  v === "stats" ? renderStatView() : render();
  const doel = document.getElementById(v === "stats" ? "statView" : "tourView");
  doel.classList.remove("instroom"); void doel.offsetWidth; doel.classList.add("instroom");
}
document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => toonView(b.dataset.view));

/* laadt (opnieuw) alle scores en tekent het dashboard; wie op de laatste etappe stond, blijft daar */
async function laad(){
  const status = document.getElementById("status");
  try{
    const opLaatste = !etappes.length || sel === etappes.length - 1;
    verwerk(await haalRijen());
    if(!etappes.length) throw new Error("nog geen scores");
    sel = opLaatste ? etappes.length - 1 : Math.min(sel, etappes.length - 1);
    const tours = [...new Set(etappes.map(e => maandKey(e.datum)))].reverse();
    kies.innerHTML = tours.map(mk => `<optgroup label="Tour van ${maandNaam(mk)}">${etappes.map((e, i) => maandKey(e.datum) === mk
      ? `<option value="${i}">${datumKort(e.datum)}, etappe ${e.tourNr}</option>` : "").reverse().join("")}</optgroup>`).join("");
    document.getElementById("bijgewerkt").textContent = `Bijgewerkt tot en met ${datumNL(etappes[etappes.length - 1].datum)}.`;
    status.hidden = !bronMelding;
    status.textContent = bronMelding;
    document.getElementById("inhoud").hidden = false;
    toonView(view);
    huldigingAuto();
  }catch(err){
    status.hidden = false;
    status.textContent = `Kon de scores niet laden: ${err.message}.`;
    console.error(err);
  }
  document.dispatchEvent(new CustomEvent("scores-geladen"));
}

document.getElementById("regel").textContent = ALLEEN_VOLLEDIG ? "Een spel telt alleen mee als iedereen het gespeeld heeft." : `Heb je een spel niet gespeeld, dan krijg je de langzaamste tijd van die dag plus ${STRAFSECONDEN} seconden. Dat geldt vanaf je eerste gespeelde dag, ook als je op vakantie bent.`;
view = location.hash === "#statistieken" ? "stats" : "tour";
laad();
let breedte = window.innerWidth;
window.addEventListener("resize", () => { clearTimeout(window._rt); window._rt = setTimeout(() => { if(window.innerWidth !== breedte && etappes.length){ breedte = window.innerWidth; view === "stats" ? renderStatView() : render(); } }, 200); });
