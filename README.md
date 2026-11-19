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

## 4. Geräte abgleichen (über GitHub)
Auf **jedem** Gerät einmal einrichten:
1. In der Bibliothek oben auf das **Wolken-Symbol** tippen.
2. Einen Namen für das Gerät eingeben (z. B. „iPhone“).
3. **„GitHub öffnen“** → bei *Expiration* „No expiration“ wählen → ganz unten **Generate token**
   → den Schlüssel (beginnt mit `ghp_`) kopieren.
4. Zurück in die App, Schlüssel einfügen, **Verbinden**.

Danach werden Positionen und Lesezeichen automatisch abgeglichen. Öffnest du ein Buch, das auf
einem anderen Gerät an einer anderen Stelle ist, fragt die App, ob du dorthin springen möchtest.

- Gespeichert wird in einem privaten Gist in deinem GitHub-Konto
  („Lesezeit – Synchronisation“, bitte nicht löschen). Die Bücher selbst werden **nicht** hochgeladen.
- Dasselbe Buch wird auf allen Geräten an der Datei erkannt – also überall dieselbe Datei verwenden.
- Schlüssel verloren oder abgelaufen? Einfach einen neuen erstellen und neu verbinden.

---

## 5. OneDrive-Ordner als Bibliothek
In der Bibliothek auf das **Wolken-Symbol** tippen → **Mit Microsoft anmelden** → Ordner auswählen.
Alle EPUBs und M4B-Hörbücher darin (auch in Unterordnern) erscheinen in der Bibliothek, mit
Wolke und Dateigröße. Ein Tipp auf ein Buch lädt es herunter und öffnet es. Das durchgestrichene
Download-Symbol entfernt die Kopie vom Gerät; das Buch bleibt in OneDrive, Position und
Lesezeichen bleiben erhalten.

- Die App darf in OneDrive nur **lesen** (nie ändern oder löschen).
- Microsoft lässt Web-Apps ca. **24 Stunden** angemeldet. Danach einmal auf „Neu anmelden“ tippen.
  Heruntergeladene Bücher funktionieren immer, auch offline.

**Einmalige Einrichtung (App bei Microsoft registrieren):**
1. <https://portal.azure.com> mit dem Microsoft-Konto öffnen → „App-Registrierungen“ → „Neue Registrierung“.
2. Name: `Lesezeit`. Kontotypen: „Konten in einem beliebigen Organisationsverzeichnis und persönliche
   Microsoft-Konten“.
3. Umleitungs-URI: Plattform **Single-Page-Anwendung (SPA)**, Adresse
   `https://nelepauline.github.io/lese-app/` (optional zusätzlich `http://localhost:5173/`).
4. Die angezeigte **Anwendungs-ID (Client-ID)** in `src/config.js` bei `ONEDRIVE_CLIENT_ID` eintragen.

---

## Projektstruktur

```
src/
  App.jsx                 Hauptkomponente, wählt die Ansicht
  main.jsx                Startpunkt
  db/db.js                Lokaler Speicher (IndexedDB): Bücher, Cover, Fortschritt, Lesezeichen
  services/
    importer.js           Dateien importieren und auswerten
    cloud/                OneDrive: Anmeldung, Ordner lesen, Herunterladen
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
