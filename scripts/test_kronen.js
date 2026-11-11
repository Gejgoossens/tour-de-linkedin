/* Controleert de Kronen-generator: node scripts/test_kronen.js
   Elke puzzel moet zonder gokken oplosbaar zijn en precies één oplossing hebben. */
const K = require("../site/kronen-logica.js");

function telOplossingen(n, reg){
  let tel = 0; const kol = [], gk = new Set(), gr = new Set();
  (function zet(r){
    if(tel > 1) return;
    if(r === n){ tel++; return; }
    for(let c = 0; c < n; c++){
      const g = reg[r * n + c];
      if(gk.has(c) || gr.has(g) || (r && Math.abs(kol[r - 1] - c) <= 1)) continue;
      gk.add(c); gr.add(g); kol[r] = c; zet(r + 1); gk.delete(c); gr.delete(g);
    }
  })(0);
  return tel;
}

let fout = 0;
for(const n of [6, 7, 8, 9]){
  const t0 = Date.now(); let max = 0, som = 0; const tel = {};
  for(let s = 1; s <= 40; s++){
    const a = Date.now(), p = K.genereer(n, K.hash(`test-${n}-${s}`));
    max = Math.max(max, Date.now() - a);
    if(!p){ console.log(`n=${n} seed ${s}: geen puzzel`); fout++; continue; }
    if(telOplossingen(n, p.reg) !== 1){ console.log(`n=${n} seed ${s}: niet uniek`); fout++; }
    som += p.zwaarte; for(const k in p.tel) tel[k] = (tel[k] || 0) + p.tel[k];
  }
  console.log(`n=${n}: 40 puzzels in ${Date.now() - t0} ms (traagste ${max} ms), gem. zwaarte ${(som / 40).toFixed(1)}`, tel);
}
process.exit(fout ? 1 : 0);
