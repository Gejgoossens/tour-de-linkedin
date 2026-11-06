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
2. Kies een speler. Je kunt ook voor iemand anders invullen.
3. De datum staat standaard op vandaag en is aan te passen.
4. Vul de 5 tijden in, als `32` of `0:32`. Laat een veld leeg als je dat spel niet gespeeld hebt.
5. Sla op. Daarna kun je meteen een volgende speler invullen, zodat ook één persoon de hele groep kan doen.
6. Het dashboard herlaadt de data en toont de nieuwe uitslag.

**Beveiliging.** Het dashboard is openbaar, dus voor schrijven is een **groepscode** nodig. Die code staat alleen in de Script Properties van Apps Script en nooit in de repo. De browser onthoudt de code na de eerste keer (`localStorage`). Lezen kan zonder code. Het script controleert ook of de invoer klopt: de speler en het spel moeten bestaan, de tijd moet tussen 1 en 3600 seconden liggen, en de datum mag niet in de toekomst liggen.

### Spelregels (in te stellen in `site/config.js`)

- Laagste totaaltijd per etappe (dag) wint.
- Elke maand is een Tour. Een week hoort bij de maand waarin de donderdag valt (ISO-week), net als in de mock-up.
- **Gemist spel:** de straftijd is `max(langzaamste tijd van die dag voor dat spel, 10 s)`. *Nog bevestigen, zie open vragen.*
- Een speler telt mee vanaf zijn eerste gespeelde dag. Dat geldt bijvoorbeeld voor Giyo en Cas.

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
│   └── voorbeeld.csv     # testdata voor lokaal ontwikkelen
├── docs/
│   ├── PLAN.md           # dit document
│   ├── SETUP-GOOGLE.md   # stappenplan Sheet + Apps Script
│   └── mockup.html       # oorspronkelijk ontwerp
└── .github/workflows/pages.yml   # automatisch deployen naar GitHub Pages
```

## Fases

### Fase 0: Repo en plan *(nu)*
- [x] Lokale git-repo met de mappenstructuur, README, .gitignore en .editorconfig
- [x] Plan vastgelegd
- [x] GitHub Actions-workflow voor Pages (draait pas na de eerste push)

### Fase 1: Lokaal dashboard met echte data
- [ ] `scripts/excel_naar_csv.py`: de Excel (tab `Tabular`) omzetten naar het lange formaat
- [ ] De 6 nieuwe dagen uit de screenshots toevoegen, inclusief Cas
- [ ] Mock-up opsplitsen in `index.html`, `style.css`, `app.js` en `config.js`
- [ ] Data laden uit lang formaat (lokaal uit `data/*.csv`, later uit Apps Script)
- [ ] Spelers dynamisch laden, zodat Cas er gewoon bij komt
- [ ] De nieuwe straftijdregel toepassen
- [ ] Lokaal testen met `python -m http.server`, ook op telefoonbreedte

### Fase 2: Invoer en Google-koppeling
- [ ] `apps-script/Code.gs`: `doGet` (alle scores als JSON) en `doPost` (upsert met een lock en controle van de groepscode)
- [ ] Invoerscherm in het dashboard
- [ ] `docs/SETUP-GOOGLE.md`: Sheet aanmaken, CSV importeren, script plakken, groepscode instellen, deployen als web-app (*Uitvoeren als: ik*, *Toegang: iedereen*)
- [ ] De web-app-URL in `config.js` zetten en de hele flow testen

### Fase 3: Online via GitHub
- [ ] Repo aanmaken op GitHub (openbaar) en pushen
- [ ] Pages aanzetten (Settings, Pages, Source: GitHub Actions)
- [ ] Link delen in de groep

### Later (optioneel)
- Foto uploaden en Claude de tijden laten uitlezen
- Melding in de groep bij een nieuwe gele trui

## Open vragen

1. **Straftijd.** Klopt `max(langzaamste tijd, 10 s)`? Voorbeeld: de langzaamste Zip-tijd is 14 s, dan krijgt wie Zip mist 14 s. Is de langzaamste 6 s, dan wordt het 10 s. Of bedoel je `langzaamste + 10 s`?
2. **Matta of Mathijs.** In de nieuwe screenshots staat "Matta", in de Excel "Mathijs". Is dat dezelfde persoon, en welke naam wil je op het dashboard?
3. **Datums van de screenshots.** De Excel loopt tot en met ma 19 oktober. Volgens jou is de screenshot met Giyo 336 de eerste die niet in de Excel staat, en die met Giyo 164 is van vandaag (za 7 november). Welke datums horen bij de 6 screenshots? Zijn er dagen tussendoor niet gespeeld?
4. **Cas.** Sinds welke datum speelt Cas mee?
5. **Jari 6 t/m 18 oktober.** In de Excel ontbreken de scores van Jari voor die dagen. Heeft hij toen niet gespeeld, of zijn ze niet ingevuld?
