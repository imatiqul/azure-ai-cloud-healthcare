// Style Dictionary configuration — @healthcare/design-system
//
// Transforms W3C Design Token Community Group (DTCG) tokens in
// src/tokens/tokens.json into multiple output formats:
//
//   dist/tokens/tokens.css      CSS custom properties (web consumption)
//   dist/tokens/tokens.js       ES module (tree-shakeable JS import)
//   dist/tokens/tokens.json     Resolved JSON (Figma plugin / Tokens Studio)
//   dist/tokens/tokens.scss     SCSS variables (legacy compatibility)
//
// Usage:
//   pnpm --filter @healthcare/design-system run build:tokens
//
// Figma plugin:
//   Import dist/tokens/tokens.json via "Tokens Studio for Figma" plugin.
//   Configure the token set to sync with this file via the plugin's GitHub
//   or local file sync feature.

import StyleDictionary from 'style-dictionary';

/** Recursively lower-cases any $value that is a color hex to keep CSS vars consistent. */
StyleDictionary.registerTransform({
  name: 'color/lowercase',
  type: 'value',
  filter: (token) => token.$type === 'color' || token.attributes?.category === 'color',
  transform: (token) => {
    const v = token.$value ?? token.value;
    return typeof v === 'string' ? v.toLowerCase() : v;
  },
});

/** Strips quotes from fontFamily values so CSS output is clean. */
StyleDictionary.registerTransform({
  name: 'fontFamily/clean',
  type: 'value',
  filter: (token) => token.$type === 'fontFamily',
  transform: (token) => token.$value ?? token.value,
});

const sd = new StyleDictionary({
  source: ['src/tokens/tokens.json'],

  // Use W3C DTCG key format ($value, $type)
  preprocessors: ['tokens-studio'],

  platforms: {
    // ── CSS custom properties ─────────────────────────────────────────────────
    css: {
      transforms: [
        'attribute/cti',
        'name/kebab',
        'color/lowercase',
        'fontFamily/clean',
        'time/seconds',
        'size/px',
      ],
      prefix: 'hq',  // --hq-color-brand-primary-600, --hq-spacing-4, etc.
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.css',
          format: 'css/variables',
          options: {
            outputReferences: false,
            selector: ':root',
            showFileHeader: true,
          },
        },
      ],
    },

    // ── JavaScript ES module ──────────────────────────────────────────────────
    js: {
      transforms: [
        'attribute/cti',
        'name/camel',
        'color/lowercase',
        'fontFamily/clean',
        'size/px',
      ],
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.js',
          format: 'javascript/es6',
        },
      ],
    },

    // ── SCSS variables ────────────────────────────────────────────────────────
    scss: {
      transforms: [
        'attribute/cti',
        'name/kebab',
        'color/lowercase',
        'fontFamily/clean',
        'size/px',
      ],
      prefix: 'hq',
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.scss',
          format: 'scss/variables',
          options: { outputReferences: false },
        },
      ],
    },

    // ── Figma / Tokens Studio JSON ────────────────────────────────────────────
    // Import this file into Tokens Studio for Figma to sync design tokens
    // between code and Figma. Set up bi-directional sync via GitHub or a
    // local file mount in the plugin settings.
    json: {
      transforms: ['attribute/cti', 'name/kebab', 'color/lowercase'],
      buildPath: 'dist/tokens/',
      files: [
        {
          destination: 'tokens.json',
          format: 'json/nested',
          options: {
            outputReferences: false,
          },
        },
      ],
    },
  },
});

await sd.buildAllPlatforms();
console.log('\n✅  Design tokens built successfully.\n');
console.log('   CSS vars  →  dist/tokens/tokens.css');
console.log('   JS module →  dist/tokens/tokens.js');
console.log('   SCSS vars →  dist/tokens/tokens.scss');
console.log('   Figma JSON →  dist/tokens/tokens.json');
console.log('\n   To sync with Figma: open Tokens Studio plugin → Settings → Sync → Local File → dist/tokens/tokens.json\n');
