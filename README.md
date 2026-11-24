# Lesezeit – E-Books & Hörbücher

Eine schlanke Web-App (PWA) zum Lesen von EPUBs und Hören von M4B-Hörbüchern.
Läuft auf iPhone, iPad und Mac, speichert alles lokal und funktioniert offline.

---

## 1. App auf dem Mac starten (zum Ausprobieren und Entwickeln)

Öffne das Programm **Terminal** (Spotlight: `⌘ + Leertaste`, „Terminal“ tippen).

In den Projektordner wechseln (`cd` = „change directory“):

```bash
cd ~/Documents/lese-app
```

Nur beim allerersten Mal (oder wenn sich Pakete ändern) – lädt die benötigten Bausteine:

```bash
npm install
```

App starten:

```bash
npm run dev
```

Im Terminal erscheint dann z. B. `Local: http://localhost:5173/`. Diese Adresse in Safari öffnen.
Beenden: im Terminal `Ctrl + C` drücken.

Zum Testen liegen im Ordner `testdaten/` ein kleines Test-EPUB und ein Test-Hörbuch.

### Auf iPhone/iPad im WLAN ausprobieren
Während `npm run dev` läuft, zeigt das Terminal auch eine Zeile `Network: http://192.168.…:5173/`.
Diese Adresse auf dem iPhone in Safari eingeben (Mac und iPhone im selben WLAN).
*Hinweis:* So läuft die App, aber **Offline-Modus und Installation** funktionieren erst mit der
Online-Version (die braucht eine sichere `https://`-Adresse, siehe unten).

---

## 2. Kostenlos online stellen

Vorher einmal die fertige Version bauen – das erzeugt den Ordner `dist/`:

```bash
npm run build
```

### Variante A: Netlify Drop (am einfachsten, ohne Konto-Einrichtung von Git)
1. <https://app.netlify.com/drop> öffnen (kostenloses Konto anlegen).
2. Den Ordner `dist` aus dem Finder auf die Seite ziehen.
3. Fertig – du bekommst eine Adresse wie `https://irgendwas.netlify.app`.
Bei Änderungen: neu bauen und den `dist`-Ordner erneut hochziehen.

### Variante B: GitHub Pages (automatisch bei jeder Änderung)
Die Datei `.github/workflows/deploy.yml` ist schon vorbereitet.
1. Kostenloses Konto auf <https://github.com> anlegen und ein neues Repository erstellen
   (z. B. `lese-app`).
2. Projekt hochladen (Claude kann dir dabei helfen).
3. Im Repository: **Settings → Pages → Source: „GitHub Actions“** auswählen.
4. Nach ein bis zwei Minuten ist die App unter `https://<dein-name>.github.io/lese-app/` erreichbar.

### Variante C: Vercel
Auf <https://vercel.com> mit GitHub anmelden, das Repository importieren – Vercel erkennt
Vite automatisch (Build-Befehl `npm run build`, Ausgabeordner `dist`).

---

## 3. Auf den Homebildschirm legen (iPhone/iPad)
1. Die Online-Adresse in **Safari** öffnen.
2. Teilen-Symbol (Quadrat mit Pfeil) → **„Zum Home-Bildschirm“**.
3. Ab jetzt startet die App wie eine normale App – auch ohne Internet.

Wichtig: Jedes Gerät hat seine **eigene** Bibliothek. Bücher müssen pro Gerät einmal
hinzugefügt werden. Lesepositionen und Lesezeichen lassen sich aber abgleichen (siehe 4.).

---

## Bücher bearbeiten
Unter jedem Buch in der Bibliothek auf **„…“** tippen: Dort lassen sich Titel, Autor/in, Serie,
Band-Nummer und Cover ändern (die Datei selbst bleibt unverändert). Über **Sortieren → Serie**
stehen die Bände einer Serie der Reihe nach unter einer Überschrift. Löschen geht ebenfalls dort.

Neben „Sortieren“ öffnet das Symbol rechts die **Ansicht**: Raster, Liste oder Regal
(Cover auf Regalbrettern) und die Cover-Größe (Klein, Mittel, Groß).

## 4. Geräte abgleichen (über GitHub)
Auf **jedem** Gerät einmal einrichten:
1. In der Bibliothek oben auf das **Pfeil-Symbol** (zwei Pfeile im Kreis) tippen.
2. Einen Namen für das Gerät eingeben (z. B. „iPhone“).
3. **„GitHub öffnen“** → bei *Expiration* „No expiration“ wählen → ganz unten **Generate token**
   → den Schlüssel (beginnt mit `ghp_`) kopieren.
4. Zurück in die App, Schlüssel einfügen, **Verbinden**.

Danach werden Positionen, Lesezeichen und selbst bearbeitete Buch-Angaben (Titel, Autor/in,
Serie, Band, eigenes Cover) automatisch abgeglichen. Öffnest du ein Buch, das auf
einem anderen Gerät an einer anderen Stelle ist, fragt die App, ob du dorthin springen möchtest.

- Gespeichert wird in einem privaten Gist in deinem GitHub-Konto
  („Lesezeit – Synchronisation“, bitte nicht löschen). Die Bücher selbst werden **nicht** hochgeladen.
- Dasselbe Buch wird auf allen Geräten an der Datei erkannt – also überall dieselbe Datei verwenden.
- Eigene Cover liegen in einem zweiten privaten Gist („Lesezeit – eigene Cover“).
- Schlüssel verloren oder abgelaufen? Einfach einen neuen erstellen und neu verbinden.

---

## 5. Dropbox-Ordner als Bibliothek
In der Bibliothek auf das **Wolken-Symbol** tippen → **Mit Dropbox anmelden** → Ordner auswählen.
Alle EPUBs und M4B-Hörbücher darin (auch in Unterordnern) erscheinen in der Bibliothek, mit
Wolke und Dateigröße. Ein Tipp auf ein Buch lädt es herunter und öffnet es. Das durchgestrichene
Download-Symbol entfernt die Kopie vom Gerät; das Buch bleibt in Dropbox, Position und
Lesezeichen bleiben erhalten.

- Die App darf in Dropbox nur **lesen** (nie ändern oder löschen).
- Man bleibt angemeldet. Heruntergeladene Bücher funktionieren immer, auch offline.

**Einmalige Einrichtung (App bei Dropbox anlegen):**
1. <https://www.dropbox.com/developers/apps> öffnen → **Create app**.
2. **Scoped access** und **Full Dropbox** wählen, einen Namen vergeben (z. B. `Lesezeit-Bücher`;
   muss bei Dropbox einmalig sein).
3. Reiter **Permissions**: Häkchen bei `files.metadata.read` und `files.content.read` → unten **Submit**.
4. Reiter **Settings** → *Redirect URIs*: `https://nelepauline.github.io/lese-app/` eintragen → **Add**
   (optional zusätzlich `http://localhost:5173/`).
5. Den **App key** (nicht das App secret!) in `src/config.js` bei `DROPBOX_APP_KEY` eintragen.

---

## Projektstruktur

```
src/
  App.jsx                 Hauptkomponente, wählt die Ansicht
  main.jsx                Startpunkt
  db/db.js                Lokaler Speicher (IndexedDB): Bücher, Cover, Fortschritt, Lesezeichen
  services/
    importer.js           Dateien importieren und auswerten
    cloud/                Dropbox: Anmeldung, Ordner lesen, Herunterladen
    progress.js           Fortschritt speichern (meldet Änderungen an den Abgleich)
    sync/                 Abgleich zwischen Geräten über einen GitHub-Gist
  formats/
    epub/epubInfo.js      Titel/Autor/Cover aus EPUBs lesen
    m4b/mp4.js            Kapitel/Titel/Cover aus M4B-Dateien lesen
  library/Library.jsx     Bibliothek
  reader/                 EPUB-Reader (Inhalt, Suche, Lesezeichen, Einstellungen)
  player/                 Hörbuch-Player, Mini-Player, Sperrbildschirm-Steuerung
  settings/settings.js    Einstellungen (Theme, Schrift, Geschwindigkeit …)
  components/             Kleine wiederverwendbare Bausteine (Icons, Fenster, Cover)
  vendor/foliate-js/      EPUB-Engine (eingebunden, siehe VENDOR.md)
public/icons/             App-Icons (neu erzeugen mit `npm run icons`)
```

### Vorbereitung für spätere Etappen
- **Synchronisierte Bücher (Storyteller):** Beim Import wird erkannt, ob ein EPUB Media Overlays
  enthält (`hasMediaOverlay`). foliate-js bringt die Abspiel-Logik bereits mit.
- **Hardcover:** Alles läuft über `saveProgress()` in `services/progress.js`. Dort meldet sich
  schon der Geräte-Abgleich mit `registerSyncTarget()` an; Hardcover kommt genauso dazu.
- **Abgleich testen ohne echtes GitHub:** Mit `VITE_GITHUB_API=<adresse> npm run dev` spricht die
  App mit einem Nachbau der GitHub-API statt mit GitHub.
