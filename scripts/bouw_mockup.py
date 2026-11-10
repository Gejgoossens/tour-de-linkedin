"""Bouwt de klikbare mock-up van de statistiekenpagina met de echte scores erin.

Gebruik: python scripts/bouw_mockup.py
Schrijft docs/mockup-statistieken.html (los te openen in de browser).
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sjabloon = (ROOT / "scripts" / "mockup_statistieken.template.html").read_text(encoding="utf-8")
csv = (ROOT / "data" / "scores.csv").read_text(encoding="utf-8").strip()
inhoud = sjabloon.replace("/*__CSV__*/", csv)
kop = '<!DOCTYPE html>\n<html lang="nl">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
(ROOT / "docs" / "mockup-statistieken.html").write_text(kop + inhoud, encoding="utf-8")
print("docs/mockup-statistieken.html geschreven")
