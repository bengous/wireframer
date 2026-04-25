#!/usr/bin/env bun

/**
 * Bundles scripts/wireframe-mapper.user.ts -> dist/wireframe-mapper.user.js
 * with the Tampermonkey ==UserScript== metadata banner intact.
 */

import { build } from "esbuild";
import { join } from "node:path";

const ROOT: string = join(import.meta.dirname, "..");

const BANNER = `// ==UserScript==
// @name         Wireframe Mapper
// @namespace    https://github.com/b3ngous/wireframe-mapper
// @version      1.0.0
// @description  Generate wireframe mockups from live websites. Press Alt+W to trigger.
// @author       b3ngous
// @match        *://*/*
// @grant        GM_registerMenuCommand
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      localhost
// @noframes
// ==/UserScript==
`;

await build({
  entryPoints: [join(ROOT, "scripts/wireframe-mapper.user.ts")],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: join(ROOT, "dist/wireframe-mapper.user.js"),
  banner: { js: BANNER },
  legalComments: "none",
  logLevel: "info",
});
