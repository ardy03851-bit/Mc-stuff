# ModForge — a Minecraft Java mod studio for iPad

A self-contained, touch-first web app for building Minecraft Java mods. Describe your mod,
watch the Java + JSON + textures get written, preview your blocks in a 3D voxel scene, then
export either a complete Gradle project for the Java client or a `.mcaddon` that installs
your blocks in the real Minecraft app on iPad, iPhone and consoles.

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
assets/js/bedrock.js        Bedrock add-on (.mcaddon) for the Minecraft app
assets/js/play.js           the three "real game" routes + install guide
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
configurable. **It is a renderer, not the game** — the title screen says so, and the
*Play real Minecraft* button sits above it.

**Export** — two real deliverables:

`yourmod-1.0.0.zip` — the Java mod as a Gradle project:

- `build.gradle`, `settings.gradle`, `gradle.properties`, `.gitignore`, `README.md`
- `run-client.command` / `run-client.bat` — double-click to boot the client with the mod
- the mod entry point, `ModBlocks`, `ModItems`, a creative tab and optional tooltip hooks
- `fabric.mod.json` or `META-INF/neoforge.mods.toml`
- blockstates, block/item models, `en_us.json`
- every 16×16 PNG texture plus a 128×128 mod icon

`yourmod-1.0.0.mcaddon` — the same blocks and items as a Bedrock add-on (behaviour pack +
resource pack), which installs into the real Minecraft app on iPad, iPhone, Android,
Windows and consoles. Custom blocks use `minecraft:geometry.full_block` with per-face
`material_instances`; items use the data-driven `minecraft:item` format. Requires
Minecraft 1.21.80 or newer.

The project is autosaved to `localStorage`; the save indicator in the top bar shows when
it is written.

## Getting it into Minecraft

The window inside the app is a renderer. There are three ways to reach the actual game,
and the **Play the real game** card offers all of them:

**1 · Minecraft app — iPad, iPhone, console, Windows** (the only in-game route on iPad)

1. Tap **Download .mcaddon**; Safari saves it to Files → Downloads.
2. Open the file in Files → Share → **Minecraft**. The game imports two packs.
3. Create or edit a world → **Add-ons → Behaviour packs → My packs** → activate the pack.
4. Creative inventory → *Construction* for blocks, *Items* for items.

Minecraft Java Edition needs a JVM and a desktop OpenGL window, so it cannot run on
iPadOS and no website can start it. The Bedrock add-on is the real-game route there.

**2 · Java Edition — Mac or PC with JDK 21**

1. Unzip the project.
2. Double-click `run-client.command` (macOS/Linux) or `run-client.bat` (Windows), or run
   `gradle wrapper --gradle-version 8.10` once and then `./gradlew runClient`.
3. Or `./gradlew build` and copy `build/libs/*.jar` into `.minecraft/mods`.

Loader/Gradle versions move fast — the generated `README.md` links to the official sites
for the current versions of the Minecraft release you chose.

**3 · Browser, no install**

The app links to a third-party Java-Edition client (1.8.8 compiled to JavaScript) that
runs in a tab on any device. It is real Minecraft, but it is not your mod and does not
run offline.

## iPad notes

- Layout adapts: rail navigation in landscape, a bottom tab bar in portrait.
- All controls are at least 44 pt; hover is never required.
- Safe-area insets are respected (notch, rounded corners, home indicator).
- The editor shows a code-key toolbar above the software keyboard.
- `viewport-fit=cover`, `user-scalable=no` and `touch-action: manipulation` prevent
  accidental zoom during editing.
- The preview screen sizes its HUD with CSS container queries, so it scales like a game
  window from a 10.2" iPad to a 13" iPad Pro.
