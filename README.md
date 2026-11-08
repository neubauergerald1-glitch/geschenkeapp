# Geschenkideen

Kleine Web-App zum Verwalten von Geschenkideen – pro **Anlass**, **Person** und **Status**.
Kein Build-Schritt, keine Abhängigkeiten: reines HTML/CSS/JavaScript.

## Funktionen
- Anlässe mit Datum, Budget und Countdown („in 46 Tagen“)
- Geschenke mit Person, Idee, Kosten, Status und Notiz
- Status: **Idee · Bestellt · Gekauft · Verpackt · Verschenkt · Verworfen**
- Budgetbalken pro Anlass und Gesamtübersicht (Verworfenes zählt nicht zum Geplanten)
- Ansicht „Nach Anlass“ oder „Nach Person“
- Filter nach Person, Anlass, Status, Volltextsuche, Verworfene ausblenden
- Export/Import als JSON (Backup oder Umzug auf ein anderes Gerät)
- Responsiv, Dark Mode, als App zum Home-Bildschirm hinzufügbar

## Starten
```bash
python3 -m http.server 8000
```
Dann http://localhost:8000 öffnen. (`index.html` direkt öffnen geht auch.)

## Daten
Alles wird im `localStorage` des Browsers gespeichert (Schlüssel `geschenkideen.v1`).
Die Daten bleiben also auf dem jeweiligen Gerät – für Backups den Export nutzen.
