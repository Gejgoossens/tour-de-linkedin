/* Huldiging over het hele scherm: per spel komen de renners met hun tijden over de streep,
   daarna wordt de rode lantaarn binnengehaald en staat de top 3 van de dagetappe op het podium.
   Elke scène blijft staan tot je zelf op Volgende tikt.
   Huldiging.speel(data, opEinde) met data = {
     kop, slot,
     spellen:[{ spel, trui, truiNaam, uitslag:[{ p, bib, kleur, t, pos, straf }] }],
     lantaarn:{ wie:[{ p, bib, kleur }], achter, grap, icoon } of null,
     podium:[{ p, bib, kleur, t, pos, gap }]  (alle renners, op volgorde) }
   Staat de winnaar op het podium, dan verschijnt de knop "Meer rook!": elke tik zet de rookmachines
   een stand hoger en laat de winnaar iets nieuws roepen. */
(() => {
  const RUSTIG = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DUUR = { spel:3.4, lantaarn:4.8, podium:7.4, weetje:4.2 };
  const ROEP = ["Wakker worden!", "Hup, doortrappen!", "Is het rustdag?", "Bel de bezemwagen!", "Bijna thuis!", "Nog één bocht!"];
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const fmt = sec => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const namen = a => a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " en " + a[a.length - 1];
  const uit = k => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

  let el, canvas, c, W = 0, H = 0, scenes = [], idx = 0, t0 = 0, raf = 0, data = null, opEinde = null, terug = null;
  let confetti = [], vorigeT = 0;

  /* Meer rook! Onze vaste kreet: de winnaar mag net zo vaak op de knop drukken als hij wil. */
  const ROOK_ROEP = ["Meer rook!", "Méér rook!", "Nog meer rook!", "MEER ROOK!!", "Ik zie het podium nog. Meer rook!",
    "Rookmachine op standje elf!", "Meer rook, ik heb gewonnen!", "Rookmelder? Nooit van gehoord. Meer rook!",
    "Wie staat er op één? Ik! Meer rook!", "Dit is geen mist, dit is winst!", "Bel de brandweer maar vast. Meer rook!",
    "Nóg. Meer. Rook.", "Ik heb gewonnen, dus: meer rook!", "Kan de bezemwagen ook roken? Meer rook!"];
  const ROOK_KNOP = ["Meer rook!", "Nog meer rook!", "En nog meer rook!", "NOG MEER ROOK!", "Dit kan rokeriger!", "MEER! ROOK!"];
  const ROOK_KLEUR = ["#E6E8EB", "#C9CED6", "#FFD300", "#F0525A", "#5AA2F0", "#4CC38A", "#F07A1A"];
  const lus = (lijst, n, vanaf) => n < lijst.length ? lijst[n] : lijst[vanaf + (n - lijst.length) % (lijst.length - vanaf)];
  let rook = [], rookNiveau = 0, rookTik = -9, rookKnop = null;
  const wolkjes = {};
  function wolkje(kl){
    if(wolkjes[kl]) return wolkjes[kl];
    const k = document.createElement("canvas"), g = k.getContext("2d"); k.width = k.height = 64;
    const v = g.createRadialGradient(32, 32, 2, 32, 32, 32);
    v.addColorStop(0, kl + "CC"); v.addColorStop(.55, kl + "55"); v.addColorStop(1, kl + "00");
    g.fillStyle = v; g.fillRect(0, 0, 64, 64);
    return wolkjes[kl] = k;
  }
  function rookKnopTekst(){
    rookKnop.innerHTML = `<span aria-hidden="true">&#128168;</span> ${esc(lus(ROOK_KNOP, rookNiveau, 3))}${rookNiveau ? ` <b>&times;${rookNiveau}</b>` : ""}`;
    rookKnop.style.setProperty("--n", Math.min(rookNiveau, 10));
  }
  function meerRook(){
    if(!rookKnop || rookKnop.hidden) return;
    rookNiveau++; rookTik = performance.now() / 1000;
    rookKnopTekst();
    rookKnop.classList.remove("pof"); void rookKnop.offsetWidth; rookKnop.classList.add("pof");
    if(!RUSTIG) for(let k = 0; k < 24; k++) pluim(2.2);
  }
  /* rookbronnen: eerst de twee machines naast het podium, daarna komt er per stand een bron bij */
  function rookBronnen(){
    const bw = Math.min(180, W * .24), zij = Math.min(W / 2 - 22, bw * 1.75);
    return [W / 2 - zij, W / 2 + zij, W * .05, W * .95, W * .3, W * .7, W * .5];
  }
  function pluim(kracht){
    const bronnen = rookBronnen(), n = Math.min(bronnen.length, 1 + rookNiveau), s = H / 300;
    const kleuren = Math.min(ROOK_KLEUR.length, rookNiveau < 3 ? 2 : rookNiveau);
    rook.push({ x:bronnen[Math.floor(Math.random() * n)] + (Math.random() - .5) * 16, y:H * .93,
      vx:(Math.random() - .5) * 46 * kracht, vy:-(34 + Math.random() * 60) * s * kracht, r:10 + Math.random() * 10,
      groei:(16 + Math.random() * 14 + rookNiveau * 2) * s, l:0, max:2.6 + Math.random() * 2.2,
      kl:ROOK_KLEUR[Math.floor(Math.random() * kleuren)] });
  }

  function bouw(){
    el = document.createElement("div");
    el.className = "huld"; el.hidden = true; el.tabIndex = -1;
    el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Huldiging van de etappe");
    el.innerHTML = `
      <div class="huld-boven">
        <div class="huld-balk" aria-hidden="true"></div>
        <div class="huld-kopregel"><p class="huld-kop"></p><button type="button" class="huld-sluit">Sluiten &times;</button></div>
        <h2 class="huld-titel"></h2>
      </div>
      <div class="huld-baan" title="Tik voor de volgende"><canvas aria-hidden="true"></canvas><button type="button" class="huld-rook" title="Meer rook!" hidden></button></div>
      <div class="huld-paneel"><div class="huld-inhoud" aria-live="polite"></div><button type="button" class="huld-verder"></button></div>`;
    document.body.appendChild(el);
    canvas = el.querySelector("canvas"); c = canvas.getContext("2d");
    el.querySelector(".huld-sluit").onclick = ev => { ev.stopPropagation(); stop(); };
    el.querySelector(".huld-baan").onclick = volgende;
    rookKnop = el.querySelector(".huld-rook");
    rookKnop.onclick = ev => { ev.stopPropagation(); meerRook(); };
    el.querySelector(".huld-verder").onclick = ev => { ev.stopPropagation(); volgende(); };
    el.addEventListener("keydown", ev => {
      if(ev.key === "Escape"){ ev.preventDefault(); stop(); }
      else if(ev.key === "ArrowRight"){ ev.preventDefault(); volgende(); }
      else if(ev.key === "r" || ev.key === "R"){ ev.preventDefault(); meerRook(); }
      else if(ev.key === "Tab"){
        ev.preventDefault();
        const knoppen = [el.querySelector(".huld-sluit"), rookKnop, el.querySelector(".huld-verder")].filter(k => !k.hidden);
        knoppen[(knoppen.indexOf(document.activeElement) + (ev.shiftKey ? knoppen.length - 1 : 1)) % knoppen.length].focus();
      }
    });
    new ResizeObserver(maat).observe(canvas);
  }

  function maat(){
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* ===== scènes opbouwen ===== */
  function maakScenes(d){
    const s = d.spellen.map(g => {
      const ts = g.uitslag.map(r => r.t), mn = Math.min(...ts), mx = Math.max(...ts);
      return { soort:"spel", duur:DUUR.spel, g, renners:g.uitslag.map((r, i) => ({
        ...r, a:.4 + .15 * (r.pos - 1) + 1.1 * ((r.t - mn) / ((mx - mn) || 1)), baan:i % 3, stop:Math.max(.08, .36 - .06 * i) })) };
    });
    if(d.lantaarn) s.push({ soort:"lantaarn", duur:DUUR.lantaarn });
    s.push({ soort:"podium", duur:DUUR.podium });
    if(d.weetje) s.push({ soort:"weetje", duur:DUUR.weetje });
    return s;
  }
  const PODIUM_A = { 3:.7, 2:2.0, 1:3.3 }, LAND = 1.25; // aankomst per trede, tijd tot de renner op de trede staat

  function start(i){
    idx = i; t0 = performance.now(); confetti = []; vorigeT = 0;
    rook = []; rookNiveau = 0; rookTik = -9; rookKnop.hidden = true; rookKnop.classList.remove("pof"); canvas.style.transform = "";
    const sc = scenes[i], titel = el.querySelector(".huld-titel"), paneel = el.querySelector(".huld-inhoud");
    if(sc.soort === "spel"){
      titel.innerHTML = `${sc.g.trui}<span>${esc(sc.g.spel)}</span>`;
      paneel.innerHTML = `<p class="huld-sub">${esc(sc.g.truiNaam)} · finishvolgorde</p>
        <ol class="huld-lijst">${sc.renners.map(r => `
          <li data-a="${r.a}" class="${r.pos === 1 ? "een" : ""}"><span class="pos">${r.pos}</span><i style="background:${r.kleur}"></i><span class="nm">${esc(r.p)}</span>${r.straf ? `<b class="straf">niet gespeeld</b>` : `<b>${fmt(r.t)}</b>`}</li>`).join("")}</ol>`;
    } else if(sc.soort === "lantaarn"){
      const l = data.lantaarn;
      titel.innerHTML = `<span class="rood">Rode lantaarn</span>`;
      paneel.innerHTML = `<div class="huld-lantaarn">
          <div data-a=".6">${l.icoon}</div>
          <div><p class="huld-groot" data-a=".9">${esc(namen(l.wie.map(r => r.p)))}</p>
            <p class="huld-sub" data-a="1.3">+${fmt(l.achter)} op de dagwinnaar</p>
            <p class="huld-grap" data-a="2.1">${esc(l.grap)}</p></div></div>`;
    } else if(sc.soort === "weetje"){
      const w = data.weetje;
      titel.innerHTML = `<span>Wist je dat…</span>`;
      paneel.innerHTML = `<p class="huld-sub" data-a=".3">Weetje van de dag · ${esc(w.cat)}</p>
        <p class="huld-weetje" data-a=".8">${esc(w.tekst)}</p>
        <p class="huld-zeld" data-a="1.8"><span>${esc(w.zeld)}</span></p>`;
    } else {
      titel.innerHTML = `<span>Dagetappe</span>`;
      const later = PODIUM_A[1] + LAND + .6;
      paneel.innerHTML = `<ol class="huld-lijst">${data.podium.map(r => `
          <li data-a="${r.pos <= 3 ? PODIUM_A[r.pos] + LAND : later + .12 * (r.pos - 4)}" class="${r.pos === 1 ? "een" : ""}"><span class="pos">${r.pos}</span><i style="background:${r.kleur}"></i><span class="nm">${esc(r.p)}${data.lantaarn && data.lantaarn.wie.some(w => w.p === r.p) ? ` <small class="rood">rode lantaarn</small>` : ""}</span><b>${r.pos === 1 ? fmt(r.t) : "+" + fmt(r.gap)}</b></li>`).join("")}</ol>
        <p class="huld-slot" data-a="${later + .8}">${esc(data.slot)}</p>`;
    }
    sc.onthul = [...paneel.querySelectorAll("[data-a]")].map(n => [n, Number(n.dataset.a)]);
    const verder = el.querySelector(".huld-verder"), na = scenes[i + 1];
    verder.classList.remove("klaar");
    verder.innerHTML = !na ? "Sluiten" : `Volgende: ${esc(na.soort === "spel" ? na.g.spel : na.soort === "lantaarn" ? "rode lantaarn" : na.soort === "weetje" ? "weetje van de dag" : "dagetappe")} <span aria-hidden="true">&#8250;</span>`;
    if(el.contains(document.activeElement)) verder.focus();
    el.querySelectorAll(".huld-balk b").forEach((b, k) => b.style.width = k < i ? "100%" : "0");
  }

  function volgende(){ idx < scenes.length - 1 ? start(idx + 1) : stop(); }

  function frame(nu){
    const sc = scenes[idx], u = Math.max(0, (nu - t0) / 1000);
    const ut = RUSTIG ? sc.duur : Math.min(u, sc.duur), t = nu / 1000;
    const dt = vorigeT ? Math.min(.05, t - vorigeT) : 0; vorigeT = t;
    if(W && H){
      if(sc.soort === "spel") tekenSpel(sc, ut, t);
      else if(sc.soort === "lantaarn") tekenLantaarn(ut, t);
      else if(sc.soort === "weetje") tekenWeetje(ut, t);
      else tekenPodium(ut, t, dt);
    }
    sc.onthul.forEach(([n, a]) => n.classList.toggle("in", ut >= a));
    if(ut >= sc.duur - .4) el.querySelector(".huld-verder").classList.add("klaar");
    const b = el.querySelectorAll(".huld-balk b")[idx];
    if(b) b.style.width = Math.min(100, u / sc.duur * 100) + "%";
    raf = requestAnimationFrame(frame);
  }

  /* ===== tekenen ===== */
  const schaal = () => Math.max(.72, Math.min(1.15, W / 900));
  const opties = (r, extra) => ({ trui:r.kleur, helm:"#2A2E36", frame:"#E9EAEC", huid:Fiets.HUID[r.bib % 4], naam:r.p, bib:r.bib, label:r.kleur, ...extra });

  function finish(xF, hor){
    const vak = 7;
    for(let y = hor, k = 0; y < H; y += vak, k++){
      c.fillStyle = k % 2 ? "#0B0C0E" : "#F2F3F5"; c.fillRect(xF - vak, y, vak, vak);
      c.fillStyle = k % 2 ? "#F2F3F5" : "#0B0C0E"; c.fillRect(xF, y, vak, vak);
    }
    const bw = Math.min(150, W * .32), by = Math.max(6, hor * .12);
    c.fillStyle = "#A3A9B3"; c.fillRect(xF - 2, by, 4, hor - by);
    c.fillStyle = "#14161A"; c.fillRect(xF - bw / 2, by, bw, 28);
    c.fillStyle = "#FFD300"; c.fillRect(xF - bw / 2, by + 28, bw, 4);
    c.fillStyle = "#F2F3F5"; c.font = `900 italic 20px "Barlow Condensed", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("FINISH", xF, by + 15); c.textAlign = "start";
  }

  function tekenSpel(sc, u, t){
    const hor = H * .42, xF = W * (W < 520 ? .38 : .45), v = W * .5, s0 = schaal();
    Fiets.decor(c, W, H, 0, hor, t);
    finish(xF, hor);
    const banen = [.2, .52, .84];
    const winnaar = sc.renners.find(r => r.pos === 1);
    sc.renners.map(r => {
      const s = s0 * (.82 + r.baan * .09), D = W * r.stop;
      const x = u < r.a ? xF + v * (u - r.a) : xF + D * (1 - Math.exp(-(u - r.a) * v / D));
      return { r, s, x, grond:hor + (H - hor) * banen[r.baan] + 12 * s };
    }).sort((a, b) => a.grond - b.grond).forEach(l => {
      if(l.x < -80 || l.x > W + 80) return;
      const binnen = u >= l.r.a;
      Fiets.renner(c, l.x, l.grond, l.s, l.x / (9 * l.s), l.x / (12 * l.s), opties(l.r, binnen
        ? { tekst:`${l.r.pos}  ${l.r.p.toUpperCase()}  ${l.r.straf ? "–" : fmt(l.r.t)}`, label:l.r.pos === 1 ? "#FFD300" : l.r.kleur }
        : {}));
    });
    const flits = u - winnaar.a;
    if(flits > 0 && flits < .25){ c.fillStyle = `rgba(255,255,255,${.22 * (1 - flits / .25)})`; c.fillRect(0, 0, W, H); }
  }

  function tekenLantaarn(u, t){
    const hor = H * .42, s0 = schaal(), l = data.lantaarn;
    Fiets.decor(c, W, H, 0, hor, t);
    c.fillStyle = "rgba(8,9,11,.35)"; c.fillRect(0, 0, W, H);
    /* roepende fans */
    [1.0, 1.7, 2.4].forEach((a, k) => {
      if(u < a) return;
      const tekst = ROEP[(l.grap.length + k * 2) % ROEP.length];
      const bx = W * (.18 + k * .3), by = hor - 62 - (k % 2) * 16;
      c.font = `800 italic 16px "Barlow Condensed", sans-serif`;
      const tw = c.measureText(tekst).width + 16, op = Math.min(1, (u - a) * 4);
      c.globalAlpha = op;
      c.fillStyle = "#F2F3F5"; c.beginPath(); c.roundRect ? c.roundRect(bx - tw / 2, by - 13, tw, 26, 6) : c.rect(bx - tw / 2, by - 13, tw, 26); c.fill();
      c.beginPath(); c.moveTo(bx - 4, by + 13); c.lineTo(bx + 4, by + 13); c.lineTo(bx - 2, by + 22); c.fill();
      c.fillStyle = "#14161A"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(tekst, bx, by + 1); c.textAlign = "start";
      c.globalAlpha = 1;
    });
    const p = uit(u / 3.4);
    l.wie.forEach((r, k) => {
      const s = s0 * (1 + k * .06), grond = hor + (H - hor) * (.55 + k * .25) + 12 * s;
      const x = W * (-.2 + .72 * p) - k * 70 * s + Math.sin(u * 4 + k) * 4 * s;
      const y = grond + Math.abs(Math.sin(u * 3 + k)) * 2 * s; // hobbelig
      Fiets.bezemwagen(c, x - 38 * s, y, s);
      Fiets.renner(c, x, y, s, u * 2.4 + k, x / (12 * s), opties(r, { lantaarn:true, tekst:`${r.p.toUpperCase()}  +${fmt(l.achter)}`, label:"#D7263D" }));
      /* zweetdruppels */
      for(let d = 0; d < 3; d++){
        const f = ((u * 1.4 + d / 3) % 1);
        c.fillStyle = `rgba(90,162,240,${.9 * (1 - f)})`;
        c.beginPath(); c.arc(x + 24 * s + f * 10 * s, y - 70 * s + f * 18 * s + d * 3, 2.2 * s, 0, 7); c.fill();
      }
    });
  }

  /* weetje: opstijgende vraag- en uitroeptekens, en de hoofdrolspeler fietst juichend het beeld in */
  function tekenWeetje(u, t){
    const hor = H * .42, s = schaal();
    Fiets.decor(c, W, H, 0, hor, t);
    c.fillStyle = "rgba(8,9,11,.45)"; c.fillRect(0, 0, W, H);
    c.font = `900 italic 34px "Barlow Condensed", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    for(let k = 0; k < 9; k++){
      const f = ((RUSTIG ? .5 : t * .22) + k / 9) % 1;
      c.fillStyle = `rgba(255,211,0,${(.55 * (1 - f)).toFixed(3)})`;
      c.fillText(k % 3 ? "?" : "!", W * (.08 + .84 * ((k * 37) % 100) / 100), hor + (H - hor) * .1 - f * hor * .9 + (H - hor) * .5);
    }
    c.textAlign = "start";
    const r = data.weetje.rij;
    if(r){
      const x = W * (-.15 + .65 * uit(u / 2.2)), grond = hor + (H - hor) * .62 + 12 * s;
      Fiets.renner(c, x, grond, s, u < 2.2 ? u * 2.4 : 2.2 * 2.4, x / (12 * s), opties(r, { juich:u > 2.4, label:"#FFD300", tekst:r.p.toUpperCase() }));
    }
  }

  function tekenPodium(u, t, dt){
    const hor = H * .42, s = schaal() * (W < 520 ? .95 : 1.05), cx = W / 2;
    Fiets.decor(c, W, H, 0, hor, t);
    c.fillStyle = "rgba(8,9,11,.4)"; c.fillRect(0, 0, W, H);
    const spot = c.createRadialGradient(cx, H * .55, 10, cx, H * .55, W * .45);
    spot.addColorStop(0, "rgba(255,211,0,.16)"); spot.addColorStop(1, "rgba(255,211,0,0)");
    c.fillStyle = spot; c.fillRect(0, 0, W, H);
    const bw = Math.max(80 * s, Math.min(180, W * .24)), vloer = H * .95, rh = H - hor;
    const hoog = { 1:rh * .44, 2:rh * .32, 3:rh * .22 }, bx = { 1:cx, 2:cx - bw, 3:cx + bw };
    const rijs = uit(u / .6);
    [2, 1, 3].forEach(p => {
      const h = hoog[p] * rijs, x = bx[p] - bw / 2;
      c.fillStyle = "#D9DCE0"; c.fillRect(x + 1, vloer - h, bw - 2, h);
      c.fillStyle = "#FFFFFF"; c.fillRect(x + 1, vloer - h, bw - 2, Math.min(h, 6));
      c.fillStyle = "rgba(0,0,0,.08)"; c.fillRect(x + bw - 12, vloer - h, 11, h);
      if(h > 30){
        c.fillStyle = p === 1 ? "#B08F00" : "#4A505A"; c.font = `900 italic ${Math.round(Math.min(hoog[p] * .55, 70))}px "Barlow Condensed", sans-serif`;
        c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(p, bx[p], vloer - h / 2 + 4); c.textAlign = "start";
      }
    });
    /* renners op de treden: rijden binnen, springen erop */
    const MEDAILLE = { 1:"#FFD300", 2:"#C9CED6", 3:"#C98A4B" };
    const getekend = [];
    [3, 2, 1].forEach(p => {
      const tier = data.podium.filter(r => r.pos === p), a = PODIUM_A[p];
      tier.forEach((r, k) => {
        const lu = u - a; if(lu < 0) return;
        const m = tier.length, ss = s * (m > 1 ? .8 : 1);
        const doelX = bx[p] + (k - (m - 1) / 2) * Math.min(bw / m, 70 * ss);
        const top = vloer - hoog[p];
        let x, y;
        if(lu < .9){ x = -60 + (doelX - 30 * ss + 60) * uit(lu / .9); y = vloer; }
        else if(lu < LAND){ const q = (lu - .9) / (LAND - .9); x = doelX - 30 * ss * (1 - q); y = vloer + (top - vloer) * q - Math.sin(q * Math.PI) * 34 * ss; }
        else { x = doelX; y = top; }
        getekend.push({ r, x, y, ss, p, staat:lu >= LAND, juich:p === 1 && lu > LAND + .3 });
      });
    });
    getekend.sort((a, b) => (a.staat === b.staat ? 0 : a.staat ? -1 : 1)).forEach(g => {
      Fiets.renner(c, g.x, g.y, g.ss, g.staat ? .6 : g.x / (9 * g.ss), g.x / (12 * g.ss), opties(g.r, {
        juich:g.juich, geel:g.p === 1 && g.staat, label:MEDAILLE[g.p],
        tekst:`${g.p}  ${g.r.p.toUpperCase()}  ${g.p === 1 ? fmt(g.r.t) : "+" + fmt(g.r.gap)}` }));
    });
    /* confetti zodra de winnaar staat */
    if(!RUSTIG && u > PODIUM_A[1] + LAND){
      if(confetti.length < 160) for(let k = 0; k < 6; k++) confetti.push({
        x:Math.random() * W, y:-10, vx:(Math.random() - .5) * 60, vy:60 + Math.random() * 90, r:Math.random() * 6, w:4 + Math.random() * 4,
        kl:["#FFD300","#F2F3F5","#F0525A","#5AA2F0","#4CC38A","#F07A1A"][Math.floor(Math.random() * 6)] });
      confetti.forEach(f => {
        f.x += f.vx * dt; f.y += f.vy * dt; f.r += dt * 6;
        if(f.y > H + 10){ f.y = -10; f.x = Math.random() * W; }
        c.save(); c.translate(f.x, f.y); c.rotate(f.r); c.fillStyle = f.kl; c.fillRect(-f.w / 2, -2, f.w, 4 * Math.abs(Math.cos(f.r))); c.restore();
      });
    }
    /* meer rook: de knop komt zodra de winnaar juicht */
    if(u > PODIUM_A[1] + LAND + .3 && rookKnop.hidden){ rookKnopTekst(); rookKnop.hidden = false; }
    if(rookNiveau) tekenRook(t, dt, s, getekend.filter(g => g.p === 1 && g.staat));
  }

  function tekenRook(t, dt, s, winnaars){
    const sinds = t - rookTik;
    if(!RUSTIG){
      /* de twee rookmachines naast het podium */
      rookBronnen().slice(0, 2).forEach((x, k) => {
        const r = k ? -1 : 1, y = H * .95;
        c.fillStyle = "#14161A"; c.fillRect(x - 13 * s, y - 14 * s, 26 * s, 14 * s);
        c.fillStyle = "#4A505A"; c.fillRect(x + r * 13 * s - (r < 0 ? 7 * s : 0), y - 12 * s, 7 * s, 6 * s);
        c.fillStyle = sinds < .4 ? "#F0525A" : "#4CC38A"; c.beginPath(); c.arc(x - r * 7 * s, y - 7 * s, 2 * s, 0, 7); c.fill();
      });
      const plafond = Math.min(460, 50 + rookNiveau * 32);
      for(let k = Math.random() < (10 + rookNiveau * 9) * dt % 1 ? 1 : 0, n = Math.floor((10 + rookNiveau * 9) * dt) + k; n > 0 && rook.length < plafond; n--) pluim(1);
      rook = rook.filter(p => (p.l += dt) < p.max);
      rook.forEach(p => {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - .6 * dt; p.vy *= 1 - .25 * dt; p.r += p.groei * dt;
        c.globalAlpha = Math.sin(Math.PI * Math.min(1, p.l / p.max)) * .6;
        c.drawImage(wolkje(p.kl), p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      });
      c.globalAlpha = 1;
      /* het podium dreunt even na bij elke tik */
      const dreun = sinds < .5 ? (1 - sinds / .5) * Math.min(9, 1 + rookNiveau) : 0;
      canvas.style.transform = dreun ? `translate(${(Math.sin(t * 71) * dreun).toFixed(1)}px,${(Math.cos(t * 89) * dreun).toFixed(1)}px)` : "";
    }
    /* de mist trekt dicht naarmate er vaker gedrukt wordt */
    const mist = Math.min(.62, (RUSTIG ? .08 : .045) * (rookNiveau - (RUSTIG ? 0 : 2)));
    if(mist > 0){ c.fillStyle = `rgba(226,229,233,${mist.toFixed(3)})`; c.fillRect(0, 0, W, H); }
    if(rookNiveau >= 8 && (RUSTIG || t % 1 < .6)){
      c.font = `900 italic 15px "Barlow Condensed", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
      const tw = c.measureText("ROOKMELDER GAAT AF").width + 18;
      c.fillStyle = "#D7263D"; c.fillRect(W / 2 - tw / 2, H - 26, tw, 20);
      c.fillStyle = "#FFFFFF"; c.fillText("ROOKMELDER GAAT AF", W / 2, H - 15); c.textAlign = "start";
    }
    /* de winnaar roept het uit */
    if(sinds < 2.4 && winnaars.length){
      const tekst = lus(ROOK_ROEP, rookNiveau - 1, 4);
      let px = 24; c.font = `900 italic ${px}px "Barlow Condensed", sans-serif`;
      while(px > 13 && c.measureText(tekst).width > W - 44) c.font = `900 italic ${--px}px "Barlow Condensed", sans-serif`;
      const tw = c.measureText(tekst).width + 22, bh = px + 16;
      const wx = winnaars.reduce((a, g) => a + g.x, 0) / winnaars.length;
      const bx = Math.max(tw / 2 + 6, Math.min(W - tw / 2 - 6, wx)), by = Math.max(62 + bh / 2, winnaars[0].y - 112 * winnaars[0].ss);
      const pop = RUSTIG ? 1 : Math.min(1, sinds * 7) * (1 + .12 * Math.max(0, 1 - sinds * 4));
      c.save(); c.translate(bx, by); c.scale(pop, pop); c.rotate(RUSTIG ? 0 : Math.sin(t * 9) * .02);
      c.globalAlpha = Math.min(1, (2.4 - sinds) * 4);
      c.fillStyle = "#FFD300"; c.beginPath(); c.roundRect ? c.roundRect(-tw / 2, -bh / 2, tw, bh, 8) : c.rect(-tw / 2, -bh / 2, tw, bh); c.fill();
      c.beginPath(); c.moveTo(wx - bx - 7, bh / 2 - 1); c.lineTo(wx - bx + 7, bh / 2 - 1); c.lineTo(wx - bx, bh / 2 + 11); c.fill();
      c.fillStyle = "#14161A"; c.textAlign = "center"; c.textBaseline = "middle"; c.fillText(tekst, 0, 1);
      c.restore(); c.textAlign = "start";
    }
  }

  /* ===== starten en stoppen ===== */
  function speel(d, klaar){
    if(!el) bouw();
    cancelAnimationFrame(raf);
    data = d; opEinde = klaar || null; scenes = maakScenes(d);
    terug = document.activeElement;
    el.querySelector(".huld-kop").textContent = d.kop;
    el.querySelector(".huld-balk").innerHTML = scenes.map(() => "<i><b></b></i>").join("");
    el.hidden = false; document.body.classList.add("huld-open");
    maat();
    start(0);
    el.querySelector(".huld-verder").focus();
    document.fonts.ready.then(() => { raf = requestAnimationFrame(frame); });
  }

  function stop(){
    if(!el || el.hidden) return;
    cancelAnimationFrame(raf);
    el.hidden = true; document.body.classList.remove("huld-open");
    if(terug && terug.focus) terug.focus();
    if(opEinde) opEinde();
  }

  window.Huldiging = { speel, stop, bezig:() => !!el && !el.hidden };
})();
