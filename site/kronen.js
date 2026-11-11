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
const opslag = Object.assign({ auto:false, partijen:[] }, lees());
opslag.partijen = opslag.partijen.filter(x => x.dag >= 0 && x.dag < 7);
const weekdag = () => (new Date().getDay() + 6) % 7;   // 0 = maandag
let dag = weekdag();

function klok(s){ s = Math.max(0, Math.round(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; }
function vandaag(){ const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }

/* ---- stand van de lopende puzzel ---- */
let p = null;          // puzzel: { n, reg, opl }
let isOpl = null;      // per vakje: hoort hier een kroon?
let staat = null;      // 0 leeg, 1 kruisje, 2 kroon
let terug = [];        // ongedaan-stapel: [[cel, vorigeWaarde], ...] per actie
let log = [];          // elke zet: { t, cel, naar, voor }
let hints = 0, fouten = 0, klaar = false, dagpuzzel = true, hint = null;
let verstreken = 0, sinds = null, zichtbaar = false, tik = null;

function tijd(){ return verstreken + (sinds === null ? 0 : (performance.now() - sinds) / 1000); }
function loop(aan){
  if(aan && sinds === null && !klaar && p) sinds = performance.now();
  if(!aan && sinds !== null){ verstreken = tijd(); sinds = null; }
}

/* ---- opbouw ---- */
doel.innerHTML = `
<section class="kr">
  <h2>Kronen</h2>
  <p class="toel">Training voor Queens. Zet in elke rij, elke kolom en elk kleurvlak precies één kroon. Kronen mogen elkaar niet raken, ook niet schuin. Kies een dag: maandag is heel makkelijk, zondag extreem moeilijk.</p>
  <div class="kr-balk">
    <div class="tabs kr-dagen" id="krDag" role="group" aria-label="Kies een dag: maandag is het makkelijkst, zondag het moeilijkst">${L.DAGEN.map((d, i) => `<button data-dag="${i}" title="${d.naam}: ${d.n}×${d.n}, ${d.label}">${d.kort}<small>${d.n}×${d.n}</small></button>`).join("")}</div>
    <div class="kr-klok" id="krKlok" aria-label="Tijd">0:00</div>
  </div>
  <p class="kr-soort" id="krSoort"></p>
  <div class="kr-bord" id="krBord"></div>
  <div class="kr-knoppen">
    <button id="krTerug">Ongedaan</button>
    <button id="krHint">Hint</button>
    <button id="krWis">Wissen</button>
    <button id="krNieuw">Nieuwe puzzel</button>
  </div>
  <div class="kr-hint" id="krHintTekst" role="status" aria-live="polite" hidden></div>
  <label class="kr-auto"><input type="checkbox" id="krAuto"> Kruisjes automatisch zetten rond een kroon</label>
  <details class="kr-uitleg">
    <summary>Zo speel je</summary>
    <ul>
      <li>Tik één keer voor een kruisje (hier kan geen kroon), nog een keer voor een kroon, nog een keer om te wissen.</li>
      <li>Sleep over het bord om snel meerdere kruisjes te zetten.</li>
      <li>Rood gestreepte kronen botsen met elkaar.</li>
      <li>Een hint wijst de makkelijkste logische stap aan en legt uit waarom hij klopt. Je hoeft nooit te gokken.</li>
      <li>Na afloop zie je waar je vastliep en welke stap je daar had kunnen zetten.</li>
    </ul>
  </details>
</section>
<div id="krAnalyse"></div>`;

const bord = doel.querySelector("#krBord"), klokEl = doel.querySelector("#krKlok"), hintEl = doel.querySelector("#krHintTekst");
const analyseEl = doel.querySelector("#krAnalyse"), autoEl = doel.querySelector("#krAuto");
autoEl.checked = !!opslag.auto;

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
  if(!opslag.auto) return uit;
  for(let i = 0; i < n * n; i++) if(st[i] === 2) for(let j = 0; j < n * n; j++) if(st[j] === 0 && L.raakt(n, i, j, reg)) uit.add(j);
  return uit;
}
/* h: optionele hint om te markeren; klein: statisch minibord voor de analyse */
function celInhoud(n, reg, st, i, h, bots, auto){
  let k = "kr-cel" + randen(n, reg, i), inh = "";
  if(st[i] === 2){ inh = KROON; k += " kroon"; if(bots.has(i)) k += " botst"; }
  else if(st[i] === 1 || auto.has(i)){ inh = "<i>×</i>"; }
  if(h){
    if(h.plaats.includes(i) || h.weg.includes(i)) k += " doel";
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
    html += `<div class="${k}" style="background:${L.KLEUREN[reg[i]].hex}">${inh}</div>`;
  }
  return `<div class="kr-bord kr-mini" style="--n:${n}" aria-hidden="true">${html}</div>`;
}

function bouwBord(){
  const n = p.n;
  bord.style.setProperty("--n", n);
  bord.innerHTML = p.reg.map((g, i) => `<button type="button" data-cel="${i}" tabindex="${i ? -1 : 0}" style="background:${L.KLEUREN[g].hex}"></button>`).join("");
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
    const wat = staat[i] === 2 ? "kroon" : (staat[i] === 1 || auto.has(i)) ? "kruisje" : "leeg";
    el.setAttribute("aria-label", `${L.naamCel(n, i)}, ${L.KLEUREN[p.reg[i]].zn}, ${wat}`);
  }
  bord.classList.toggle("klaar", klaar);
  doel.querySelector("#krTerug").disabled = klaar || !terug.length;
  doel.querySelector("#krHint").disabled = klaar;
  doel.querySelector("#krWis").disabled = klaar || !staat.some(v => v);
  klokEl.textContent = klok(tijd());
}
function toonHint(h, tekst){
  hint = h;
  hintEl.hidden = !tekst;
  hintEl.innerHTML = tekst || "";
}

/* ---- zetten ---- */
function zet(wijzigingen){
  const echt = wijzigingen.filter(([c, v]) => staat[c] !== v);
  if(!echt.length || klaar) return;
  const groep = [];
  for(const [c, v] of echt){
    log.push({ t:tijd(), cel:c, naar:v, voor:staat.slice() });
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
  teken();
}
function wissel(c){
  const toont = staat[c] || (autoKruis(p.n, p.reg, staat).has(c) ? 1 : 0);
  zet([[c, toont === 0 ? 1 : toont === 1 ? 2 : 0]]);
}
function ongedaan(){
  const groep = terug.pop();
  if(!groep || klaar) return;
  for(const [c, v] of groep.reverse()){ log.push({ t:tijd(), cel:c, naar:v, voor:staat.slice(), terug:true }); staat[c] = v; }
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
  log.push({ t:tijd(), hint:true });
  const f = standFout(staat);
  if(f){
    const k = f.kroon.length > 0, cellen = k ? f.kroon : f.kruis;
    toonHint({ plaats:[], weg:cellen, basis:[] }, `<b>Eerst iets rechtzetten.</b> ${k
      ? (cellen.length === 1 ? "De aangewezen kroon staat" : "De aangewezen kronen staan") + " niet goed. Haal die weg en kijk opnieuw."
      : (cellen.length === 1 ? "Op het aangewezen vakje staat een kruisje, maar daar hoort" : "Op de aangewezen vakjes staan kruisjes, maar daar horen") + " juist een kroon. Haal het kruisje weg."}`);
  } else {
    const h = L.stap(p.n, p.reg, staat);
    if(h && h.type !== "vast"){
      const actie = h.plaats.length ? "Zet een kroon op het aangewezen vakje." : `Zet een kruisje op ${h.weg.length === 1 ? "het aangewezen vakje" : "de aangewezen vakjes"}.`;
      toonHint(h, `<b>${L.TECHNIEKEN[L.techniek(h)].naam}.</b> ${L.beschrijf(h)} <span class="kr-actie">${actie}</span>`);
    } else {
      const c = p.opl.find(i => staat[i] !== 2);
      toonHint({ plaats:[c], weg:[], basis:[] }, "<b>Hier hoort een kroon.</b>");
    }
  }
  teken();
}

/* ---- analyse achteraf ---- */
function klaarMaken(){
  loop(false);
  klaar = true;
  const totaal = tijd(), n = p.n;
  /* per zet: hoe lang dacht je na, en wat was op dat moment de makkelijkste stap? */
  /* een kroon zet je met twee tikken (kruisje, dan kroon): dat telt als één zet */
  const zetten = [];
  for(const z of log){
    const v = zetten[zetten.length - 1];
    if(v && !v.hint && !z.hint && !v.terug && !z.terug && v.cel === z.cel && v.naar === 1 && z.naar === 2 && z.t - v.t < 1.5) v.naar = 2;
    else zetten.push(Object.assign({}, z));
  }
  fouten = zetten.filter(z => !z.hint && !z.terug && ((z.naar === 2 && !isOpl[z.cel]) || (z.naar === 1 && isOpl[z.cel]))).length;
  const momenten = [], perTech = {};
  let vorige = 0;
  for(const z of zetten){
    const duur = z.t - vorige; vorige = z.t;
    if(z.hint || !z.voor) continue;
    const fout = standFout(z.voor);
    const h = fout ? null : L.stap(n, p.reg, z.voor);
    const t = fout ? "fout" : L.techniek(h);
    const s = perTech[t] || (perTech[t] = { tijd:0, aantal:0 });
    s.tijd += duur;
    if(duur >= 2){ s.aantal++; momenten.push({ duur, t:z.t, z, h, fout, tech:t }); }
  }
  const vast = [...momenten].sort((a, b) => b.duur - a.duur).filter(m => m.duur >= 5).slice(0, 3).sort((a, b) => a.t - b.t);

  const eerder = opslag.partijen.filter(x => x.dag === dag);
  const record = eerder.length ? Math.min(...eerder.map(x => x.t)) : null;
  const partij = { d:vandaag(), n, dag, t:Math.round(totaal), h:hints, f:fouten, vast:dagpuzzel, tech:{} };
  for(const k in perTech) partij.tech[k] = [Math.round(perTech[k].tijd * 10) / 10, perTech[k].aantal];
  opslag.partijen.push(partij);
  opslag.partijen = opslag.partijen.slice(-300);
  bewaar(opslag);
  tekenAnalyse({ totaal, vast, perTech, record, eerder, partij });
}

function tekenAnalyse({ totaal, vast, perTech, record, eerder, partij }){
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
      uitleg = `<b>Er stond een fout op het bord.</b> ${m.fout.kroon.length ? "De aangewezen kroon stond verkeerd" : "Op het aangewezen vakje stond een kruisje waar een kroon hoort"}. Daardoor liep je vast: de puzzel klopte niet meer.`;
    } else if(h && h.type !== "vast"){
      uitleg = `<b>${T[m.tech].naam}.</b> ${L.beschrijf(h)}`;
    } else uitleg = "Hier was geen eenvoudige stap te vinden.";
    let deed = "";
    if(h && !m.fout){
      const raak = (h.plaats.includes(m.z.cel) && m.z.naar === 2) || (h.weg.includes(m.z.cel) && m.z.naar === 1);
      const wat = m.z.terug ? "maakte je een zet ongedaan" : m.z.naar === 2 ? `zette je een kroon op ${L.naamCel(n, m.z.cel)}` : m.z.naar === 1 ? `zette je een kruisje op ${L.naamCel(n, m.z.cel)}` : `maakte je ${L.naamCel(n, m.z.cel)} leeg`;
      deed = `<p class="kr-deed">Daarna ${wat}. ${raak ? "Dat was precies deze stap: je zag hem, het duurde alleen even." : "De stap hiernaast was makkelijker te zien."}</p>`;
    }
    return `<div class="kr-kaart">
      ${miniBord(n, p.reg, m.z.voor, h)}
      <div><h3><span class="kr-nr">${i + 1}</span>${Math.round(m.duur)} s stil na ${klok(m.t - m.duur)}</h3><p>${uitleg}</p>${deed}</div>
    </div>`;
  }).join("");

  /* technieken: deze puzzel naast je eigen gemiddelde */
  const gem = {};
  for(const x of opslag.partijen) for(const k in x.tech || {}){ const g = gem[k] || (gem[k] = [0, 0]); g[0] += x.tech[k][0]; g[1] += x.tech[k][1]; }
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
    <h2>Opgelost in ${klok(totaal)}</h2>
    <p class="toel">${recordTekst}</p>
    <div class="kr-tegels">
      <div><b>${klok(totaal)}</b><span>tijd</span></div>
      <div><b>${partij.h}</b><span>${partij.h === 1 ? "hint" : "hints"}</span></div>
      <div><b>${partij.f}</b><span>${partij.f === 1 ? "foute zet" : "foute zetten"}</span></div>
      <div><b>${langst ? Math.round(langst) + " s" : "geen"}</b><span>langste stilstand</span></div>
    </div>
    ${vorm}
    <div class="kr-knoppen"><button id="krVolgende" class="hoofd">Volgende puzzel</button></div>
  </section>
  <section class="kr-na">
    <h2>Waar liep je vast</h2>
    ${vast.length ? `<p class="toel">De rode blokken zijn je langste denkpauzes, de streepjes zijn je kronen. Per pauze zie je de stand van dat moment en de makkelijkste stap die er lag.</p>
    <div class="kr-lijn" aria-hidden="true">${blokken}${tikken}</div>
    <div class="kr-lijn-as" aria-hidden="true"><span>0:00</span><span>${klok(totaal)}</span></div>
    ${kaarten}` : `<p class="conclusie">Nergens. Je hebt geen enkele keer langer dan 5 seconden stilgestaan.</p>`}
  </section>
  ${rijen.length ? `<section class="kr-na">
    <h2>Denktijd per techniek</h2>
    <p class="toel">Bij elke denkpauze van 2 seconden of meer is gekeken welke stap op dat moment het makkelijkst was. Zo zie je welk soort stap je het meeste tijd kost.</p>
    <div class="scroll"><table class="tbl vrij kr-tech"><thead><tr><th>Techniek</th><th>Totaal</th><th>Pauzes</th><th>Per keer</th><th>Jouw gem.</th></tr></thead><tbody>${techTabel}</tbody></table></div>
    ${tip}
  </section>` : ""}`;
  analyseEl.querySelector("#krVolgende").onclick = () => { start(false); doel.scrollIntoView({ behavior:"smooth", block:"start" }); };
  analyseEl.querySelector(".kr-na").scrollIntoView({ behavior:"smooth", block:"start" });
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
  verstreken = 0; sinds = null;
  analyseEl.innerHTML = "";
  toonHint(null);
  doel.querySelectorAll("#krDag button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.dag === dag));
  doel.querySelector("#krSoort").innerHTML = `<b>${D.naam}</b> · ${n}×${n} · ${D.label}${dag === weekdag() ? " · de dag van vandaag" : ""}<br>${vaste ? "Vaste puzzel van vandaag: iedereen krijgt op deze dag dezelfde." : "Oefenpuzzel"}`;
  bouwBord();
  loop(zichtbaar && !document.hidden);
}

doel.querySelectorAll("#krDag button").forEach(b => b.onclick = () => { dag = +b.dataset.dag; start(true); });
doel.querySelector("#krTerug").onclick = ongedaan;
doel.querySelector("#krHint").onclick = geefHint;
doel.querySelector("#krWis").onclick = () => { const w = []; staat.forEach((v, i) => { if(v) w.push([i, 0]); }); zet(w); };
doel.querySelector("#krNieuw").onclick = () => start(false);
autoEl.onchange = () => { opslag.auto = autoEl.checked; bewaar(opslag); if(p) teken(); };

document.addEventListener("visibilitychange", () => loop(zichtbaar && !document.hidden));
tik = setInterval(() => { if(sinds !== null) klokEl.textContent = klok(tijd()); }, 250);

/* app.js roept dit aan bij het wisselen van weergave; de klok loopt alleen als het bord in beeld is */
window.Kronen = {
  toon(){ zichtbaar = true; if(!p) start(true); else loop(!document.hidden); },
  verberg(){ zichtbaar = false; loop(false); }
};
})();
