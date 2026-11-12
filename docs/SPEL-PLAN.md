# Plan: het spel

Een losstaand spel naast het dashboard, op `site/spel.html`. Het staat los van de scores en het klassement. Te spelen op een telefoon, met één duim.

## Het idee

Een roguelike in de Tour. Je stelt een ploeg samen en rijdt een ronde van meerdere korte etappes. In elke etappe bestuur je het peloton: je komt van achteren, slokt groep na groep op en moet de etappe winnen. Achter je rijdt de bezemwagen, die elke geloste renner opveegt. Toon: wielrennen met een knipoog ("Meer rook!").

### De etappe (het rijden zelf)

- **Sturen:** opzij slepen. **Waaier:** omlaag vegen, tegen zijwind. **Lint:** omhoog vegen, snel en smal, voor dorpen en vluchtheuvels.
- **Ladder linksboven**, zoals in de tv-uitzending: kop van de koers, achtervolgers, groepen, en wij als peloton met de tijdsachterstand. Elke groep die je inloopt verdwijnt uit de ladder en sluit bij je aan.
- **Winnen** is als eerste over de streep komen, niet alleen geel inhalen. De laatste meters zijn een sprint.
- **Drie ritmes van beloning:** elke seconde iets kleins (bidons, lossers), elke tien seconden een keuze of boost (poort, boostmat, knop van een renner), elke halve minuut een groot moment (groep ingelopen, bevoorradingskaart).
- **Tempometer:** alles wat je oppakt verhoogt de vermenigvuldiger, en die verhoogt je score én je snelheid. Een renner verliezen laat hem zakken.
- **Renners met een knop:** drie benoemde renners plus de rookknop, dus maximaal vier knoppen. Wordt een benoemde renner opgeveegd, dan is zijn knop weg.

### De ronde (de roguelike)

- Eén run is één Tour van ongeveer zeven etappes. De tijd die je wint of verliest neem je mee in het klassement; in Parijs moet je geel dragen.
- Vooraf kies je een kopman en vier knechten uit een willekeurig aanbod. Types: sprinter, klimmer, waaierkoning, tempobeul, waterdrager, rookmeester. Elk heeft een passief effect; de kopman en twee knechten hebben ook een knop.
- Wie wordt opgeveegd, is de rest van de Tour weg.
- Tussen etappes kies je een route op een kaart: etappesoorten (waaier, berg, kasseien, tijdrit), ploegbus (materiaal kopen met bidons), rustdag, tactiekbord (Queens of Tango tegen de klok voor zeldzaam materiaal), voorval (keuze met risico), eindbazen.
- Materiaal en renners versterken elkaar, zodat elke Tour een andere ploeg oplevert.
- Tussen runs speel je vooral opties vrij (renners, kopmannen, materiaal, rondes) en weinig pure kracht.

## Fases

| Fase | Inhoud | Stand |
|------|--------|-------|
| 1 | **De etappe.** Eén vlakke etappe met ladder, groepen inlopen, bidons, lossers, poorten, boostmatten, vluchtheuvels, tempometer, drie renners met een knop, rook, bezemwagen, bevoorradingskaarten, sprint, geluid. Beste score in de browser. | gebouwd, wordt afgesteld |
| 2 | **De Tour.** Routekaart, ploeg samenstellen, klassement over etappes, renners die wegvallen, ploegbus en rustdag. | |
| 3 | **Opslaan en vrijspelen.** Voortgang per telefoon (browseropslag), missies van drie opdrachten, etappe van de dag. | |
| 4 | **Meer inhoud.** Tactiekbord met Queens en Tango (hergebruik van `kronen-logica.js` en `tango-logica.js`), bergrit, kasseien, tijdrit, voorvallen. Nieuwe rondes als losse pakketjes ("Tour van …"). | |
| 5 | **Aankleding.** Mooiere graphics, de zes spelers als kopmannen, commentaar, rijker geluid. Eventueel gedeelde records via de Google Sheet. | |

Na fase 1 eerst spelen en bijstellen tot het rijden verslavend is. De rest bouwt daarop.

## Techniek

- Geen build-stap, net als het dashboard: `site/spel.html` en `site/spel.js`.
- 3D met Three.js (r128), meegeleverd in `site/vendor/three.min.js`.
- Veel dezelfde objecten (renners, bomen, bidons) worden als één groep getekend, zodat het op een telefoon soepel blijft.
- Geluid wordt in de browser gemaakt, zonder geluidsbestanden.
