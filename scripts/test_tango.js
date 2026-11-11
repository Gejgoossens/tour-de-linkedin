/* Controleert de Tango-generator: node scripts/test_tango.js
   Elke puzzel moet zonder gokken oplosbaar zijn, precies één oplossing hebben en bij zijn weekdag passen. */
const T = require("../site/tango-logica.js");

function telOplossingen(p){
  const st = Uint8Array.from(p.giv); let tel = 0;
  (function zet(i){
    if(tel > 1) return;
    if(T.fouten(p.tekens, st).length) return;
    while(i < 36 && st[i]) i++;
    if(i === 36){ if(T.LIJNEN.every(L => L.filter(c => st[c] === 1).length === 3)) tel++; return; }
    for(const v of [1, 2]){ st[i] = v; zet(i + 1); }
    st[i] = 0;
  })(0);
  return tel;
}

const AANTAL = +process.argv[2] || 40;
let fout = 0;
for(let d = 0; d < 7; d++){
  const D = T.DAGEN[d], t0 = Date.now(); let max = 0, raak = 0; const zw = [], giv = [], tek = [], lijn = [];
  for(let s = 1; s <= AANTAL; s++){
    const a = Date.now(), p = T.genereerDag(d, T.hash(`test-${d}-${s}`));
    max = Math.max(max, Date.now() - a);
    if(!p){ console.log(`${D.naam} seed ${s}: geen puzzel`); fout++; continue; }
    if(telOplossingen(p) !== 1){ console.log(`${D.naam} seed ${s}: niet uniek`); fout++; }
    const r = T.losOp(p);
    if(!r || r.tel.gevolg){ console.log(`${D.naam} seed ${s}: niet zonder gokken oplosbaar`); fout++; }
    else if(r.opl.some((v, i) => v !== p.opl[i])){ console.log(`${D.naam} seed ${s}: andere oplossing`); fout++; }
    if(p.tekens.some(([a2, b]) => p.giv[a2] || p.giv[b])){ console.log(`${D.naam} seed ${s}: teken raakt een voorgevuld vakje`); fout++; }
    if(!p.raak){ console.log(`${D.naam} seed ${s}: past niet bij de dag`); fout++; }
    else raak++;
    zw.push(p.zwaarte); giv.push(p.giv.filter(v => v).length); tek.push(p.tekens.length); lijn.push(p.tel.lijn || 0);
  }
  const bereik = a => { a.sort((x, y) => x - y); return `${a[0]}-${a[a.length - 1]}`; };
  console.log(`${D.naam.padEnd(9)} raak ${raak}/${AANTAL}  voorgevuld ${bereik(giv)}  tekens ${bereik(tek)}  lijnstappen ${bereik(lijn)}  zwaarte ${bereik(zw)}  ${Date.now() - t0} ms, traagste ${max} ms`);
}
process.exit(fout ? 1 : 0);
