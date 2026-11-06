"""Eenmalige migratie: oude LinkedInScoreboard.xlsx (tab "Tabular") naar lang formaat.

Gebruik:
    python scripts/excel_naar_csv.py pad/naar/LinkedInScoreboard.xlsx data/scores.csv

De datums in de Excel zijn formules (=vorige + 1), daarom rekenen we ze zelf uit
vanaf de eerste datum: elk blok van 6 rijen (5 spellen + Total) is één dag.
"""
import csv
import datetime as dt
import sys

import openpyxl

HERNOEM = {"Mathijs": "Matta"}


def main(xlsx_pad, csv_pad):
    ws = openpyxl.load_workbook(xlsx_pad, data_only=False)["Tabular"]
    rijen = list(ws.iter_rows(values_only=True))
    kop, data = rijen[0], rijen[1:]
    spelers = [HERNOEM.get(p, p) for p in kop[4:] if p]
    start = data[0][2].date()

    uit = []
    for i, r in enumerate(data):
        spel = r[3]
        if not spel or spel == "Total":
            continue
        datum = start + dt.timedelta(days=i // 6)
        for speler, tijd in zip(spelers, r[4:]):
            if isinstance(tijd, (int, float)):
                uit.append([datum.isoformat(), speler, spel, int(tijd), ""])

    with open(csv_pad, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f, lineterminator="\n")
        w.writerow(["Datum", "Speler", "Spel", "Tijd", "IngevoerdOp"])
        w.writerows(uit)

    dagen = sorted({r[0] for r in uit})
    print(f"{len(uit)} scores, {len(dagen)} dagen ({dagen[0]} t/m {dagen[-1]}), spelers: {', '.join(spelers)}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    main(sys.argv[1], sys.argv[2])
