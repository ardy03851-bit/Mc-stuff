/* ============================================================
   generator.js — turns the builder model into a real Gradle mod
   ============================================================ */
(function (MF) {
  'use strict';
  const { pascal, snake, escapeHtml } = MF.util;
  const T = '\t';

  const LANG_FOR = {
    java: 'java', json: 'json', gradle: 'gradle', properties: 'properties',
    toml: 'toml', md: 'md', png: 'png', gitignore: 'text'
  };
  function langFor(path) {
    if (/\.java$/.test(path)) return 'java';
    if (/\.json$/.test(path)) return 'json';
    if (/\.gradle$/.test(path)) return 'gradle';
    if (/\.properties$/.test(path)) return 'properties';
    if (/\.toml$/.test(path)) return 'toml';
    if (/\.md$/.test(path)) return 'md';
    if (/\.png$/.test(path)) return 'png';
    if (/\.gitignore$/.test(path)) return 'text';
    return 'text';
  }

  function context(p) {
    const ns = p.modid;
    const cls = pascal(p.name);
    const pkg = p.pkg;
    const dir = 'src/main/java/' + pkg.replace(/\./g, '/');
    const v = {
      modern: p.mcVersion !== '1.21.1',
      itemDefinitions: p.mcVersion === '1.21.4',
      needsItemKey: p.mcVersion === '1.21.4'
    };
    return { p, ns, cls, pkg, dir, v, blocks: p.blocks || [], items: p.items || [] };
  }

  function num(n) {
    const v = Math.round(n * 100) / 100;
    return (Number.isInteger(v) ? v.toFixed(1) : String(v)) + 'f';
  }
  function jstr(s) { return JSON.stringify(String(s)); }
  function py(s) { return String(s); }

  /* ---------------- resource files ---------------- */
  function resourceFiles(ctx, files) {
    const { p, ns, v, blocks, items } = ctx;
    const lang = {};
    lang['itemGroup.' + ns + '.main'] = p.name;

    blocks.forEach((b) => {
      const id = b.slug;
      lang['block.' + ns + '.' + id] = b.name;
      if (b.tooltip) lang['tooltip.' + ns + '.' + id] = b.tooltip;
      files.push({
        path: 'src/main/resources/assets/' + ns + '/blockstates/' + id + '.json',
        content: JSON.stringify({ variants: { '': { model: ns + ':block/' + id } } }, null, 2) + '\n'
      });
      files.push({
        path: 'src/main/resources/assets/' + ns + '/models/block/' + id + '.json',
        content: JSON.stringify({ parent: 'minecraft:block/cube_all', textures: { all: ns + ':block/' + id } }, null, 2) + '\n'
      });
      if (v.itemDefinitions) {
        files.push({
          path: 'src/main/resources/assets/' + ns + '/items/' + id + '.json',
          content: JSON.stringify({ model: { type: 'minecraft:model', model: ns + ':block/' + id } }, null, 2) + '\n'
        });
      } else {
        files.push({
          path: 'src/main/resources/assets/' + ns + '/models/item/' + id + '.json',
          content: JSON.stringify({ parent: ns + ':block/' + id }, null, 2) + '\n'
        });
      }
      const tex = MF.pixels.blockTextures(b);
      files.push({
        path: 'src/main/resources/assets/' + ns + '/textures/block/' + id + '.png',
        dataUrl: MF.pixels.dataUrl(tex.rawSide),
        binary: true
      });
    });

    items.forEach((it) => {
      const id = it.slug;
      lang['item.' + ns + '.' + id] = it.name;
      if (it.tooltip) lang['tooltip.' + ns + '.' + id] = it.tooltip;
      files.push({
        path: 'src/main/resources/assets/' + ns + '/models/item/' + id + '.json',
        content: JSON.stringify({ parent: 'minecraft:item/generated', textures: { layer0: ns + ':item/' + id } }, null, 2) + '\n'
      });
      if (v.itemDefinitions) {
        files.push({
          path: 'src/main/resources/assets/' + ns + '/items/' + id + '.json',
          content: JSON.stringify({ model: { type: 'minecraft:model', model: ns + ':item/' + id } }, null, 2) + '\n'
        });
      }
      files.push({
        path: 'src/main/resources/assets/' + ns + '/textures/item/' + id + '.png',
        dataUrl: MF.pixels.dataUrl(MF.pixels.itemTexture(it)),
        binary: true
      });
    });

    files.push({
      path: 'src/main/resources/assets/' + ns + '/lang/en_us.json',
      content: JSON.stringify(lang, null, 2) + '\n'
    });

    // mod icon
    const icon = makeIcon(ctx);
    files.push({
      path: 'src/main/resources/assets/' + ns + '/icon.png',
      dataUrl: icon,
      binary: true
    });
    if (p.loader === 'neoforge') {
      files.push({ path: 'src/main/resources/icon.png', dataUrl: icon, binary: true });
    }

    return lang;
  }

  function makeIcon(ctx) {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, size, size);
    bg.addColorStop(0, '#17252f');
    bg.addColorStop(1, '#0a1218');
    g.fillStyle = bg;
    g.fillRect(0, 0, size, size);
    g.fillStyle = 'rgba(94,224,138,0.14)';
    g.beginPath();
    g.arc(size / 2, size * 0.52, size * 0.46, 0, Math.PI * 2);
    g.fill();
    const first = ctx.blocks[0] || { material: 'grass', tint: 'none', seed: 'icon' };
    g.imageSmoothingEnabled = false;
    MF.icons.paintCube(g, MF.pixels.blockTextures(first), size / 2, size * 0.4, size * 0.3);
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.fillRect(0, size - 12, size, 12);
    return MF.pixels.dataUrl(c);
  }

  /* ---------------- shared project files ---------------- */
  function sharedFiles(ctx, files, loader) {
    const { p, ns, cls } = ctx;
    files.push({
      path: '.gitignore',
      content: ['# Gradle', '.gradle/', 'build/', 'run/', 'out/', '', '# Idea', '.idea/', '*.iml', '', '# macOS', '.DS_Store', ''].join('\n')
    });
    files.push({
      path: 'run-client.command',
      mode: 0o755,
      content: [
        '#!/bin/sh',
        '# ' + p.name + ' — boot Minecraft with this mod loaded (macOS / Linux)',
        'cd "$(dirname "$0")" || exit 1',
        'if [ ! -f ./gradlew ]; then',
        '  echo "Generating the Gradle wrapper (one time)…"',
        '  gradle wrapper --gradle-version 8.10 || { echo "Install Gradle 8.10 and JDK 21 first."; exit 1; }',
        'fi',
        'chmod +x ./gradlew 2>/dev/null',
        './gradlew runClient',
        ''
      ].join('\n')
    });
    files.push({
      path: 'run-client.bat',
      content: [
        '@echo off',
        'REM ' + p.name + ' — boot Minecraft with this mod loaded (Windows)',
        'cd /d "%~dp0"',
        'if not exist gradlew.bat (',
        '  echo Generating the Gradle wrapper ^(one time^)...',
        '  call gradle wrapper --gradle-version 8.10',
        '  if errorlevel 1 goto fail',
        ')',
        'call gradlew.bat runClient',
        'goto :eof',
        ':fail',
        'echo Install Gradle 8.10 and JDK 21 first.',
        'pause',
        ''
      ].join('\r\n')
    });
    files.push({
      path: 'README.md',
      content: [
        '# ' + p.name,
        '',
        p.description,
        '',
        '- **Loader:** ' + (loader === 'fabric' ? 'Fabric' : 'NeoForge'),
        '- **Minecraft:** ' + p.mcVersion,
        '- **Mod id:** `' + ns + '`',
        '- **Java package:** `' + p.pkg + '`',
        '- **Generated with:** ModForge',
        '',
        '## Run the game with the mod',
        '',
        'Fastest: double-click `run-client.command` (macOS) or `run-client.bat` (Windows).',
        'It generates the Gradle wrapper on first run and then boots the real client with',
        'the mod loaded.',
        '',
        '```bash',
        '# one time only, if this project has no wrapper yet',
        'gradle wrapper --gradle-version 8.10',
        '',
        './gradlew runClient',
        '```',
        '',
        '## Build a jar',
        '',
        '```bash',
        './gradlew build',
        '# the jar lands in build/libs/' + ns + '-' + p.version + '.jar',
        '```',
        '',
        '## Install',
        '',
        '1. Install ' + (loader === 'fabric' ? 'Fabric Loader' : 'NeoForge') + ' for Minecraft ' + p.mcVersion + '.',
        '2. Put the built jar in `.minecraft/mods`.',
        '3. Launch the game.',
        '',
        '## Things you may need to change',
        '',
        '- Gradle plugin / loader versions move fast. Check https://fabricmc.net/develop or https://neoforged.net for the current versions for ' + p.mcVersion + '.',
        '- All code and assets in this project were generated from your ModForge project. Edit them freely.',
        '',
        '## What is included',
        '',
        '- Mod entry point and registry classes',
        '- ' + p.blocks.length + ' block' + (p.blocks.length === 1 ? '' : 's') + ' and ' + p.items.length + ' item' + (p.items.length === 1 ? '' : 's') + ', all registered',
        '- Blockstates, block + item models, lang entries',
        '- 16×16 textures generated to match your palette choices',
        ''
      ].join('\n')
    });
    files.push({
      path: 'LICENSE',
      content: 'MIT License\n\nCopyright (c) ' + new Date().getFullYear() + ' ' + (p.author || 'you') + '\n\nPermission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:\n\nThe above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.\n\nTHE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.\n'
    });
  }

  /* ============================================================
     FABRIC
     ============================================================ */
  function fabricFiles(ctx, files) {
    const { p, ns, cls, pkg, dir, v, blocks, items } = ctx;
    const mc = p.mcVersion;
    const versions = mc === '1.21.4'
      ? { yarn: '1.21.4+build.8', loader: '0.16.10', api: '0.119.2+1.21.4' }
      : { yarn: '1.21.1+build.3', loader: '0.16.9', api: '0.107.0+1.21.1' };

    sharedFiles(ctx, files, 'fabric');

    files.push({
      path: 'settings.gradle',
      content: [
        'pluginManagement {',
        T + 'repositories {',
        T + T + 'maven { name = "Fabric"; url = "https://maven.fabricmc.net/" }',
        T + T + 'mavenCentral()',
        T + T + 'gradlePluginPortal()',
        T + '}',
        '}',
        '',
        'rootProject.name = "' + ns + '"',
        ''
      ].join('\n')
    });

    files.push({
      path: 'gradle.properties',
      content: [
        'org.gradle.jvmargs=-Xmx2G',
        'org.gradle.parallel=true',
        '',
        '# Minecraft / Fabric — update these for other versions',
        'minecraft_version=' + mc,
        'yarn_mappings=' + versions.yarn,
        'loader_version=' + versions.loader,
        'fabric_version=' + versions.api,
        '',
        '# Mod',
        'mod_version=' + p.version,
        'maven_group=' + pkg,
        'archives_base_name=' + ns,
        ''
      ].join('\n')
    });

    files.push({
      path: 'build.gradle',
      content: [
        'plugins {',
        T + 'id "fabric-loom" version "1.9-SNAPSHOT"',
        T + 'id "maven-publish"',
        '}',
        '',
        'version = project.mod_version',
        'group = project.maven_group',
        '',
        'base {',
        T + 'archivesName = project.archives_base_name',
        '}',
        '',
        'repositories {',
        T + 'mavenCentral()',
        T + 'maven { name = "Fabric"; url = "https://maven.fabricmc.net/" }',
        '}',
        '',
        'dependencies {',
        T + 'minecraft "com.mojang:minecraft:${project.minecraft_version}"',
        T + 'mappings "net.fabricmc:yarn:${project.yarn_mappings}:v2"',
        T + 'modImplementation "net.fabricmc:fabric-loader:${project.loader_version}"',
        T + 'modImplementation "net.fabricmc.fabric-api:fabric-api:${project.fabric_version}"',
        '}',
        '',
        'processResources {',
        T + 'inputs.property "version", project.version',
        T + 'filesMatching("fabric.mod.json") {',
        T + T + 'expand "version": inputs.properties.version',
        T + '}',
        '}',
        '',
        'tasks.withType(JavaCompile).configureEach {',
        T + 'it.options.release = 21',
        '}',
        '',
        'java {',
        T + 'withSourcesJar()',
        T + 'sourceCompatibility = JavaVersion.VERSION_21',
        T + 'targetCompatibility = JavaVersion.VERSION_21',
        '}',
        ''
      ].join('\n')
    });

    const hasTooltips = blocks.concat(items).some((c) => c.tooltip);
    const entrypoints = { main: [pkg + '.' + cls] };
    if (hasTooltips) entrypoints.client = [pkg + '.client.' + cls + 'Client'];

    files.push({
      path: 'src/main/resources/fabric.mod.json',
      content: JSON.stringify({
        schemaVersion: 1,
        id: ns,
        version: '${version}',
        name: p.name,
        description: p.description,
        authors: [p.author || 'anonymous'],
        license: 'MIT',
        icon: 'assets/' + ns + '/icon.png',
        environment: '*',
        entrypoints,
        depends: {
          fabricloader: '>=' + versions.loader,
          minecraft: '~' + mc,
          java: '>=21',
          'fabric-api': '*'
        }
      }, null, 2) + '\n'
    });

    /* ---- main class ---- */
    files.push({
      path: dir + '/' + cls + '.java',
      content: [
        'package ' + pkg + ';',
        '',
        'import net.fabricmc.api.ModInitializer;',
        'import net.minecraft.util.Identifier;',
        'import org.slf4j.Logger;',
        'import org.slf4j.LoggerFactory;',
        '',
        '/**',
        ' * ' + p.name + ' — entry point.',
        ' * Generated by ModForge. Everything here is yours to edit.',
        ' */',
        'public class ' + cls + ' implements ModInitializer {',
        T + 'public static final String MOD_ID = "' + ns + '";',
        T + 'public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);',
        '',
        T + '/** Namespaced id helper: ' + cls + '.id("' + (blocks[0] ? blocks[0].slug : 'example') + '") */',
        T + 'public static Identifier id(String path) {',
        T + T + 'return Identifier.of(MOD_ID, path);',
        T + '}',
        '',
        T + '@Override',
        T + 'public void onInitialize() {',
        T + T + 'ModBlocks.register();',
        T + T + 'ModItems.register();',
        T + T + 'ModItemGroups.register();',
        '',
        T + T + 'LOGGER.info("{} ready — {} blocks, {} items", MOD_ID, ModBlocks.ALL.size(), ModItems.ALL.size());',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    /* ---- blocks ---- */
    const blockFields = blocks.map((b) => {
      const settings = ['AbstractBlock.Settings.create()', '.strength(' + num(b.hardness) + ')'];
      if (b.tool !== 'none') settings.push('.requiresTool()');
      if (b.glow) settings.push('.luminance(state -> 12)');
      if (b.transparent) settings.push('.nonOpaque()');
      return T + 'public static final Block ' + b.slug.toUpperCase() + ' = register("' + b.slug + '",' +
        '\n' + T + T + settings.join('\n' + T + T) + ');';
    });

    files.push({
      path: dir + '/block/ModBlocks.java',
      content: [
        'package ' + pkg + '.block;',
        '',
        'import ' + pkg + '.' + cls + ';',
        'import net.minecraft.block.AbstractBlock;',
        'import net.minecraft.block.Block;',
        'import net.minecraft.item.BlockItem;',
        'import net.minecraft.item.Item;',
        'import net.minecraft.registry.Registries;',
        'import net.minecraft.registry.Registry;',
        'import net.minecraft.registry.RegistryKey;',
        'import net.minecraft.registry.RegistryKeys;',
        'import java.util.ArrayList;',
        'import java.util.List;',
        '',
        '/**',
        ' * Every block in ' + p.name + '.',
        ' * A matching BlockItem is registered for each block automatically.',
        ' */',
        'public final class ModBlocks {',
        T + 'public static final List<Block> ALL = new ArrayList<>();',
        '',
        blockFields.length ? blockFields.join('\n\n') : T + '// No blocks yet — add one in ModForge and regenerate.',
        '',
        T + 'private ModBlocks() {',
        T + '}',
        '',
        T + 'private static Block register(String path, AbstractBlock.Settings settings) {',
        T + T + 'RegistryKey<Block> blockKey = RegistryKey.of(RegistryKeys.BLOCK, ' + cls + '.id(path));',
        T + T + 'Block block = new Block(settings);',
        T + T + 'Registry.register(Registries.BLOCK, blockKey, block);',
        '',
        T + T + 'RegistryKey<Item> itemKey = RegistryKey.of(RegistryKeys.ITEM, ' + cls + '.id(path));',
        T + T + (v.needsItemKey
          ? 'Registry.register(Registries.ITEM, itemKey, new BlockItem(block, new Item.Settings().registryKey(itemKey)));'
          : 'Registry.register(Registries.ITEM, itemKey, new BlockItem(block, new Item.Settings()));'),
        T + T + 'ALL.add(block);',
        T + T + 'return block;',
        T + '}',
        '',
        T + '/** Called from the mod initializer so the class (and its fields) load. */',
        T + 'public static void register() {',
        T + T + cls + '.LOGGER.info("Registered {} blocks", ALL.size());',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    /* ---- items ---- */
    const itemFields = items.map((it) => {
      const chain = ['new Item.Settings()', '.maxCount(' + it.stackSize + ')'];
      if (v.needsItemKey) chain.push('.registryKey(itemKey("' + it.slug + '"))');
      return T + 'public static final Item ' + it.slug.toUpperCase() + ' = register("' + it.slug + '", ' +
        chain.join('') + ');';
    });

    files.push({
      path: dir + '/item/ModItems.java',
      content: [
        'package ' + pkg + '.item;',
        '',
        'import ' + pkg + '.' + cls + ';',
        'import net.minecraft.item.Item;',
        'import net.minecraft.registry.Registries;',
        'import net.minecraft.registry.Registry;',
        'import net.minecraft.registry.RegistryKey;',
        'import net.minecraft.registry.RegistryKeys;',
        'import java.util.ArrayList;',
        'import java.util.List;',
        '',
        '/** Every standalone item in ' + p.name + '. */',
        'public final class ModItems {',
        T + 'public static final List<Item> ALL = new ArrayList<>();',
        '',
        itemFields.length ? itemFields.join('\n\n') : T + '// No items yet — add one in ModForge and regenerate.',
        '',
        T + 'private ModItems() {',
        T + '}',
        '',
        (v.needsItemKey ? [
          T + 'private static RegistryKey<Item> itemKey(String path) {',
          T + T + 'return RegistryKey.of(RegistryKeys.ITEM, ' + cls + '.id(path));',
          T + '}',
          ''
        ].join('\n') : ''),
        T + 'private static Item register(String path, Item.Settings settings) {',
        T + T + 'RegistryKey<Item> key = RegistryKey.of(RegistryKeys.ITEM, ' + cls + '.id(path));',
        T + T + 'Item item = new Item(settings);',
        T + T + 'Registry.register(Registries.ITEM, key, item);',
        T + T + 'ALL.add(item);',
        T + T + 'return item;',
        T + '}',
        '',
        T + 'public static void register() {',
        T + T + cls + '.LOGGER.info("Registered {} items", ALL.size());',
        T + '}',
        '}',
        ''
      ].filter((l) => l !== null).join('\n')
    });

    /* ---- creative tab ---- */
    const tabEntries = blocks.map((b) => T + T + T + T + 'entries.add(ModBlocks.' + b.slug.toUpperCase() + ');')
      .concat(items.map((i) => T + T + T + T + 'entries.add(ModItems.' + i.slug.toUpperCase() + ');'));
    const tabIcon = blocks[0]
      ? 'new ItemStack(ModBlocks.' + blocks[0].slug.toUpperCase() + ')'
      : (items[0] ? 'new ItemStack(ModItems.' + items[0].slug.toUpperCase() + ')' : 'new ItemStack(net.minecraft.item.Items.STONE)');

    files.push({
      path: dir + '/item/ModItemGroups.java',
      content: [
        'package ' + pkg + '.item;',
        '',
        'import ' + pkg + '.' + cls + ';',
        'import ' + pkg + '.block.ModBlocks;',
        'import net.fabricmc.fabric.api.itemgroup.v1.FabricItemGroup;',
        'import net.minecraft.item.ItemGroup;',
        'import net.minecraft.item.ItemStack;',
        'import net.minecraft.registry.Registries;',
        'import net.minecraft.registry.Registry;',
        'import net.minecraft.registry.RegistryKey;',
        'import net.minecraft.registry.RegistryKeys;',
        'import net.minecraft.text.Text;',
        '',
        '/** One creative tab holding everything from ' + p.name + '. */',
        'public final class ModItemGroups {',
        T + 'public static final RegistryKey<ItemGroup> MAIN =',
        T + T + 'RegistryKey.of(RegistryKeys.ITEM_GROUP, ' + cls + '.id("main"));',
        '',
        T + 'private ModItemGroups() {',
        T + '}',
        '',
        T + 'public static void register() {',
        T + T + 'Registry.register(Registries.ITEM_GROUP, MAIN, FabricItemGroup.builder()',
        T + T + T + '.icon(() -> ' + tabIcon + ')',
        T + T + T + '.displayName(Text.translatable("itemGroup.' + ns + '.main"))',
        T + T + T + '.entries((context, entries) -> {',
        tabEntries.length ? tabEntries.join('\n') : T + T + T + T + '// add entries here',
        T + T + T + '})',
        T + T + T + '.build());',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    /* ---- tooltips (client) ---- */
    if (hasTooltips) {
      const lines = [];
      blocks.concat(items).forEach((c) => {
        if (!c.tooltip) return;
        const ref = c.kind === 'block'
          ? 'ModBlocks.' + c.slug.toUpperCase()
          : 'ModItems.' + c.slug.toUpperCase();
        lines.push(T + T + T + 'if (stack.isOf(' + ref + ')) {');
        lines.push(T + T + T + T + 'lines.add(Text.translatable("tooltip.' + ns + '.' + c.slug + '").formatted(Formatting.GRAY));');
        lines.push(T + T + T + '}');
      });
      files.push({
        path: dir + '/client/' + cls + 'Client.java',
        content: [
          'package ' + pkg + '.client;',
          '',
          'import ' + pkg + '.block.ModBlocks;',
          'import ' + pkg + '.item.ModItems;',
          'import net.fabricmc.api.ClientModInitializer;',
          'import net.fabricmc.fabric.api.client.item.v1.ItemTooltipCallback;',
          'import net.minecraft.util.Formatting;',
          'import net.minecraft.text.Text;',
          '',
          '/** Client-only extras: item tooltips. */',
          'public class ' + cls + 'Client implements ClientModInitializer {',
          T + '@Override',
          T + 'public void onInitializeClient() {',
          T + T + 'ItemTooltipCallback.EVENT.register((stack, context, type, lines) -> {',
          lines.join('\n'),
          T + T + '});',
          T + '}',
          '}',
          ''
        ].join('\n')
      });
    }

    return files;
  }

  /* ============================================================
     NEOFORGE
     ============================================================ */
  function neoForgeFiles(ctx, files) {
    const { p, ns, cls, pkg, dir, blocks, items } = ctx;
    const neoVersion = p.mcVersion === '1.21.4' ? '21.4.80' : '21.1.80';

    sharedFiles(ctx, files, 'neoforge');

    files.push({
      path: 'settings.gradle',
      content: [
        'pluginManagement {',
        T + 'repositories {',
        T + T + 'mavenLocal()',
        T + T + 'gradlePluginPortal()',
        T + T + 'maven { name = "NeoForge"; url = "https://maven.neoforged.net/releases" }',
        T + '}',
        '}',
        '',
        'plugins {',
        T + 'id "net.neoforged.moddev" version "2.0.78"',
        '}',
        '',
        'rootProject.name = "' + ns + '"',
        ''
      ].join('\n')
    });

    files.push({
      path: 'gradle.properties',
      content: [
        'org.gradle.jvmargs=-Xmx2G',
        'org.gradle.parallel=true',
        '',
        'mod_id=' + ns,
        'mod_version=' + p.version,
        'mod_group_id=' + pkg,
        'mod_name=' + p.name.replace(/[^\w ]/g, ''),
        'minecraft_version=' + p.mcVersion,
        'neo_version=' + neoVersion,
        ''
      ].join('\n')
    });

    files.push({
      path: 'build.gradle',
      content: [
        'plugins {',
        T + 'id "java-library"',
        T + 'id "net.neoforged.moddev" version "2.0.78"',
        '}',
        '',
        'version = project.mod_version',
        'group = project.mod_group_id',
        '',
        'base {',
        T + 'archivesName = project.mod_id',
        '}',
        '',
        'java.toolchain.languageVersion = JavaLanguageVersion.of(21)',
        '',
        'neoForge {',
        T + 'version = project.neo_version',
        '',
        T + 'runs {',
        T + T + 'client {',
        T + T + T + 'client()',
        T + T + T + 'systemProperty "neoforge.enabledGameTestNamespaces", project.mod_id',
        T + T + '}',
        T + '}',
        '',
        T + 'mods {',
        T + T + 'register(project.mod_id) {',
        T + T + T + 'sourceSet(sourceSets.main)',
        T + T + '}',
        T + '}',
        '}',
        '',
        'tasks.withType(JavaCompile).configureEach {',
        T + 'options.encoding = "UTF-8"',
        '}',
        ''
      ].join('\n')
    });

    files.push({
      path: 'src/main/resources/META-INF/neoforge.mods.toml',
      content: [
        'modLoader="javafml"',
        'loaderVersion="[4,)"',
        'license="MIT"',
        '',
        '[[mods]]',
        'modId="' + ns + '"',
        'version="${file.jarVersion}"',
        'displayName="' + p.name.replace(/"/g, '') + '"',
        'authors="' + (p.author || 'you').replace(/"/g, '') + '"',
        'description=\'\'\'' + p.description.replace(/'''/g, "''") + '\'\'\'',
        'logoFile="icon.png"',
        '',
        '[[dependencies.' + ns + ']]',
        'modId="neoforge"',
        'type="required"',
        'versionRange="[' + neoVersion + ',)"',
        'ordering="NONE"',
        'side="BOTH"',
        '',
        '[[dependencies.' + ns + ']]',
        'modId="minecraft"',
        'type="required"',
        'versionRange="[' + p.mcVersion + ',)"',
        'ordering="NONE"',
        'side="BOTH"',
        ''
      ].join('\n')
    });

    const blockFields = blocks.map((b) => {
      const props = ['BlockBehaviour.Properties.of()', '.strength(' + num(b.hardness) + ')'];
      if (b.tool !== 'none') props.push('.requiresCorrectToolForDrops()');
      if (b.glow) props.push('.lightLevel(state -> 12)');
      if (b.transparent) props.push('.noOcclusion()');
      return T + 'public static final DeferredBlock<Block> ' + b.slug.toUpperCase() + ' = register("' + b.slug + '",' +
        '\n' + T + T + '() -> new Block(' + props.join('\n' + T + T + T) + '));';
    });

    const itemFields = items.map((it) =>
      T + 'public static final DeferredItem<Item> ' + it.slug.toUpperCase() + ' = register("' + it.slug + '",' +
      '\n' + T + T + '() -> new Item(new Item.Properties().stacksTo(' + it.stackSize + ')));'
    );

    const tabEntries = blocks.map((b) => T + T + T + T + 'output.accept(ModBlocks.' + b.slug.toUpperCase() + '.get());')
      .concat(items.map((i) => T + T + T + T + 'output.accept(ModItems.' + i.slug.toUpperCase() + '.get());'));
    const tabIcon = blocks[0]
      ? 'new ItemStack(ModBlocks.' + blocks[0].slug.toUpperCase() + '.get())'
      : (items[0] ? 'new ItemStack(ModItems.' + items[0].slug.toUpperCase() + '.get())' : 'new ItemStack(net.minecraft.world.item.Items.STONE)');

    files.push({
      path: dir + '/' + cls + '.java',
      content: [
        'package ' + pkg + ';',
        '',
        'import ' + pkg + '.registry.ModBlocks;',
        'import ' + pkg + '.registry.ModItems;',
        'import ' + pkg + '.registry.ModCreativeTabs;',
        'import net.minecraft.resources.ResourceLocation;',
        'import net.neoforged.bus.api.IEventBus;',
        'import net.neoforged.fml.ModContainer;',
        'import net.neoforged.fml.common.Mod;',
        'import org.slf4j.Logger;',
        'import org.slf4j.LoggerFactory;',
        '',
        '/** ' + p.name + ' — NeoForge entry point. Generated by ModForge. */',
        '@Mod(' + cls + '.MOD_ID)',
        'public class ' + cls + ' {',
        T + 'public static final String MOD_ID = "' + ns + '";',
        T + 'public static final Logger LOGGER = LoggerFactory.getLogger(MOD_ID);',
        '',
        T + 'public ' + cls + '(IEventBus modBus, ModContainer container) {',
        T + T + 'ModBlocks.register(modBus);',
        T + T + 'ModItems.register(modBus);',
        T + T + 'ModCreativeTabs.register(modBus);',
        '',
        T + T + 'LOGGER.info("{} ready — {} blocks, {} items", MOD_ID, ModBlocks.ALL.size(), ModItems.ALL.size());',
        T + '}',
        '',
        T + 'public static ResourceLocation id(String path) {',
        T + T + 'return ResourceLocation.fromNamespaceAndPath(MOD_ID, path);',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    files.push({
      path: dir + '/registry/ModBlocks.java',
      content: [
        'package ' + pkg + '.registry;',
        '',
        'import ' + pkg + '.' + cls + ';',
        'import net.minecraft.world.level.block.Block;',
        'import net.minecraft.world.level.block.state.BlockBehaviour;',
        'import net.neoforged.bus.api.IEventBus;',
        'import net.neoforged.neoforge.registries.DeferredBlock;',
        'import net.neoforged.neoforge.registries.DeferredRegister;',
        '',
        'import java.util.ArrayList;',
        'import java.util.List;',
        'import java.util.function.Supplier;',
        '',
        'public final class ModBlocks {',
        T + 'public static final DeferredRegister.Blocks BLOCKS = DeferredRegister.createBlocks(' + cls + '.MOD_ID);',
        T + 'public static final List<DeferredBlock<Block>> ALL = new ArrayList<>();',
        '',
        blockFields.length ? blockFields.join('\n\n') : T + '// No blocks yet.',
        '',
        T + 'private ModBlocks() {',
        T + '}',
        '',
        T + 'private static DeferredBlock<Block> register(String name, Supplier<Block> supplier) {',
        T + T + 'DeferredBlock<Block> block = BLOCKS.register(name, supplier);',
        T + T + 'ModItems.ITEMS.registerSimpleBlockItem(block);',
        T + T + 'ALL.add(block);',
        T + T + 'return block;',
        T + '}',
        '',
        T + 'public static void register(IEventBus bus) {',
        T + T + 'BLOCKS.register(bus);',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    files.push({
      path: dir + '/registry/ModItems.java',
      content: [
        'package ' + pkg + '.registry;',
        '',
        'import ' + pkg + '.' + cls + ';',
        'import net.minecraft.world.item.Item;',
        'import net.neoforged.bus.api.IEventBus;',
        'import net.neoforged.neoforge.registries.DeferredItem;',
        'import net.neoforged.neoforge.registries.DeferredRegister;',
        '',
        'import java.util.ArrayList;',
        'import java.util.List;',
        'import java.util.function.Supplier;',
        '',
        'public final class ModItems {',
        T + 'public static final DeferredRegister.Items ITEMS = DeferredRegister.createItems(' + cls + '.MOD_ID);',
        T + 'public static final List<DeferredItem<Item>> ALL = new ArrayList<>();',
        '',
        itemFields.length ? itemFields.join('\n\n') : T + '// No items yet.',
        '',
        T + 'private ModItems() {',
        T + '}',
        '',
        T + 'private static DeferredItem<Item> register(String name, Supplier<Item> supplier) {',
        T + T + 'DeferredItem<Item> item = ITEMS.register(name, supplier);',
        T + T + 'ALL.add(item);',
        T + T + 'return item;',
        T + '}',
        '',
        T + 'public static void register(IEventBus bus) {',
        T + T + 'ITEMS.register(bus);',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    files.push({
      path: dir + '/registry/ModCreativeTabs.java',
      content: [
        'package ' + pkg + '.registry;',
        '',
        'import ' + pkg + '.' + cls + ';',
        'import net.minecraft.core.registries.Registries;',
        'import net.minecraft.network.chat.Component;',
        'import net.minecraft.world.item.CreativeModeTab;',
        'import net.minecraft.world.item.ItemStack;',
        'import net.neoforged.bus.api.IEventBus;',
        'import net.neoforged.neoforge.registries.DeferredHolder;',
        'import net.neoforged.neoforge.registries.DeferredRegister;',
        '',
        'public final class ModCreativeTabs {',
        T + 'public static final DeferredRegister<CreativeModeTab> TABS =',
        T + T + 'DeferredRegister.create(Registries.CREATIVE_MODE_TAB, ' + cls + '.MOD_ID);',
        '',
        T + 'public static final DeferredHolder<CreativeModeTab, CreativeModeTab> MAIN = TABS.register("main",',
        T + T + '() -> CreativeModeTab.builder()',
        T + T + T + '.title(Component.translatable("itemGroup.' + ns + '.main"))',
        T + T + T + '.icon(() -> ' + tabIcon + ')',
        T + T + T + '.displayItems((params, output) -> {',
        tabEntries.length ? tabEntries.join('\n') : T + T + T + T + '// add entries here',
        T + T + T + '})',
        T + T + T + '.build());',
        '',
        T + 'private ModCreativeTabs() {',
        T + '}',
        '',
        T + 'public static void register(IEventBus bus) {',
        T + T + 'TABS.register(bus);',
        T + '}',
        '}',
        ''
      ].join('\n')
    });

    const hasTooltips = blocks.concat(items).some((c) => c.tooltip);
    if (hasTooltips) {
      const lines = [];
      blocks.concat(items).forEach((c) => {
        if (!c.tooltip) return;
        const ref = c.kind === 'block'
          ? 'ModBlocks.' + c.slug.toUpperCase() + '.get()'
          : 'ModItems.' + c.slug.toUpperCase() + '.get()';
        lines.push(T + T + 'if (event.getItemStack().is(' + ref + ')) {');
        lines.push(T + T + T + 'event.getToolTip().add(Component.translatable("tooltip.' + ns + '.' + c.slug + '").withStyle(ChatFormatting.GRAY));');
        lines.push(T + T + '}');
      });
      files.push({
        path: dir + '/client/TooltipEvents.java',
        content: [
          'package ' + pkg + '.client;',
          '',
          'import ' + pkg + '.' + cls + ';',
          'import ' + pkg + '.registry.ModBlocks;',
          'import ' + pkg + '.registry.ModItems;',
          'import net.minecraft.ChatFormatting;',
          'import net.minecraft.network.chat.Component;',
          'import net.neoforged.api.distmarker.Dist;',
          'import net.neoforged.bus.api.SubscribeEvent;',
          'import net.neoforged.fml.common.EventBusSubscriber;',
          'import net.neoforged.neoforge.event.entity.player.ItemTooltipEvent;',
          '',
          '@EventBusSubscriber(modid = ' + cls + '.MOD_ID, value = Dist.CLIENT)',
          'public final class TooltipEvents {',
          T + '@SubscribeEvent',
          T + 'public static void onTooltip(ItemTooltipEvent event) {',
          lines.join('\n'),
          T + '}',
          '}',
          ''
        ].join('\n')
      });
    }

    return files;
  }

  function build(p) {
    const ctx = context(p);
    const files = [];
    resourceFiles(ctx, files);
    if (p.loader === 'neoforge') neoForgeFiles(ctx, files);
    else fabricFiles(ctx, files);

    // attach language metadata + sort so the tree is stable
    files.forEach((f) => {
      f.lang = f.lang || langFor(f.path);
      f.generated = true;
    });
    files.sort((a, b) => a.path.localeCompare(b.path));

    return {
      files,
      stats: {
        total: files.length,
        java: files.filter((f) => /\.java$/.test(f.path)).length,
        json: files.filter((f) => /\.json$/.test(f.path)).length,
        png: files.filter((f) => /\.png$/.test(f.path)).length,
        bytes: files.reduce((n, f) => n + (f.dataUrl ? Math.round(f.dataUrl.length * 0.75) : f.content.length), 0)
      }
    };
  }

  MF.generator = { build, langFor };
})(window.MF);
