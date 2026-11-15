// DUSTLINE — a three.js tactical FPS, handed in for threejs-fps-02.
//
// The game is plain static files under game/: ES modules the browser loads
// with no build step, three.js 0.187.0 vendored under game/vendor/three/ and
// mapped by the import map in game/index.html. This program is the entrypoint
// the grader runs (Node 22, standard library only): it copies game/ and
// screenshots/ from beside this file into /output and writes
// /output/dossier.json with the vendored make.fun library — the summary the
// judge reads.
//
// Serve the game locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// The dossier caps from the competition's gate: the text the judge reads is
// capped at 160 KiB, at most 4 screenshots of at most 256 KiB each, and
// game/ at most 993 entries / 48 MiB (the platform caps /output itself at
// 1000 entries, which game/, screenshots/ and dossier.json share).
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
};

const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function copyTree(source, target) {
  cpSync(source, target, { recursive: true });
}

function main() {
  mkdirSync(outDir, { recursive: true });

  // Start from a clean output directory so a stale file from an earlier run
  // can never leak into the entry.
  const gameOut = join(outDir, 'game');
  const shotsOut = join(outDir, 'screenshots');
  rmSync(gameOut, { recursive: true, force: true });
  rmSync(shotsOut, { recursive: true, force: true });

  copyTree(join(repoRoot, 'game'), gameOut);
  mkdirSync(shotsOut, { recursive: true });
  if (existsSync(join(repoRoot, 'screenshots'))) {
    copyTree(join(repoRoot, 'screenshots'), shotsOut);
  }

  const dossier = buildDossier(outDir, DOSSIER_CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  console.log(`dossier.json written: ${dossier.length} bytes`);
}

main();
