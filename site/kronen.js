/* Kronen: trainingsversie van het kronenspel. Bord, bediening, hints en de analyse achteraf.
   De logica (generator en redeneermotor) staat in kronen-logica.js. */
(function(){
"use strict";
const L = window.KronenLogica;
const doel = document.getElementById("speelView");
if(!L || !doel) return;

const OPSLAG = "tdl-kronen";
const KROON = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 17.5 2 7.5l5.5 4L12 4l4.5 7.5 5.5-4-1.5 10z"/><rect x="3.5" y="19" width="17" height="2.4" rx="1"/></svg>`;

function lees(){ try{ return JSON.parse(localStorage.getItem(OPSLAG)) || {}; }catch(err){ return {}; } }
function bewaar(o){ try{ localStorage.setItem(OPSLAG, JSON.stringify(o)); }catch(err){} }
const opslag = Object.assign({ autoX:true, partijen:[] }, lees());
opslag.partijen = opslag.partijen.filter(x => x.dag >= 0 && x.dag < 7);
const weekdag = () => (new Date().getDay() + 6) % 7;   // 0 = maandag
let dag = weekdag();

/* ---- wie speelt er, en de gedeelde uitslag in de Google Sheet ---- */
const API = (window.TOUR_CONFIG || {}).APPS_SCRIPT_URL || "";
const CODE_SLEUTEL = "tdl-groepscode", SPELER_SLEUTEL = "tdl-stat-speler";
const veilig = t => String(t).replace(/[&<>"]/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[c]));
const leesKort = k => { try{ return localStorage.getItem(k) || ""; }catch(err){ return ""; } };
const zetKort = (k, v) => { try{ v ? localStorage.setItem(k, v) : localStorage.removeItem(k); }catch(err){} };
function namenLijst(){
  try{ return spelerLijst.length ? spelerLijst.filter(x => x.Actief).map(x => x.Naam) : spelers.slice(); }catch(err){ return []; }
}
let ik = "";
/* uitslag van vandaag: status "laden", "ok", "oud" (script nog niet bijgewerkt) of "fout" */
let uitslag = { datum:"", status:"laden", rijen:[] };
let deelMelding = "";

function klok(s){ s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function vandaag(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

/* ---- stand van de lopende puzzel ---- */
let p = null;          // puzzel: { n, reg, opl }
let isOpl = null;      // per vakje: hoort hier een queen?
let staat = null;      // 0 leeg, 1 kruisje, 2 kroon
let terug = [];        // ongedaan-stapel: [[cel, vorigeWaarde], ...] per actie
let log = [];          // elke zet: { t, cel, naar, voor }
let hints = 0, fouten = 0, klaar = false, dagpuzzel = true, hint = null;
let verstreken = 0, sinds = null, zichtbaar = false, tik = null, gestart = false;

/* De vaste puzzel van een dag speel je één keer. De stand wordt bewaard, zodat herladen
   geen nieuwe poging geeft en je de analyse later die dag kunt teruglezen. */
function vasteStand(){
  if(!opslag.vast || opslag.vast.datum !== vandaag()) opslag.vast = { datum:vandaag(), dagen:{} };
  return opslag.vast.dagen;
}
const standSleutel = () => `${ik}|${dag}`;
const vanMij = x => x.wie === undefined || x.wie === ik;
function bewaarStand(extra){
  if(!dagpuzzel || !gestart || !p) return;
  const dagen = vasteStand();
  dagen[standSleutel()] = Object.assign(dagen[standSleutel()] || {}, { staat:Array.from(staat), log, terug, verstreken:tijd(), hints, klaar }, extra || {});
  bewaar(opslag);
}

function tijd(){ return verstreken + (sinds === null ? 0 : (performance.now() - sinds) / 1000); }
function loop(aan){
  if(aan && sinds === null && !klaar && p && gestart) sinds = performance.now();
  if(!aan && sinds !== null){ verstreken = tijd(); sinds = null; bewaarStand(); }
}

/* ---- opbouw ---- */
doel.innerHTML = `
<section class="kr">
  <h2>Queens-training</h2>
  <p class="toel">Zet in elke rij, elke kolom en elk kleurvlak precies één queen. Queens mogen elkaar niet raken, ook niet schuin. Kies een dag: maandag is heel makkelijk, zondag extreem moeilijk.</p>
  <div class="kr-balk">
    <div class="tabs kr-dagen" id="krDag" role="group" aria-label="Kies een dag: maandag is het makkelijkst, zondag het moeilijkst">${L.DAGEN.map((d, i) => `<button data-dag="${i}" title="${d.naam}: ${d.n}×${d.n}, ${d.label}">${d.kort}<small>${d.n}×${d.n}</small></button>`).join("")}</div>
    <div class="kr-klok" id="krKlok" aria-label="Tijd">0:00</div>
  </div>
  <label class="kr-wie">Je speelt als <select id="krWie" aria-label="Wie speelt er"></select></label>
  <p class="kr-soort" id="krSoort"></p>
  <div class="kr-veld">
    <div class="kr-bord" id="krBord"></div>
    <div class="kr-start" id="krStart"><button type="button" id="krStartKnop">Start</button><span id="krStartInfo"></span></div>
  </div>
  <div class="kr-knoppen">
    <button id="krTerug">Ongedaan</button>
    <button id="krHint">Hint</button>
    <button id="krWis">Wissen</button>
    <button id="krNieuw">Nieuwe puzzel</button>
  </div>
  <div class="kr-hint" id="krHintTekst" role="status" aria-live="polite" hidden></div>
  <label class="kr-auto"><input type="checkbox" id="krAuto"> Kruisjes automatisch zetten rond een queen</label>
  <details class="kr-uitleg">
    <summary>Zo speel je</summary>
    <ul>
      <li>Tik één keer voor een kruisje (hier kan geen queen), nog een keer voor een queen, nog een keer om te wissen.</li>
      <li>Sleep over het bord om snel meerdere kruisjes te zetten.</li>
      <li>Rood gestreepte queens botsen met elkaar.</li>
      <li>Een hint wijst de makkelijkste logische stap aan en legt uit waarom hij klopt. Je hoeft nooit te gokken.</li>
      <li>Na afloop zie je waar je vastliep en welke stap je daar had kunnen zetten.</li>
    </ul>
  </details>
</section>
<section class="kr-na" id="krUitslag" hidden></section>
<div id="krAnalyse"></div>`;

const bord = doel.querySelector("#krBord"), klokEl = doel.querySelector("#krKlok"), hintEl = doel.querySelector("#krHintTekst");
const analyseEl = doel.querySelector("#krAnalyse"), autoEl = doel.querySelector("#krAuto");
autoEl.checked = opslag.autoX !== false;

/* ---- tekenen ---- */
function randen(n, reg, i){
  const r = (i / n) | 0, c = i % n; let k = "";
  if(r && reg[i - n] !== reg[i]) k += " rb";
  if(c && reg[i - 1] !== reg[i]) k += " rl";
  return k;
}
function botsers(n, reg, st){
  const q = [], uit = new Set();
  for(let i = 0; i < n * n; i++) if(st[i] === 2) q.push(i);
  for(const a of q) for(const b of q) if(a < b && L.raakt(n, a, b, reg)){ uit.add(a); uit.add(b); }
  return uit;
}
function autoKruis(n, reg, st){
  const uit = new Set();
  if(!opslag.autoX) return uit;
  for(let i = 0; i < n * n; i++) if(st[i] === 2) for(let j = 0; j < n * n; j++) if(st[j] === 0 && L.raakt(n, i, j, reg)) uit.add(j);
  return uit;
}
/* h: optionele hint om te markeren; klein: statisch minibord voor de analyse */
function celInhoud(n, reg, st, i, h, bots, auto){
  let k = "kr-cel" + randen(n, reg, i), inh = "";
  if(st[i] === 2){ inh = KROON; k += " kroon"; if(bots.has(i)) k += " botst"; }
  else if(st[i] === 1 || auto.has(i)){ inh = "<i>×</i>"; }
  if(h){
    if(h.plaats.includes(i)) k += " doel";
    else if(h.weg.includes(i)) k += " streep";
    else if(h.basis.includes(i)) k += " basis";
    else k += " dof";
  }
  return [k, inh];
}
function miniBord(n, reg, st, h){
  const bots = botsers(n, reg, st), leeg = new Set();
  let html = "";
  for(let i = 0; i < n * n; i++){
    const [k, inh] = celInhoud(n, reg, st, i, h, bots, leeg);
    html += `<div class="${k}" style="background-color:${L.KLEUREN[reg[i]].hex}">${inh}</div>`;
  }
  return `<div class="kr-bord kr-mini" style="--n:${n}" aria-hidden="true">${html}</div>`;
}

function bouwBord(){
  const n = p.n;
  bord.style.setProperty("--n", n);
  bord.innerHTML = p.reg.map((g, i) => `<button type="button" data-cel="${i}" tabindex="${i ? -1 : 0}" style="background-color:${L.KLEUREN[g].hex}"></button>`).join("");
  teken();
}
function teken(){
  const n = p.n, bots = botsers(n, p.reg, staat), auto = autoKruis(n, p.reg, staat);
  const cellen = bord.children;
  for(let i = 0; i < n * n; i++){
    const [k, inh] = celInhoud(n, p.reg, staat, i, hint, bots, auto);
    const el = cellen[i];
    if(el.className !== k) el.className = k;
    if(el._inh !== inh){ el.innerHTML = inh; el._inh = inh; }
    const wat = staat[i] === 2 ? "queen" : (staat[i] === 1 || auto.has(i)) ? "kruisje" : "leeg";
    el.setAttribute("aria-label", `${L.naamCel(n, i)}, ${L.KLEUREN[p.reg[i]].zn}, ${wat}`);
  }
  bord.classList.toggle("klaar", klaar);
  doel.querySelector("#krTerug").disabled = klaar || !gestart || !terug.length;
  doel.querySelector("#krHint").disabled = klaar || !gestart;
  doel.querySelector("#krWis").disabled = klaar || !gestart || !staat.some(v => v);
  bord.classList.toggle("wacht", !gestart);
  doel.querySelector("#krStart").hidden = gestart;
  klokEl.textContent = klok(tijd());
}
function toonHint(h, tekst){
  hint = h;
  hintEl.hidden = !tekst;
  hintEl.innerHTML = tekst ? `<button type="button" class="kr-hint-sluit" aria-label="Hint sluiten">&times;</button><div class="kr-hint-kop">Hint</div><p>${tekst}</p>${h && h.doe ? `<button type="button" class="kr-toon">Laat zien</button>` : ""}` : "";
  if(!tekst) return;
  hintEl.querySelector(".kr-hint-sluit").onclick = () => { toonHint(null); teken(); };
  const toon = hintEl.querySelector(".kr-toon");
  if(toon) toon.onclick = () => zet(h.doe);
}

/* ---- zetten ---- */
function zet(wijzigingen){
  const echt = wijzigingen.filter(([c, v]) => staat[c] !== v);
  if(!echt.length || klaar) return;
  const groep = [];
  for(const [c, v] of echt){
    log.push({ t:tijd(), cel:c, naar:v, voor:Array.from(staat) });
    groep.push([c, staat[c]]);
    staat[c] = v;
  }
  terug.push(groep);
  na();
}
function na(){
  toonHint(null);
  const n = p.n;
  let kronen = 0;
  for(let i = 0; i < n * n; i++) if(staat[i] === 2) kronen++;
  if(kronen === n && !botsers(n, p.reg, staat).size) klaarMaken();
  else bewaarStand();
  teken();
}
function wissel(c){
  const toont = staat[c] || (autoKruis(p.n, p.reg, staat).has(c) ? 1 : 0);
  zet([[c, toont === 0 ? 1 : toont === 1 ? 2 : 0]]);
}
function ongedaan(){
  const groep = terug.pop();
  if(!groep || klaar) return;
  for(const [c, v] of groep.reverse()){ log.push({ t:tijd(), cel:c, naar:v, voor:Array.from(staat), terug:true }); staat[c] = v; }
  na();
}

/* tikken en slepen */
let sleep = null;
function celBij(e){ const el = document.elementFromPoint(e.clientX, e.clientY); return el && el.closest ? el.closest("[data-cel]") : null; }
bord.addEventListener("pointerdown", e => {
  const el = e.target.closest("[data-cel]");
  if(!el || klaar || (e.button && e.pointerType === "mouse")) return;
  e.preventDefault();
  el.focus({ preventScroll:true });
  sleep = { start:+el.dataset.cel, vorige:+el.dataset.cel, bezig:false };
  try{ bord.setPointerCapture(e.pointerId); }catch(err){}
});
bord.addEventListener("pointermove", e => {
  if(!sleep) return;
  const el = celBij(e);
  if(!el || !bord.contains(el)) return;
  const c = +el.dataset.cel;
  if(c === sleep.vorige) return;
  const auto = autoKruis(p.n, p.reg, staat), kruis = [];
  if(!sleep.bezig){ sleep.bezig = true; if(staat[sleep.start] === 0 && !auto.has(sleep.start)) kruis.push([sleep.start, 1]); }
  if(staat[c] === 0 && !auto.has(c)) kruis.push([c, 1]);
  sleep.vorige = c;
  zet(kruis);
});
bord.addEventListener("pointerup", () => { if(sleep && !sleep.bezig) wissel(sleep.start); sleep = null; });
bord.addEventListener("pointercancel", () => { sleep = null; });
bord.addEventListener("keydown", e => {
  const el = e.target.closest("[data-cel]");
  if(!el) return;
  const c = +el.dataset.cel, n = p.n;
  const stapje = { ArrowUp:-n, ArrowDown:n, ArrowLeft:-1, ArrowRight:1 }[e.key];
  if(e.key === "Enter" || e.key === " "){ e.preventDefault(); wissel(c); }
  else if(stapje){
    e.preventDefault();
    const d = c + stapje;
    if(d < 0 || d >= n * n || (Math.abs(stapje) === 1 && ((d / n) | 0) !== ((c / n) | 0))) return;
    el.tabIndex = -1; bord.children[d].tabIndex = 0; bord.children[d].focus();
  }
});

/* ---- hints ---- */
function standFout(st){
  const kroon = [], kruis = [];
  for(let i = 0; i < st.length; i++){ if(st[i] === 2 && !isOpl[i]) kroon.push(i); if(st[i] === 1 && isOpl[i]) kruis.push(i); }
  return kroon.length || kruis.length ? { kroon, kruis } : null;
}
function geefHint(){
  if(klaar) return;
  hints++;
  const item = { t:tijd(), hint:true, voor:Array.from(staat) };
  log.push(item);
  const f = standFout(staat);
  if(f){
    const k = f.kroon.length > 0, cellen = k ? f.kroon : f.kruis;
    item.h = { plaats:[], weg:cellen, basis:[] }; item.tech = "fout";
    item.tekst = k ? "Er stond een queen op een plek waar er geen hoort." : "Er stond een kruisje op een plek waar juist een queen hoort.";
    toonHint({ plaats:[], weg:cellen, basis:[], doe:cellen.map(c => [c, 0]) }, `<b>Eerst iets rechtzetten.</b> ${k
      ? (cellen.length === 1 ? "De gestreepte queen staat" : "De gestreepte queens staan") + " niet goed. Haal die weg en kijk opnieuw."
      : (cellen.length === 1 ? "Op het gestreepte vakje staat een kruisje, maar daar hoort" : "Op de gestreepte vakjes staan kruisjes, maar daar horen") + " juist een queen. Haal het kruisje weg."}`);
  } else {
    const h = L.stap(p.n, p.reg, staat);
    if(h && h.type !== "vast"){
      h.doe = h.plaats.map(c => [c, 2]).concat(h.weg.map(c => [c, 1]));
      const actie = h.plaats.length ? "Zet een queen op het omlijnde vakje." : `Zet een kruisje op ${h.weg.length === 1 ? "het gestreepte vakje" : "de gestreepte vakjes"}.`;
      item.h = { plaats:h.plaats, weg:h.weg, basis:h.basis }; item.tech = L.techniek(h); item.tekst = L.beschrijf(h);
      toonHint(h, `<b>${L.TECHNIEKEN[L.techniek(h)].naam}.</b> ${L.beschrijf(h)} </p><p class="kr-actie">${actie}`);
    } else {
      const c = p.opl.find(i => staat[i] !== 2);
      item.h = { plaats:[c], weg:[], basis:[] }; item.tech = "gevolg"; item.tekst = "Hier hoort een queen.";
      toonHint({ plaats:[c], weg:[], basis:[], doe:[[c, 2]] }, "<b>Hier hoort een queen.</b>");
    }
  }
  bewaarStand();
  teken();
}

/* ---- analyse achteraf ---- */
function klaarMaken(terugkijken){
  klaar = true;
  loop(false);
  const totaal = tijd(), n = p.n;
  /* per zet: hoe lang dacht je na, en wat was op dat moment de makkelijkste stap? */
  /* een queen zet je met twee tikken (kruisje, dan kroon): dat telt als één zet */
  const zetten = [];
  for(const z of log){
    const v = zetten[zetten.length - 1];
    if(v && !v.hint && !z.hint && !v.terug && !z.terug && v.cel === z.cel && v.naar === 1 && z.naar === 2 && z.t - v.t < 1.5) v.naar = 2;
    else zetten.push(Object.assign({}, z));
  }
  fouten = zetten.filter(z => !z.hint && !z.terug && ((z.naar === 2 && !isOpl[z.cel]) || (z.naar === 1 && isOpl[z.cel]))).length;
  const momenten = [], perTech = {}, hintMomenten = [];
  let vorige = 0, vorigeHint = false;
  for(const z of zetten){
    const duur = z.t - vorige; vorige = z.t;
    if(z.hint){
      if(z.h){
        const s = perTech[z.tech] || (perTech[z.tech] = { tijd:0, aantal:0 });
        s.tijd += duur; s.aantal++;
        hintMomenten.push({ duur, t:z.t, z, naHint:vorigeHint });
      }
      vorigeHint = true;
      continue;
    }
    vorigeHint = false;
    if(!z.voor) continue;
    const fout = standFout(z.voor);
    const h = fout ? null : L.stap(n, p.reg, z.voor);
    const t = fout ? "fout" : L.techniek(h);
    const s = perTech[t] || (perTech[t] = { tijd:0, aantal:0 });
    s.tijd += duur;
    if(duur >= 2){ s.aantal++; momenten.push({ duur, t:z.t, z, h, fout, tech:t }); }
  }
  const vast = [...momenten].sort((a, b) => b.duur - a.duur).filter(m => m.duur >= 5).slice(0, 3).sort((a, b) => a.t - b.t);

  let eerder = opslag.partijen.filter(x => x.dag === dag && vanMij(x)), partij;
  if(terugkijken){
    partij = terugkijken.partij;
    eerder = eerder.slice(0, terugkijken.eerder);
  } else {
    partij = { d:vandaag(), n, dag, wie:ik, t:Math.round(totaal), h:hints, f:fouten, vast:dagpuzzel, tech:{} };
    for(const k in perTech) partij.tech[k] = [Math.round(perTech[k].tijd * 10) / 10, perTech[k].aantal];
    opslag.partijen.push(partij);
    opslag.partijen = opslag.partijen.slice(-300);
    bewaar(opslag);
    bewaarStand({ partij, eerder:eerder.length });
    if(dagpuzzel && ik){
      opslag.wachtrij = (opslag.wachtrij || []).concat({ datum:partij.d, speler:ik, dag, tijd:Math.max(1, partij.t), hints:partij.h, fouten:partij.f });
      bewaar(opslag);
      verstuur();
    }
  }
  const record = eerder.length ? Math.min(...eerder.map(x => x.t)) : null;
  tekenAnalyse({ totaal, vast, perTech, record, eerder, partij, hintMomenten, terugkijken:!!terugkijken });
  toonSoort();
}

function tekenAnalyse({ totaal, vast, perTech, record, eerder, partij, hintMomenten, terugkijken }){
  const n = p.n, T = L.TECHNIEKEN;
  const langst = vast.length ? Math.max(...vast.map(m => m.duur)) : 0;
  const dn = L.DAGEN[dag].naam.toLowerCase();
  const recordTekst = record === null ? `Je eerste tijd op een ${dn}puzzel.`
    : partij.t < record ? `Nieuw record op ${dn}. Het oude stond op ${klok(record)}.`
    : `Je record op ${dn} is ${klok(record)}.`;

  /* tijdlijn: waar zat de tijd? */
  const blokken = vast.map((m, i) => `<i class="vast" style="left:${(m.t - m.duur) / totaal * 100}%;width:${m.duur / totaal * 100}%"><b>${i + 1}</b></i>`).join("");
  const kroonMomenten = log.filter(z => z.naar === 2 && isOpl[z.cel] && !z.terug);
  const laatste = new Map(kroonMomenten.map(z => [z.cel, z.t]));
  const tikken = [...laatste.values()].map(t => `<u style="left:${t / totaal * 100}%"></u>`).join("");

  const kaarten = vast.map((m, i) => {
    let uitleg, h = m.h;
    if(m.fout){
      const cellen = m.fout.kroon.length ? m.fout.kroon : m.fout.kruis;
      h = { plaats:[], weg:cellen, basis:[] };
      uitleg = `<b>Er stond een fout op het bord.</b> ${m.fout.kroon.length ? "De gestreepte queen stond verkeerd" : "Op het gestreepte vakje stond een kruisje waar een queen hoort"}. Daardoor liep je vast: de puzzel klopte niet meer.`;
    } else if(h && h.type !== "vast"){
      uitleg = `<b>${T[m.tech].naam}.</b> ${L.beschrijf(h)}`;
    } else uitleg = "Hier was geen eenvoudige stap te vinden.";
    let deed = "";
    if(h && !m.fout){
      const raak = (h.plaats.includes(m.z.cel) && m.z.naar === 2) || (h.weg.includes(m.z.cel) && m.z.naar === 1);
      const wat = m.z.terug ? "maakte je een zet ongedaan" : m.z.naar === 2 ? `zette je een queen op ${L.naamCel(n, m.z.cel)}` : m.z.naar === 1 ? `zette je een kruisje op ${L.naamCel(n, m.z.cel)}` : `maakte je ${L.naamCel(n, m.z.cel)} leeg`;
      deed = `<p class="kr-deed">Daarna ${wat}. ${raak ? "Dat was precies deze stap: je zag hem, het duurde alleen even." : "De stap hiernaast was makkelijker te zien."}</p>`;
    }
    return `<div class="kr-kaart">
      ${miniBord(n, p.reg, m.z.voor, h)}
      <div><h3><span class="kr-nr">${i + 1}</span>${Math.round(m.duur)} s stil na ${klok(m.t - m.duur)}</h3><p>${uitleg}</p>${deed}</div>
    </div>`;
  }).join("");

  /* hints: welke vroeg je, en waarom had je ze nodig? */
  const hintTikken = hintMomenten.map(m => `<s style="left:${m.t / totaal * 100}%"></s>`).join("");
  const hintKaarten = hintMomenten.slice(0, 8).map((m, i) => {
    const tech = m.z.tech, sec = Math.round(m.duur);
    let waarom;
    if(tech === "fout") waarom = `Je had deze hint nodig omdat de puzzel niet meer klopte. Met een fout op het bord vallen er vakjes af die wel kunnen, en dan lijkt het alsof er geen stap meer is. ${T.fout.tip}`;
    else {
      const start = m.naHint ? "Je vroeg deze hint direct na de vorige: ook de volgende stap zag je niet."
        : sec < 3 ? "Je vroeg deze hint vrijwel meteen, zonder eerst zelf te zoeken."
        : `Je zocht ${sec} s voordat je deze hint vroeg.`;
      waarom = `${start} De stap die je miste is van het soort <b>${T[tech].naam.toLowerCase()}</b>. ${T[tech].tip}`;
    }
    return `<div class="kr-kaart">
      ${miniBord(n, p.reg, m.z.voor, m.z.h)}
      <div><h3><span class="kr-nr hint">${i + 1}</span>Hint na ${klok(m.t)}</h3><p>${m.z.tekst}</p><p class="kr-deed"><b>Waarom je hem nodig had.</b> ${waarom}</p></div>
    </div>`;
  }).join("");
  const hintTel = {};
  for(const m of hintMomenten) hintTel[m.z.tech] = (hintTel[m.z.tech] || 0) + 1;
  const hintSom = Object.keys(hintTel).sort((a, b) => hintTel[b] - hintTel[a]).map(k => `${hintTel[k]}× ${T[k].naam.toLowerCase()}`).join(", ");

  /* technieken: deze puzzel naast je eigen gemiddelde */
  const gem = {};
  for(const x of opslag.partijen.filter(vanMij)) for(const k in x.tech || {}){ const g = gem[k] || (gem[k] = [0, 0]); g[0] += x.tech[k][0]; g[1] += x.tech[k][1]; }
  const rijen = Object.keys(perTech).filter(k => perTech[k].aantal).sort((a, b) => perTech[b].tijd - perTech[a].tijd);
  const maxT = Math.max(1, ...rijen.map(k => perTech[k].tijd));
  const techTabel = rijen.map(k => {
    const s = perTech[k], nu = s.tijd / s.aantal, g = gem[k] && gem[k][1] ? gem[k][0] / gem[k][1] : nu;
    return `<tr><td>${T[k].naam}<span class="kr-staaf"><i style="width:${s.tijd / maxT * 100}%"></i></span></td><td>${Math.round(s.tijd)} s</td><td>${s.aantal}×</td><td>${nu.toFixed(1)} s</td><td>${g.toFixed(1)} s</td></tr>`;
  }).join("");
  const zwak = rijen[0];
  const tip = zwak ? `<p class="kr-tip"><b>Hier win je de meeste tijd: ${T[zwak].naam.toLowerCase()}.</b> ${T[zwak].tip}</p>` : "";

  const reeks = [...eerder, partij].slice(-12), top = Math.max(...reeks.map(x => x.t));
  const vorm = reeks.length > 1 ? `<div class="kr-vorm" role="img" aria-label="Je laatste ${reeks.length} tijden op ${dn}">${reeks.map((x, i) => `<i class="${i === reeks.length - 1 ? "nu" : ""}" style="height:${Math.max(8, x.t / top * 100)}%" title="${x.d}: ${klok(x.t)}"></i>`).join("")}</div><p class="toel">Je laatste ${reeks.length} tijden op ${dn}; de gele is deze puzzel.</p>` : "";

  analyseEl.innerHTML = `
  <section class="kr-na">
    <h2>${ik ? veilig(ik) + ": opgelost" : "Opgelost"} in ${klok(totaal)}</h2>
    <p class="toel">${recordTekst}</p>
    <div class="kr-tegels">
      <div><b>${klok(totaal)}</b><span>tijd</span></div>
      <div><b>${partij.h}</b><span>${partij.h === 1 ? "hint" : "hints"}</span></div>
      <div><b>${partij.f}</b><span>${partij.f === 1 ? "foute zet" : "foute zetten"}</span></div>
      <div><b>${langst ? Math.round(langst) + " s" : "geen"}</b><span>langste stilstand</span></div>
    </div>
    ${vorm}
    <div class="kr-knoppen"><button id="krVolgende" class="hoofd">Oefenpuzzel spelen</button></div>
  </section>
  <section class="kr-na">
    <h2>Waar liep je vast</h2>
    ${vast.length ? `<p class="toel">De rode blokken zijn je langste denkpauzes, de witte streepjes zijn je queens${hintMomenten.length ? ", de gele je hints" : ""}. Per pauze zie je de stand van dat moment en de makkelijkste stap die er lag.</p>
    <div class="kr-lijn" aria-hidden="true">${blokken}${tikken}${hintTikken}</div>
    <div class="kr-lijn-as" aria-hidden="true"><span>0:00</span><span>${klok(totaal)}</span></div>
    ${kaarten}` : `<p class="conclusie">Nergens. Je hebt geen enkele keer langer dan 5 seconden stilgestaan.</p>`}
  </section>
  <section class="kr-na">
    <h2>Je hints</h2>
    ${hintMomenten.length ? `<p class="toel">Je gebruikte ${hintMomenten.length === 1 ? "1 hint" : hintMomenten.length + " hints"}: ${hintSom}. Per hint zie je de stand van dat moment, de stap die de hint aanwees en waarom je hem nodig had.</p>
    ${hintKaarten}${hintMomenten.length > 8 ? `<p class="toel">En nog ${hintMomenten.length - 8} hints daarna.</p>` : ""}` : `<p class="conclusie">Geen. Je hebt deze puzzel helemaal zelf opgelost.</p>`}
  </section>
  ${rijen.length ? `<section class="kr-na">
    <h2>Denktijd per techniek</h2>
    <p class="toel">Bij elke denkpauze van 2 seconden of meer is gekeken welke stap op dat moment het makkelijkst was. Zo zie je welk soort stap je het meeste tijd kost.</p>
    <div class="scroll"><table class="tbl vrij kr-tech"><thead><tr><th>Techniek</th><th>Totaal</th><th>Pauzes</th><th>Per keer</th><th>Jouw gem.</th></tr></thead><tbody>${techTabel}</tbody></table></div>
    ${tip}
  </section>` : ""}`;
  analyseEl.querySelector("#krVolgende").onclick = () => { start(false); doel.scrollIntoView({ behavior:"smooth", block:"start" }); };
  if(!terugkijken) analyseEl.querySelector(".kr-na").scrollIntoView({ behavior:"smooth", block:"start" });
}

/* ---- gedeelde uitslag ---- */
async function haalUitslag(){
  if(!API){ uitslag = { datum:vandaag(), status:"fout", rijen:[] }; return werkBij(); }
  const datum = vandaag();
  if(uitslag.datum !== datum) uitslag = { datum, status:"laden", rijen:[] };
  try{
    const r = await fetch(`${API}${API.includes("?") ? "&" : "?"}action=training&datum=${datum}`, { cache:"no-store" });
    const j = await r.json();
    uitslag = j.ok && Array.isArray(j.training) ? { datum, status:"ok", rijen:j.training } : { datum, status:"oud", rijen:[] };
  }catch(err){
    uitslag = { datum, status:"fout", rijen:[] };
  }
  werkBij();
  if(uitslag.status === "ok" && (opslag.wachtrij || []).length && leesKort(CODE_SLEUTEL)) verstuur();
}
let bezigMetSturen = false;
async function verstuur(){
  const code = leesKort(CODE_SLEUTEL);
  if(bezigMetSturen || !API || !code || uitslag.status !== "ok"){ tekenUitslag(); return; }
  bezigMetSturen = true; deelMelding = "";
  let gelukt = false;
  for(const item of (opslag.wachtrij || []).slice()){
    let j;
    try{
      const r = await fetch(API, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body:JSON.stringify(Object.assign({ code, soort:"training" }, item)) });
      j = await r.json();
    }catch(err){ deelMelding = "Geen verbinding met de Google Sheet. Je tijd wordt later opnieuw verstuurd."; break; }
    if(j.ok || j.code === "datum"){
      opslag.wachtrij = opslag.wachtrij.filter(x => x !== item); bewaar(opslag); gelukt = gelukt || j.ok;
      if(j.bestond && j.resultaat && j.resultaat.Tijd !== item.tijd) deelMelding = `Er stond al een tijd voor ${item.speler} (${klok(j.resultaat.Tijd)}). Die eerste blijft staan.`;
    } else if(j.code === "groepscode"){ zetKort(CODE_SLEUTEL, ""); deelMelding = "De groepscode klopt niet."; break; }
    else { deelMelding = j.fout || "Delen is mislukt."; break; }
  }
  bezigMetSturen = false;
  if(gelukt) haalUitslag(); else tekenUitslag();
}
function serverResultaat(){ return uitslag.status === "ok" ? uitslag.rijen.find(r => r.Speler === ik && r.Dag === dag) : null; }
function geblokkeerd(){ return dagpuzzel && !gestart && !!serverResultaat(); }

function tekenUitslag(){
  const el = doel.querySelector("#krUitslag");
  el.hidden = !dagpuzzel;
  if(!dagpuzzel) return;
  const D = L.DAGEN[dag];
  const wacht = (opslag.wachtrij || []).filter(x => x.datum === vandaag() && x.dag === dag);
  const gespeeld = uitslag.rijen.filter(r => r.Dag === dag).map(r => ({ naam:r.Speler, t:r.Tijd, h:r.Hints, f:r.Fouten }));
  for(const w of wacht) if(!gespeeld.some(g => g.naam === w.speler)) gespeeld.push({ naam:w.speler, t:w.tijd, h:w.hints, f:w.fouten, lokaal:true });
  gespeeld.sort((a, b) => (a.h > 0) - (b.h > 0) || a.t - b.t);   // zonder hints gaat voor, daarna telt de tijd
  const rest = namenLijst().filter(nm => !gespeeld.some(g => g.naam === nm));
  const rijen = gespeeld.map((g, i) => `<tr class="${g.naam === ik ? "ik" : ""}"><td>${i + 1}</td><td>${veilig(g.naam)}${g.lokaal ? ` <small>nog niet gedeeld</small>` : ""}</td><td>${klok(g.t)}</td><td>${g.h}</td><td>${g.f}</td></tr>`).join("")
    + rest.map(nm => `<tr class="leeg ${nm === ik ? "ik" : ""}"><td>–</td><td>${veilig(nm)}</td><td colspan="3">nog niet gespeeld</td></tr>`).join("");
  let status = "";
  if(uitslag.status === "laden") status = "Uitslag ophalen…";
  else if(uitslag.status === "oud") status = "De gedeelde uitslag werkt nog niet: het Apps Script moet eerst worden bijgewerkt. Je tijd blijft op dit apparaat bewaard en wordt daarna alsnog gedeeld.";
  else if(uitslag.status === "fout") status = "De Google Sheet is nu niet bereikbaar. Je ziet alleen wat op dit apparaat staat.";
  const codeNodig = uitslag.status === "ok" && (opslag.wachtrij || []).length && !leesKort(CODE_SLEUTEL);
  el.innerHTML = `<h2>Uitslag van vandaag</h2>
    <p class="toel">${D.naam}, vaste puzzel (${D.n}×${D.n}). Iedereen speelt hem één keer. Wie zonder hints oplost staat boven wie hints gebruikte; daarna telt de tijd.</p>
    <div class="scroll"><table class="tbl vrij kr-uitslag"><thead><tr><th></th><th>Speler</th><th>Tijd</th><th>Hints</th><th>Fouten</th></tr></thead><tbody>${rijen}</tbody></table></div>
    ${status ? `<p class="toel">${status}</p>` : ""}
    ${deelMelding ? `<p class="toel kr-let">${veilig(deelMelding)}</p>` : ""}
    ${codeNodig ? `<form class="kr-code" id="krCodeForm"><label>Groepscode om je tijd te delen<input id="krCode" type="password" autocomplete="off" required></label><button type="submit">Deel mijn tijd</button></form>` : ""}`;
  const f = el.querySelector("#krCodeForm");
  if(f) f.onsubmit = e => { e.preventDefault(); zetKort(CODE_SLEUTEL, el.querySelector("#krCode").value.trim()); verstuur(); };
}

/* startknop, naam en uitslag opnieuw tekenen; na het ophalen van de uitslag of het wisselen van speler */
function werkBij(){
  if(!p) return;
  const knop = doel.querySelector("#krStartKnop"), info = doel.querySelector("#krStartInfo");
  const sr = serverResultaat(), blok = geblokkeerd();
  const wachtOpSheet = dagpuzzel && API && uitslag.status === "laden";
  knop.hidden = blok;
  knop.disabled = !ik || wachtOpSheet;
  knop.textContent = ik ? `Start als ${ik}` : "Start";
  info.innerHTML = !ik ? "Kies eerst hierboven wie je bent."
    : blok ? `<b>${veilig(ik)}</b> heeft deze puzzel vandaag al gespeeld: ${klok(sr.Tijd)}. Morgen staat er een nieuwe. Oefenen kan met “Nieuwe puzzel”.`
    : wachtOpSheet ? "Even kijken of je vandaag al gespeeld hebt…"
    : dagpuzzel ? `Je tijd komt op naam van <b>${veilig(ik)}</b>. De tijd loopt zodra je start.`
    : "De tijd loopt zodra je start.";
  toonSoort();
  tekenUitslag();
}
function vulWie(){
  const sel = doel.querySelector("#krWie"), lijst = namenLijst();
  if(!ik){ const oud = leesKort(SPELER_SLEUTEL); if(lijst.includes(oud)) ik = oud; }
  sel.innerHTML = `${ik ? "" : `<option value="">kies je naam…</option>`}${lijst.map(nm => `<option${nm === ik ? " selected" : ""}>${veilig(nm)}</option>`).join("")}`;
}

function toonSoort(){
  const D = L.DAGEN[dag];
  const regel = !dagpuzzel ? "Oefenpuzzel: telt niet als de vaste puzzel van de dag."
    : klaar ? `Deze puzzel heb je vandaag al gespeeld (${klok(tijd())}). Morgen staat er een nieuwe. Oefenen kan met “Nieuwe puzzel”.`
    : "Vaste puzzel van vandaag: iedereen krijgt dezelfde en je speelt hem één keer.";
  doel.querySelector("#krSoort").innerHTML = `<b>${D.naam}</b> · ${D.n}×${D.n} · ${D.label}${dag === weekdag() ? " · de dag van vandaag" : ""}<br>${regel}`;
}

/* ---- starten ---- */
function start(vaste){
  const D = L.DAGEN[dag], n = D.n;
  dagpuzzel = vaste;
  const seed = vaste ? L.hash(`kronen-${vandaag()}-${dag}`) : (Math.random() * 4294967296) >>> 0;
  p = L.genereerDag(dag, seed);
  isOpl = new Uint8Array(n * n); p.opl.forEach(c => isOpl[c] = 1);
  staat = new Uint8Array(n * n);
  terug = []; log = []; hints = 0; fouten = 0; klaar = false; hint = null;
  verstreken = 0; sinds = null; gestart = false;
  analyseEl.innerHTML = "";
  toonHint(null);
  doel.querySelectorAll("#krDag button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.dag === dag));
  vulWie();
  const oud = vaste && ik ? vasteStand()[standSleutel()] : null;
  if(oud && oud.staat && oud.staat.length === n * n){
    staat = Uint8Array.from(oud.staat); log = oud.log || []; terug = oud.terug || [];
    verstreken = oud.verstreken || 0; hints = oud.hints || 0; gestart = true;
  }
  bouwBord();
  if(oud && gestart && oud.klaar && oud.partij) klaarMaken({ partij:oud.partij, eerder:oud.eerder || 0 });
  else if(gestart) loop(zichtbaar && !document.hidden);
  werkBij();
  teken();
}
doel.querySelector("#krWie").onchange = e => {
  loop(false);
  ik = e.target.value;
  zetKort(SPELER_SLEUTEL, ik);
  start(dagpuzzel);
};
doel.querySelector("#krStartKnop").onclick = () => {
  if(!ik || geblokkeerd()) return;
  gestart = true;
  teken();
  loop(zichtbaar && !document.hidden);
  bewaarStand();
  bord.children[0].focus({ preventScroll:true });
};

doel.querySelectorAll("#krDag button").forEach(b => b.onclick = () => { dag = +b.dataset.dag; start(true); });
doel.querySelector("#krTerug").onclick = ongedaan;
doel.querySelector("#krHint").onclick = geefHint;
doel.querySelector("#krWis").onclick = () => { const w = []; staat.forEach((v, i) => { if(v) w.push([i, 0]); }); zet(w); };
doel.querySelector("#krNieuw").onclick = () => start(false);
autoEl.onchange = () => { opslag.autoX = autoEl.checked; bewaar(opslag); if(p) teken(); };

document.addEventListener("visibilitychange", () => loop(zichtbaar && !document.hidden));
tik = setInterval(() => { if(sinds !== null) klokEl.textContent = klok(tijd()); }, 250);
setInterval(() => { if(sinds !== null) bewaarStand(); }, 5000);
window.addEventListener("pagehide", () => { if(sinds !== null) bewaarStand(); });

/* app.js roept dit aan bij het wisselen van weergave; de klok loopt alleen als het bord in beeld is */
window.Kronen = {
  toon(){ zichtbaar = true; if(!p) start(true); else { loop(!document.hidden); if(!gestart) vulWie(); } haalUitslag(); },
  verberg(){ zichtbaar = false; loop(false); }
};
})();
