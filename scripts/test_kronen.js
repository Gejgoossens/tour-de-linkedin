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
for(let d = 0; d < 7; d++){
  const D = K.DAGEN[d], t0 = Date.now(); let max = 0, raak = 0; const zw = [];
  for(let s = 1; s <= 30; s++){
    const a = Date.now(), p = K.genereerDag(d, K.hash(`test-${d}-${s}`));
    max = Math.max(max, Date.now() - a);
    if(telOplossingen(D.n, p.reg) !== 1){ console.log(`${D.naam} seed ${s}: niet uniek`); fout++; }
    if(!K.losOp(D.n, p.reg)){ console.log(`${D.naam} seed ${s}: niet zonder gokken oplosbaar`); fout++; }
    if(p.raak) raak++;
    zw.push(p.zwaarte);
  }
  zw.sort((a, b) => a - b);
  console.log(`${D.naam.padEnd(9)} ${D.n}×${D.n}  doel ${D.min}-${D.max}  raak ${raak}/30  zwaarte ${zw[0]}-${zw[29]} (mediaan ${zw[15]})  ${Date.now() - t0} ms, traagste ${max} ms`);
}
process.exit(fout ? 1 : 0);
