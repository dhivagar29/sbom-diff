/**
 * Parse requirements.txt and poetry.lock into inventories.
 */

const REQ_LINE = /^\s*([A-Za-z0-9_.-]+)\s*==\s*([^\s\\;]+)/;

export function parseRequirementsTxt(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line || line.startsWith('-')) continue;
    const m = line.match(REQ_LINE);
    if (!m) continue;
    const name = normalizePyName(m[1]);
    const version = m[2].trim();
    if (!out.has(name)) out.set(name, version);
  }
  return out;
}

export function parsePoetryLock(text) {
  const out = new Map();
  const blocks = text.split(/^\[\[package\]\]/m).slice(1);
  for (const block of blocks) {
    const nameM = block.match(/^\s*name\s*=\s*"([^"]+)"/m);
    const verM = block.match(/^\s*version\s*=\s*"([^"]+)"/m);
    if (!nameM || !verM) continue;
    const name = normalizePyName(nameM[1]);
    if (!out.has(name)) out.set(name, verM[1]);
  }
  return out;
}

function normalizePyName(name) {
  return name.toLowerCase().replace(/_/g, '-');
}

export function inventoryFromRequirements(text) {
  return [...parseRequirementsTxt(text).entries()].map(([name, version]) => ({
    ecosystem: 'PyPI',
    name,
    version,
    purl: `pkg:pypi/${name}@${version}`,
  }));
}

export function inventoryFromPoetry(text) {
  return [...parsePoetryLock(text).entries()].map(([name, version]) => ({
    ecosystem: 'PyPI',
    name,
    version,
    purl: `pkg:pypi/${name}@${version}`,
  }));
}
