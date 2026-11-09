#!/usr/bin/env node
/**
 * CLI: compare two trees, query OSV, write artifact JSON (+ optional markdown).
 *
 *   node src/cli.js --base <dir> --head <dir> --out artifact.json [--markdown report.md]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectInventory } from './collect.js';
import { diffInventories, packagesForOsv } from './diff.js';
import { queryOsv, attachVulns } from './osv.js';
import { buildArtifact } from './schema.js';
import { formatComment } from './format.js';

function parseArgs(argv) {
  const args = {
    base: null,
    head: null,
    out: 'sbom-diff.json',
    markdown: null,
    skipOsv: false,
    meta: {},
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--base') { args.base = next; i++; }
    else if (a === '--head') { args.head = next; i++; }
    else if (a === '--out') { args.out = next; i++; }
    else if (a === '--markdown') { args.markdown = next; i++; }
    else if (a === '--skip-osv') { args.skipOsv = true; }
    else if (a === '--base-ref') { args.meta.baseRef = next; i++; }
    else if (a === '--head-ref') { args.meta.headRef = next; i++; }
    else if (a === '--base-sha') { args.meta.baseSha = next; i++; }
    else if (a === '--head-sha') { args.meta.headSha = next; i++; }
    else if (a === '--repository') { args.meta.repository = next; i++; }
    else if (a === '--pr') { args.meta.pullRequestNumber = Number(next); i++; }
    else if (a === '--help' || a === '-h') { args.help = true; }
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

export async function run(argv = process.argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return { ok: true };
  }
  if (!args.base || !args.head) {
    throw new Error('--base and --head are required');
  }
  const baseRoot = path.resolve(args.base);
  const headRoot = path.resolve(args.head);
  if (!fs.existsSync(baseRoot) || !fs.existsSync(headRoot)) {
    throw new Error('base or head directory does not exist');
  }

  const baseInv = collectInventory(baseRoot);
  const headInv = collectInventory(headRoot);
  const diff = diffInventories(baseInv, headInv);

  let withVulns = {
    added: diff.added.map((p) => ({ ...p, vulnerabilities: [] })),
    removed: diff.removed.map((p) => ({ ...p, vulnerabilities: [] })),
    upgraded: diff.upgraded.map((p) => ({ ...p, vulnerabilities: [] })),
    downgraded: diff.downgraded.map((p) => ({ ...p, vulnerabilities: [] })),
  };

  if (!args.skipOsv) {
    const pkgs = packagesForOsv(diff);
    if (pkgs.length) {
      const vulnMap = await queryOsv(pkgs);
      withVulns = attachVulns(diff, vulnMap);
      withVulns.removed = diff.removed.map((p) => ({ ...p, vulnerabilities: [] }));
    }
  }

  const artifact = buildArtifact({ diff: withVulns, meta: args.meta });
  const outPath = path.resolve(args.out);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2) + '\n', 'utf8');

  let markdown = null;
  if (args.markdown) {
    markdown = formatComment(artifact);
    fs.writeFileSync(path.resolve(args.markdown), markdown, 'utf8');
  }

  return { artifact, outPath, markdown };
}

function printHelp() {
  console.log(`sbom-diff — compare dependency manifests between two trees

Usage:
  node src/cli.js --base <dir> --head <dir> --out artifact.json [--markdown report.md]

Options:
  --skip-osv          Skip OSV network lookup
  --base-ref/--head-ref/--base-sha/--head-sha/--repository/--pr
                      Metadata embedded in the artifact
`);
}

const isMain = process.argv[1]
  && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  run().then((r) => {
    if (r.artifact) {
      const s = r.artifact.summary;
      console.log(
        `Wrote ${r.outPath} (+${s.added} -${s.removed} ↑${s.upgraded} ↓${s.downgraded}, vulns:${s.vulnerable})`,
      );
    }
  }).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
