# Tour de LinkedIn

Dashboard dat onze dagelijkse LinkedIn-spellen (Wend, Zip, Patches, Tango, Queens) bijhoudt als een wielerronde: etappes, truien, klassementen en statistieken. Scores worden ingevoerd via het dashboard en opgeslagen in een Google Sheet.

Zie [docs/PLAN.md](docs/PLAN.md) voor de opzet en de planning.

## Structuur

| Map | Inhoud |
|-----|--------|
| `site/` | Statisch dashboard, wordt gepubliceerd op GitHub Pages |
| `apps-script/` | Google Apps Script dat de Sheet leest en beschrijft |
| `scripts/` | Hulpscripts, zoals de eenmalige Excel-migratie |
| `data/` | Voorbeelddata voor lokaal ontwikkelen |
| `docs/` | Plan, setup-handleiding en het oorspronkelijke ontwerp |

## Lokaal draaien

```bash
python -m http.server 8000 --directory site
```

Open daarna <http://localhost:8000>.

## Deployen

Elke push naar `main` publiceert `site/` automatisch via GitHub Actions naar GitHub Pages.
