/* Fietsertje, bezemwagen en decor op een canvas; gedeeld door het peloton en de huldiging. */
(() => {
  const HUID = ["#E8B894","#D9A07A","#C68B63","#F0C8A8"];
  const PUBLIEK = ["#FFD300","#5AA2F0","#F0525A","#F2F3F5","#3FBF7F","#F07A1A","#B39DDB"];

  function renner(c, x, grond, s, hoek, wiel, o){
    const R = 12 * s, y = grond - R;
    const achter = [x - 21 * s, y], voor = [x + 21 * s, y];
    const bb = [x - 3 * s, y - 1 * s], zadel = [x - 10 * s, y - 23 * s], stuur = [x + 15 * s, y - 21 * s];
    c.lineWidth = 2 * s; c.strokeStyle = "#0B0C0E";
    [achter, voor].forEach(([wx, wy]) => {
      c.beginPath(); c.arc(wx, wy, R, 0, 7); c.stroke();
      c.save(); c.lineWidth = .7 * s; c.strokeStyle = "#5C6370";
      for(let k = 0; k < 4; k++){ const a = wiel + k * Math.PI / 4; c.beginPath(); c.moveTo(wx - Math.cos(a) * R, wy - Math.sin(a) * R); c.lineTo(wx + Math.cos(a) * R, wy + Math.sin(a) * R); c.stroke(); }
      c.restore();
    });
    c.strokeStyle = o.frame; c.lineWidth = 2.6 * s; c.lineJoin = "round"; c.lineCap = "round";
    c.beginPath(); c.moveTo(...achter); c.lineTo(...bb); c.lineTo(...zadel); c.lineTo(...achter);
    c.moveTo(...zadel); c.lineTo(...stuur); c.lineTo(...bb); c.moveTo(...stuur); c.lineTo(...voor);
    c.moveTo(...stuur); c.lineTo(stuur[0] + 5 * s, stuur[1] + 1 * s); c.lineTo(stuur[0] + 5 * s, stuur[1] + 6 * s);
    c.stroke();
    const heup = [x - 9 * s, y - 27 * s], L1 = 15 * s, L2 = 15 * s;
    const been = a => {
      const p = [bb[0] + Math.cos(a) * 7 * s, bb[1] + Math.sin(a) * 7 * s];
      const dx = p[0] - heup[0], dy = p[1] - heup[1], d = Math.min(Math.hypot(dx, dy), L1 + L2 - .01);
      const aa = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - aa * aa));
      const bx = heup[0] + aa * dx / d, by = heup[1] + aa * dy / d;
      const k1 = [bx - h * dy / d, by + h * dx / d], k2 = [bx + h * dy / d, by - h * dx / d];
      const knie = k1[0] > k2[0] ? k1 : k2;
      c.strokeStyle = "#111318"; c.lineWidth = 5.2 * s; c.beginPath(); c.moveTo(...heup); c.lineTo(...knie); c.stroke();
      c.strokeStyle = o.huid; c.lineWidth = 3.6 * s; c.beginPath(); c.moveTo(...knie); c.lineTo(...p); c.stroke();
      c.fillStyle = "#0B0C0E"; c.fillRect(p[0] - 3 * s, p[1] - 1 * s, 6 * s, 2.4 * s);
    };
    been(hoek + Math.PI);
    const schouder = [x + 9 * s, y - 37 * s];
    c.strokeStyle = o.trui; c.lineWidth = 9 * s; c.beginPath(); c.moveTo(...heup); c.lineTo(...schouder); c.stroke();
    if(o.bol){ c.fillStyle = "#D7263D"; [[.3,0],[.55,1.5],[.8,-1]].forEach(([t, dd]) => { c.beginPath(); c.arc(heup[0] + (schouder[0] - heup[0]) * t, heup[1] + (schouder[1] - heup[1]) * t + dd * s, 1.5 * s, 0, 7); c.fill(); }); }
    been(hoek);
    if(o.juich){
      [[-4, -12, -6, -24], [7, -11, 11, -23]].forEach(([ex, ey, hx, hy]) => {
        const el = [schouder[0] + ex * s, schouder[1] + ey * s], hand = [schouder[0] + hx * s, schouder[1] + hy * s];
        c.strokeStyle = o.trui; c.lineWidth = 3.8 * s; c.beginPath(); c.moveTo(...schouder); c.lineTo(...el); c.stroke();
        c.strokeStyle = o.huid; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(...el); c.lineTo(...hand); c.stroke();
      });
    } else {
      c.strokeStyle = o.trui; c.lineWidth = 3.8 * s; c.beginPath(); c.moveTo(...schouder); c.lineTo(schouder[0] + 6 * s, schouder[1] + 8 * s); c.stroke();
      c.strokeStyle = o.huid; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(schouder[0] + 6 * s, schouder[1] + 8 * s); c.lineTo(stuur[0] + 4 * s, stuur[1] + 1 * s); c.stroke();
    }
    const hoofd = [x + 15 * s, y - 43 * s];
    c.fillStyle = o.huid; c.beginPath(); c.arc(...hoofd, 4.6 * s, 0, 7); c.fill();
    c.fillStyle = o.helm; c.beginPath(); c.ellipse(hoofd[0] - 1 * s, hoofd[1] - 2.2 * s, 6.4 * s, 4 * s, -.25, Math.PI, 2 * Math.PI); c.fill();
    /* naambordje */
    if(o.zonderBord) return;
    const fs = Math.round(12 * Math.max(.85, s));
    c.font = `700 ${fs}px "Barlow Condensed", "Arial Narrow", sans-serif`;
    const tekst = o.tekst || `${o.bib}  ${o.naam.toUpperCase()}`, tw = c.measureText(tekst).width + 12, th = fs + 5;
    const tx = hoofd[0] - tw / 2, ty = hoofd[1] - 15 * s - th;
    c.fillStyle = "rgba(15,17,21,.88)"; c.fillRect(tx, ty, tw, th);
    c.fillStyle = o.geel ? "#FFD300" : o.label; c.fillRect(tx, ty, 3, th);
    c.fillStyle = "#F2F3F5"; c.textBaseline = "middle"; c.fillText(tekst, tx + 7, ty + th / 2 + 1);
    if(o.lantaarn){ c.fillStyle = "#D7263D"; c.fillRect(tx + tw + 3, ty + 2, 6, th - 4); c.fillStyle = "#A3A9B3"; c.fillRect(tx + tw + 2, ty, 8, 2); }
  }

  function bezemwagen(c, x, grond, s){
    const h = 26 * s, w = 62 * s, y = grond - h - 5 * s;
    c.fillStyle = "#E9EAEC"; c.fillRect(x - w, y, w * .72, h);
    c.beginPath(); c.moveTo(x - w * .28, y + 4 * s); c.lineTo(x - w * .1, y + 4 * s); c.lineTo(x, y + h * .55); c.lineTo(x, y + h); c.lineTo(x - w * .28, y + h); c.closePath(); c.fill();
    c.fillStyle = "#5AA2F0"; c.beginPath(); c.moveTo(x - w * .25, y + 7 * s); c.lineTo(x - w * .12, y + 7 * s); c.lineTo(x - w * .03, y + h * .5); c.lineTo(x - w * .25, y + h * .5); c.closePath(); c.fill();
    c.fillStyle = "#FFD300"; c.fillRect(x - w * .95, y + 4 * s, w * .62, h * .55);
    c.fillStyle = "#14161A"; c.font = `800 ${Math.round(9 * s + 2)}px "Barlow Condensed", sans-serif`; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("BEZEMWAGEN", x - w * .64, y + 4 * s + h * .28); c.textAlign = "start";
    c.fillStyle = "#0B0C0E";
    [x - w * .75, x - w * .18].forEach(wx => { c.beginPath(); c.arc(wx, grond - 5 * s, 6 * s, 0, 7); c.fill(); });
  }

  function decor(c, W, H, off, horizon, t){
    const g = c.createLinearGradient(0, 0, 0, horizon);
    g.addColorStop(0, "#0F1217"); g.addColorStop(.7, "#1B2230"); g.addColorStop(1, "#3B3330");
    c.fillStyle = g; c.fillRect(0, 0, W, horizon);
    const heuvel = (kleur, sp, amp, basis, f) => {
      c.fillStyle = kleur; c.beginPath(); c.moveTo(0, horizon);
      for(let x = 0; x <= W + 10; x += 10){ const wx = x + off * sp; c.lineTo(x, basis - amp * (Math.sin(wx * f) * .6 + Math.sin(wx * f * 2.3 + 1) * .3 + Math.sin(wx * f * 5.1) * .1)); }
      c.lineTo(W, horizon); c.closePath(); c.fill();
    };
    heuvel("#232A36", .08, 34, horizon - 40, .006);
    heuvel("#1A2029", .22, 20, horizon - 14, .011);
    const pubY = horizon - 4;
    for(let i = -2; i < W / 14 + 2; i++){
      const wi = Math.floor(off * .7 / 14) + i, px = i * 14 - (off * .7) % 14;
      const h = 12 + ((wi * 37) % 7 + 7) % 7, zwaai = Math.sin(t * 3.8 + wi) > .6;
      c.fillStyle = PUBLIEK[((wi * 7) % PUBLIEK.length + PUBLIEK.length) % PUBLIEK.length]; c.fillRect(px, pubY - h, 9, h);
      c.fillStyle = HUID[((wi % 4) + 4) % 4]; c.beginPath(); c.arc(px + 4.5, pubY - h - 4, 4, 0, 7); c.fill();
      if(zwaai && wi % 3 === 0){ c.strokeStyle = HUID[((wi % 4) + 4) % 4]; c.lineWidth = 2; c.beginPath(); c.moveTo(px + 8, pubY - h + 3); c.lineTo(px + 13, pubY - h - 9); c.stroke(); }
      if(wi % 9 === 0){ c.strokeStyle = "#A3A9B3"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(px + 2, pubY - h); c.lineTo(px + 2, pubY - h - 20); c.stroke(); c.fillStyle = wi % 2 ? "#FFD300" : "#F0525A"; c.fillRect(px + 2, pubY - h - 20, 12, 8); }
    }
    c.fillStyle = "#D9DCE0"; c.fillRect(0, horizon - 8, W, 8);
    for(let x = -(off % 60); x < W; x += 60){ c.fillStyle = "#F0525A"; c.fillRect(x, horizon - 8, 30, 8); }
    c.fillStyle = "#2B2E34"; c.fillRect(0, horizon, W, H - horizon);
    c.fillStyle = "#33363D"; c.fillRect(0, horizon, W, 4);
    c.fillStyle = "#E9EAEC";
    const mid = horizon + (H - horizon) * .5;
    for(let x = -(off % 80); x < W; x += 80) c.fillRect(x, mid, 40, 3);
  }

  window.Fiets = { renner, bezemwagen, decor, HUID };
})();
