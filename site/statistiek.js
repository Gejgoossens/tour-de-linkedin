/* Persoonlijke statistieken "tegen de puzzel", de vormranglijst en puzzelkalender voor het peloton,
   en het weetje van de dag. app.js roept Stat.bereken(...) aan na elke keer laden.

   Het model: per spel en dag is log(tijd) = niveau van de renner (glijdend, ±21 dagen) + zwaarte van de puzzel.
   De zwaarte voor renner p wordt geschat uit de ANDERE renners van die dag, zodat je jezelf niet meet.
   Vermogen = 300 W × verwachte tijd van een gemiddelde renner / jouw tijd. Een gemist spel telt als straftijd. */
(() => {
  const BASIS = 300, VENSTER = 14, SKILL_VENSTER = 21;
  const WD_KLEUR = ["#FFF1A8","#FFE066","#FFCC33","#FFB020","#F9922B","#EE7034","#DE4F3F"];
  const DAGEN = ["Ma","Di","Wo","Do","Vr","Za","Zo"], DAGEN_LANG = ["maandag","dinsdag","woensdag","donderdag","vrijdag","zaterdag","zondag"];
  const MAANDEN = ["jan","feb","mrt","apr","mei","jun","jul","aug","sep","okt","nov","dec"];
  const MAANDEN_LANG = ["januari","februari","maart","april","mei","juni","juli","augustus","september","oktober","november","december"];
  const ETAPPE = "Etappe";
  const SPELER_KEY = "tdl-stat-speler";

  /* ===== hulpjes ===== */
  const $ = s => document.querySelector(s);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const fmt = sec => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const duur = sec => { const u = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return u ? `${u} uur ${m} min` : `${m} min`; };
  const wdOf = ds => (new Date(ds + "T12:00:00").getDay() + 6) % 7;
  const dKort = ds => { const d = new Date(ds + "T12:00:00"); return `${DAGEN[wdOf(ds)].toLowerCase()} ${d.getDate()} ${MAANDEN[d.getMonth()]}`; };
  const dLang = ds => { const d = new Date(ds + "T12:00:00"); return `${DAGEN_LANG[wdOf(ds)]} ${d.getDate()} ${MAANDEN_LANG[d.getMonth()]}`; };
  const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const median = a => { if(!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const quant = (a, q) => { const s = a.slice().sort((x, y) => x - y), i = (s.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i); return s[lo] + (s[hi] - s[lo]) * (i - lo); };
  const sd = a => { const m = mean(a); return a.length > 1 ? Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)) : 0; };
  const watt = r => BASIS * Math.exp(-r);
  const namen = a => a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " en " + a[a.length - 1];
  const pctTxt = f => `${Math.round(Math.abs(f) * 100)}%`;
  const sec = n => `${n} seconde${n === 1 ? "" : "n"}`;
  const opslaan = (k, v) => { try{ localStorage.setItem(k, v); }catch(e){} };
  const lezen = k => { try{ return localStorage.getItem(k); }catch(e){ return null; } };
  const glad = () => matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";

  /* ===== toestand, gevuld door bereken() ===== */
  let dates = [], D = 0, dIdx = new Map(), num = [], wd = [], games = [], players = [], eerste = {}, raw = {}, E = [], M = {}, comb = {}, AF = [];
  let tijden = [], vorigEind = -1, STRAF = 10, kleurVan = () => "#888", trui = () => "", bibNr = () => "";
  let speler = "", spelKeus = ETAPPE, modus = "puzzel", kalSpel = "", wattOpen = false;

  const meeOp = d => players.filter(p => eerste[p] <= dates[d]);
  const eff = (g, d, p) => { const v = raw[g][d]; return v[p] ?? Math.max(...Object.values(v)) + STRAF; };
  function rangschik(t, wie){
    const a = wie.map(p => ({ p, t:t[p] })).sort((x, y) => x.t - y.t || players.indexOf(x.p) - players.indexOf(y.p));
    let pos = 0; a.forEach((r, i) => { if(i === 0 || r.t !== a[i - 1].t) pos = i + 1; r.pos = pos; }); return a;
  }

  /* opts: { etappes, spelers, spellen, eerste, straf, kleurVan, trui(spel, size), bib(p) } */
  function bereken(opts){
    STRAF = opts.straf; kleurVan = opts.kleurVan; trui = opts.trui; bibNr = opts.bib;
    dates = opts.etappes.map(e => e.datum); D = dates.length; dIdx = new Map(dates.map((d, i) => [d, i]));
    num = dates.map(ds => Math.round(Date.parse(ds + "T12:00:00Z") / 864e5)); wd = dates.map(wdOf);
    games = opts.spellen.slice(); eerste = { ...opts.eerste };
    players = opts.spelers.filter(p => eerste[p]);
    raw = {}; games.forEach(g => raw[g] = dates.map(() => null));
    tijden = [];
    opts.etappes.forEach((e, d) => e.spellen.forEach(g => {
      if(!raw[g.spel]) return;
      players.forEach(p => { const t = g.raw[p]; if(t !== null && t !== undefined){ (raw[g.spel][d] ||= {})[p] = t; tijden.push({ d, p, t }); } });
    }));

    /* etappes */
    E = dates.map((ds, d) => {
      const gs = games.filter(g => raw[g][d]), m = meeOp(d);
      const tot = {}, full = {}, gw = {}, spelWinnaars = {};
      m.forEach(p => { tot[p] = gs.reduce((a, g) => a + eff(g, d, p), 0); gw[p] = 0; if(gs.every(g => raw[g][d][p] != null)) full[p] = gs.reduce((a, g) => a + raw[g][d][p], 0); });
      gs.forEach(g => { const v = raw[g][d], b = Math.min(...Object.values(v)); spelWinnaars[g] = Object.keys(v).filter(p => v[p] === b); spelWinnaars[g].forEach(p => { if(p in gw) gw[p]++; }); });
      const rang = rangschik(tot, m);
      return { d, ds, gs, m, tot, full, gw, spelWinnaars, rang, winnaars:rang.filter(r => r.pos === 1).map(r => r.p), mk:ds.slice(0, 7), straf:m.filter(p => gs.some(g => raw[g][d][p] == null)) };
    });
    E.forEach((e, d) => {
      const tour = E.filter(x => x.mk === e.mk && x.d <= d), wie = players.filter(p => eerste[p] <= tour[0].ds);
      const som = {}; wie.forEach(p => som[p] = tour.reduce((a, x) => a + (x.tot[p] ?? 0), 0));
      e.gc = rangschik(som, wie); e.tourNr = tour.length;
    });

    /* model per spel */
    M = {};
    games.forEach(g => {
      const R = raw[g], S = {}, diff = new Array(D).fill(null);
      players.forEach(p => S[p] = new Array(D).fill(0));
      const zwaarte = () => { for(let d = 0; d < D; d++) diff[d] = R[d] ? mean(Object.entries(R[d]).map(([q, t]) => Math.log(t) - S[q][d])) : null; };
      for(let it = 0; it < 8; it++){
        zwaarte();
        players.forEach(q => {
          const eigen = []; for(let d = 0; d < D; d++) if(R[d] && R[d][q] != null) eigen.push(d);
          if(!eigen.length) return;
          const res = eigen.map(d => Math.log(R[d][q]) - diff[d]), alles = mean(res);
          /* glijdend venster met twee wijzers: som van residuen binnen ±21 dagen, zonder de dag zelf */
          let lo = 0, hi = 0, som = 0;
          for(let d = 0; d < D; d++){
            while(hi < eigen.length && num[eigen[hi]] <= num[d] + SKILL_VENSTER){ som += res[hi]; hi++; }
            while(lo < hi && num[eigen[lo]] < num[d] - SKILL_VENSTER){ som -= res[lo]; lo++; }
            let n = hi - lo, s = som;
            const k = eigen.indexOf(d, lo); if(k >= 0 && k < hi){ n--; s -= res[k]; }
            S[q][d] = n >= 3 ? s / n : alles;
          }
        });
        const alle = []; players.forEach(q => { for(let d = 0; d < D; d++) if(R[d] && R[d][q] != null) alle.push(S[q][d]); });
        const c = mean(alle) || 0; players.forEach(q => { for(let d = 0; d < D; d++) S[q][d] -= c; });
      }
      zwaarte();
      const wdNorm = DAGEN.map((_, w) => mean(diff.filter((x, d) => x != null && wd[d] === w)));
      const score = {}; players.forEach(p => score[p] = new Array(D).fill(null));
      for(let d = 0; d < D; d++){
        if(!R[d]) continue;
        const mx = Math.max(...Object.values(R[d]));
        meeOp(d).forEach(p => {
          const ander = Object.entries(R[d]).filter(([q]) => q !== p);
          const dex = ander.length >= 2 || wdNorm[wd[d]] == null ? mean(ander.length ? ander.map(([q, t]) => Math.log(t) - S[q][d]) : [diff[d]]) : wdNorm[wd[d]];
          const straf = R[d][p] == null, t = straf ? mx + STRAF : R[d][p], r = Math.log(t) - dex;
          score[p][d] = { r, t, straf, norm:Math.exp(dex), watt:watt(r), g };
        });
      }
      M[g] = { diff, wdNorm, score };
    });
    comb = {};
    players.forEach(p => comb[p] = dates.map((_, d) => {
      const s = E[d].gs.map(g => M[g].score[p][d]).filter(Boolean);
      if(!s.length) return null;
      const r = mean(s.map(x => x.r));
      return { r, t:s.reduce((a, x) => a + x.t, 0), norm:s.reduce((a, x) => a + x.norm, 0), straf:s.some(x => x.straf), watt:watt(r), g:ETAPPE };
    }));
    vorigEind = D ? idxVoor(num[D - 1] - VENSTER) : -1;
    if(!players.includes(speler)) speler = players.includes(lezen(SPELER_KEY)) ? lezen(SPELER_KEY) : players[0] || "";
    if(!games.includes(spelKeus)) spelKeus = ETAPPE;
    if(!games.includes(kalSpel)) kalSpel = games.includes("Queens") ? "Queens" : games[games.length - 1];
    AF = DET.map(det => dates.map((_, d) => { if(d < (det.min || 0)) return null; try{ return det.f(d); }catch(err){ return null; } }));
  }

  const serie = (p, g) => g === ETAPPE ? comb[p] : M[g].score[p];
  function vorm(p, g, eind = D - 1, len = VENSTER){
    const s = serie(p, g), v = [];
    for(let d = 0; d <= eind; d++) if(s[d] && num[d] > num[eind] - len) v.push(s[d].r);
    if(!v.length) return null;
    const r = mean(v); return { r, watt:watt(r), n:v.length, se:v.length > 1 ? sd(v) / Math.sqrt(v.length) : 0 };
  }
  function idxVoor(n){ let i = -1; for(let d = 0; d < D; d++) if(num[d] <= n) i = d; return i; }
  const glijdend = (p, g) => { const s = serie(p, g); return dates.map((_, d) => { if(!s[d]) return null; const v = vorm(p, g, d); return v && v.n >= 3 ? v : null; }); };
  const bib = p => `<span class="bib">${bibNr(p)}</span>`;

  /* ===== tooltip ===== */
  let tip = null;
  function toonTip(html, x, y){
    if(!tip){ tip = document.createElement("div"); tip.className = "vm-tip"; tip.hidden = true; document.body.appendChild(tip); }
    tip.innerHTML = html; tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let lx = x + 14, ly = y + 14;
    if(lx + w > innerWidth - 8) lx = x - w - 14;
    if(ly + h > innerHeight - 8) ly = y - h - 14;
    tip.style.left = Math.max(8, lx) + "px"; tip.style.top = Math.max(8, ly) + "px";
  }
  const verbergTip = () => { if(tip) tip.hidden = true; };
  document.addEventListener("pointerover", ev => { const el = ev.target.closest && ev.target.closest("[data-tip]"); if(el) toonTip(el.dataset.tip, ev.clientX, ev.clientY); });
  document.addEventListener("pointermove", ev => { const el = ev.target.closest && ev.target.closest("[data-tip]"); if(el) toonTip(el.dataset.tip, ev.clientX, ev.clientY); });
  document.addEventListener("pointerout", ev => { if(ev.target.closest && ev.target.closest("[data-tip]")) verbergTip(); });
  addEventListener("scroll", verbergTip, { passive:true });

  /* ===== kleine grafiekjes ===== */
  function spark(vals, w = 100, h = 30, kleur = "var(--geel)"){
    const pts = vals.map((v, i) => v == null ? null : [i, v]).filter(Boolean);
    if(pts.length < 2) return `<svg class="vm-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"></svg>`;
    const lv = pts.map(p => Math.log(p[1])).concat([Math.log(BASIS)]);
    const lo = Math.min(...lv), hi = Math.max(...lv), n = vals.length - 1;
    const X = i => 2 + (w - 6) * i / (n || 1), Y = v => h - 3 - (h - 6) * (Math.log(v) - lo) / ((hi - lo) || 1);
    const d = pts.map((p, i) => `${i ? "L" : "M"}${X(p[0]).toFixed(1)} ${Y(p[1]).toFixed(1)}`).join(" ");
    const laatst = pts[pts.length - 1];
    return `<svg class="vm-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true">
      <line x1="0" x2="${w}" y1="${Y(BASIS)}" y2="${Y(BASIS)}" stroke="#3A404A" stroke-dasharray="2 3"/>
      <path d="${d} L${X(laatst[0])} ${h} L${X(pts[0][0])} ${h} Z" fill="${kleur}" opacity=".12"/>
      <path d="${d}" fill="none" stroke="${kleur}" stroke-width="1.6" stroke-linejoin="round"/>
      <circle cx="${X(laatst[0])}" cy="${Y(laatst[1])}" r="2.6" fill="${kleur}"/></svg>`;
  }
  /* vermogensmeter: halve cirkel, 150–600 W op logschaal, 300 W precies bovenin */
  function meter(w){
    const lo = Math.log(150), hi = Math.log(600), cx = 130, cy = 120, R = 98;
    const hoek = v => Math.PI * (1 - (Math.log(Math.min(600, Math.max(150, v))) - lo) / (hi - lo));
    const pt = (a, r = R) => [cx + r * Math.cos(a), cy - r * Math.sin(a)];
    const boog = (a0, a1, r = R) => { const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r); return `M${x0.toFixed(1)} ${y0.toFixed(1)} A${r} ${r} 0 0 ${a0 > a1 ? 1 : 0} ${x1.toFixed(1)} ${y1.toFixed(1)}`; };
    const a = hoek(w), a3 = hoek(300);
    const ticks = [150,200,300,450,600].map(v => { const t = hoek(v), [x0, y0] = pt(t, R + 10), [x1, y1] = pt(t, R + 20), [tx, ty] = pt(t, R + 31); return `<line x1="${x0}" y1="${y0}" x2="${x1}" y2="${y1}" stroke="#14161A" stroke-width="2"/><text x="${tx}" y="${ty + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#4A3A00" font-family="Barlow,sans-serif">${v}</text>`; }).join("");
    const [nx, ny] = pt(a, R - 16);
    return `<svg class="vm-meter" viewBox="-22 -14 304 150" role="img" aria-label="Vermogensmeter: ${Math.round(w)} watt">
      <path d="${boog(Math.PI, 0)}" fill="none" stroke="rgba(20,22,26,.16)" stroke-width="18"/>
      <path class="vm-teken" pathLength="1" d="${boog(a3, a)}" fill="none" stroke="#14161A" stroke-width="18"/>
      ${ticks}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="#D7263D" stroke-width="4" stroke-linecap="round"/>
      <circle cx="${cx}" cy="${cy}" r="8" fill="#14161A"/>
      <text x="${cx}" y="${cy - 30}" text-anchor="middle" font-size="12" fill="#4A3A00" font-family="Barlow,sans-serif">watt</text></svg>`;
  }
  const deltaTxt = (nu, toen) => {
    if(!nu || !toen) return `<span class="vm-s">nog geen vergelijking</span>`;
    const f = nu.watt / toen.watt - 1;
    if(Math.abs(f) < .02) return `<span>= gelijk</span>`;
    return f > 0 ? `<span class="vm-op">▲ ${pctTxt(f)}</span>` : `<span class="vm-neer">▼ ${pctTxt(f)}</span>`;
  };

  /* ===== IK ===== */
  function renderIk(root){
    if(!D || !players.length){ root.innerHTML = `<p class="toel">Nog geen scores.</p>`; return; }
    if(!root.querySelector("#vmHero")) root.innerHTML = `
      <div class="tabs" id="vmSpeler" role="group" aria-label="Kies renner"></div>
      <p class="vm-onthoud">Kies jezelf: je keuze wordt op dit apparaat onthouden.</p>
      <div class="vm-hero" id="vmHero"></div>
      <div class="vm-spellen" id="vmSpellen"></div>
      <section id="vm-verloop"></section>
      <section id="vm-week"></section>
      <section id="vm-toen"></section>
      <section id="vm-records"></section>
      <section id="vm-reeksen"></section>
      <section id="vm-opvallend"></section>`;
    const keus = $("#vmSpeler");
    keus.innerHTML = players.map(p => `<button data-sp="${esc(p)}" aria-pressed="${p === speler}"><span class="vm-sw" style="background:${kleurVan(p)}"></span>${esc(p)}</button>`).join("");
    keus.querySelectorAll("button").forEach(b => b.onclick = () => { speler = b.dataset.sp; opslaan(SPELER_KEY, speler); renderIk(root); $(`#vmSpeler [data-sp="${CSS.escape(speler)}"]`).focus(); });
    renderHero(); renderVerloop(); renderWeek(); renderToen(); renderRecords(); renderReeksen(); renderOpvallend();
  }

  function renderHero(){
    const p = speler, nu = vorm(p, ETAPPE), toen = vorigEind >= 0 ? vorm(p, ETAPPE, vorigEind) : null;
    const rang = players.map(q => ({ q, v:vorm(q, ETAPPE) })).filter(x => x.v && x.v.n >= 5).sort((a, b) => b.v.watt - a.v.watt);
    const plek = rang.findIndex(x => x.q === p);
    let deltaZin = "Nog te weinig etappes om te vergelijken.";
    if(nu && toen){
      const f = nu.watt / toen.watt - 1;
      deltaZin = Math.abs(f) < .02 ? "Even sterk als de 14 dagen ervoor." : `<b>${f > 0 ? "▲" : "▼"} ${pctTxt(f)}</b> ${f > 0 ? "sterker" : "zwakker"} dan de 14 dagen ervoor (${Math.round(toen.watt)} W).`;
    }
    const tijdF = nu ? 1 - BASIS / nu.watt : 0;
    $("#vmHero").innerHTML = `<div class="finish"></div><div class="vm-hero-in">
      <div>
        <p class="vm-eyebrow">Vorm van de laatste 14 dagen</p>
        <p class="vm-naam">${esc(p)}</p>
        <div class="vm-watt">${nu ? Math.round(nu.watt) : "–"}<small>W</small></div>
        <p class="vm-delta">${deltaZin}</p>
        <button type="button" class="vm-uitleg-knop" id="vmWattKnop" aria-expanded="${wattOpen}" aria-controls="vmWattUitleg"><span class="i" aria-hidden="true">i</span>Wat betekent watt?</button>
        <p class="vm-rang">${nu ? `${tijdF >= 0 ? `${pctTxt(tijdF)} minder tijd nodig` : `${pctTxt(tijdF)} meer tijd nodig`} dan een gemiddelde renner op dezelfde puzzels. ` : ""}${plek >= 0 ? `Nummer ${plek + 1} van ${rang.length} in vorm.` : ""}</p>
      </div>
      <div>${nu ? meter(nu.watt) : ""}</div></div>
      <div class="vm-watt-uitleg" id="vmWattUitleg" ${wattOpen ? "" : "hidden"}>
        <h3>Wat betekent watt?</h3>
        <ul>
          <li><b>300 W</b> is wat een gemiddelde renner uit de groep op <i>dezelfde puzzel</i> zou trappen. Daarboven ben je sneller, daaronder trager.</li>
          <li>Zo tellen makkelijke maandagen en zware zondagen eerlijk mee: je wordt altijd gemeten tegen hoe zwaar die puzzel was.</li>
          <li>Hoe zwaar een puzzel was, halen we uit de tijden van de <i>anderen</i> die dag, rekening houdend met hun eigen niveau. Jouw tijd telt niet mee in je eigen maatstaf.</li>
          <li>Rekensom: 300 × verwachte tijd ÷ jouw tijd. 360 W = 17% minder tijd nodig, 240 W = 25% meer tijd nodig.</li>
          <li>Spel gemist? Dan telt de straftijd (langzaamste tijd van die dag + ${STRAF} s). Er zijn is ook een kwaliteit.</li>
          <li>Je <b>vorm</b> is je gemiddelde over de laatste 14 dagen.</li>
        </ul>
        <p class="vm-vb">Voorbeeld: een gemiddelde renner doet de zondag-Queens in <b>1:30</b>, jij in <b>1:15</b>. Dan trap je 300 × 90 ÷ 75 = <b>360 W</b>. Geen echte watt, wel een eerlijke vergelijking.</p>
      </div>`;
    $("#vmWattKnop").onclick = () => { wattOpen = !wattOpen; $("#vmWattKnop").setAttribute("aria-expanded", wattOpen); $("#vmWattUitleg").hidden = !wattOpen; };
    $("#vmSpellen").innerHTML = games.map(g => {
      const v = vorm(p, g), t = vorigEind >= 0 ? vorm(p, g, vorigEind) : null;
      return `<button class="vm-spelkaart" data-g="${esc(g)}" aria-pressed="${spelKeus === g}" title="Toon ${esc(g)} in de grafiek">
        <div class="vm-sk-kop">${trui(g, 18)}${esc(g)}</div>
        <div class="vm-sk-w">${v ? Math.round(v.watt) : "–"}<small>W</small></div>
        <div class="vm-sk-d">${deltaTxt(v, t)}</div>${spark(glijdend(p, g).map(x => x && x.watt))}</button>`;
    }).join("");
    $("#vmSpellen").querySelectorAll(".vm-spelkaart").forEach(b => b.onclick = () => { spelKeus = spelKeus === b.dataset.g ? ETAPPE : b.dataset.g; renderHero(); renderVerloop(); $("#vm-verloop").scrollIntoView({ behavior:glad(), block:"start" }); });
  }

  function renderVerloop(){
    const p = speler, g = spelKeus, s = serie(p, g), box = $("#vm-verloop");
    box.innerHTML = `<h2>Verloop</h2>
      <p class="toel">${modus === "puzzel" ? "Elke stip is één dag, gemeten tegen de puzzel van die dag. De gele lijn is je vorm: het gemiddelde over 14 dagen, met de band als onzekerheid. Boven de stippellijn ben je sneller dan een gemiddelde renner." : "Dezelfde dagen in echte seconden. De grijze lijn is wat een gemiddelde renner op die puzzel nodig had. Zie hoe de weekdag alles bepaalt."}</p>
      <div class="tabs" id="vmVSpel" role="group" aria-label="Kies spel">${[ETAPPE, ...games].map(x => `<button data-g="${esc(x)}" aria-pressed="${x === g}">${x === ETAPPE ? "Hele etappe" : trui(x, 16) + " " + esc(x)}</button>`).join("")}</div>
      <div class="tabs" id="vmVModus" role="group" aria-label="Weergave"><button data-m="puzzel" aria-pressed="${modus === "puzzel"}">Tegen de puzzel (watt)</button><button data-m="ruw" aria-pressed="${modus === "ruw"}">Ruwe tijden</button></div>
      <div class="vm-grafiek" id="vmVGraf"></div>
      <div class="vm-legenda">${DAGEN.map((d, i) => `<span><i style="background:${WD_KLEUR[i]}"></i>${d}</span>`).join("")}<span><i class="ring"></i>straftijd</span>${modus === "puzzel" ? `<span><i class="lijn" style="background:var(--geel)"></i>vorm (14 d)</span>` : `<span><i class="lijn" style="background:#8A9099"></i>gemiddelde renner</span>`}</div>
      <p class="conclusie" id="vmVConc"></p>`;
    box.querySelectorAll("#vmVSpel button").forEach(b => b.onclick = () => { spelKeus = b.dataset.g; renderHero(); renderVerloop(); });
    box.querySelectorAll("#vmVModus button").forEach(b => b.onclick = () => { modus = b.dataset.m; renderVerloop(); });

    const graf = $("#vmVGraf");
    const W = Math.max(300, Math.round(graf.clientWidth)), H = 270, L = 46, Rm = 10, T = 12, B = 28;
    const d0 = dIdx.get(eerste[p]) ?? 0, dagen = []; for(let d = d0; d < D; d++) if(s[d]) dagen.push(d);
    if(dagen.length < 2){ graf.innerHTML = `<p class="toel">Nog te weinig dagen.</p>`; return; }
    const xs = d => L + (W - L - Rm) * (num[d] - num[d0]) / ((num[D - 1] - num[d0]) || 1);
    const rol = glijdend(p, g);
    let vals, ticks, fmtY;
    if(modus === "puzzel"){
      vals = dagen.map(d => s[d].watt).concat(dagen.filter(d => rol[d]).flatMap(d => [watt(rol[d].r + rol[d].se), watt(rol[d].r - rol[d].se)]), [BASIS]);
      ticks = [75,100,150,200,300,450,600,900,1200]; fmtY = v => v + " W";
    } else {
      vals = dagen.flatMap(d => [s[d].t, s[d].norm]);
      ticks = [2,5,10,20,30,60,120,180,300,600,900]; fmtY = v => v < 60 ? v + "s" : fmt(v);
    }
    const lo = Math.log(Math.min(...vals)) - .06, hi = Math.log(Math.max(...vals)) + .06;
    const Y = v => T + (H - T - B) * (1 - (Math.log(v) - lo) / ((hi - lo) || 1));
    let svg = ticks.filter(v => Math.log(v) >= lo && Math.log(v) <= hi).map(v => `<line x1="${L}" x2="${W - Rm}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#2A2F36"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${fmtY(v)}</text>`).join("");
    for(let d = d0; d < D; d++) if(d === d0 || dates[d].slice(0, 7) !== dates[d - 1].slice(0, 7)){
      const m = new Date(dates[d] + "T12:00:00"); svg += `<text x="${xs(d).toFixed(1)}" y="${H - 8}" text-anchor="${d === d0 ? "start" : "middle"}">${m.getDate()} ${MAANDEN[m.getMonth()]}</text>`;
    }
    const stip = (d, v) => s[d].straf ? `<circle cx="${xs(d).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4.5" fill="#1E2127" stroke="#F0525A" stroke-width="2"/>` : `<circle cx="${xs(d).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="4.5" fill="${WD_KLEUR[wd[d]]}" stroke="#1E2127" stroke-width="1.5"/>`;
    if(modus === "puzzel"){
      svg += `<line x1="${L}" x2="${W - Rm}" y1="${Y(BASIS)}" y2="${Y(BASIS)}" stroke="#8A9099" stroke-dasharray="4 4"/><text x="${W - Rm}" y="${Y(BASIS) - 5}" text-anchor="end">gemiddelde renner</text>`;
      const rd = dagen.filter(d => rol[d]);
      if(rd.length > 1){
        const boven = rd.map(d => `${xs(d).toFixed(1)} ${Y(watt(rol[d].r - rol[d].se)).toFixed(1)}`), onder = rd.slice().reverse().map(d => `${xs(d).toFixed(1)} ${Y(watt(rol[d].r + rol[d].se)).toFixed(1)}`);
        svg += `<path d="M${boven.join(" L")} L${onder.join(" L")} Z" fill="#FFD300" opacity=".14"/>`;
      }
      svg += dagen.map(d => stip(d, s[d].watt)).join("");
      if(rd.length > 1) svg += `<path class="vm-teken" pathLength="1" d="${rd.map((d, i) => `${i ? "L" : "M"}${xs(d).toFixed(1)} ${Y(rol[d].watt).toFixed(1)}`).join(" ")}" fill="none" stroke="#FFD300" stroke-width="3" stroke-linejoin="round"/>`;
    } else {
      svg += `<path d="${dagen.map((d, i) => `${i ? "L" : "M"}${xs(d).toFixed(1)} ${Y(s[d].norm).toFixed(1)}`).join(" ")}" fill="none" stroke="#8A9099" stroke-width="2" stroke-linejoin="round"/>`;
      svg += dagen.map(d => stip(d, s[d].t)).join("");
    }
    graf.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Verloop van ${esc(p)} in ${esc(g)}">${svg}<line id="vmCross" x1="0" x2="0" y1="${T}" y2="${H - B}" stroke="#F2F3F5" stroke-opacity=".35" visibility="hidden"/><rect x="${L}" y="0" width="${W - L - Rm}" height="${H - B}" fill="transparent" id="vmHit"/></svg>`;
    const hit = $("#vmHit"), cross = $("#vmCross");
    const opDag = ev => {
      const r = hit.ownerSVGElement.getBoundingClientRect(), x = (ev.clientX - r.left) * W / r.width;
      let best = dagen[0]; dagen.forEach(d => { if(Math.abs(xs(d) - x) < Math.abs(xs(best) - x)) best = d; });
      const v = s[best], f = rol[best];
      cross.setAttribute("x1", xs(best)); cross.setAttribute("x2", xs(best)); cross.setAttribute("visibility", "visible");
      toonTip(`<span class="t-k">${dKort(dates[best])} · ${g === ETAPPE ? "etappe" : esc(g)}</span>
        <b>${fmt(v.t)}</b>${v.straf ? ` <span style="color:var(--rood)">incl. straftijd</span>` : ""}<br>
        <span class="t-s">Gemiddelde renner: ${fmt(v.norm)}</span><br>
        <b>${Math.round(v.watt)} W</b> <span class="t-s">${v.watt >= BASIS ? pctTxt(1 - BASIS / v.watt) + " sneller" : pctTxt(BASIS / v.watt - 1) + " trager"} dan verwacht</span>
        ${f ? `<br><span class="t-s">Vorm toen: ${Math.round(f.watt)} W</span>` : ""}`, ev.clientX, ev.clientY);
    };
    hit.addEventListener("pointermove", opDag); hit.addEventListener("pointerdown", opDag);
    hit.addEventListener("pointerleave", () => { verbergTip(); cross.setAttribute("visibility", "hidden"); });

    const xsN = dagen.map(d => num[d]), ys = dagen.map(d => s[d].r), mx = mean(xsN), my = mean(ys);
    const noem = xsN.reduce((a, x) => a + (x - mx) ** 2, 0);
    const pm = noem ? Math.exp(-xsN.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / noem * 30) - 1 : 0;
    const nu = vorm(p, g), t = vorigEind >= 0 ? vorm(p, g, vorigEind) : null;
    const naam = g === ETAPPE ? "over alle spellen" : `in ${esc(g)}`;
    let zin = Math.abs(pm) < .03 ? `${esc(p)} is ${naam} vrij stabiel over de hele periode.` : `${esc(p)} wordt ${naam} gemiddeld <b>${pctTxt(pm)} per maand ${pm > 0 ? "sterker" : "zwakker"}</b> ten opzichte van de puzzel.`;
    if(nu && t) zin += ` Nu ${Math.round(nu.watt)} W, twee weken geleden ${Math.round(t.watt)} W.`;
    if(dagen.length < 20) zin += ` Met nog maar ${dagen.length} dagen is dit een eerste indruk.`;
    $("#vmVConc").innerHTML = zin;
  }

  function renderWeek(){
    const p = speler;
    const rijen = [...games, ETAPPE].map(g => {
      const s = serie(p, g);
      const cellen = DAGEN.map((_, w) => {
        const ds = []; for(let d = 0; d < D; d++) if(s[d] && wd[d] === w) ds.push(d);
        if(!ds.length) return { html:`<td class="leeg">–</td>`, w:null };
        const rs = ds.map(d => s[d].r), wt = watt(mean(rs)), t = Math.max(-1, Math.min(1, Math.log(wt / BASIS) / .45));
        let pijl = "";
        if(rs.length >= 4){
          const h = rs.length >> 1, f = watt(mean(rs.slice(h))) / watt(mean(rs.slice(0, h))) - 1;
          pijl = Math.abs(f) < .05 ? `<span class="pijl vm-s">=</span>` : f > 0 ? `<span class="pijl vm-op">▲${pctTxt(f)}</span>` : `<span class="pijl vm-neer">▼${pctTxt(f)}</span>`;
        }
        const groep = [];
        ds.forEach(d => { if(g === ETAPPE) groep.push(...Object.values(E[d].full)); else groep.push(...Object.values(raw[g][d])); });
        const tipTxt = `<span class='t-k'>${esc(g)} op ${DAGEN_LANG[w]}</span>${ds.length}× gespeeld<br>Mediane tijd: <b>${fmt(median(ds.map(d => s[d].t)))}</b><br><span class='t-s'>Groep mediaan: ${groep.length ? fmt(median(groep)) : "–"}</span>`;
        return { html:`<td style="background:color-mix(in srgb, ${t >= 0 ? "var(--blauw)" : "var(--vm-oranje)"} ${Math.round(Math.abs(t) * 55)}%, var(--wit-2))" data-tip="${tipTxt}"><b>${Math.round(wt)}</b>${pijl}</td>`, w:wt };
      });
      return { g, cellen };
    });
    const et = rijen[rijen.length - 1].cellen.map((c, i) => ({ w:c.w, i })).filter(x => x.w).sort((a, b) => b.w - a.w);
    const conc = et.length > 2 ? `Relatief het sterkst op <b>${DAGEN_LANG[et[0].i]}</b> (${Math.round(et[0].w)} W), het zwakst op <b>${DAGEN_LANG[et[et.length - 1].i]}</b> (${Math.round(et[et.length - 1].w)} W). Alles is al tegen de puzzel gemeten, dus dit zegt niet "zondag is zwaar", maar "op zondag doe jij het beter of slechter dan de rest".` : "";
    $("#vm-week").innerHTML = `<h2>Jouw week</h2>
      <p class="toel">Je gemiddelde vermogen per spel en weekdag. Blauw is sterker dan een gemiddelde renner, oranje zwakker. Het pijltje vergelijkt de recente helft van die weekdagen met de eerste helft: word je beter op zondagen, of alleen op maandagen? Tik op een vak voor de echte tijden.</p>
      <div class="vm-schaal"><span>zwakker</span><span class="balk"></span><span>sterker dan gemiddeld</span></div>
      <div class="scroll"><table class="vm-tbl"><thead><tr><th></th>${DAGEN.map(d => `<th>${d}</th>`).join("")}</tr></thead>
      <tbody>${rijen.map(r => `<tr${r.g === ETAPPE ? ' class="som"' : ""}><td>${esc(r.g)}</td>${r.cellen.map(c => c.html).join("")}</tr>`).join("")}</tbody></table></div>
      ${conc ? `<p class="conclusie">${conc}</p>` : ""}`;
  }

  function renderToen(){
    const p = speler, start = dIdx.get(eerste[p]) ?? 0, box = $("#vm-toen");
    const rijen = games.map(g => {
      const s = M[g].score[p], begin = [], nu = [];
      for(let d = start; d < D; d++) if(s[d]){ if(num[d] < num[start] + 21) begin.push(s[d].watt); if(num[d] > num[D - 1] - VENSTER) nu.push(s[d].watt); }
      return { g, begin, nu };
    }).filter(r => r.begin.length >= 3 && r.nu.length >= 3);
    if(!rijen.length || num[D - 1] - num[start] < 28){ box.innerHTML = `<h2>Toen en nu</h2><p class="toel">${esc(p)} rijdt nog te kort mee voor een vergelijking tussen de eerste weken en nu.</p>`; return; }
    box.innerHTML = `<h2>Toen en nu</h2>
      <p class="toel">Per spel je eerste drie weken (grijs) tegenover de laatste 14 dagen (geel). De stip is je mediaan, de balk de middelste helft van je dagen: hoe smaller, hoe constanter.</p>
      <div class="vm-grafiek" id="vmToenGraf"></div>
      <div class="vm-legenda"><span><i style="background:#1E2127;border:2px solid #C4C9D1"></i>eerste 3 weken</span><span><i style="background:#FFD300"></i>laatste 14 dagen</span></div>
      <p class="conclusie" id="vmToenConc"></p>`;
    const W = Math.max(300, Math.round($("#vmToenGraf").clientWidth)), rij = 52, L = 78, Rm = 14, H = rijen.length * rij + 30;
    const alle = rijen.flatMap(r => [quant(r.begin, .25), quant(r.begin, .75), quant(r.nu, .25), quant(r.nu, .75)]).concat([BASIS]);
    const lo = Math.log(Math.min(...alle)) - .08, hi = Math.log(Math.max(...alle)) + .08;
    const X = v => L + (W - L - Rm) * (Math.log(v) - lo) / (hi - lo);
    let svg = [100,150,200,300,450,600,900].filter(v => Math.log(v) > lo && Math.log(v) < hi).map(v => `<line x1="${X(v)}" x2="${X(v)}" y1="4" y2="${H - 22}" stroke="${v === BASIS ? "#8A9099" : "#2A2F36"}" ${v === BASIS ? 'stroke-dasharray="4 4"' : ""}/><text x="${X(v)}" y="${H - 6}" text-anchor="middle">${v} W</text>`).join("");
    rijen.forEach((r, i) => {
      const y = 14 + i * rij, mb = median(r.begin), mn = median(r.nu), bt = `<span class='t-k'>${esc(r.g)}</span>`;
      const balk = (a, yy, kl, tekst) => `<rect x="${X(quant(a, .25))}" y="${yy}" width="${Math.max(2, X(quant(a, .75)) - X(quant(a, .25)))}" height="10" rx="5" fill="${kl}" opacity=".35" data-tip="${bt}${tekst}: middelste helft tussen ${Math.round(quant(a, .25))} en ${Math.round(quant(a, .75))} W"/>`;
      svg += `<text x="0" y="${y + 18}" class="vm-rijlabel">${esc(r.g)}</text>
        ${balk(r.begin, y + 2, "#8A9099", "Eerste 3 weken")}${balk(r.nu, y + 18, "#FFD300", "Laatste 14 dagen")}
        <line x1="${X(mb)}" x2="${X(mn)}" y1="${y + 7}" y2="${y + 23}" stroke="#F2F3F5" stroke-opacity=".5" stroke-width="1.5"/>
        <circle cx="${X(mb)}" cy="${y + 7}" r="5" fill="#1E2127" stroke="#C4C9D1" stroke-width="2" data-tip="${bt}Mediaan eerste 3 weken: <b>${Math.round(mb)} W</b>"/>
        <circle cx="${X(mn)}" cy="${y + 23}" r="6" fill="#FFD300" stroke="#1E2127" stroke-width="2" data-tip="${bt}Mediaan laatste 14 dagen: <b>${Math.round(mn)} W</b>"/>`;
    });
    $("#vmToenGraf").innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Vermogen per spel, begin tegenover nu">${svg}</svg>`;
    const beste = rijen.map(r => ({ g:r.g, f:median(r.nu) / median(r.begin) - 1, sp:(quant(r.nu, .75) / quant(r.nu, .25)) / (quant(r.begin, .75) / quant(r.begin, .25)) })).sort((a, b) => b.f - a.f);
    const constant = beste.slice().sort((a, b) => a.sp - b.sp)[0];
    $("#vmToenConc").innerHTML = `Grootste sprong: <b>${esc(beste[0].g)}</b>, ${beste[0].f >= 0 ? pctTxt(beste[0].f) + " sterker" : "al ging het " + pctTxt(beste[0].f) + " achteruit"}. ${constant && constant.sp < .9 ? `In <b>${esc(constant.g)}</b> ben je het meest constant geworden.` : ""}`;
  }

  function renderRecords(){
    const p = speler;
    const rijen = games.map(g => ({ g, cellen:DAGEN.map((_, w) => {
      let mijn = null, md = null, groep = null, gw = null;
      for(let d = 0; d < D; d++){
        if(wd[d] !== w || !raw[g][d]) continue;
        const v = raw[g][d];
        if(v[p] != null && (mijn === null || v[p] < mijn)){ mijn = v[p]; md = d; }
        Object.entries(v).forEach(([q, t]) => { if(groep === null || t < groep){ groep = t; gw = q; } });
      }
      if(mijn === null) return `<td class="leeg">–</td>`;
      const ster = mijn === groep;
      return `<td class="${ster ? "ster" : ""}" data-tip="<span class='t-k'>Beste ${esc(g)} op ${DAGEN_LANG[w]}</span><b>${fmt(mijn)}</b> op ${dKort(dates[md])}<br><span class='t-s'>${ster ? "Dit is ook het groepsrecord." : `Groepsrecord: ${esc(gw)}, ${fmt(groep)}`}</span>">${fmt(mijn)}</td>`;
    }) }));
    const top = []; games.forEach(g => M[g].score[p].forEach((v, d) => { if(v && !v.straf) top.push({ ...v, d }); }));
    top.sort((a, b) => b.watt - a.watt);
    $("#vm-records").innerHTML = `<h2>Records per weekdag</h2>
      <p class="toel">Een record op zondag is iets anders dan op maandag, dus elke weekdag heeft een eigen record. Geel omlijnd: dat is ook het groepsrecord voor die dag.</p>
      <div class="scroll"><table class="vm-tbl"><thead><tr><th></th>${DAGEN.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>${rijen.map(r => `<tr><td>${esc(r.g)}</td>${r.cellen.join("")}</tr>`).join("")}</tbody></table></div>
      <h3 class="vm-h3">Beste prestaties tegen de puzzel</h3>
      <p class="toel">Niet de snelste tijden, maar de dagen waarop je het verst onder de verwachte tijd bleef.</p>
      <ol class="vm-lijst">${top.slice(0, 5).map((v, i) => `<li><span class="pos">${i + 1}</span><span>${trui(v.g, 16)} <b>${esc(v.g)}</b> op ${dKort(dates[v.d])}<br><span class="vm-s">${fmt(v.t)} waar een gemiddelde renner ${fmt(v.norm)} nodig had</span></span><span class="w">${Math.round(v.watt)} W</span></li>`).join("")}</ol>`;
  }

  function renderReeksen(){
    const p = speler, start = dIdx.get(eerste[p]) ?? 0, c = comb[p];
    const totaal = D - start, volledig = E.slice(start).filter(e => e.full[p] != null).length;
    const gemist = games.reduce((a, g) => a + M[g].score[p].filter(v => v && v.straf).length, 0);
    let reeks = 0; for(let d = D - 1; d >= start && E[d].full[p] != null; d--) reeks++;
    let lang = 0, cur = 0, langEind = -1; for(let d = start; d < D; d++){ if(c[d] && c[d].watt > BASIS){ cur++; if(cur > lang){ lang = cur; langEind = d; } } else cur = 0; }
    let nuBoven = 0; for(let d = D - 1; d >= start && c[d] && c[d].watt > BASIS; d--) nuBoven++;
    const weken = {}; for(let d = start; d < D; d++) if(c[d]){ const dt = new Date(dates[d] + "T12:00:00"); dt.setDate(dt.getDate() - wd[d]); const k = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`; (weken[k] ||= []).push(c[d].r); }
    const besteWeek = Object.entries(weken).filter(([, v]) => v.length >= 5).map(([k, v]) => ({ k, w:watt(mean(v)) })).sort((a, b) => b.w - a.w)[0];
    const gepuzzeld = tijden.filter(r => r.p === p).reduce((a, r) => a + r.t, 0);
    const ritzeges = E.filter(e => e.winnaars.includes(p)).length, podium = E.filter(e => e.rang.some(r => r.p === p && r.pos <= 3)).length;
    $("#vm-reeksen").innerHTML = `<h2>Reeksen &amp; aanwezigheid</h2>
      <p class="toel">Er zijn is ook een kwaliteit. Een gemist spel telt mee als straftijd (langzaamste tijd van die dag + ${STRAF} s), dus ook in je vermogen.</p>
      <div class="vm-tegels">
        <div class="vm-tegel"><b>${volledig}/${totaal}</b><span>etappes volledig gereden (${Math.round(volledig / (totaal || 1) * 100)}%)</span></div>
        <div class="vm-tegel"><b>${gemist}</b><span>spellen gemist, straftijd gekregen</span></div>
        <div class="vm-tegel"><b>${reeks}</b><span>dagen op rij alles gespeeld</span></div>
        <div class="vm-tegel"><b>${nuBoven}</b><span>dagen op rij boven 300 W (record: ${lang}${langEind >= 0 ? ", t/m " + dKort(dates[langEind]) : ""})</span></div>
        <div class="vm-tegel"><b>${besteWeek ? Math.round(besteWeek.w) + " W" : "–"}</b><span>beste week${besteWeek ? ", vanaf " + dKort(besteWeek.k) : ""}</span></div>
        <div class="vm-tegel"><b>${duur(gepuzzeld)}</b><span>totaal gepuzzeld</span></div>
        <div class="vm-tegel"><b>${ritzeges}</b><span>ritzeges, ${podium}× op het podium</span></div>
      </div>`;
  }

  function renderOpvallend(){
    const p = speler, c = comb[p], feiten = [];
    const dagen = c.map((v, d) => v && { ...v, d }).filter(Boolean);
    const best = dagen.slice().sort((a, b) => b.watt - a.watt)[0], slecht = dagen.slice().sort((a, b) => a.watt - b.watt)[0];
    if(best) feiten.push(["★", `Beste dag ooit: <b>${dLang(dates[best.d])}</b>, ${Math.round(best.watt)} W over alle spellen (${fmt(best.t)}, verwacht ${fmt(best.norm)}).`]);
    if(slecht && slecht !== best) feiten.push(["↓", `Zwaarste dag: ${dLang(dates[slecht.d])}, ${Math.round(slecht.watt)} W${slecht.straf ? ", met straftijd" : ""}.`]);
    const h2h = players.filter(q => q !== p).map(q => { let w = 0, l = 0; E.forEach(e => { if(e.tot[p] != null && e.tot[q] != null){ if(e.tot[p] < e.tot[q]) w++; else if(e.tot[p] > e.tot[q]) l++; } }); return { q, w, l }; }).filter(x => x.w + x.l >= 5);
    if(h2h.length){
      const nemesis = h2h.slice().sort((a, b) => a.w / (a.w + a.l) - b.w / (b.w + b.l))[0], prooi = h2h.slice().sort((a, b) => b.w / (b.w + b.l) - a.w / (a.w + a.l))[0];
      feiten.push(["⚔", `Lastigste tegenstander: <b>${esc(nemesis.q)}</b>. Van de ${nemesis.w + nemesis.l} onderlinge etappes won je er ${nemesis.w}.`]);
      if(prooi.q !== nemesis.q) feiten.push(["♥", `Favoriete prooi: <b>${esc(prooi.q)}</b>, ${prooi.w} van de ${prooi.w + prooi.l} onderlinge etappes gewonnen.`]);
    }
    const pg = games.map(g => ({ g, v:vorm(p, g, D - 1, 9999) })).filter(x => x.v).sort((a, b) => b.v.watt - a.v.watt);
    if(pg.length > 1) feiten.push(["◆", `Specialisme: <b>${esc(pg[0].g)}</b> (${Math.round(pg[0].v.watt)} W over de hele periode). Werk aan de winkel: ${esc(pg[pg.length - 1].g)} (${Math.round(pg[pg.length - 1].v.watt)} W).`]);
    const prs = []; games.forEach(g => DAGEN.forEach((_, w) => { let b = null; for(let d = 0; d < D; d++) if(wd[d] === w && raw[g][d] && raw[g][d][p] != null && (!b || raw[g][d][p] < b.t)) b = { t:raw[g][d][p], d }; if(b && num[D - 1] - num[b.d] < VENSTER) prs.push(`${g} op ${DAGEN_LANG[w]}`); }));
    if(prs.length) feiten.push(["⚡", `In de laatste 14 dagen ${prs.length} weekdagrecord${prs.length > 1 ? "s" : ""} gebroken: ${esc(namen(prs.slice(0, 4)))}${prs.length > 4 ? " en meer" : ""}.`]);
    let snel = null; games.forEach(g => raw[g].forEach((v, d) => { if(v && v[p] != null && (!snel || v[p] < snel.t)) snel = { t:v[p], g, d }; }));
    if(snel) feiten.push(["⏱", `Snelste spel ooit: ${esc(snel.g)} in ${sec(snel.t)}, op ${dLang(dates[snel.d])}.`]);
    $("#vm-opvallend").innerHTML = `<h2>Opvallend</h2>${feiten.map(([i, t]) => `<div class="vm-feit"><span class="ic" aria-hidden="true">${i}</span><span>${t}</span></div>`).join("")}`;
  }

  /* ===== PELOTON: vormranglijst en puzzelkalender ===== */
  function renderPeloton(vormEl, kalEl){
    if(!D || !players.length){ vormEl.innerHTML = kalEl.innerHTML = ""; return; }
    const rij = players.map(q => ({ q, nu:vorm(q, ETAPPE), toen:vorigEind >= 0 ? vorm(q, ETAPPE, vorigEind) : null, lijn:glijdend(q, ETAPPE).map(x => x && x.watt) })).filter(x => x.nu).sort((a, b) => b.nu.watt - a.nu.watt);
    vormEl.innerHTML = `<h2>Vormranglijst</h2>
      <p class="toel">Wie trapt nu het hardst? Gemiddeld vermogen over de laatste 14 dagen, gemeten tegen de puzzels (300 W = een gemiddelde renner). Het lijntje is het verloop sinds de start.</p>
      ${rij.map((x, i) => `<div class="vm-vorm-rij"><span class="pos">${i + 1}</span>${bib(x.q)}<span class="nm">${esc(x.q)}<small>${x.nu.n} dagen${x.nu.n < 5 ? ", te weinig voor een eerlijk beeld" : ""}</small></span>${spark(x.lijn, 110, 28, kleurVan(x.q))}<span class="w">${Math.round(x.nu.watt)} W<small>${deltaTxt(x.nu, x.toen)}</small></span></div>`).join("")}`;

    const g = kalSpel, diff = M[g].diff;
    const start = new Date(dates[0] + "T12:00:00"); start.setDate(start.getDate() - wd[0]);
    const eind = new Date(dates[D - 1] + "T12:00:00");
    const weken = []; for(let d = new Date(start); d <= eind; d.setDate(d.getDate() + 7)) weken.push(new Date(d));
    const vals = diff.filter(x => x != null), lo = Math.min(...vals), hi = Math.max(...vals);
    const iso = x => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
    const cel = ds => {
      const d = dIdx.get(ds); if(d === undefined || diff[d] == null) return `<td class="x"></td>`;
      const t = (diff[d] - lo) / ((hi - lo) || 1), rel = Math.exp(diff[d] - M[g].wdNorm[wd[d]]) - 1;
      return `<td style="background:color-mix(in srgb, #DE4F3F ${Math.round(t * 100)}%, #FFF1A8)" data-tip="<span class='t-k'>${esc(g)} · ${dKort(ds)}</span>Gemiddelde renner: <b>${fmt(Math.exp(diff[d]))}</b><br><span class='t-s'>${Math.abs(rel) < .05 ? "normaal" : pctTxt(rel) + (rel > 0 ? " zwaarder" : " lichter")} voor een ${DAGEN_LANG[wd[d]]}</span>">${fmt(Math.exp(diff[d]))}</td>`;
    };
    const rel = dates.map((_, d) => diff[d] == null ? null : { d, f:Math.exp(diff[d] - M[g].wdNorm[wd[d]]) }).filter(Boolean).sort((a, b) => b.f - a.f);
    kalEl.innerHTML = `<h2>Puzzelkalender</h2>
      <p class="toel">Hoe zwaar was elke puzzel? Het getal is de tijd die een gemiddelde renner nodig had, de kleur loopt van licht (makkelijk) naar rood (zwaar). Je ziet de week van maandag naar zondag zwaarder worden.</p>
      <div class="tabs" id="vmKalSpel" role="group" aria-label="Kies spel">${games.map(x => `<button data-g="${esc(x)}" aria-pressed="${x === g}">${trui(x, 16)} ${esc(x)}</button>`).join("")}</div>
      <div class="scroll"><table class="vm-kal"><thead><tr><th class="wk">week van</th>${DAGEN.map(d => `<th>${d}</th>`).join("")}</tr></thead><tbody>
      ${weken.slice().reverse().map(w => `<tr><th class="wk">${w.getDate()} ${MAANDEN[w.getMonth()]}</th>${DAGEN.map((_, i) => { const x = new Date(w); x.setDate(x.getDate() + i); return cel(iso(x)); }).join("")}</tr>`).join("")}
      </tbody></table></div>
      ${rel.length > 1 ? `<p class="conclusie">Zwaarste ${esc(g)} in verhouding tot de weekdag: <b>${dLang(dates[rel[0].d])}</b>, ${rel[0].f.toFixed(1).replace(".", ",")}× zo lang als normaal op een ${DAGEN_LANG[wd[rel[0].d]]}. Makkelijkste: ${dLang(dates[rel[rel.length - 1].d])}.</p>` : ""}`;
    kalEl.querySelectorAll("#vmKalSpel button").forEach(b => b.onclick = () => { kalSpel = b.dataset.g; renderPeloton(vormEl, kalEl); });
  }

  /* ===== WEETJE VAN DE DAG =====
     Elke detector kijkt naar één etappe (en alles daarvoor). Hoe zeldzamer hij in het verleden afging, hoe hoger hij scoort.
     Records per weekdag pas vanaf 3 eerdere keren die weekdag; "ooit"-records pas na 10 etappes. */
  const vorigeWd = d => { const r = []; for(let j = 0; j < d; j++) if(wd[j] === wd[d]) r.push(j); return r; };
  const enkel = e => e.winnaars.length === 1 ? e.winnaars[0] : null;
  const marge = e => e.rang.length > 1 && e.winnaars.length === 1 ? e.rang[1].t - e.rang[0].t : null;
  const spread = e => { const f = e.m.filter(p => e.full[p] != null).map(p => e.full[p]); return f.length >= 4 && f.length === e.m.length ? Math.max(...f) - Math.min(...f) : null; };
  const groepGem = e => mean(e.m.map(p => e.tot[p]));
  const ritWinsTot = (p, d) => E.slice(0, d + 1).filter(e => e.winnaars.includes(p)).length;
  const somTot = j => tijden.filter(r => r.d <= j).reduce((a, r) => a + r.t, 0);
  const DET = [
    { id:"zonder", cat:"Uitslag", naam:"Ritwinst zonder één spel te winnen", f:d => { const e = E[d], w = enkel(e); return w && e.gw[w] === 0 && e.gs.length >= 3 ? { tekst:`<b>${esc(w)}</b> wint de etappe zonder ook maar één spel te winnen.`, wie:w } : null; } },
    { id:"sweep", cat:"Uitslag", naam:"Alle spellen gewonnen", f:d => { const e = E[d], w = enkel(e); return w && e.gw[w] === e.gs.length && e.gs.length >= 3 ? { tekst:`<b>${esc(w)}</b> wint alle ${e.gs.length} spellen. Een solo van start tot finish.`, wie:w } : null; } },
    { id:"foto", cat:"Uitslag", naam:"Fotofinish: winst met 2 seconden of minder", f:d => { const e = E[d], m = marge(e); return m != null && m <= 2 ? { tekst:`Fotofinish! <b>${esc(e.winnaars[0])}</b> wint met ${sec(m)} voorsprong op ${esc(e.rang[1].p)}.`, wie:e.winnaars[0] } : null; } },
    { id:"gedeeld", cat:"Uitslag", naam:"Gedeelde ritzege", f:d => { const e = E[d]; return e.winnaars.length > 1 ? { tekst:`Dode race: <b>${esc(namen(e.winnaars))}</b> finishen in exact dezelfde tijd, ${fmt(e.rang[0].t)}.` } : null; } },
    { id:"marge", cat:"Uitslag", naam:"Grootste winstmarge ooit", min:10, f:d => { const m = marge(E[d]); if(m == null) return null; const oud = E.slice(0, d).map(marge).filter(x => x != null); if(!oud.length) return null; const ooit = Math.max(...oud); return m > ooit ? { tekst:`<b>${esc(E[d].winnaars[0])}</b> wint met ${fmt(m)} voorsprong. Nooit eerder won iemand zo ruim (vorig record: ${fmt(ooit)}).`, wie:E[d].winnaars[0] } : null; } },
    { id:"etWd", cat:"Records", naam:"Snelste etappe ooit op deze weekdag", f:d => { const v = vorigeWd(d); if(v.length < 3) return null; const nu = Object.entries(E[d].full).sort((a, b) => a[1] - b[1])[0]; if(!nu) return null; let oud = null; v.forEach(j => Object.entries(E[j].full).forEach(([p, t]) => { if(!oud || t < oud.t) oud = { p, t, j }; })); return oud && nu[1] < oud.t ? { tekst:`Snelste ${DAGEN_LANG[wd[d]]}-etappe ooit: <b>${esc(nu[0])}</b> in ${fmt(nu[1])}. Het oude record (${fmt(oud.t)}) was van ${esc(oud.p)}, ${dKort(dates[oud.j])}.`, wie:nu[0] } : null; } },
    { id:"etOoit", cat:"Records", naam:"Snelste etappe aller tijden", min:10, f:d => { const nu = Object.entries(E[d].full).sort((a, b) => a[1] - b[1])[0]; if(!nu) return null; const oud = Math.min(...E.slice(0, d).flatMap(x => Object.values(x.full))); return nu[1] < oud ? { tekst:`Snelste etappe aller tijden: <b>${esc(nu[0])}</b> in ${fmt(nu[1])}.`, wie:nu[0] } : null; } },
    { id:"grSnel", cat:"Records", naam:"Snelste groepsdag ooit op deze weekdag", f:d => { const v = vorigeWd(d); if(v.length < 3) return null; const g0 = groepGem(E[d]), oud = Math.min(...v.map(j => groepGem(E[j]))); return g0 < oud ? { tekst:`Nooit reed het peloton zo snel op een ${DAGEN_LANG[wd[d]]}: gemiddeld ${fmt(g0)} per renner (vorige beste ${fmt(oud)}).` } : null; } },
    { id:"grTraag", cat:"Records", naam:"Traagste groepsdag ooit op deze weekdag", f:d => { const v = vorigeWd(d); if(v.length < 3) return null; const g0 = groepGem(E[d]), oud = Math.max(...v.map(j => groepGem(E[j]))); return g0 > oud ? { tekst:`Zwaarste ${DAGEN_LANG[wd[d]]} ooit voor het peloton: gemiddeld ${fmt(g0)} per renner. De bezemwagen maakte overuren.` } : null; } },
    { id:"spWd", cat:"Records", naam:"Spelrecord voor deze weekdag", f:d => { const v = vorigeWd(d); let b = null; E[d].gs.forEach(g => { const vg = v.filter(j => raw[g][j]); if(vg.length < 3) return; const oud = Math.min(...vg.flatMap(j => Object.values(raw[g][j]))), nu = Math.min(...Object.values(raw[g][d])); if(nu < oud && (!b || nu / oud < b.f)) b = { g, nu, oud, f:nu / oud, wie:E[d].spelWinnaars[g] }; }); return b ? { tekst:`Snelste ${DAGEN_LANG[wd[d]]}-${esc(b.g)} ooit: <b>${esc(namen(b.wie))}</b> in ${fmt(b.nu)} (oud record ${fmt(b.oud)}).`, wie:b.wie[0] } : null; } },
    { id:"spOoit", cat:"Records", naam:"Spelrecord aller tijden", min:10, f:d => { let r = null; E[d].gs.forEach(g => { const eerder = raw[g].slice(0, d).filter(Boolean).flatMap(v => Object.values(v)); if(!eerder.length) return; const nu = Math.min(...Object.values(raw[g][d])); if(nu < Math.min(...eerder)) r = { tekst:`Groepsrecord aller tijden in ${esc(g)}: <b>${esc(namen(E[d].spelWinnaars[g]))}</b> in ${sec(nu)}.`, wie:E[d].spelWinnaars[g][0] }; }); return r; } },
    { id:"pr", cat:"Records", naam:"Persoonlijk record op deze weekdag", f:d => { const v = vorigeWd(d), wie = []; Object.entries(E[d].full).forEach(([p, t]) => { const oud = v.map(j => E[j].full[p]).filter(x => x != null); if(oud.length >= 3 && t < Math.min(...oud)) wie.push(`${esc(p)} (${fmt(t)})`); }); return wie.length ? { tekst:`Persoonlijk ${DAGEN_LANG[wd[d]]}record voor <b>${namen(wie)}</b>.` } : null; } },
    { id:"watt", cat:"Tegen de puzzel", naam:"Hoogste vermogen ooit in één spel", min:10, f:d => { let nu = null; E[d].gs.forEach(g => E[d].m.forEach(p => { const s = M[g].score[p][d]; if(s && !s.straf && (!nu || s.watt > nu.watt)) nu = { ...s, p }; })); if(!nu) return null; let oud = 0; for(let j = 0; j < d; j++) E[j].gs.forEach(g => E[j].m.forEach(p => { const s = M[g].score[p][j]; if(s && !s.straf) oud = Math.max(oud, s.watt); })); return nu.watt > oud ? { tekst:`<b>${esc(nu.p)}</b> trapt ${Math.round(nu.watt)} W in ${esc(nu.g)}: ${fmt(nu.t)} waar een gemiddelde renner ${fmt(nu.norm)} nodig had. Het hoogste vermogen ooit gemeten.`, wie:nu.p } : null; } },
    { id:"dagWatt", cat:"Tegen de puzzel", naam:"Beste etappe ooit tegen de puzzel", min:10, f:d => { const nu = E[d].m.map(p => ({ p, c:comb[p][d] })).filter(x => x.c && !x.c.straf).sort((a, b) => b.c.watt - a.c.watt)[0]; if(!nu) return null; let oud = 0; for(let j = 0; j < d; j++) players.forEach(p => { const c = comb[p][j]; if(c && !c.straf) oud = Math.max(oud, c.watt); }); return nu.c.watt > oud ? { tekst:`<b>${esc(nu.p)}</b> rijdt de sterkste etappe ooit: ${Math.round(nu.c.watt)} W gemiddeld over alle spellen.`, wie:nu.p } : null; } },
    { id:"zwaar", cat:"Tegen de puzzel", naam:"Zwaarste puzzel ooit voor deze weekdag", f:d => { const v = vorigeWd(d); let b = null; E[d].gs.forEach(g => { const oud = v.map(j => M[g].diff[j]).filter(x => x != null); if(oud.length < 3) return; const nu = M[g].diff[d]; if(nu > Math.max(...oud)){ const f = Math.exp(nu - mean(oud)); if(!b || f > b.f) b = { g, f }; } }); return b ? { tekst:`De ${esc(b.g)} van vandaag was de zwaarste ${DAGEN_LANG[wd[d]]}-${esc(b.g)} ooit: <b>${b.f.toFixed(1).replace(".", ",")}×</b> zo lang als een gewone ${DAGEN_LANG[wd[d]]}.` } : null; } },
    { id:"licht", cat:"Tegen de puzzel", naam:"Makkelijkste puzzel ooit voor deze weekdag", f:d => { const v = vorigeWd(d); let b = null; E[d].gs.forEach(g => { const oud = v.map(j => M[g].diff[j]).filter(x => x != null); if(oud.length < 3) return; const nu = M[g].diff[d]; if(nu < Math.min(...oud)){ const f = 1 - Math.exp(nu - mean(oud)); if(!b || f > b.f) b = { g, f }; } }); return b ? { tekst:`Cadeautje: de makkelijkste ${DAGEN_LANG[wd[d]]}-${esc(b.g)} ooit, ${pctTxt(b.f)} sneller op te lossen dan normaal.` } : null; } },
    { id:"boven", cat:"Tegen de puzzel", naam:"Hele peloton boven de eigen vorm", f:d => { const e = E[d]; if(e.m.length < 4 || e.straf.length) return null; return e.m.every(p => { const c = comb[p][d], v = d ? vorm(p, ETAPPE, d - 1) : null; return c && v && v.n >= 5 && c.r < v.r; }) ? { tekst:`Iedereen reed vandaag boven de eigen vorm. Een collectieve topdag.` } : null; } },
    { id:"l2e", cat:"Wendingen", naam:"Gisteren laatste, vandaag winnaar", f:d => { if(!d) return null; const w = enkel(E[d]), v = E[d - 1]; if(!w || v.rang.length < 4) return null; const laatst = v.rang[v.rang.length - 1].pos; return v.rang.some(r => r.p === w && r.pos === laatst) ? { tekst:`Van de rode lantaarn naar de bloemen: <b>${esc(w)}</b> werd gisteren laatste en wint vandaag.`, wie:w } : null; } },
    { id:"e2l", cat:"Wendingen", naam:"Gisteren winnaar, vandaag laatste", f:d => { if(!d) return null; const e = E[d], w = enkel(E[d - 1]); if(!w || e.rang.length < 4) return null; const l = e.rang[e.rang.length - 1]; return l.p === w && e.rang.filter(r => r.pos === l.pos).length === 1 ? { tekst:`Hoogmoed komt voor de val: winnaar van gisteren <b>${esc(w)}</b> wordt vandaag laatste.`, wie:w } : null; } },
    { id:"omgekeerd", cat:"Wendingen", naam:"Uitslag precies omgekeerd t.o.v. gisteren", f:d => { if(!d) return null; const a = E[d].rang, b = E[d - 1].rang; if(a.length < 4 || a.length !== b.length || new Set(a.map(r => r.pos)).size !== a.length || new Set(b.map(r => r.pos)).size !== b.length) return null; return a.every((r, i) => r.p === b[b.length - 1 - i].p) ? { tekst:`De uitslag is precies het spiegelbeeld van gisteren. Eerste werd laatste, laatste werd eerste.` } : null; } },
    { id:"comeback", cat:"Wendingen", naam:"Winst na een gemiste dag", f:d => { if(!d) return null; const w = enkel(E[d]); return w && E[d - 1].straf.includes(w) ? { tekst:`<b>${esc(w)}</b> miste gisteren nog een spel, en wint vandaag de etappe.`, wie:w } : null; } },
    { id:"pech", cat:"Wendingen", naam:"Snelst in twee spellen, toch geen podium", f:d => { const e = E[d], r = e.rang.find(x => x.pos > 3 && e.gw[x.p] >= 2); return r ? { tekst:`Pech voor <b>${esc(r.p)}</b>: snelste in ${e.gw[r.p]} spellen, en toch maar ${r.pos}e.`, wie:r.p } : null; } },
    { id:"lantaarn", cat:"Wendingen", naam:"Rode lantaarn van de Tour wint de etappe", f:d => { const e = E[d], w = enkel(e); if(!w || e.tourNr < 3) return null; const gc = E[d - 1].gc; return gc.length >= 4 && gc[gc.length - 1].p === w ? { tekst:`De rode lantaarn van de Tour, <b>${esc(w)}</b>, wint de etappe. Er is nog hoop.`, wie:w } : null; } },
    { id:"geelLaatst", cat:"Wendingen", naam:"Gele trui wordt laatste in de etappe", f:d => { const e = E[d]; if(e.tourNr < 3 || e.rang.length < 4) return null; const geel = E[d - 1].gc[0].p, l = e.rang[e.rang.length - 1]; return l.p === geel ? { tekst:`Inzinking in het geel: Tourleider <b>${esc(geel)}</b> wordt vandaag laatste.`, wie:geel } : null; } },
    { id:"geel", cat:"Klassement", naam:"Gele trui wisselt van drager", f:d => { const e = E[d]; if(e.tourNr < 2) return null; const oud = E[d - 1].gc[0].p, nu = e.gc[0].p; if(oud === nu) return null; let n = 0; for(let j = d - e.tourNr + 2; j <= d; j++) if(E[j].gc[0].p !== E[j - 1].gc[0].p) n++; return { tekst:`<b>${esc(nu)}</b> pakt het geel van ${esc(oud)}. Wissel nummer ${n} in deze Tour.`, wie:nu }; } },
    { id:"reeks", cat:"Reeksen", naam:"Drie of meer ritzeges op rij", f:d => { const w = enkel(E[d]); if(!w) return null; let n = 1; for(let j = d - 1; j >= 0 && E[j].winnaars.includes(w); j--) n++; return n >= 3 ? { tekst:`<b>${esc(w)}</b> wint voor de ${n}e keer op rij. Iemand moet hier iets aan doen.`, wie:w } : null; } },
    { id:"podium", cat:"Reeksen", naam:"Tien, vijftien, … podiumplaatsen op rij", f:d => { let b = null; E[d].rang.filter(r => r.pos <= 3).forEach(r => { let n = 0; for(let j = d; j >= 0 && E[j].rang.some(x => x.p === r.p && x.pos <= 3); j--) n++; if(n >= 10 && n % 5 === 0 && (!b || n > b.n)) b = { p:r.p, n }; }); return b ? { tekst:`<b>${esc(b.p)}</b> staat voor de ${b.n}e dag op rij op het podium.`, wie:b.p } : null; } },
    { id:"anders", cat:"Reeksen", naam:"Vijf verschillende winnaars in vijf dagen", f:d => { if(d < 4) return null; const w = E.slice(d - 4, d + 1).map(enkel); return w.every(Boolean) && new Set(w).size === 5 ? { tekst:`Vijf etappes, vijf verschillende winnaars: ${esc(namen(w))}. Open koers!` } : null; } },
    { id:"opkomst", cat:"Reeksen", naam:"Mijlpaal volledige opkomst (elke 5 dagen)", f:d => { let n = 0; for(let j = d; j >= 0 && !E[j].straf.length; j--) n++; return n >= 5 && n % 5 === 0 ? { tekst:`Al ${n} etappes op rij heeft iedereen alles gespeeld. Er zijn is een kwaliteit.` } : null; } },
    { id:"eersteWin", cat:"Mijlpalen", naam:"Eerste ritzege ooit", min:5, f:d => { const w = enkel(E[d]); return w && ritWinsTot(w, d) === 1 && dIdx.get(eerste[w]) < d ? { tekst:`Eindelijk! <b>${esc(w)}</b> wint de eerste etappe ooit, na ${d - dIdx.get(eerste[w])} dagen proberen.`, wie:w } : null; } },
    { id:"jubileum", cat:"Mijlpalen", naam:"Jubileum: 10e, 25e of 50e ritzege", f:d => { const w = enkel(E[d]); if(!w) return null; const n = ritWinsTot(w, d); return [10, 25, 50, 75, 100].includes(n) ? { tekst:`Jubileum: dit is ritzege nummer <b>${n}</b> voor ${esc(w)}.`, wie:w } : null; } },
    { id:"etJub", cat:"Mijlpalen", naam:"Jubileumetappe (elke 25)", f:d => (d + 1) % 25 === 0 ? { tekst:`Vandaag werd etappe nummer <b>${d + 1}</b> verreden sinds de start op ${dLang(dates[0])}.` } : null },
    { id:"uren", cat:"Mijlpalen", naam:"Weer 2 uur samen gepuzzeld", f:d => { const nu = somTot(d), oud = d ? somTot(d - 1) : 0; return Math.floor(nu / 7200) > Math.floor(oud / 7200) ? { tekst:`Samen hebben jullie nu <b>${Math.floor(nu / 3600)} uur</b> gepuzzeld. Genoeg voor een bergetappe in de echte Tour.` } : null; } },
    { id:"ieder", cat:"Kuriositeiten", naam:"Iedereen wint minstens één spel", f:d => { const e = E[d]; return e.m.length >= 4 && e.m.every(p => e.gw[p] >= 1) ? { tekst:`Eerlijk verdeeld: elke renner won vandaag minstens één spel.` } : null; } },
    { id:"allesGelijk", cat:"Kuriositeiten", naam:"Iedereen precies even snel in een spel", f:d => { const e = E[d], g = e.gs.find(g => { const v = Object.values(raw[g][d]); return v.length === e.m.length && v.length >= 3 && v.every(x => x === v[0]); }); return g ? { tekst:`Synchroonpuzzelen: iedereen deed ${esc(g)} in precies ${sec(raw[g][d][e.m[0]])}.` } : null; } },
    { id:"drie", cat:"Kuriositeiten", naam:"Drie of meer renners gedeeld snelst in een spel", f:d => { const e = E[d], g = e.gs.find(g => e.spelWinnaars[g].length >= 3); return g ? { tekst:`In ${esc(g)} deelden <b>${esc(namen(e.spelWinnaars[g]))}</b> de snelste tijd: ${sec(raw[g][d][e.spelWinnaars[g][0]])}.` } : null; } },
    { id:"tweeling", cat:"Kuriositeiten", naam:"Twee renners met exact dezelfde etappetijd", f:d => { const e = E[d], f = Object.entries(e.full); for(let i = 0; i < f.length; i++) for(let j = i + 1; j < f.length; j++) if(f[i][1] === f[j][1] && !(e.winnaars.includes(f[i][0]) && e.winnaars.includes(f[j][0]))) return { tekst:`Tweelingen: <b>${esc(f[i][0])}</b> en <b>${esc(f[j][0])}</b> hebben exact dezelfde etappetijd, ${fmt(f[i][1])}.` }; return null; } },
    { id:"flits", cat:"Kuriositeiten", naam:"Een spel in 3 seconden of sneller", f:d => { let b = null; E[d].gs.forEach(g => Object.entries(raw[g][d]).forEach(([p, t]) => { if(t <= 3 && (!b || t < b.t)) b = { p, g, t }; })); return b ? { tekst:`Flitsend: <b>${esc(b.p)}</b> deed ${esc(b.g)} in ${sec(b.t)}. Knipperen en je mist het.`, wie:b.p } : null; } },
    { id:"compact", cat:"Kuriositeiten", naam:"Kleinste verschil tussen eerste en laatste", min:10, f:d => { const s = spread(E[d]); if(s == null) return null; const oud = E.slice(0, d).map(spread).filter(x => x != null); return oud.length && s < Math.min(...oud) ? { tekst:`Het peloton bleef bij elkaar: maar ${fmt(s)} tussen de eerste en de laatste. Nog nooit zo klein.` } : null; } },
    { id:"uiteen", cat:"Kuriositeiten", naam:"Grootste verschil tussen eerste en laatste", min:10, f:d => { const s = spread(E[d]); if(s == null) return null; const oud = E.slice(0, d).map(spread).filter(x => x != null); return oud.length && s > Math.max(...oud) ? { tekst:`Het peloton spat uiteen: ${fmt(s)} tussen de eerste en de laatste. Nog nooit zo groot.` } : null; } },
    { id:"basis", cat:"Uitslag", naam:"Terugvaloptie: ritzege nummer zoveel", basis:true, f:d => { const e = E[d]; return e.winnaars.length ? { tekst:e.winnaars.length > 1 ? `<b>${esc(namen(e.winnaars))}</b> delen de winst, in ${fmt(e.rang[0].t)}.` : `<b>${esc(e.winnaars[0])}</b> pakt ritzege nummer ${ritWinsTot(e.winnaars[0], d)}, in ${fmt(e.rang[0].t)}.`, wie:e.winnaars[0] } : null; } }
  ];

  /* alle weetjes van een dag, zeldzaamste eerst */
  function weetjes(datum){
    const d = dIdx.get(datum);
    if(d === undefined) return [];
    return DET.map((det, k) => {
      const uit = AF[k] && AF[k][d]; if(!uit) return null;
      const eerder = AF[k].slice(0, d).filter(Boolean).length;
      return { det, ...uit, eerder, n:d + 1, score:det.basis ? -1 : Math.log((d + 1) / (eerder + 1)) };
    }).filter(Boolean).sort((a, b) => b.score - a.score);
  }
  const zeldTxt = w => w.det.basis ? "Een gewone dag in de Tour" : w.eerder === 0 ? `Voor het eerst in ${w.n} etappes` : `Pas de ${w.eerder + 1}e keer in ${w.n} etappes`;
  const zeldBalk = w => { const f = w.det.basis ? 0 : Math.min(1, w.score / Math.log(60)), n = Math.max(1, Math.round(f * 8)); return `<span class="vm-zeldmeter" aria-hidden="true">${[...Array(8)].map((_, i) => `<i class="${i < n ? "aan" : ""}" style="height:${6 + i * 1.6}px"></i>`).join("")}</span>`; };

  /* de kaart voor de Tour-pagina */
  function weetjeHtml(datum, voorlopig){
    const lijst = weetjes(datum); if(!lijst.length) return "";
    const top = lijst[0], rest = lijst.slice(1).filter(x => !x.det.basis).slice(0, 3);
    return `<div class="vm-weetje">
      <div class="vm-w-band"><span class="vm-w-label">Weetje van de dag</span><span class="vm-w-cat">${esc(top.det.cat)}${voorlopig ? " · voorlopig" : ""}</span></div>
      <p class="vm-w-tekst">${top.tekst}</p>
      <div class="vm-w-zeld"><span class="vm-pill ${top.eerder === 0 && !top.det.basis ? "vol" : ""}">${zeldTxt(top)}</span>${zeldBalk(top)}</div>
      ${rest.length ? `<details class="vm-ook"><summary>Ook vandaag (${rest.length})</summary>${rest.map(w => `<div class="vm-feit"><span class="ic" aria-hidden="true">◆</span><span>${w.tekst} <span class="vm-s">${zeldTxt(w)}.</span></span></div>`).join("")}</details>` : ""}
    </div>`;
  }
  /* voor de huldiging: alleen een echt bijzonder weetje, als platte tekst */
  function weetjeVoorHuldiging(datum){
    const top = weetjes(datum)[0];
    if(!top || top.det.basis) return null;
    return { tekst:top.tekst.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"'), zeld:zeldTxt(top), cat:top.det.cat, wie:top.wie || null };
  }

  window.Stat = { bereken, renderIk, renderPeloton, weetjeHtml, weetjeVoorHuldiging };
})();
