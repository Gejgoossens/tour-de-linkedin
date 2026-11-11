# Tour de LinkedIn

Dashboard dat onze dagelijkse LinkedIn-spellen (Wend, Zip, Patches, Tango, Queens) bijhoudt als een wielerronde: etappes, truien, klassementen en statistieken. Scores worden ingevoerd via het dashboard en opgeslagen in een Google Sheet.

Zie [docs/PLAN.md](docs/PLAN.md) voor de opzet en de planning.

## Structuur

| Map | Inhoud |
|-----|--------|
| `site/` | Statisch dashboard, wordt gepubliceerd op GitHub Pages |
| `apps-script/` | Google Apps Script dat de Sheet leest en beschrijft |
| `scripts/` | Hulpscripts, zoals de eenmalige Excel-migratie en de tests van de trainingspuzzels (`node scripts/test_kronen.js`, `node scripts/test_tango.js`) |
| `data/` | `scores.csv` met alle scores; de Pages-workflow zet een kopie in de site |
| `docs/` | Plan, setup-handleiding en het oorspronkelijke ontwerp |

## Lokaal draaien

Start de server vanuit de repo-map (niet vanuit `site/`), zodat het dashboard `data/scores.csv` kan vinden:

```bash
python -m http.server 8000 --bind 127.0.0.1
```

Open daarna <http://127.0.0.1:8000/site/>. Instellingen (straftijd, volgorde van spelers en spellen, later de Apps Script-URL) staan in `site/config.js`.

## Deployen

Elke push naar `main` die `site/` of `data/` raakt, publiceert `site/` (plus `data/scores.csv`) automatisch via GitHub Actions naar GitHub Pages.
