/* Tango: trainingsversie van het zon-en-maanspel. Bord, bediening, hints en de analyse achteraf.
   Bediening en hulpmiddelen volgen LinkedIn: tik voor een zon, nog een keer voor een maan, nog een
   keer om te wissen; Ongedaan maken, Hint en Wissen; rode strepen bij een regelovertreding.
   De logica (generator en redeneermotor) staat in tango-logica.js. */
(function(){
"use strict";
const L = window.TangoLogica;
const doel = document.getElementById("speelTango");
if(!L || !doel) return;

const N = L.N, NN = N * N, SPEL = "Tango";
const OPSLAG = "tdl-tango";
const ZON = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.3" fill="#FFB533" stroke="#DE8A00" stroke-width="1.6"/></svg>`;
const MAAN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.6 4.5A8.3 8.3 0 1 0 20 15.3 6.5 6.5 0 0 1 15.6 4.5z" fill="#80ADF3" stroke="#3D6CC4" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
const SYMBOOL = ["", ZON, MAAN], NAAM = ["leeg", "zon", "maan"], NAAM_MV = ["", "zonnen", "manen"];

function lees(){ try{ return JSON.parse(localStorage.getItem(OPSLAG)) || {}; }catch(err){ return {}; } }
function bewaar(o){ try{ localStorage.setItem(OPSLAG, JSON.stringify(o)); }catch(err){} }
const opslag = Object.assign({ controle:true, partijen:[] }, lees());
opslag.partijen = opslag.partijen.filter(x => x.dag >= 0 && x.dag < 7);
/* Vanaf hoeveel seconden stilstand telt een pauze als "vastlopen" (per dag, ma t/m zo)?
   Tango speel je sneller dan Queens: een zet kost meestal minder dan een seconde.
   Een denkpauze voor de techniektabel telt vanaf 40% daarvan, met een ondergrens van 1 seconde. */
const VAST_VANAF = [2, 2, 3, 3, 4, 4, 4];
const vastVanaf = () => VAST_VANAF[dag];
const pauzeVanaf = () => Math.max(1, Math.round(VAST_VANAF[dag] * 4) / 10);
const secTekst = x => `${String(x).replace(".", ",")} ${x === 1 ? "seconde" : "seconden"}`;
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
let p = null;          // puzzel: { giv, tekens, opl }
let staat = null;      // per vakje: 0 leeg, 1 zon, 2 maan
let terug = [];        // ongedaan-stapel: [[cel, vorigeWaarde], ...] per actie
let log = [];          // elke zet: { t, cel, naar, voor }
let hints = 0, fouten = 0, klaar = false, dagpuzzel = true, hint = null;
let verstreken = 0, sinds = null, zichtbaar = false, gestart = false;
/* regelovertredingen die nu met rode strepen op het bord staan; nieuwe verschijnen na een korte tel,
   zodat een zon die je doortikt naar een maan niet eerst rood oplicht */
let zichtFout = new Set(), foutTekst = "", foutTimer = null;

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
  <h2>Tango-training</h2>
  <p class="toel">Vul elk vakje met een zon of een maan. In elke rij en elke kolom staan er van allebei drie, en nooit meer dan twee dezelfde naast elkaar. Een = tussen twee vakjes betekent gelijk, een × betekent verschillend. Het bord is altijd 6×6, net als bij LinkedIn: per dag verandert hoeveel er voorgevuld is en welke stappen je nodig hebt.</p>
  <div class="kr-balk">
    <div class="tabs kr-dagen" id="tgDag" role="group" aria-label="Kies een dag: maandag is het makkelijkst, zondag het moeilijkst">${L.DAGEN.map((d, i) => `<button data-dag="${i}" title="${d.naam}: ${d.label}">${d.kort}<small>${d.klein}</small></button>`).join("")}</div>
    <div class="kr-klok" id="tgKlok" aria-label="Tijd">0:00</div>
  </div>
  <label class="kr-wie">Je speelt als <select id="tgWie" aria-label="Wie speelt er"></select></label>
  <p class="kr-soort" id="tgSoort"></p>
  <div class="kr-veld">
    <div class="tg-bord" id="tgBord"><div class="tg-raster" id="tgRaster"></div><div class="tg-tekens" id="tgTekens" aria-hidden="true"></div></div>
    <div class="kr-start" id="tgStart"><button type="button" id="tgStartKnop">Start</button><span id="tgStartInfo"></span></div>
  </div>
  <p class="tg-melding" id="tgMelding" role="status" aria-live="polite"></p>
  <div class="kr-knoppen tg-knoppen">
    <button id="tgTerug">Ongedaan maken</button>
    <button id="tgHint">Hint</button>
    <button id="tgWis">Wissen</button>
    <button id="tgNieuw">Nieuwe puzzel</button>
  </div>
  <div class="kr-hint" id="tgHintTekst" role="status" aria-live="polite" hidden></div>
  <label class="kr-auto"><input type="checkbox" id="tgAuto"> Automatisch controleren (rode strepen bij een overtreding)</label>
  <details class="kr-uitleg">
    <summary>Zo speel je</summary>
    <ul>
      <li>Tik één keer voor een zon, nog een keer voor een maan, nog een keer om te wissen. De grijze vakjes zijn voorgevuld en liggen vast.</li>
      <li>Elke rij en elke kolom krijgt drie zonnen en drie manen.</li>
      <li>Drie dezelfde naast elkaar mag niet, horizontaal of verticaal. Schuin telt niet.</li>
      <li>= tussen twee vakjes: die twee zijn gelijk. × tussen twee vakjes: die twee zijn verschillend.</li>
      <li>Rood gestreepte vakjes overtreden een regel. Onder het bord staat welke.</li>
      <li>Een hint wijst het makkelijkste vakje aan en legt uit waarom het klopt. Je hoeft nooit te gokken.</li>
      <li>Na afloop zie je waar je vastliep en welke stap je daar had kunnen zetten.</li>
    </ul>
  </details>
</section>
<section class="kr-na" id="tgUitslag" hidden></section>
<div id="tgAnalyse"></div>`;

const bord = doel.querySelector("#tgBord"), raster = doel.querySelector("#tgRaster"), tekenLaag = doel.querySelector("#tgTekens");
const klokEl = doel.querySelector("#tgKlok"), hintEl = doel.querySelector("#tgHintTekst"), meldingEl = doel.querySelector("#tgMelding");
const analyseEl = doel.querySelector("#tgAnalyse"), autoEl = doel.querySelector("#tgAuto");
autoEl.checked = opslag.controle !== false;

/* ---- tekenen ---- */
/* h: optionele markering { doel, weg, basis, tekens }; fout: vakjes met rode strepen */
function celInhoud(st, i, h, fout){
  let k = "tg-cel";
  if(p.giv[i]) k += " vast";
  if(st[i]) k += st[i] === 1 ? " zon" : " maan";
  if(fout.has(i)) k += " fout";
  if(h){
    if(h.doel.includes(i)) k += " doel";
    else if(h.weg.includes(i)) k += " streep";
    else if(!h.basis.includes(i)) k += " dof";
  }
  return [k, SYMBOOL[st[i]]];
}
function tekensHtml(h){
  return p.tekens.map(([a, b, t], i) => {
    const r = (a / N) | 0, c = a % N, hor = b === a + 1;
    const x = (hor ? c + 1 : c + .5) / N * 100, y = (hor ? r + .5 : r + 1) / N * 100;
    return `<span class="tg-teken${h ? (h.tekens.includes(i) ? " aan" : " dof") : ""}" style="left:${x}%;top:${y}%">${t === L.GELIJK ? "=" : "×"}</span>`;
  }).join("");
}
function foutCellen(st){ return new Set(L.fouten(p.tekens, st).flatMap(f => f.cellen)); }
/* statisch minibord voor de analyse; overtredingen van dat moment staan er altijd bij */
function miniBord(st, h){
  const fout = foutCellen(st);
  let html = "";
  for(let i = 0; i < NN; i++){
    const [k, inh] = celInhoud(st, i, h, fout);
    html += `<div class="${k}">${inh}</div>`;
  }
  return `<div class="tg-bord tg-mini" aria-hidden="true"><div class="tg-raster">${html}</div><div class="tg-tekens">${tekensHtml(h)}</div></div>`;
}

function bouwBord(){
  raster.innerHTML = p.giv.map((g, i) => `<button type="button" data-cel="${i}" tabindex="${i ? -1 : 0}"></button>`).join("");
  tekenLaag._html = null;
  teken();
}
function teken(){
  const fout = opslag.controle !== false ? zichtFout : new Set();
  const cellen = raster.children;
  for(let i = 0; i < NN; i++){
    const [k, inh] = celInhoud(staat, i, hint, fout);
    const el = cellen[i];
    if(el.className !== k) el.className = k;
    if(el._inh !== inh){ el.innerHTML = inh; el._inh = inh; }
    el.setAttribute("aria-label", `${L.naamCel(i)}, ${NAAM[staat[i]]}${p.giv[i] ? ", voorgevuld" : ""}${fout.has(i) ? ", overtreedt een regel" : ""}`);
  }
  const th = tekensHtml(hint);
  if(tekenLaag._html !== th){ tekenLaag.innerHTML = th; tekenLaag._html = th; }
  meldingEl.textContent = fout.size ? foutTekst : "";
  bord.classList.toggle("klaar", klaar);
  doel.querySelector("#tgTerug").disabled = klaar || !gestart || !terug.length;
  doel.querySelector("#tgHint").disabled = klaar || !gestart;
  doel.querySelector("#tgWis").disabled = klaar || !gestart || !staat.some((v, i) => v && !p.giv[i]);
  bord.classList.toggle("wacht", !gestart);
  doel.querySelector("#tgStart").hidden = gestart;
  klokEl.textContent = klok(tijd());
}
function regelTekst(f){
  if(f.soort === "drie") return `Niet meer dan twee ${NAAM_MV[f.waarde]} naast elkaar.`;
  if(f.soort === "tel") return `Te veel ${NAAM_MV[f.waarde]} in ${L.naamLijn(f.lijn)}: elke rij en kolom heeft er drie van elk.`;
  return f.t === L.GELIJK ? "Vakjes met een = ertussen moeten gelijk zijn." : "Vakjes met een × ertussen moeten verschillend zijn.";
}
function werkFoutBij(direct){
  const lijst = L.fouten(p.tekens, staat), nu = new Set(lijst.flatMap(f => f.cellen));
  for(const c of [...zichtFout]) if(!nu.has(c)) zichtFout.delete(c);
  clearTimeout(foutTimer);
  const toon = () => { zichtFout = nu; foutTekst = lijst.length ? regelTekst(lijst[0]) : ""; if(!direct) teken(); };
  if(direct || !nu.size) toon(); else foutTimer = setTimeout(toon, 650);
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
  const echt = wijzigingen.filter(([c, v]) => staat[c] !== v && !p.giv[c]);
  if(!echt.length || klaar || !gestart) return;
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
  const vol = staat.every(v => v);
  if(vol && !L.fouten(p.tekens, staat).length){ zichtFout = new Set(); klaarMaken(); }
  else { werkFoutBij(vol); bewaarStand(); }
  teken();
}
function wissel(c){ zet([[c, (staat[c] + 1) % 3]]); }
function ongedaan(){
  const groep = terug.pop();
  if(!groep || klaar) return;
  for(const [c, v] of groep.reverse()){ log.push({ t:tijd(), cel:c, naar:v, voor:Array.from(staat), terug:true }); staat[c] = v; }
  na();
}

raster.addEventListener("click", e => {
  const el = e.target.closest("[data-cel]");
  if(!el || klaar) return;
  wissel(+el.dataset.cel);
});
raster.addEventListener("keydown", e => {
  const el = e.target.closest("[data-cel]");
  if(!el) return;
  const c = +el.dataset.cel;
  const stapje = { ArrowUp:-N, ArrowDown:N, ArrowLeft:-1, ArrowRight:1 }[e.key];
  if(stapje){
    e.preventDefault();
    const d = c + stapje;
    if(d < 0 || d >= NN || (Math.abs(stapje) === 1 && ((d / N) | 0) !== ((c / N) | 0))) return;
    el.tabIndex = -1; raster.children[d].tabIndex = 0; raster.children[d].focus();
  }
});

/* ---- hints ---- */
/* symbolen die niet in de oplossing passen (de puzzel heeft er precies één) */
function standFout(st){
  const uit = [];
  for(let i = 0; i < NN; i++) if(st[i] && st[i] !== p.opl[i]) uit.push(i);
  return uit.length ? uit : null;
}
/* welke vakjes en tekens horen bij deze stap? */
function markeer(h){
  const basis = new Set(h.basis || []), tekens = new Set();
  if(h.paar) h.paar.forEach(c => basis.add(c));
  if(h.teken !== undefined) tekens.add(h.teken);
  const metTeken = cellen => p.tekens.forEach(([a, b], i) => { if(cellen.includes(a) && cellen.includes(b)) tekens.add(i); });
  if(h.paar) metTeken(h.paar);
  if(h.type === "lijn"){ L.LIJNEN[h.lijn].forEach(c => basis.add(c)); metTeken(L.LIJNEN[h.lijn]); }
  for(const k of h.keten || []){
    basis.add(k.cel); (k.basis || []).forEach(c => basis.add(c));
    if(k.teken !== undefined) tekens.add(k.teken);
  }
  if(h.einde) h.einde.cellen.forEach(c => basis.add(c));
  basis.delete(h.cel);
  return { doel:[h.cel], weg:[], basis:[...basis], tekens:[...tekens] };
}
function geefHint(){
  if(klaar || !gestart) return;
  hints++;
  const item = { t:tijd(), hint:true, voor:Array.from(staat) };
  log.push(item);
  const f = standFout(staat);
  if(f){
    item.h = { doel:[], weg:f, basis:[], tekens:[] }; item.tech = "fout";
    item.tekst = f.length === 1 ? "Er stond een symbool op een plek waar het andere hoort." : "Er stonden symbolen op plekken waar het andere hoort.";
    toonHint(Object.assign({ doe:f.map(c => [c, 0]) }, item.h), `<b>Eerst iets rechtzetten.</b> ${f.length === 1 ? "Het gestreepte symbool staat" : "De gestreepte symbolen staan"} niet goed. Haal ${f.length === 1 ? "het" : "ze"} weg en kijk opnieuw.`);
  } else {
    const h = L.stap(p, staat);
    if(h && h.type !== "vast"){
      item.h = markeer(h); item.tech = L.techniek(h); item.tekst = L.beschrijf(h);
      toonHint(Object.assign({ doe:[[h.cel, h.waarde]] }, item.h), `<b>${L.TECHNIEKEN[item.tech].naam}.</b> ${item.tekst} </p><p class="kr-actie">Zet een ${NAAM[h.waarde]} op het omlijnde vakje.`);
    } else {
      const c = staat.findIndex(v => !v);
      item.h = { doel:[c], weg:[], basis:[], tekens:[] }; item.tech = "gevolg"; item.tekst = `Hier hoort een ${NAAM[p.opl[c]]}.`;
      toonHint(Object.assign({ doe:[[c, p.opl[c]]] }, item.h), `<b>${item.tekst}</b>`);
    }
  }
  bewaarStand();
  teken();
}

/* ---- analyse achteraf ---- */
function klaarMaken(terugkijken){
  klaar = true;
  loop(false);
  const totaal = tijd();
  /* per zet: hoe lang dacht je na, en wat was op dat moment de makkelijkste stap? */
  /* een maan zet je met twee tikken (zon, dan maan) en wissen kan er ook twee kosten: dat telt als één zet */
  const zetten = [];
  for(const z of log){
    const v = zetten[zetten.length - 1];
    if(v && !v.hint && !z.hint && !v.terug && !z.terug && v.cel === z.cel && z.t - v.laatst < 1.5){ v.naar = z.naar; v.laatst = z.t; }
    else zetten.push(Object.assign({ laatst:z.t }, z));
  }
  fouten = zetten.filter(z => !z.hint && !z.terug && z.naar && z.naar !== p.opl[z.cel]).length;
  const momenten = [], perTech = {}, hintMomenten = [];
  let vorige = 0, vorigeHint = false;
  for(const z of zetten){
    const duur = z.t - vorige; vorige = z.laatst;
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
    const h = fout ? null : L.stap(p, z.voor);
    const t = fout ? "fout" : L.techniek(h);
    const s = perTech[t] || (perTech[t] = { tijd:0, aantal:0 });
    s.tijd += duur;
    if(duur >= pauzeVanaf()){ s.aantal++; momenten.push({ duur, t:z.t, z, h, fout, tech:t }); }
  }
  const vast = [...momenten].sort((a, b) => b.duur - a.duur).filter(m => m.duur >= vastVanaf()).slice(0, 3).sort((a, b) => a.t - b.t);

  let eerder = opslag.partijen.filter(x => x.dag === dag && vanMij(x)), partij;
  if(terugkijken){
    partij = terugkijken.partij;
    eerder = eerder.slice(0, terugkijken.eerder);
  } else {
    partij = { d:vandaag(), dag, wie:ik, t:Math.round(totaal), h:hints, f:fouten, vast:dagpuzzel, tech:{} };
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
  const T = L.TECHNIEKEN;
  const langst = vast.length ? Math.max(...vast.map(m => m.duur)) : 0;
  const dn = L.DAGEN[dag].naam.toLowerCase();
  const recordTekst = record === null ? `Je eerste tijd op een ${dn}puzzel.`
    : partij.t < record ? `Nieuw record op ${dn}. Het oude stond op ${klok(record)}.`
    : `Je record op ${dn} is ${klok(record)}.`;

  /* tijdlijn: waar zat de tijd? */
  const blokken = vast.map((m, i) => `<i class="vast" style="left:${(m.t - m.duur) / totaal * 100}%;width:${m.duur / totaal * 100}%"><b>${i + 1}</b></i>`).join("");
  const goed = new Map(log.filter(z => !z.hint && !z.terug && z.naar && z.naar === p.opl[z.cel]).map(z => [z.cel, z.t]));
  const tikken = [...goed.values()].map(t => `<u style="left:${t / totaal * 100}%"></u>`).join("");

  const kaarten = vast.map((m, i) => {
    let uitleg, mark = null;
    if(m.fout){
      mark = { doel:[], weg:m.fout, basis:[], tekens:[] };
      uitleg = `<b>Er stond een fout op het bord.</b> ${m.fout.length === 1 ? "Het gestreepte symbool stond verkeerd" : "De gestreepte symbolen stonden verkeerd"}. Daardoor liep je vast: de puzzel klopte niet meer.`;
    } else if(m.h && m.h.type !== "vast"){
      mark = markeer(m.h);
      uitleg = `<b>${T[m.tech].naam}.</b> ${L.beschrijf(m.h)}`;
    } else uitleg = "Hier was geen eenvoudige stap te vinden.";
    let deed = "";
    if(m.h && m.h.type !== "vast" && !m.fout){
      const raak = m.h.cel === m.z.cel && m.h.waarde === m.z.naar;
      const wat = m.z.terug ? "maakte je een zet ongedaan" : m.z.naar ? `zette je een ${NAAM[m.z.naar]} op ${L.naamCel(m.z.cel)}` : `maakte je ${L.naamCel(m.z.cel)} leeg`;
      const goedeZet = m.z.naar && m.z.naar === p.opl[m.z.cel];
      deed = `<p class="kr-deed">Daarna ${wat}. ${raak ? "Dat was precies deze stap: je zag hem, het duurde alleen even." : goedeZet ? "Dat klopte ook, maar de stap hiernaast was makkelijker te zien." : "De stap hiernaast was makkelijker te zien."}</p>`;
    }
    return `<div class="kr-kaart">
      ${miniBord(m.z.voor, mark)}
      <div><h3><span class="kr-nr">${i + 1}</span>${Math.round(m.duur)} s stil na ${klok(m.t - m.duur)}</h3><p>${uitleg}</p>${deed}</div>
    </div>`;
  }).join("");

  /* hints: welke vroeg je, en waarom had je ze nodig? */
  const hintTikken = hintMomenten.map(m => `<s style="left:${m.t / totaal * 100}%"></s>`).join("");
  const hintKaarten = hintMomenten.slice(0, 8).map((m, i) => {
    const tech = m.z.tech, sec = Math.round(m.duur);
    let waarom;
    if(tech === "fout") waarom = `Je had deze hint nodig omdat de puzzel niet meer klopte. Met een fout op het bord kloppen de tellingen en de tekens niet meer, en dan lijkt het alsof er geen stap meer is. ${T.fout.tip}`;
    else {
      const start = m.naHint ? "Je vroeg deze hint direct na de vorige: ook de volgende stap zag je niet."
        : sec < 3 ? "Je vroeg deze hint vrijwel meteen, zonder eerst zelf te zoeken."
        : `Je zocht ${sec} s voordat je deze hint vroeg.`;
      waarom = `${start} De stap die je miste is van het soort <b>${T[tech].naam.toLowerCase()}</b>. ${T[tech].tip}`;
    }
    return `<div class="kr-kaart">
      ${miniBord(m.z.voor, m.z.h)}
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
    <div class="kr-knoppen"><button id="tgVolgende" class="hoofd">Oefenpuzzel spelen</button></div>
  </section>
  <section class="kr-na">
    <h2>Waar liep je vast</h2>
    ${vast.length ? `<p class="toel">De rode blokken zijn je langste denkpauzes (vanaf ${secTekst(vastVanaf())} op een ${dn}puzzel), de witte streepjes zijn je goede zetten${hintMomenten.length ? ", de gele je hints" : ""}. Per pauze zie je de stand van dat moment en de makkelijkste stap die er lag.</p>
    <div class="kr-lijn" aria-hidden="true">${blokken}${tikken}${hintTikken}</div>
    <div class="kr-lijn-as" aria-hidden="true"><span>0:00</span><span>${klok(totaal)}</span></div>
    ${kaarten}` : `<p class="conclusie">Nergens. Je hebt geen enkele keer langer dan ${secTekst(vastVanaf())} stilgestaan. Op een ${dn}puzzel telt dat als vastlopen.</p>`}
  </section>
  <section class="kr-na">
    <h2>Je hints</h2>
    ${hintMomenten.length ? `<p class="toel">Je gebruikte ${hintMomenten.length === 1 ? "1 hint" : hintMomenten.length + " hints"}: ${hintSom}. Per hint zie je de stand van dat moment, de stap die de hint aanwees en waarom je hem nodig had.</p>
    ${hintKaarten}${hintMomenten.length > 8 ? `<p class="toel">En nog ${hintMomenten.length - 8} hints daarna.</p>` : ""}` : `<p class="conclusie">Geen. Je hebt deze puzzel helemaal zelf opgelost.</p>`}
  </section>
  ${rijen.length ? `<section class="kr-na">
    <h2>Denktijd per techniek</h2>
    <p class="toel">Bij elke denkpauze van ${secTekst(pauzeVanaf())} of meer is gekeken welke stap op dat moment het makkelijkst was. Zo zie je welk soort stap je het meeste tijd kost.</p>
    <div class="scroll"><table class="tbl vrij kr-tech"><thead><tr><th>Techniek</th><th>Totaal</th><th>Pauzes</th><th>Per keer</th><th>Jouw gem.</th></tr></thead><tbody>${techTabel}</tbody></table></div>
    ${tip}
  </section>` : ""}`;
  analyseEl.querySelector("#tgVolgende").onclick = () => { start(false); doel.scrollIntoView({ behavior:"smooth", block:"start" }); };
  if(!terugkijken) analyseEl.querySelector(".kr-na").scrollIntoView({ behavior:"smooth", block:"start" });
}

/* ---- gedeelde uitslag ---- */
async function haalUitslag(){
  if(!API){ uitslag = { datum:vandaag(), status:"fout", rijen:[] }; return werkBij(); }
  const datum = vandaag();
  if(uitslag.datum !== datum) uitslag = { datum, status:"laden", rijen:[] };
  try{
    const r = await fetch(`${API}${API.includes("?") ? "&" : "?"}action=training&spel=${SPEL}&datum=${datum}`, { cache:"no-store" });
    const j = await r.json();
    /* een script van vóór de Tango-training kent geen spel: dan zouden Tango-tijden tussen de Queens-tijden komen */
    uitslag = j.ok && Array.isArray(j.training) && j.versie >= 2 ? { datum, status:"ok", rijen:j.training } : { datum, status:"oud", rijen:[] };
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
      const r = await fetch(API, { method:"POST", headers:{ "Content-Type":"text/plain;charset=utf-8" }, body:JSON.stringify(Object.assign({ code, soort:"training", spel:SPEL }, item)) });
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
  const el = doel.querySelector("#tgUitslag");
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
  else if(uitslag.status === "oud") status = "De gedeelde uitslag voor Tango werkt nog niet: het Apps Script moet eerst worden bijgewerkt. Je tijd blijft op dit apparaat bewaard en wordt daarna alsnog gedeeld.";
  else if(uitslag.status === "fout") status = "De Google Sheet is nu niet bereikbaar. Je ziet alleen wat op dit apparaat staat.";
  const codeNodig = uitslag.status === "ok" && (opslag.wachtrij || []).length && !leesKort(CODE_SLEUTEL);
  el.innerHTML = `<h2>Uitslag van vandaag</h2>
    <p class="toel">${D.naam}, vaste Tango-puzzel (${D.label}). Iedereen speelt hem één keer. Wie zonder hints oplost staat boven wie hints gebruikte; daarna telt de tijd.</p>
    <div class="scroll"><table class="tbl vrij kr-uitslag"><thead><tr><th></th><th>Speler</th><th>Tijd</th><th>Hints</th><th>Fouten</th></tr></thead><tbody>${rijen}</tbody></table></div>
    ${status ? `<p class="toel">${status}</p>` : ""}
    ${deelMelding ? `<p class="toel kr-let">${veilig(deelMelding)}</p>` : ""}
    ${codeNodig ? `<form class="kr-code" id="tgCodeForm"><label>Groepscode om je tijd te delen<input id="tgCode" type="password" autocomplete="off" required></label><button type="submit">Deel mijn tijd</button></form>` : ""}`;
  const f = el.querySelector("#tgCodeForm");
  if(f) f.onsubmit = e => { e.preventDefault(); zetKort(CODE_SLEUTEL, el.querySelector("#tgCode").value.trim()); verstuur(); };
}

/* startknop, naam en uitslag opnieuw tekenen; na het ophalen van de uitslag of het wisselen van speler */
function werkBij(){
  if(!p) return;
  const knop = doel.querySelector("#tgStartKnop"), info = doel.querySelector("#tgStartInfo");
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
  const sel = doel.querySelector("#tgWie"), lijst = namenLijst();
  const oud = leesKort(SPELER_SLEUTEL);
  if(lijst.includes(oud)) ik = oud;   // dezelfde naam als bij de Queens-training en de statistieken
  else if(!lijst.includes(ik)) ik = "";
  sel.innerHTML = `${ik ? "" : `<option value="">kies je naam…</option>`}${lijst.map(nm => `<option${nm === ik ? " selected" : ""}>${veilig(nm)}</option>`).join("")}`;
}

function toonSoort(){
  const D = L.DAGEN[dag];
  const regel = !dagpuzzel ? "Oefenpuzzel: telt niet als de vaste puzzel van de dag."
    : klaar ? `Deze puzzel heb je vandaag al gespeeld (${klok(tijd())}). Morgen staat er een nieuwe. Oefenen kan met “Nieuwe puzzel”.`
    : "Vaste puzzel van vandaag: iedereen krijgt dezelfde en je speelt hem één keer.";
  const opbouw = p ? ` · ${p.giv.filter(v => v).length} voorgevuld, ${p.tekens.length} tekens` : "";
  doel.querySelector("#tgSoort").innerHTML = `<b>${D.naam}</b> · 6×6 · ${D.label}${opbouw}${dag === weekdag() ? " · de dag van vandaag" : ""}<br>${regel}`;
}

/* ---- starten ---- */
function start(vaste){
  dagpuzzel = vaste;
  const seed = vaste ? L.hash(`tango-${vandaag()}-${dag}`) : (Math.random() * 4294967296) >>> 0;
  p = L.genereerDag(dag, seed);
  staat = Uint8Array.from(p.giv);
  terug = []; log = []; hints = 0; fouten = 0; klaar = false; hint = null;
  verstreken = 0; sinds = null; gestart = false;
  clearTimeout(foutTimer); zichtFout = new Set(); foutTekst = "";
  analyseEl.innerHTML = "";
  toonHint(null);
  doel.querySelectorAll("#tgDag button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.dag === dag));
  vulWie();
  const oud = vaste && ik ? vasteStand()[standSleutel()] : null;
  if(oud && oud.staat && oud.staat.length === NN && p.giv.every((g, i) => !g || oud.staat[i] === g)){
    staat = Uint8Array.from(oud.staat); log = oud.log || []; terug = oud.terug || [];
    verstreken = oud.verstreken || 0; hints = oud.hints || 0; gestart = true;
  }
  bouwBord();
  if(oud && gestart && oud.klaar && oud.partij) klaarMaken({ partij:oud.partij, eerder:oud.eerder || 0 });
  else if(gestart){ werkFoutBij(true); loop(zichtbaar && !document.hidden); }
  werkBij();
  teken();
}
doel.querySelector("#tgWie").onchange = e => {
  loop(false);
  ik = e.target.value;
  zetKort(SPELER_SLEUTEL, ik);
  start(dagpuzzel);
};
doel.querySelector("#tgStartKnop").onclick = () => {
  if(!ik || geblokkeerd()) return;
  gestart = true;
  teken();
  loop(zichtbaar && !document.hidden);
  bewaarStand();
  raster.children[0].focus({ preventScroll:true });
};

doel.querySelectorAll("#tgDag button").forEach(b => b.onclick = () => { loop(false); dag = +b.dataset.dag; start(true); });
doel.querySelector("#tgTerug").onclick = ongedaan;
doel.querySelector("#tgHint").onclick = geefHint;
doel.querySelector("#tgWis").onclick = () => { const w = []; staat.forEach((v, i) => { if(v && !p.giv[i]) w.push([i, 0]); }); zet(w); };
doel.querySelector("#tgNieuw").onclick = () => { loop(false); start(false); };
autoEl.onchange = () => { opslag.controle = autoEl.checked; bewaar(opslag); if(p) teken(); };

document.addEventListener("visibilitychange", () => loop(zichtbaar && !document.hidden));
setInterval(() => { if(sinds !== null) klokEl.textContent = klok(tijd()); }, 250);
setInterval(() => { if(sinds !== null) bewaarStand(); }, 5000);
window.addEventListener("pagehide", () => { if(sinds !== null) bewaarStand(); });

/* trainen.js roept dit aan bij het wisselen van spel of weergave; de klok loopt alleen als het bord in beeld is */
window.Tango = {
  toon(){
    zichtbaar = true;
    /* bij de Queens-training een andere naam gekozen? Dan hier ook, tenzij er een puzzel loopt */
    const naam = leesKort(SPELER_SLEUTEL), wissel = naam && naam !== ik && namenLijst().includes(naam) && (!gestart || klaar);
    if(!p) start(true); else if(wissel) start(dagpuzzel); else loop(!document.hidden);
    haalUitslag();
  },
  verberg(){ zichtbaar = false; loop(false); }
};
})();
