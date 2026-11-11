# Setup: Google Sheet en Apps Script

Eenmalig, ongeveer 10 minuten. Je doet dit met het Google-account dat eigenaar wordt van de scores.

## 1. Sheet aanmaken

1. Ga naar <https://sheets.new>. Er opent een nieuwe, lege Google Sheet.
2. Geef hem een naam, bijvoorbeeld **Tour de LinkedIn**.

## 2. Script plakken

1. Kies in de Sheet **Extensies → Apps Script**. De script-editor opent.
2. Verwijder alles in `Code.gs` en plak de inhoud van [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Zet de tijdzone goed: klik op het tandwiel **Projectinstellingen** en vink
   **"appsscript.json"-manifestbestand weergeven in editor** aan. Open daarna `appsscript.json` in de editor en vervang de inhoud door [`apps-script/appsscript.json`](../apps-script/appsscript.json).
4. Klik op **Opslaan** (het diskette-icoon).

## 3. Scores importeren

1. Kies bovenaan in de editor de functie **`installeer`** en klik op **Uitvoeren**.
2. Google vraagt om toestemming. Kies je account. Bij "Google heeft deze app niet geverifieerd" klik je op **Geavanceerd → Ga naar … (onveilig)**. Dat is normaal voor een eigen script. Het script vraagt alleen toegang tot deze ene Sheet en tot het ophalen van de CSV van GitHub.
3. Het script maakt de tabs **Scores** en **Spelers** aan en haalt alle scores uit `data/scores.csv` op GitHub. In het uitvoeringslogboek staat hoeveel scores er zijn geïmporteerd.
4. Kijk in de Sheet: tab **Spelers** bevat Matta, Bouw, Corne, Jari, Giyo en Cas met hun startnummer en een vinkje bij **Actief**. Haal het vinkje weg bij iemand die stopt; die verdwijnt dan uit het invoerscherm maar blijft in de geschiedenis.

Het leeg tabblad "Blad1" mag je verwijderen.

## 4. Groepscode instellen

1. In de editor: **Projectinstellingen** (tandwiel) → onderaan **Scripteigenschappen** → **Scripteigenschap toevoegen**.
2. Eigenschap: `GROEPSCODE`, waarde: een code die je in de groepsapp deelt, bijvoorbeeld `gelekoers26`.
3. Klik op **Scripteigenschappen opslaan**.

De code staat alleen hier, niet in de repo. Wil je hem veranderen, pas dan alleen deze waarde aan. Iedereen moet de nieuwe code dan één keer opnieuw invullen.

## 5. Publiceren als web-app

1. Klik rechtsboven op **Implementeren → Nieuwe implementatie**.
2. Klik op het tandwiel naast "Type selecteren" en kies **Web-app**.
3. Vul in:
   - Beschrijving: `Tour de LinkedIn`
   - **Uitvoeren als: Ik**
   - **Wie heeft toegang: Iedereen**
4. Klik op **Implementeren** en kopieer de **web-app-URL** (eindigt op `/exec`).
5. Test hem: plak de URL met `?action=scores` erachter in je browser. Je ziet een lange lijst JSON die begint met `{"ok":true,"scores":[`.

## 6. Dashboard koppelen

Zet de URL in [`site/config.js`](../site/config.js):

```js
APPS_SCRIPT_URL: "https://script.google.com/macros/s/…/exec",
```

Commit en push. Na een minuut staat de knop **+ Scores invoeren** op het dashboard.

## Later het script aanpassen

Plak de nieuwe code in de editor en kies **Implementeren → Implementaties beheren → potloodje → Versie: Nieuwe versie → Implementeren**. Zo blijft de URL hetzelfde. Kies je "Nieuwe implementatie", dan krijg je een nieuwe URL en moet `config.js` mee.

### Bijwerken voor de Queens-training (eenmalig, november 2026)

De gedeelde uitslag van de Queens-training heeft de nieuwste `Code.gs` nodig. Zolang het script niet is bijgewerkt, werkt de training gewoon, maar ziet niemand elkaars tijden.

1. Open de Sheet en kies **Extensies → Apps Script**.
2. Verwijder alles in `Code.gs` en plak de inhoud van [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Kies **Implementeren → Implementaties beheren → potloodje → Versie: Nieuwe versie → Implementeren**.

Het tabblad **Training** maakt het script zelf aan bij het eerste resultaat. Tijden die al op een apparaat stonden, worden bij het volgende bezoek alsnog gedeeld (tot twee dagen terug).

### Bijwerken voor de Tango-training (eenmalig, november 2026)

De Tango-training deelt haar uitslag via hetzelfde tabblad **Training**, met een extra kolom `Spel`. Daarvoor moet het script nog één keer worden bijgewerkt, met dezelfde drie stappen als hierboven. Tot die tijd werkt de Tango-training gewoon, maar blijven de tijden op het eigen apparaat; daarna worden ze alsnog gedeeld (tot twee dagen terug). De Queens-training merkt niets van de overgang: rijen zonder `Spel` tellen als Queens.

## Goed om te weten

- **Invoeren** gaat het snelst **per spel**: open op LinkedIn de uitslag van één spel en neem de tijden van iedereen in één keer over. Met **per speler** vul je juist al je eigen spellen in.
- **Corrigeren** kan op twee manieren: in het invoerscherm (dezelfde datum en hetzelfde spel of dezelfde speler kiezen, de tijd aanpassen of het veld leegmaken) of direct in de Sheet.
- **Datums** staan in de Sheet als tekst `2026-11-07`. Typ je ze zelf in, gebruik dan ook dat formaat.
- De CSV in de repo (`data/scores.csv`) is vanaf nu alleen nog een **reservekopie**. Het dashboard valt daarop terug als Google even niet bereikbaar is, en zegt dat er dan bij.
