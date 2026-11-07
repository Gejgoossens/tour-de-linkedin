/* Huldiging over het hele scherm: per spel komen de renners met hun tijden over de streep,
   daarna wordt de rode lantaarn binnengehaald en staat de top 3 van de dagetappe op het podium.
   Elke scène blijft staan tot je zelf op Volgende tikt.
   Huldiging.speel(data, opEinde) met data = {
     kop, slot,
     spellen:[{ spel, trui, truiNaam, uitslag:[{ p, bib, kleur, t, pos, straf }] }],
     lantaarn:{ wie:[{ p, bib, kleur }], achter, grap, icoon } of null,
     podium:[{ p, bib, kleur, t, pos, gap }]  (alle renners, op volgorde) } */
(() => {
  const RUSTIG = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const DUUR = { spel:3.4, lantaarn:4.8, podium:7.4 };
  const ROEP = ["Wakker worden!", "Hup, doortrappen!", "Is het rustdag?", "Bel de bezemwagen!", "Bijna thuis!", "Nog één bocht!"];
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[ch]));
  const fmt = sec => { sec = Math.round(sec); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`; };
  const namen = a => a.length === 1 ? a[0] : a.slice(0, -1).join(", ") + " en " + a[a.length - 1];
  const uit = k => 1 - Math.pow(1 - Math.max(0, Math.min(1, k)), 3);

  let el, canvas, c, W = 0, H = 0, scenes = [], idx = 0, t0 = 0, raf = 0, data = null, opEinde = null, terug = null;
  let confetti = [], vorigeT = 0;

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
      <div class="huld-baan" title="Tik voor de volgende"><canvas aria-hidden="true"></canvas></div>
      <div class="huld-paneel"><div class="huld-inhoud" aria-live="polite"></div><button type="button" class="huld-verder"></button></div>`;
    document.body.appendChild(el);
    canvas = el.querySelector("canvas"); c = canvas.getContext("2d");
    el.querySelector(".huld-sluit").onclick = ev => { ev.stopPropagation(); stop(); };
    el.querySelector(".huld-baan").onclick = volgende;
    el.querySelector(".huld-verder").onclick = ev => { ev.stopPropagation(); volgende(); };
    el.addEventListener("keydown", ev => {
      if(ev.key === "Escape"){ ev.preventDefault(); stop(); }
      else if(ev.key === "ArrowRight"){ ev.preventDefault(); volgende(); }
      else if(ev.key === "Tab"){
        ev.preventDefault();
        const knoppen = [el.querySelector(".huld-sluit"), el.querySelector(".huld-verder")];
        knoppen[(knoppen.indexOf(document.activeElement) + 1) % 2].focus();
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
    return s;
  }
  const PODIUM_A = { 3:.7, 2:2.0, 1:3.3 }, LAND = 1.25; // aankomst per trede, tijd tot de renner op de trede staat

  function start(i){
    idx = i; t0 = performance.now(); confetti = []; vorigeT = 0;
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
    verder.innerHTML = !na ? "Sluiten" : `Volgende: ${esc(na.soort === "spel" ? na.g.spel : na.soort === "lantaarn" ? "rode lantaarn" : "dagetappe")} <span aria-hidden="true">&#8250;</span>`;
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
