/**
 * Tour de LinkedIn: kleine API op de Google Sheet.
 *
 *   GET  ?action=scores   → { ok, scores:[{Datum,Speler,Spel,Tijd,IngevoerdOp}], spelers:[{Naam,Startnummer,Actief}], spellen:[...] }
 *   POST (JSON als text/plain) { code, datum, scores:[{ speler:"Giyo", spel:"Wend", tijd:26 }, ...] }
 *        tijd getal = opslaan/overschrijven, null = bestaande tijd wissen. Wat er niet in staat, blijft zoals het was.
 *        Zo kan het dashboard per spel (alle spelers) of per speler (alle spellen) opslaan.
 *   GET  ?action=training&datum=2026-11-12   → { ok, training:[{Datum,Speler,Dag,Tijd,Hints,Fouten}] } (zonder datum: alles)
 *   POST { code, soort:"training", datum, speler, dag:0-6, tijd, hints, fouten }
 *        Resultaat van de vaste Queens-trainingspuzzel. Eén per speler per dagpuzzel per datum: het eerste blijft staan.
 *
 * De groepscode staat in Projectinstellingen → Scripteigenschappen als GROEPSCODE, nooit in de code.
 * Eenmalig: voer `installeer` uit vanuit de editor (maakt de tabs en haalt de scores van GitHub).
 */

var SPELLEN = ['Wend', 'Patches', 'Zip', 'Tango', 'Queens'];
var STANDAARD_SPELERS = ['Matta', 'Bouw', 'Corne', 'Jari', 'Giyo', 'Cas'];
var CSV_URL = 'https://raw.githubusercontent.com/Gejgoossens/tour-de-linkedin/main/data/scores.csv';
var KOP_SCORES = ['Datum', 'Speler', 'Spel', 'Tijd', 'IngevoerdOp'];
var KOP_SPELERS = ['Naam', 'Startnummer', 'Actief'];
var KOP_TRAINING = ['Datum', 'Speler', 'Dag', 'Tijd', 'Hints', 'Fouten', 'IngevoerdOp'];
var MAX_TIJD = 3600;

/* ===== web-app ===== */

function doGet(e) {
  var actie = (e && e.parameter && e.parameter.action) || 'scores';
  if (actie === 'training') return json_({ ok: true, training: leesTraining_(String((e.parameter && e.parameter.datum) || '')) });
  if (actie !== 'scores') return json_({ ok: false, fout: 'Onbekende actie' });
  return json_({ ok: true, scores: leesScores_(), spelers: leesSpelers_(), spellen: SPELLEN });
}

function doPost(e) {
  var invoer;
  try {
    invoer = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  } catch (err) {
    return json_({ ok: false, fout: 'Ongeldige invoer' });
  }

  var code = PropertiesService.getScriptProperties().getProperty('GROEPSCODE');
  if (!code) return json_({ ok: false, fout: 'Er is nog geen groepscode ingesteld in het script' });
  if (String(invoer.code || '').trim() !== code) return json_({ ok: false, fout: 'Verkeerde groepscode', code: 'groepscode' });

  if (invoer.soort === 'training') return postTraining_(invoer);

  var datum = String(invoer.datum || '');
  if (!/^\d{4}-\d\d-\d\d$/.test(datum) || isNaN(new Date(datum + 'T12:00:00').getTime())) {
    return json_({ ok: false, fout: 'Ongeldige datum' });
  }
  if (datum > vandaag_()) return json_({ ok: false, fout: 'De datum ligt in de toekomst' });

  var bekend = leesSpelers_().filter(function (s) { return s.Actief; }).map(function (s) { return s.Naam; });
  var lijst = invoer.scores;
  if (!Array.isArray(lijst) || lijst.length > 100) return json_({ ok: false, fout: 'Ongeldige invoer' });
  var wijzigingen = [], gezien = {};
  for (var i = 0; i < lijst.length; i++) {
    var item = lijst[i] || {};
    var speler = String(item.speler || '').trim(), spel = String(item.spel || '').trim(), t = item.tijd;
    if (bekend.indexOf(speler) < 0) return json_({ ok: false, fout: 'Onbekende speler: ' + speler });
    if (SPELLEN.indexOf(spel) < 0) return json_({ ok: false, fout: 'Onbekend spel: ' + spel });
    if (gezien[speler + '|' + spel]) return json_({ ok: false, fout: speler + ' staat dubbel bij ' + spel });
    gezien[speler + '|' + spel] = true;
    if (t === null || t === '' || t === undefined) { wijzigingen.push({ speler: speler, spel: spel, tijd: null }); continue; }
    t = Number(t);
    if (!(t >= 1 && t <= MAX_TIJD) || Math.round(t) !== t) {
      return json_({ ok: false, fout: speler + ', ' + spel + ': tijd moet een heel getal tussen 1 en ' + MAX_TIJD + ' seconden zijn' });
    }
    wijzigingen.push({ speler: speler, spel: spel, tijd: t });
  }
  if (!wijzigingen.length) return json_({ ok: false, fout: 'Geen tijden ingevuld' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, fout: 'Het is even druk, probeer het opnieuw' });
  try {
    var resultaat = schrijf_(datum, wijzigingen);
    return json_({ ok: true, opgeslagen: resultaat.opgeslagen, gewist: resultaat.gewist });
  } finally {
    lock.releaseLock();
  }
}

/* ===== Queens-training ===== */

function postTraining_(invoer) {
  var datum = String(invoer.datum || '');
  if (!/^\d{4}-\d\d-\d\d$/.test(datum) || isNaN(new Date(datum + 'T12:00:00').getTime())) return json_({ ok: false, fout: 'Ongeldige datum' });
  /* alleen vandaag, met een dag speling voor tijdzones en een resultaat dat later alsnog wordt verstuurd */
  var dagen = Math.round((new Date(vandaag_() + 'T12:00:00') - new Date(datum + 'T12:00:00')) / 86400000);
  if (dagen < -1 || dagen > 2) return json_({ ok: false, fout: 'Deze datum is te oud of ligt in de toekomst', code: 'datum' });

  var speler = String(invoer.speler || '').trim();
  var bekend = leesSpelers_().filter(function (s) { return s.Actief; }).map(function (s) { return s.Naam; });
  if (bekend.indexOf(speler) < 0) return json_({ ok: false, fout: 'Onbekende speler: ' + speler });
  var dag = Number(invoer.dag), tijd = Number(invoer.tijd), hints = Number(invoer.hints || 0), fouten = Number(invoer.fouten || 0);
  if (!(dag >= 0 && dag <= 6) || Math.round(dag) !== dag) return json_({ ok: false, fout: 'Ongeldige dag' });
  if (!(tijd >= 1 && tijd <= 86400) || Math.round(tijd) !== tijd) return json_({ ok: false, fout: 'Ongeldige tijd' });
  if (!(hints >= 0 && hints <= 999) || !(fouten >= 0 && fouten <= 999)) return json_({ ok: false, fout: 'Ongeldige invoer' });

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return json_({ ok: false, fout: 'Het is even druk, probeer het opnieuw' });
  try {
    var al = leesTraining_(datum).filter(function (r) { return r.Speler === speler && r.Dag === dag; })[0];
    if (al) return json_({ ok: true, bestond: true, resultaat: al });
    var blad = blad_('Training', KOP_TRAINING);
    var rij = blad.getLastRow() + 1;
    blad.getRange(rij, 1, 1, 1).setNumberFormat('@');
    blad.getRange(rij, 1, 1, KOP_TRAINING.length).setValues([[datum, speler, dag, tijd, Math.round(hints), Math.round(fouten), new Date().toISOString()]]);
    return json_({ ok: true, bestond: false });
  } finally {
    lock.releaseLock();
  }
}

function leesTraining_(datum) {
  var blad = blad_('Training', KOP_TRAINING);
  var laatste = blad.getLastRow();
  if (laatste < 2) return [];
  return blad.getRange(2, 1, laatste - 1, 6).getValues()
    .filter(function (r) { return r[0] !== '' && r[1] !== '' && r[3] !== '' && (!datum || datumTekst_(r[0]) === datum); })
    .map(function (r) {
      return { Datum: datumTekst_(r[0]), Speler: String(r[1]).trim(), Dag: Number(r[2]), Tijd: Number(r[3]), Hints: Number(r[4]) || 0, Fouten: Number(r[5]) || 0 };
    });
}

/* ===== Sheet lezen en schrijven ===== */

function schrijf_(datum, wijzigingen) {
  var blad = blad_('Scores', KOP_SCORES);
  var nu = new Date().toISOString();
  var laatste = blad.getLastRow();
  var data = laatste > 1 ? blad.getRange(2, 1, laatste - 1, 3).getValues() : [];
  var rijVan = {};
  data.forEach(function (r, i) {
    if (datumTekst_(r[0]) === datum) rijVan[String(r[1]).trim() + '|' + String(r[2]).trim()] = i + 2;
  });

  var opgeslagen = 0, gewist = [], nieuw = [];
  wijzigingen.forEach(function (w) {
    var rij = rijVan[w.speler + '|' + w.spel];
    if (w.tijd === null) {
      if (rij) gewist.push(rij);
    } else if (rij) {
      blad.getRange(rij, 4, 1, 2).setValues([[w.tijd, nu]]);
      opgeslagen++;
    } else {
      nieuw.push([datum, w.speler, w.spel, w.tijd, nu]);
    }
  });
  if (nieuw.length) {
    var start = blad.getLastRow() + 1;
    var bereik = blad.getRange(start, 1, nieuw.length, KOP_SCORES.length);
    blad.getRange(start, 1, nieuw.length, 1).setNumberFormat('@');
    bereik.setValues(nieuw);
    opgeslagen += nieuw.length;
  }
  gewist.sort(function (a, b) { return b - a; }).forEach(function (rij) { blad.deleteRow(rij); });
  return { opgeslagen: opgeslagen, gewist: gewist.length };
}

function leesScores_() {
  var blad = blad_('Scores', KOP_SCORES);
  var laatste = blad.getLastRow();
  if (laatste < 2) return [];
  return blad.getRange(2, 1, laatste - 1, KOP_SCORES.length).getValues()
    .filter(function (r) { return r[0] !== '' && r[1] !== '' && r[2] !== '' && r[3] !== ''; })
    .map(function (r) {
      var op = r[4] instanceof Date ? r[4].toISOString() : String(r[4] || '');
      return { Datum: datumTekst_(r[0]), Speler: String(r[1]).trim(), Spel: String(r[2]).trim(), Tijd: Number(r[3]), IngevoerdOp: op };
    });
}

function leesSpelers_() {
  var blad = blad_('Spelers', KOP_SPELERS);
  var laatste = blad.getLastRow();
  if (laatste < 2) return [];
  return blad.getRange(2, 1, laatste - 1, KOP_SPELERS.length).getValues()
    .filter(function (r) { return String(r[0]).trim(); })
    .map(function (r) {
      var actief = r[2] === '' || r[2] === true || /^(ja|true|1|x)$/i.test(String(r[2]).trim());
      return { Naam: String(r[0]).trim(), Startnummer: Number(r[1]) || null, Actief: actief };
    })
    .sort(function (a, b) { return (a.Startnummer || 999) - (b.Startnummer || 999); });
}

/* ===== eenmalige installatie (uitvoeren vanuit de editor) ===== */

function installeer() {
  var scores = blad_('Scores', KOP_SCORES);
  if (scores.getLastRow() > 1) throw new Error('Tab Scores bevat al data. Leeg hem eerst als je opnieuw wilt importeren.');
  var tekst = UrlFetchApp.fetch(CSV_URL).getContentText('UTF-8');
  var rijen = Utilities.parseCsv(tekst).slice(1).filter(function (r) { return r[0]; })
    .map(function (r) { return [r[0], r[1], r[2], Number(r[3]), r[4] || '']; });
  scores.getRange('A:A').setNumberFormat('@');
  scores.getRange('E:E').setNumberFormat('@');
  if (rijen.length) scores.getRange(2, 1, rijen.length, KOP_SCORES.length).setValues(rijen);

  var spelers = blad_('Spelers', KOP_SPELERS);
  if (spelers.getLastRow() < 2) {
    var lijst = STANDAARD_SPELERS.map(function (n, i) { return [n, i + 1, true]; });
    spelers.getRange(2, 1, lijst.length, 3).setValues(lijst);
    spelers.getRange(2, 3, lijst.length, 1).insertCheckboxes();
  }
  Logger.log(rijen.length + ' scores geïmporteerd. Vergeet niet GROEPSCODE in te stellen bij Scripteigenschappen.');
}

/* ===== hulpjes ===== */

function blad_(naam, kop) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var blad = ss.getSheetByName(naam);
  if (!blad) {
    blad = ss.insertSheet(naam);
    blad.getRange(1, 1, 1, kop.length).setValues([kop]).setFontWeight('bold');
    blad.setFrozenRows(1);
  }
  return blad;
}

function datumTekst_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return String(v).trim().slice(0, 10);
}

function vandaag_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
