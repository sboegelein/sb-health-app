# Stephan's Health

Ein persönliches Health-Tracking, das Ernährung, Sport, Übungen, Timer und Auswertung kombiniert und sich dank Manifest + Service Worker als progressive Web App installieren lässt.

## Lokal testen
1. Öffne `index.html` im Browser deiner Wahl (`Google Chrome` auf Desktop reicht aus).
2. Alle Daten (Sport, Ernährung, History) werden lokal im Browser gespeichert; neu laden verändert nichts.

## PWA-Installation
- Die Datei `manifest.json` liefert Name/Icon/Farben.
- `sw.js` cached die Shell (`index.html`, `css/style.css`, `js/app.js`, Bilder) und sorgt für Offline-Fallback.
- Öffne die App unter `https://...` (HTTPS erforderlich), tippe in Chrome auf das Menü und wähle „Zum Home-Bildschirm“.

## Deployment via GitHub Pages
1. Repository nach GitHub pushen und GitHub Pages aus den Einstellungen aktivieren (Branch `main`, Ordner `/`).
2. Der Hosting-Link sieht dann so aus: `https://<dein-username>.github.io/<repo>`.
3. Neue Änderungen einfach committen und `git push` ausführen; GitHub baut die Seite automatisch neu.

## Struktur
- `index.html`: Single-Page-App mit Tabs für Dashboard, Ernährung, Sport, Übungen, Timer und Auswertung.
- `js/app.js`: Logik für Daten, Timer, Tab-Navigation und Service Worker-Registrierung.
- `css/style.css`: Styling der App-Oberfläche.
- `manifest.json`, `sw.js`: PWA-Definition und Offline-Cache.

Wenn du Fragen zu Einzelteilen hast, helfe ich dir gerne weiter.
