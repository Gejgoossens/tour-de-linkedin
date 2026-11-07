/* Instellingen voor Tour de LinkedIn. Aanpassen mag, het dashboard leest dit bij het laden. */
window.TOUR_CONFIG = {
  /* Web-app-URL van Apps Script (fase 2). Leeg = scores uit de CSV-bestanden hieronder. */
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbycVtt1JRE5cYHAta0fZI_qNhFE4HDe3ND9A3AjAm9UY3npjnDsMrMTxnWvLZMamcHptA/exec",

  /* CSV in lang formaat (Datum,Speler,Spel,Tijd,IngevoerdOp). De eerste die bestaat wordt gebruikt:
     "data/scores.csv" op GitHub Pages, "../data/scores.csv" lokaal vanuit de repo-map. */
  CSV_BRONNEN: ["data/scores.csv", "../data/scores.csv"],

  /* Gemist spel: langzaamste tijd van die dag voor dat spel + zoveel seconden. */
  STRAFSECONDEN: 10,

  /* true: een spel telt alleen als iedereen het speelde (oude Excel-regel). */
  ALLEEN_VOLLEDIG: false,

  /* Optioneel: dagen vóór deze datum (bijv. "2026-09-07") tellen niet mee. Leeg = alles telt. */
  START_DATUM: "",

  /* Volgorde van spellen en rugnummers. Onbekende spellen/spelers komen er vanzelf achteraan bij. */
  SPELLEN: ["Wend", "Patches", "Zip", "Tango", "Queens"], // volgorde zoals op de foto's in de groepsapp
  SPELERS: ["Matta", "Bouw", "Corne", "Jari", "Giyo", "Cas"]
};
