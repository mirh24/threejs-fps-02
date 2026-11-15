// main.ts — DUSTLINE's entrypoint (Node 22, standard library only).
//
// What it does, in order:
//   1. Works out where the grader wants the entry (/output, or
//      MAKEFUN_OUTPUT_DIR outside the grader).
//   2. Copies this repository's game/ and screenshots/ there, verbatim.
//   3. Writes /output/dossier.json with buildDossier from the vendored
//      make.fun library, under the competition's caps: the dossier text
//      at most 163840 bytes, at most 4 screenshots of at most 256 KiB,
//      game/ at most 993 files and 48 MiB in all.
//
// The program is deterministic: same repository in, same bytes out, so the
// grader's two runs agree byte for byte. It reads nothing but this
// directory and writes nothing but the output directory.
//
// Run it locally to check the entry before submitting:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Walk a directory tree and total its files and bytes (for the build log).
function dirStats(dir: string): { files: number; bytes: number } {
  let files = 0;
  let bytes = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      const sub = dirStats(full);
      files += sub.files;
      bytes += sub.bytes;
    } else if (entry.isFile()) {
      files += 1;
      bytes += statSync(full).size;
    }
  }
  return { files, bytes };
}

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Start from a clean output directory so a stale screenshot or dossier
// from an earlier run can never leak into this one. Clear only the
// entry's own outputs, never the output directory itself: the grader
// mounts it, and its parent is read-only, so removing it fails there.
mkdirSync(out, { recursive: true });
for (const name of ['game', 'screenshots', 'dossier.json']) {
  rmSync(join(out, name), { recursive: true, force: true });
}

cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps from the competition's gate (reference/gate.json): the text cap is
// the one that shapes the dossier's bytes; the others refuse an entry the
// scorer would refuse anyway.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(out, 'dossier.json'), dossier);

// Report what was written, so a local run shows the entry fits the caps
// before it is submitted (game/ 993 files / 48 MiB, screenshots 4 x 256 KiB,
// dossier 1.5 MiB with 160 KiB of text inside it).
const gameStats = dirStats(join(out, 'game'));
const shotStats = dirStats(join(out, 'screenshots'));
const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`DUSTLINE entry written to ${out}`);
console.log(`  game/: ${gameStats.files} files, ${gameStats.bytes} bytes`);
console.log(`  screenshots/: ${shotStats.files} files, ${shotStats.bytes} bytes`);
console.log(`  dossier.json: ${dossierBytes} bytes`);
