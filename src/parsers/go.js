/**
 * Parse go.sum into module@version inventory.
 */

export function parseGoSum(text) {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const parts = line.split(/\s+/);
    if (parts.length < 2) continue;
    let [module, version] = parts;
    if (version.endsWith('/go.mod')) {
      version = version.slice(0, -'/go.mod'.length);
    }
    const key = `${module}@${version}`;
    if (!out.has(key)) {
      out.set(key, { name: module, version });
    }
  }
  return out;
}

export function inventoryFromGoSum(text) {
  return [...parseGoSum(text).values()].map(({ name, version }) => ({
    ecosystem: 'Go',
    name,
    version,
    purl: `pkg:golang/${name}@${version}`,
  }));
}
