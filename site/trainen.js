/* Trainen: kiest tussen de trainingsspellen (Queens en Tango). Alleen het gekozen spel is in beeld
   en alleen daarvan loopt de klok. app.js roept toon() en verberg() aan bij het wisselen van weergave. */
(function(){
"use strict";
const SLEUTEL = "tdl-train-spel";
const SPELLEN = {
  queens: { vak:"speelQueens", api:() => window.Kronen },
  tango:  { vak:"speelTango",  api:() => window.Tango }
};
const knoppen = document.querySelectorAll("#speelKies [data-spel]");
if(!knoppen.length) return;

let spel = "queens", zichtbaar = false;
try{ const oud = localStorage.getItem(SLEUTEL); if(SPELLEN[oud]) spel = oud; }catch(err){}

function werkBij(){
  for(const naam in SPELLEN){
    const S = SPELLEN[naam], api = S.api(), aan = naam === spel;
    document.getElementById(S.vak).hidden = !aan;
    if(api) aan && zichtbaar ? api.toon() : api.verberg();
  }
  knoppen.forEach(b => b.setAttribute("aria-pressed", b.dataset.spel === spel));
}
knoppen.forEach(b => b.onclick = () => {
  spel = b.dataset.spel;
  try{ localStorage.setItem(SLEUTEL, spel); }catch(err){}
  werkBij();
});

window.Trainen = {
  toon(){ zichtbaar = true; werkBij(); },
  verberg(){ zichtbaar = false; werkBij(); }
};
})();
