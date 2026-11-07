/* Invoerscherm: tijden van één speler voor één dag opslaan in de Google Sheet via Apps Script. */
(() => {
  const knop = document.getElementById("invoerKnop");
  if(!CFG.APPS_SCRIPT_URL) return; // zonder koppeling geen invoer; knop blijft verborgen
  knop.hidden = false;

  const CODE_SLEUTEL = "tdl-groepscode";
  const dlg = document.getElementById("invoer");
  const form = document.getElementById("invoerForm");
  const kiesSpeler = document.getElementById("inSpeler");
  const kiesDatum = document.getElementById("inDatum");
  const velden = document.getElementById("inTijden");
  const codeRij = document.getElementById("inCodeRij");
  const codeVeld = document.getElementById("inCode");
  const melding = document.getElementById("inMelding");
  const opslaan = document.getElementById("inOpslaan");
  let origineel = {};

  const leesCode = () => { try{ return localStorage.getItem(CODE_SLEUTEL) || ""; }catch(err){ return ""; } };
  const bewaarCode = c => { try{ c ? localStorage.setItem(CODE_SLEUTEL, c) : localStorage.removeItem(CODE_SLEUTEL); }catch(err){} };
  const vandaag = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const spellenLijst = () => alleSpellen.length ? alleSpellen : (CFG.SPELLEN || []);
  const actieveSpelers = () => spelerLijst.length ? spelerLijst.filter(s => s.Actief).map(s => s.Naam) : spelers;

  /* "32", "0:32" of "1:05" → seconden; leeg → null; onzin → NaN */
  function leesTijd(v){
    v = v.trim();
    if(!v) return null;
    let m = v.match(/^(\d+)$/);
    if(m) return Number(m[1]);
    m = v.match(/^(\d+)[:.](\d{1,2})$/);
    if(m && Number(m[2]) < 60) return Number(m[1]) * 60 + Number(m[2]);
    return NaN;
  }

  function toon(tekst, soort){
    melding.textContent = tekst;
    melding.className = "in-melding" + (soort ? " " + soort : "");
  }

  function vulVelden(){
    const datum = kiesDatum.value, speler = kiesSpeler.value;
    origineel = {};
    velden.innerHTML = spellenLijst().map(sp => {
      const t = tijdVan.get(`${datum}|${speler}|${sp}`);
      if(t !== undefined) origineel[sp] = t;
      const id = "in-" + sp.replace(/\W/g, "");
      return `<label class="in-tijd" for="${id}">${truiSvg(truiVoor(sp).kleur, 22)}<span>${esc(sp)}</span>
        <input id="${id}" data-spel="${esc(sp)}" inputmode="numeric" autocomplete="off" placeholder="–" value="${t !== undefined ? fmt(t) : ""}"></label>`;
    }).join("");
    const al = Object.keys(origineel).length;
    toon(al ? `${speler} heeft voor deze dag al ${al} ${al === 1 ? "tijd" : "tijden"}. Pas aan of maak een veld leeg om te wissen.` : "");
  }

  function vulSpelers(voorkeur){
    const lijst = actieveSpelers();
    kiesSpeler.innerHTML = lijst.map(p => `<option>${esc(p)}</option>`).join("");
    if(voorkeur && lijst.includes(voorkeur)) kiesSpeler.value = voorkeur;
  }

  /* eerstvolgende speler die op deze datum nog niets heeft */
  function volgendeSpeler(na){
    const lijst = actieveSpelers(), datum = kiesDatum.value;
    const leeg = p => !spellenLijst().some(sp => tijdVan.has(`${datum}|${p}|${sp}`));
    const i = lijst.indexOf(na);
    return [...lijst.slice(i + 1), ...lijst.slice(0, i + 1)].find(leeg);
  }

  knop.onclick = () => {
    vulSpelers(kiesSpeler.value);
    kiesDatum.max = vandaag();
    if(!kiesDatum.value || kiesDatum.value > kiesDatum.max) kiesDatum.value = vandaag();
    codeRij.hidden = !!leesCode();
    vulVelden();
    dlg.showModal();
    kiesSpeler.focus();
  };
  document.getElementById("inSluit").onclick = () => dlg.close();
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); });
  kiesSpeler.onchange = vulVelden;
  kiesDatum.onchange = vulVelden;

  form.onsubmit = async e => {
    e.preventDefault();
    const speler = kiesSpeler.value, datum = kiesDatum.value;
    if(!datum || datum > vandaag()) return toon("Kies een datum van vandaag of eerder.", "fout");

    const tijden = {};
    for(const inp of velden.querySelectorAll("input")){
      const sp = inp.dataset.spel, t = leesTijd(inp.value);
      inp.removeAttribute("aria-invalid");
      if(Number.isNaN(t) || (t !== null && (t < 1 || t > 3600))){
        inp.setAttribute("aria-invalid", "true");
        inp.focus();
        return toon(`${sp}: vul een tijd in als 32 of 0:32 (maximaal 60:00).`, "fout");
      }
      if(t === null && origineel[sp] !== undefined) tijden[sp] = null;
      else if(t !== null && t !== origineel[sp]) tijden[sp] = t;
    }
    if(!Object.keys(tijden).length) return toon(Object.keys(origineel).length ? "Er is niets veranderd." : "Vul minstens één tijd in.", "fout");

    const code = codeRij.hidden ? leesCode() : codeVeld.value.trim();
    if(!code){ codeRij.hidden = false; codeVeld.focus(); return toon("Vul de groepscode in.", "fout"); }

    opslaan.disabled = true;
    toon("Opslaan…");
    let antwoord;
    try{
      const r = await fetch(CFG.APPS_SCRIPT_URL, {
        method:"POST",
        headers:{ "Content-Type":"text/plain;charset=utf-8" }, // text/plain voorkomt een CORS-preflight
        body:JSON.stringify({ code, datum, speler, tijden })
      });
      antwoord = await r.json();
    }catch(err){
      console.error(err);
      antwoord = { ok:false, fout:"Geen verbinding met de Google Sheet. Probeer het opnieuw." };
    }
    opslaan.disabled = false;

    if(!antwoord.ok){
      if(antwoord.code === "groepscode"){ bewaarCode(""); codeVeld.value = ""; codeRij.hidden = false; codeVeld.focus(); }
      return toon(antwoord.fout || "Opslaan is mislukt.", "fout");
    }
    bewaarCode(code);
    codeRij.hidden = true;
    const delen = [];
    if(antwoord.opgeslagen) delen.push(`${antwoord.opgeslagen} ${antwoord.opgeslagen === 1 ? "tijd" : "tijden"} opgeslagen`);
    if(antwoord.gewist) delen.push(`${antwoord.gewist} gewist`);
    const klaar = `${speler}: ${delen.join(", ")}.`;

    toon(klaar + " Dashboard bijwerken…", "goed");
    await laad();
    const volgende = volgendeSpeler(speler);
    vulSpelers(volgende || speler);
    vulVelden();
    toon(volgende ? `${klaar} Nu ${volgende}?` : `${klaar} Iedereen heeft voor deze dag tijden.`, "goed");
    (velden.querySelector("input") || kiesSpeler).focus();
  };
})();
