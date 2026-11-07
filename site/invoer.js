/* Invoerscherm: tijden opslaan in de Google Sheet via Apps Script.
   Per spel (alle spelers tegelijk, zoals LinkedIn de uitslag per spel toont) of per speler (alle spellen). */
(() => {
  const knop = document.getElementById("invoerKnop");
  if(!CFG.APPS_SCRIPT_URL) return; // zonder koppeling geen invoer; knop blijft verborgen
  knop.hidden = false;

  const CODE_SLEUTEL = "tdl-groepscode", MODUS_SLEUTEL = "tdl-invoer-modus";
  const dlg = document.getElementById("invoer");
  const form = document.getElementById("invoerForm");
  const kies = document.getElementById("inKies");
  const kiesLabel = document.getElementById("inKiesLabel");
  const kiesDatum = document.getElementById("inDatum");
  const velden = document.getElementById("inTijden");
  const codeRij = document.getElementById("inCodeRij");
  const codeVeld = document.getElementById("inCode");
  const melding = document.getElementById("inMelding");
  const opslaan = document.getElementById("inOpslaan");
  let origineel = {};

  const lees = k => { try{ return localStorage.getItem(k) || ""; }catch(err){ return ""; } };
  const bewaar = (k, v) => { try{ v ? localStorage.setItem(k, v) : localStorage.removeItem(k); }catch(err){} };
  let modus = lees(MODUS_SLEUTEL) === "speler" ? "speler" : "spel";

  const vandaag = () => isoDatum(new Date());
  const spellenLijst = () => alleSpellen.length ? alleSpellen : (CFG.SPELLEN || []);
  const actieveSpelers = () => spelerLijst.length ? spelerLijst.filter(s => s.Actief).map(s => s.Naam) : spelers;
  const sleutel = (speler, spel) => `${kiesDatum.value}|${speler}|${spel}`;

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

  /* de rijen van het formulier: per spel één rij per speler, per speler één rij per spel */
  function rijen(){
    const k = kies.value;
    return modus === "spel"
      ? actieveSpelers().map(p => ({ speler:p, spel:k, label:p, icoon:`<span class="bib">${spelers.indexOf(p) + 1 || "–"}</span>` }))
      : spellenLijst().map(sp => ({ speler:k, spel:sp, label:sp, icoon:truiSvg(truiVoor(sp).kleur, 22) }));
  }

  function vulVelden(){
    origineel = {};
    velden.innerHTML = rijen().map((r, i) => {
      const t = tijdVan.get(sleutel(r.speler, r.spel));
      if(t !== undefined) origineel[r.speler + "|" + r.spel] = t;
      return `<label class="in-tijd" for="in-${i}">${r.icoon}<span>${esc(r.label)}</span>
        <input id="in-${i}" data-speler="${esc(r.speler)}" data-spel="${esc(r.spel)}" inputmode="numeric" autocomplete="off" placeholder="–" value="${t !== undefined ? fmt(t) : ""}"></label>`;
    }).join("");
    const al = Object.keys(origineel).length;
    toon(al ? `Er ${al === 1 ? "staat al 1 tijd" : `staan al ${al} tijden`} voor ${kies.value} op deze dag. Pas aan of maak een veld leeg om te wissen.` : "");
  }

  /* is deze keuze (spel of speler) op deze datum al compleet? */
  function compleet(k){
    return modus === "spel"
      ? actieveSpelers().filter(p => !eerste[p] || eerste[p] <= kiesDatum.value).every(p => tijdVan.has(sleutel(p, k)))
      : spellenLijst().some(sp => tijdVan.has(sleutel(k, sp)));
  }
  function volgende(na){
    const lijst = modus === "spel" ? spellenLijst() : actieveSpelers();
    const i = lijst.indexOf(na);
    return [...lijst.slice(i + 1), ...lijst.slice(0, i + 1)].find(k => !compleet(k));
  }

  function vulKeuze(voorkeur){
    const lijst = modus === "spel" ? spellenLijst() : actieveSpelers();
    kiesLabel.textContent = modus === "spel" ? "Spel" : "Speler";
    kies.innerHTML = lijst.map(k => `<option>${esc(k)}</option>`).join("");
    kies.value = voorkeur && lijst.includes(voorkeur) ? voorkeur : (lijst.find(k => !compleet(k)) || lijst[0]);
    document.querySelectorAll("#inModus button").forEach(b => b.setAttribute("aria-pressed", b.dataset.modus === modus));
    document.getElementById("inUitleg").textContent = modus === "spel"
      ? "Neem de uitslag van één spel over uit LinkedIn. Tijden als 32 of 0:32; niet gespeeld? Laat leeg."
      : "Tijden als 32 of 0:32. Niet gespeeld? Laat het veld leeg.";
  }

  document.querySelectorAll("#inModus button").forEach(b => b.onclick = () => {
    modus = b.dataset.modus; bewaar(MODUS_SLEUTEL, modus);
    vulKeuze(); vulVelden();
  });

  knop.onclick = () => {
    kiesDatum.max = vandaag();
    if(!kiesDatum.value || kiesDatum.value > kiesDatum.max) kiesDatum.value = vandaag();
    codeRij.hidden = !!lees(CODE_SLEUTEL);
    vulKeuze(kies.value);
    vulVelden();
    dlg.showModal();
    (velden.querySelector("input") || kies).focus();
  };
  document.getElementById("inSluit").onclick = () => dlg.close();
  dlg.addEventListener("click", e => { if(e.target === dlg) dlg.close(); });
  kies.onchange = vulVelden;
  kiesDatum.onchange = () => { vulKeuze(kies.value); vulVelden(); };

  form.onsubmit = async e => {
    e.preventDefault();
    const datum = kiesDatum.value, keuze = kies.value;
    if(!datum || datum > vandaag()) return toon("Kies een datum van vandaag of eerder.", "fout");

    const scores = [];
    for(const inp of velden.querySelectorAll("input")){
      const { speler, spel } = inp.dataset, t = leesTijd(inp.value), oud = origineel[speler + "|" + spel];
      inp.removeAttribute("aria-invalid");
      if(Number.isNaN(t) || (t !== null && (t < 1 || t > 3600))){
        inp.setAttribute("aria-invalid", "true");
        inp.focus();
        return toon(`${modus === "spel" ? speler : spel}: vul een tijd in als 32 of 0:32 (maximaal 60:00).`, "fout");
      }
      if(t === null && oud !== undefined) scores.push({ speler, spel, tijd:null });
      else if(t !== null && t !== oud) scores.push({ speler, spel, tijd:t });
    }
    if(!scores.length) return toon(Object.keys(origineel).length ? "Er is niets veranderd." : "Vul minstens één tijd in.", "fout");

    const code = codeRij.hidden ? lees(CODE_SLEUTEL) : codeVeld.value.trim();
    if(!code){ codeRij.hidden = false; codeVeld.focus(); return toon("Vul de groepscode in.", "fout"); }

    opslaan.disabled = true;
    toon("Opslaan…");
    let antwoord;
    try{
      const r = await fetch(CFG.APPS_SCRIPT_URL, {
        method:"POST",
        headers:{ "Content-Type":"text/plain;charset=utf-8" }, // text/plain voorkomt een CORS-preflight
        body:JSON.stringify({ code, datum, scores })
      });
      antwoord = await r.json();
    }catch(err){
      console.error(err);
      antwoord = { ok:false, fout:"Geen verbinding met de Google Sheet. Probeer het opnieuw." };
    }
    opslaan.disabled = false;

    if(!antwoord.ok){
      if(antwoord.code === "groepscode"){ bewaar(CODE_SLEUTEL, ""); codeVeld.value = ""; codeRij.hidden = false; codeVeld.focus(); }
      return toon(antwoord.fout || "Opslaan is mislukt.", "fout");
    }
    bewaar(CODE_SLEUTEL, code);
    codeRij.hidden = true;
    const delen = [];
    if(antwoord.opgeslagen) delen.push(`${antwoord.opgeslagen} ${antwoord.opgeslagen === 1 ? "tijd" : "tijden"} opgeslagen`);
    if(antwoord.gewist) delen.push(`${antwoord.gewist} gewist`);
    const klaar = `${keuze}: ${delen.join(", ")}.`;

    toon(klaar + " Dashboard bijwerken…", "goed");
    await laad();
    const nu = volgende(keuze);
    vulKeuze(nu || keuze);
    vulVelden();
    toon(nu ? `${klaar} Nu ${nu}?` : `${klaar} Alles is ingevuld voor deze dag.`, "goed");
    (velden.querySelector("input") || kies).focus();
  };
})();
