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

## Koerswijziging na het eerste spelen

De eerste versie (één lange etappe, geel inhalen voor de finish) voelde te traag en te vlak. Het rijden is daarom omgebouwd naar het model van Archero:

- **Korte stukken.** Een etappe is vier sectoren van ongeveer tien seconden. Aan het eind van elke sector loop je een groep in; de laatste is geel, daarna volgt de sprint.
- **Een kracht per ingelopen groep.** Je kiest één van drie. (Eerst was er een ervaringsbalk die bij bidons volliep; dat gaf veel te veel krachten.)
- **Krachten blijven en stapelen**, en je ziet ze: spooklinten naast je, een helikopter die bidons laat vallen, motoren op kop, een reuzenkopman die hindernissen wegbeukt, bidonbliksem, een nabrander waarmee je tijdens een boost overal doorheen ramt.
- **Snelheid vermenigvuldigt.** Tempo, boost, sleuren, rook en motoren vermenigvuldigen met elkaar. Op topsnelheid wordt sturen echt moeilijk.
- **Renners zijn je levens**, hooguit dertig. Je bent af als je hele peloton is opgeveegd.
- **Valpartij.** Wie botst, neemt iedereen in zijn wiel mee; hoe harder je rijdt, hoe meer er vallen.
- **De bezemwagen jaagt.** Hij rijdt het tempo van de etappe. Rijd je trager, bijvoorbeeld na een valpartij of in de wind, dan komt hij dichterbij en eet hij renners van je staart.
- **De koers als smalle balk bovenaan:** wij, de groepen voor ons als stippen, en de streep.
- **Elke etappe harder en in een nieuw decor:** Provence, De Alpen, De Hel van het Noorden, Parijs bij nacht, De Vulkaan, en dan opnieuw maar sneller.
- **Meer hindernissen:** vluchtheuvels, ploegauto's, chicanes van strobalen, dorpen en zijwind, dichter naarmate je verder komt.

De ploeg samenstellen en de routekaart uit "De ronde" hierboven komen hier bovenop, in fase 2.

## Fases

| Fase | Inhoud | Stand |
|------|--------|-------|
| 1 | **Het rijden.** Etappes met sectoren, ladder, ervaringsbalk en krachten, tempometer, drie renners met een knop, rook, bezemwagen, sprint, decors, geluid. Beste score in de browser. | gebouwd, wordt afgesteld |
| 2 | **De Tour.** Routekaart tussen etappes, ploeg samenstellen, ploegbus en rustdag. | |
| 3 | **Opslaan en vrijspelen.** Voortgang per telefoon (browseropslag): nieuwe krachten, renners en decors vrijspelen; missies van drie opdrachten; etappe van de dag. | |
| 4 | **Meer inhoud.** Tactiekbord met Queens en Tango (hergebruik van `kronen-logica.js` en `tango-logica.js`), eindbazen, voorvallen, nieuwe rondes als losse pakketjes ("Tour van …"). | |
| 5 | **Aankleding.** Mooiere graphics, de zes spelers als kopmannen, commentaar, rijker geluid. Eventueel gedeelde records via de Google Sheet. | |

Na fase 1 eerst spelen en bijstellen tot het rijden verslavend is. De rest bouwt daarop.

## Techniek

- Geen build-stap, net als het dashboard: `site/spel.html` en `site/spel.js`.
- 3D met Three.js (r128), meegeleverd in `site/vendor/three.min.js`.
- Veel dezelfde objecten (renners, bomen, bidons) worden als één groep getekend, zodat het op een telefoon soepel blijft.
- Geluid wordt in de browser gemaakt, zonder geluidsbestanden.
