# Plan: Tour de LinkedIn

## Doel

Een dashboard dat altijd online staat en de dagelijkse LinkedIn-spellen (Wend, Zip, Patches, Tango, Queens) bijhoudt als een wielerronde: etappes, truien, klassementen en statistieken. Iedereen voert zijn tijden in via het dashboard zelf. Het handmatig bijhouden van foto's in Excel verdwijnt.

## Architectuur

```
┌────────────────────────────┐      GET  ?action=scores       ┌──────────────────────┐      ┌──────────────────┐
│ Dashboard (GitHub Pages)   │ ─────────────────────────────► │ Google Apps Script   │ ───► │ Google Sheet     │
│  site/index.html           │                                │  web-app (Code.gs)   │      │  tab "Scores"    │
│  • Tour / Statistieken     │ ◄───────────────────────────── │  • leest + schrijft  │ ◄─── │  tab "Spelers"   │
│  • "Scores invoeren"       │      POST  scores + groepscode │  • controleert code  │      │                  │
└────────────────────────────┘                                └──────────────────────┘      └──────────────────┘
```

- **Google Sheet** is de enige bron van waarheid. Je kunt er altijd zelf in kijken en corrigeren.
- **Apps Script** is een kleine, gratis API die aan de Sheet hangt. Hij draait onder het Google-account van de eigenaar en heeft geen eigen server nodig.
- **Dashboard** is een statische pagina op GitHub Pages zonder build-stap: alleen HTML, CSS en JS. Alle berekeningen (klassementen, truien, statistieken) gebeuren in de browser, net als in de mock-up.

### Datamodel (Google Sheet)

Tab **Scores**, één rij per speler per spel per dag ("lang formaat"):

| Datum      | Speler  | Spel    | Tijd | IngevoerdOp          |
|------------|---------|---------|------|----------------------|
| 2026-11-07 | Giyo    | Wend    | 26   | 2026-11-07T08:12:00Z |

- `Tijd` is in hele seconden. Een leeg veld betekent niet gespeeld.
- Een nieuwe invoer voor dezelfde (Datum, Speler, Spel) overschrijft de oude. Zo herstel je een fout.
- Waarom lang formaat: een nieuwe speler (zoals Cas) of een nieuw spel kost geen extra kolom. Gelijktijdig invoeren botst ook niet. Het dashboard zet de rijen zelf om naar de etappe-tabel.

Tab **Spelers**: `Naam | Startnummer | Actief`. Dit bepaalt de volgorde en de rugnummers op het dashboard.

### Invoer op het dashboard

1. Klik op de knop "Scores invoeren".
2. Kies **per spel** (standaard: alle spelers voor één spel, zoals LinkedIn de uitslag per spel toont) of **per speler** (alle spellen van één speler).
3. De datum staat standaard op vandaag en is aan te passen.
4. Vul de tijden in, als `32` of `0:32`. Laat een veld leeg als die speler dat spel niet gespeeld heeft. Bestaande tijden staan al ingevuld; een veld leegmaken wist de tijd.
5. Sla op. Het scherm springt naar het volgende spel (of de volgende speler) dat nog niet compleet is.
6. Het dashboard herlaadt de data en toont de nieuwe uitslag.

**Beveiliging.** Het dashboard is openbaar, dus voor schrijven is een **groepscode** nodig. Die code staat alleen in de Script Properties van Apps Script en nooit in de repo. De browser onthoudt de code na de eerste keer (`localStorage`). Lezen kan zonder code. Het script controleert ook of de invoer klopt: de speler en het spel moeten bestaan, de tijd moet tussen 1 en 3600 seconden liggen, en de datum mag niet in de toekomst liggen.

### Spelregels (in te stellen in `site/config.js`)

- Laagste totaaltijd per etappe (dag) wint.
- Elke kalendermaand is een Tour, van de 1e t/m de laatste dag. (Eerst gold de ISO-weekregel uit de mock-up; op 7 november 2026 omgezet.) Weekklassementen lopen van maandag t/m zondag.
- **Gemist spel:** de straftijd is de langzaamste tijd van die dag voor dat spel + 10 s.
- Een speler telt mee vanaf zijn eerste gespeelde dag (Giyo vanaf 4 september, Cas vanaf 24 oktober). Daarna krijgt een niet-gespeelde dag de straftijd, ook bij vakantie.

## Repo-structuur

```
tour-de-linkedin/
├── site/                 # wat er op GitHub Pages komt
│   ├── index.html        # dashboard (op basis van docs/mockup.html)
│   ├── app.js            # data ophalen, berekeningen, renderen
│   ├── invoer.js         # invoerformulier
│   ├── style.css
│   └── config.js         # Apps Script URL + spelregels
├── apps-script/
│   ├── Code.gs           # doGet / doPost voor de Sheet
│   └── appsscript.json   # manifest (geschikt voor clasp)
├── scripts/
│   └── excel_naar_csv.py # eenmalige migratie van de oude Excel
├── data/
│   └── scores.csv        # alle scores tot nu toe (lang formaat)
├── docs/
│   ├── PLAN.md           # dit document
│   ├── SETUP-GOOGLE.md   # stappenplan Sheet + Apps Script
│   └── mockup.html       # oorspronkelijk ontwerp
└── .github/workflows/pages.yml   # automatisch deployen naar GitHub Pages
```

## Fases

### Fase 0: Repo en plan
- [x] Lokale git-repo met de mappenstructuur, README, .gitignore en .editorconfig
- [x] Plan vastgelegd
- [x] GitHub Actions-workflow voor Pages (draait pas na de eerste push)

### Fase 1: Lokaal dashboard met echte data *(klaar)*
- [x] `scripts/excel_naar_csv.py`: de Excel (tab `Tabular`) omzetten naar het lange formaat, met "Mathijs" hernoemd naar "Matta"
- [x] Mock-up opsplitsen in `index.html`, `style.css`, `app.js` en `config.js`
- [x] Data laden uit lang formaat (lokaal uit `data/*.csv`, later uit Apps Script)
- [x] Spelers dynamisch laden, zodat Cas er gewoon bij komt
- [x] De nieuwe straftijdregel toepassen
- [x] Lokaal testen met `python -m http.server`, ook op telefoonbreedte

### Fase 2: Invoer en Google-koppeling *(volgende)*
- [x] `apps-script/Code.gs`: `doGet` (alle scores als JSON) en `doPost` (upsert met een lock en controle van de groepscode)
- [x] Invoerscherm in het dashboard
- [x] `docs/SETUP-GOOGLE.md`: Sheet aanmaken, CSV importeren, script plakken, groepscode instellen, deployen als web-app (*Uitvoeren als: ik*, *Toegang: iedereen*)
- [x] De web-app-URL in `config.js` zetten (lezen en groepscodecontrole getest)
- [ ] Echte invoer met de groepscode testen

### Fase 3: Online via GitHub
- [x] GitHub CLI installeren, repo aanmaken (openbaar) en pushen
- [x] Pages aanzetten (Source: GitHub Actions)
- [ ] Link delen in de groep

### Fase 4: Trainen (zelf spelen)
- [x] Tabblad "Trainen" met Queens-training (regels en bediening als Queens, eigen uiterlijk en eigen puzzels)
- [x] Generator die alleen puzzels maakt die zonder gokken oplosbaar zijn (`site/kronen-logica.js`, test: `node scripts/test_kronen.js`)
- [x] Dagkeuze: maandag 7×7 heel makkelijk tot zondag 9×9 extreem moeilijk (ma/di 7×7, wo t/m vr 8×8, za/zo 9×9, zoals Queens-archieven voor LinkedIn laten zien)
- [x] Hints met uitleg, en na afloop een analyse: waar liep je vast, welke stap lag er, denktijd per techniek
- [x] Vaste puzzel één keer per dag per speler; je kiest wie je bent ("Start als Giyo") en het resultaat gaat naar tab **Training** in de Sheet (`Datum | Speler | Dag | Tijd | Hints | Fouten | IngevoerdOp`)
- [x] Uitslag van vandaag per dagpuzzel onder het bord
- [ ] Punten, leaderboard en verzamelobjecten
- [x] Tango-training naast de Queens-training, met een spelkeuze bovenaan het tabblad (`site/tango-logica.js`, `site/tango.js`, test: `node scripts/test_tango.js`). Regels, bediening en hulpmiddelen zoals LinkedIn: tik voor zon, maan, leeg; Ongedaan maken, Hint, Wissen; rode strepen bij een overtreding. Dezelfde analyse als bij Queens: waar liep je vast, je hints, denktijd per techniek
- [x] Tango per weekdag opgebouwd zoals LinkedIn (zie "Tango per weekdag" hieronder); resultaten in tab **Training** met de extra kolom `Spel`
- [ ] Trainingsversies van de andere spellen (Zip, Patches, Wend)

### Tango per weekdag

Bij LinkedIn is Tango elke dag 6×6; de moeilijkheid zit in hoeveel er voorgevuld is, hoeveel tekens er liggen en welke stappen je nodig hebt. Gemeten op 16 echte puzzels (#750 t/m #765, 27 oktober t/m 11 november 2026, startborden van Nerd's Chalk, opgelost met onze eigen motor) en naast de telling van HintSheet over 37 borden (3 september t/m 10 oktober 2026) gelegd:

| Dag | Voorgevuld | Tekens | Lijn doorrekenen | Label |
|-----|-----------|--------|------------------|-------|
| Maandag | 6–9 | 2–4 | niet nodig | makkelijk |
| Dinsdag | 5–8 | 3–5 | niet nodig | makkelijk |
| Woensdag | 6–10 | 3–6 | 0–2 keer | gemiddeld |
| Donderdag | 6–8 | 4–6 | 1–4 keer | gemiddeld |
| Vrijdag | 6–10 | 4–6 | 3–5 keer | pittig |
| Zaterdag | 4–7 | 6–8 | 2–4 keer | moeilijk |
| Zondag | 4–6 | 6–8 | 3–6 keer | heel moeilijk |

Verder overgenomen: een teken raakt aan het begin nooit een voorgevuld vakje (bij alle gemeten borden zo), = en × komen ongeveer even vaak voor, en de voorgevulde vakjes en tekens liggen in rijtjes, hoekjes en diagonalen, vaak gespiegeld of een halve slag gedraaid. Geen enkele dagpuzzel vraagt om gokken of om vooruitdenken over meerdere lijnen.

Niet overgenomen: de echte puzzels van LinkedIn zelf (we maken eigen puzzels), de resultaatpagina met vergelijking tegen andere leden, en de exacte teksten van LinkedIn's hints (die staan niet in de helppagina; onze hints leggen de stap uit zoals bij Queens).

### Later (optioneel)
- Foto uploaden en Claude de tijden laten uitlezen
- Melding in de groep bij een nieuwe gele trui

## Besluiten

| Onderwerp | Besluit |
|-----------|---------|
| Straftijd gemist spel | langzaamste tijd van die dag + 10 s |
| Naam | "Matta" (was "Mathijs" in de Excel) |
| Startdata | alleen de Excel. De dagen na 19 oktober vullen we later aan via het dashboard |
| Cas | doet mee vanaf 24 oktober 2026 |
| Jari 6 t/m 18 oktober | niet gespeeld (vakantie), dus straftijd |
| Openbaar | ja, openbare repo en GitHub Pages |
| Invoer | door iedereen, ook voor anderen; standaard per spel |
| Tour-periode | kalendermaand (1e t/m laatste dag), besloten 7 november 2026 |
| Statistieken | tabblad "Ik" (persoonlijk) en "Peloton" (groep); gekozen renner wordt per apparaat onthouden |
| Persoonlijke maat | vermogen "tegen de puzzel": 300 W = gemiddelde renner op dezelfde puzzel; zwaarte geschat uit de tijden van de anderen, dus weekdag telt eerlijk mee |
| Vorm | gemiddelde over de laatste 14 dagen |
| Gemiste spellen in persoonlijke stats | tellen mee als straftijd ("er zijn is ook een kwaliteit") |
| Weetje van de dag | het zeldzaamste van 40 controles; op de Tour-pagina en als laatste scène van de huldiging |
| Tour centraal | sectie "Tour van <maand>" direct onder de etappewinnaar, met etappekalender en het verloop van de achterstand op de gele trui |
