// SAYAP NUSANTARA — the entry program (Node 22, standard library only).
// The game is plain static files under game/ (an index.html plus ES
// modules, no library, no network request at run time). This program hands
// it in: it copies game/ and screenshots/ from beside this file into the
// output directory and writes dossier.json there with the vendored make.fun
// library, which is the summary the judge reads.
//
// Run it locally with MAKEFUN_OUTPUT_DIR set:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Inside the grader the output directory is /output.

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outputDir, { recursive: true });
cpSync(join(repoRoot, 'game'), join(outputDir, 'game'), { recursive: true });
mkdirSync(join(outputDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outputDir, 'screenshots'), { recursive: true });
}

// The scorer's caps, as the competition's RULES.txt states them: the dossier
// text is capped, at most 4 screenshots of at most 256 KiB each, game/ holds
// at most 993 files and 48 MiB with no path over 1000 bytes. game/,
// screenshots/ and dossier.json share /output's own 1000-entry cap, so the
// game leaves them room.
writeFileSync(
  join(outputDir, 'dossier.json'),
  buildDossier(outputDir, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
