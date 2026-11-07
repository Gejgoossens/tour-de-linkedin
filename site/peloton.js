/* Bewegend peloton bovenaan het dashboard.
   Peloton.zet(renners) met renners = [{ naam, bib, kleur, gap, geel, bol, lantaarn, buiten }] op volgorde van het klassement.
   De renners rijden op volgorde, met onderlinge afstand naar hun achterstand. */
(() => {
  const canvas = document.getElementById("peloton");
  if(!canvas) return;
  const c = canvas.getContext("2d");
  const RUSTIG = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const { HUID } = Fiets;
  const renner = (...a) => Fiets.renner(c, ...a), bezemwagen = (...a) => Fiets.bezemwagen(c, ...a), decor = (...a) => Fiets.decor(c, W, H, ...a);
  let W = 0, H = 0, renners = [], loopt = false, vorige = 0, start = performance.now();


  /* doelposities: leider vooraan, de rest naar achterstand, drie rijbanen tegen overlap */
  function doelen(){
    const mee = renners.filter(r => !r.buiten);
    const maxGap = Math.max(1, ...mee.map(r => r.gap));
    const breed = W < 520;
    const voorste = breed ? .84 : .8, bereik = breed ? .6 : .56, minAfstand = breed ? .16 : .09;
    const laatsteInBaan = [null, null, null];
    mee.forEach((r, i) => {
      r.baan = i % 3;
      let x = voorste - bereik * Math.pow(r.gap / maxGap, .75);
      const vorige = laatsteInBaan[r.baan];
      if(vorige !== null) x = Math.min(x, vorige - minAfstand);
      r.doel = Math.max(.12, x);
      laatsteInBaan[r.baan] = r.doel;
    });
    renners.filter(r => r.buiten).forEach((r, i) => { r.baan = (mee.length + i) % 3; r.doel = .06; });
  }

  function maat(){
    const r = canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    doelen();
  }

  function frame(nu){
    const t = (nu - start) / 1000, dt = Math.min(.1, (nu - (vorige || nu)) / 1000); vorige = nu;
    const schaal = Math.max(.6, Math.min(1.15, W / 900));
    const horizon = H * .5, off = t * 140 * schaal;
    decor(off, horizon, t);
    const banen = [.2, .52, .84];
    const lijst = renners.map((r, i) => {
      r.x = r.x == null ? r.doel : r.x + (r.doel - r.x) * Math.min(1, dt * 1.6);
      const s = schaal * (.82 + r.baan * .09) * (W < 520 ? .82 : 1);
      return { r, s, grond: horizon + (H - horizon) * banen[r.baan] + 12 * s, x: W * (r.x + .012 * Math.sin(t * .6 + i * 1.7)) };
    }).sort((a, b) => a.grond - b.grond || a.x - b.x);
    const laatste = lijst.filter(l => !l.r.buiten).sort((a, b) => a.x - b.x)[0];
    if(laatste && laatste.x > 110) bezemwagen(laatste.x - 70 * laatste.s, laatste.grond, laatste.s);
    lijst.forEach((l, i) => renner(l.x, l.grond, l.s, t * 6.5 + i, -off / (12 * l.s), {
      trui: l.r.geel ? "#FFD300" : l.r.kleur, helm: l.r.geel ? "#FFD300" : "#2A2E36", frame: "#E9EAEC",
      huid: HUID[i % 4], naam: l.r.naam, bib: l.r.bib, label: l.r.kleur, geel: l.r.geel, bol: l.r.bol, lantaarn: l.r.lantaarn
    }));
    if(loopt && !RUSTIG) requestAnimationFrame(frame);
  }

  function zet(lijst){
    const oud = new Map(renners.map(r => [r.naam, r.x]));
    renners = lijst.map(r => ({ ...r, x: oud.get(r.naam) ?? null }));
    doelen();
    if(RUSTIG || !loopt) document.fonts.ready.then(() => frame(performance.now()));
  }

  maat();
  new ResizeObserver(() => { maat(); if(RUSTIG || !loopt) frame(performance.now()); }).observe(canvas);
  if(!RUSTIG){
    new IntersectionObserver(([e]) => {
      const was = loopt; loopt = e.isIntersecting && !document.hidden;
      if(loopt && !was){ vorige = 0; requestAnimationFrame(frame); }
    }).observe(canvas);
    document.addEventListener("visibilitychange", () => {
      if(document.hidden) loopt = false;
      else if(!loopt && canvas.getBoundingClientRect().bottom > 0){ loopt = true; vorige = 0; requestAnimationFrame(frame); }
    });
  }
  window.Peloton = { zet };
})();
