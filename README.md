# ModForge — a Minecraft Java mod studio for iPad

A self-contained, touch-first web app for building Minecraft Java mods. Describe your mod,
watch the Java + JSON + textures get written, preview your blocks in a 3D voxel scene,
then export a complete Gradle project that runs in the real Java client.

No build step, no framework, no network requests. It is plain HTML, CSS and JavaScript and
works offline from the Files app or from any static server.

```
index.html                  app shell (module-free, works from file://)
assets/css/app.css          design system, shell, forms, sheets
assets/css/editor.css       file tree + code editor
assets/css/preview.css      the Minecraft preview window
assets/js/core.js           DOM, storage, toasts, sheets
assets/js/pixels.js         procedural 16×16 texture generator
assets/js/iso.js            isometric voxel renderer + item/block icons
assets/js/project.js        project model & defaults
assets/js/generator.js      Fabric / NeoForge code + resource generation
assets/js/zip.js            dependency-free ZIP writer (store + CRC32)
assets/js/editor.js         syntax highlighting, file tree, keyboard bar
assets/js/preview.js        island generator, sky, HUD, touch building
assets/js/build.js          builder forms, content sheets, live gallery
assets/js/app.js            navigation, autosave, export
manifest.webmanifest        Add to Home Screen metadata
assets/icons/               app icons
```

## Quick start

The app is static. Any of these work:

```bash
# from this folder
python3 -m http.server 8080
# then open http://<your-computer>:8080 on the iPad
```

Or copy the folder to iCloud Drive / Files, open `index.html` in Safari, and use
**Share → Add to Home Screen** for a full-screen, standalone app.

## What you can do

**Build** — name the mod, pick Fabric or NeoForge and Minecraft 1.21.1 / 1.21.4. Add blocks
and items and give each one a procedurally generated 16×16 texture (17 material patterns,
18 tint palettes), hardness, tool, light emission, transparency, stack size and a tooltip.

**Code** — a real editor with syntax highlighting for Java, JSON, Gradle and TOML, line
numbers, auto-indent, bracket pairs, a touch keyboard bar for `{ } ( ) ; " @`, JSON
validation and a "revert to generated" action. Files you edit are preserved when the
project regenerates.

**Preview** — a Minecraft-styled window with a title screen, loading sequence and an
isometric island. Your blocks ring the pond on spawn. Tap a face to place the selected
block, swipe to rotate, pinch to zoom, switch to break/inspect tools, and open the mod
gallery. Sky, clouds and stars are drawn procedurally; time of day and world seed are
configurable.

**Export** — download `yourmod-1.0.0.zip` with:

- `build.gradle`, `settings.gradle`, `gradle.properties`, `.gitignore`, `README.md`
- the mod entry point, `ModBlocks`, `ModItems`, a creative tab and optional tooltip hooks
- `fabric.mod.json` or `META-INF/neoforge.mods.toml`
- blockstates, block/item models, `en_us.json`
- every 16×16 PNG texture plus a 128×128 mod icon

The project is autosaved to `localStorage`; the save indicator in the top bar shows when
it is written.

## Getting it into Minecraft

The preview inside the browser is a renderer, not the Java client. To run the real game:

1. Export the zip and unzip it on a computer with JDK 21.
2. `gradle wrapper --gradle-version 8.10` (one time), then `./gradlew runClient`.
3. Or `./gradlew build` and copy `build/libs/*.jar` into `.minecraft/mods`.

Loader/Gradle versions move fast — the generated `README.md` links to the official sites
for the current versions of the Minecraft release you chose.

## iPad notes

- Layout adapts: rail navigation in landscape, a bottom tab bar in portrait.
- All controls are at least 44 pt; hover is never required.
- Safe-area insets are respected (notch, rounded corners, home indicator).
- The editor shows a code-key toolbar above the software keyboard.
- `viewport-fit=cover`, `user-scalable=no` and `touch-action: manipulation` prevent
  accidental zoom during editing.
- The preview screen sizes its HUD with CSS container queries, so it scales like a game
  window from a 10.2" iPad to a 13" iPad Pro.
