# Novo Tracker

A dark-mode gym progress tracker for iPhone, themed on Novo Gym Welling: black kit, the orange feature wall, and the cyan/blue/pink LED strips.

**Live app:** https://jeryybob9-dot.github.io/Gym-tracker/ (once GitHub Pages is switched on; see below)

## What it does

- **Set logger**: pick an exercise, set weight and reps with big +/− steppers, then tap **Log set**. It shows last session's sets (tap one to reuse it), a live estimated 1RM and a rest timer, and you can backfill past dates.
- **Progress charts**: per exercise, chart top set, estimated 1RM or volume (max reps, added weight or total reps for bodyweight moves) over 1M / 3M / 6M / 1Y / All. Drag along the chart to read any session.
- **Bench press PR board**: best estimated 1RM, heaviest set, a goal meter, rep maxes (1/3/5/8/10RM), a PR timeline and an e1RM chart.
- **PR badges**: any set that beats your previous best gets flagged, and you get a "New PR!" alert as you log it.
- **History**: every session by month. Tap a set to edit or delete it.
- **Home**: this week's sessions, sets and volume, your weekly streak and recent sessions.
- **Settings**: kg/lb, rest timer length, bench goal, your own extra exercises, and backup export/import.

Exercises included: Low Pulley Row, Pull Ups, T-Bar Row, Muscle Ups, Cable Bicep Curls, Preacher Curls, Tricep Push Down, Seated Tricep Dips, Primal Chest Press, Pec Deck, Flat Bench Press and Viking Press.

## Install on your iPhone

1. Open the live link in **Safari**.
2. Tap **Share**, then **Add to Home Screen**.
3. Launch it from the home screen. It runs full screen and works offline.

Your data is stored on your phone only (in the browser's local storage), with nothing sent anywhere. Use **Settings → Backup → Export** now and then, and before switching phones.

## Publish with GitHub Pages (one-time)

1. On GitHub, open the repo, then **Settings → Pages**.
2. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
3. Choose branch **main** and folder **/ (root)**, then **Save**.
4. After a minute or so the site is live at `https://jeryybob9-dot.github.io/Gym-tracker/`.

Every push to `main` redeploys automatically.

## Development

It's plain HTML, CSS and JavaScript modules, with no build step and no dependencies. To run it locally:

```sh
npx http-server -p 8080 .
# then open http://localhost:8080
```

| File | Purpose |
| --- | --- |
| `index.html` | App shell and iPhone web-app meta tags |
| `styles.css` | Theme and layout |
| `js/app.js` | Screens, sheets, rest timer, events |
| `js/store.js` | Local storage, backup import/export |
| `js/stats.js` | e1RM (Epley), sessions, PR detection, streaks |
| `js/chart.js` | SVG progress chart with touch scrubbing |
| `js/exercises.js` | Exercise list |
| `sw.js` | Offline support (network first, cached fallback) |

Novo Tracker is an unofficial personal project and isn't affiliated with Novo Gym.
