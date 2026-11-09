#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from '../src/cli.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(root, '..');

const outJson = path.join(repo, 'docs', 'sample-artifact.json');
const outMd = path.join(repo, 'docs', 'sample-comment.md');

await run([
  'node', 'cli',
  '--base', path.join(repo, 'test/fixtures/base/combined'),
  '--head', path.join(repo, 'test/fixtures/head/combined'),
  '--out', outJson,
  '--markdown', outMd,
  '--repository', 'dhivagar29/sbom-diff',
  '--pr', '1',
  '--base-ref', 'main',
  '--head-ref', 'feat/deps',
]);

console.log('Wrote', outJson);
console.log('Wrote', outMd);
