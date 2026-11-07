/* Instellingen voor Tour de LinkedIn. Aanpassen mag, het dashboard leest dit bij het laden. */
window.TOUR_CONFIG = {
  /* Web-app-URL van Apps Script (fase 2). Leeg = scores uit de CSV-bestanden hieronder. */
  APPS_SCRIPT_URL: "",

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
  SPELLEN: ["Wend", "Zip", "Patches", "Tango", "Queens"],
  SPELERS: ["Matta", "Bouw", "Corne", "Jari", "Giyo", "Cas"]
};
