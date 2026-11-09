/**
 * Parse package-lock.json (lockfileVersion 1, 2, or 3) into a Map of
 * package name -> version. Skips the root "" entry.
 */
export function parsePackageLock(text) {
  const data = JSON.parse(text);
  const out = new Map();

  if (data.packages && typeof data.packages === 'object') {
    for (const [pkgPath, meta] of Object.entries(data.packages)) {
      if (!pkgPath || pkgPath === '') continue;
      if (!meta || typeof meta !== 'object') continue;
      if (meta.link === true) continue;
      const name = meta.name || pathToName(pkgPath);
      const version = meta.version;
      if (!name || !version) continue;
      if (!out.has(name)) {
        out.set(name, String(version));
      }
    }
  } else if (data.dependencies && typeof data.dependencies === 'object') {
    walkV1(data.dependencies, out);
  }

  return out;
}

function pathToName(pkgPath) {
  const parts = pkgPath.split('node_modules/').filter(Boolean);
  const last = parts[parts.length - 1];
  return last ? last.replace(/\/$/, '') : null;
}

function walkV1(deps, out) {
  for (const [name, meta] of Object.entries(deps)) {
    if (!meta || typeof meta !== 'object') continue;
    if (meta.version && !out.has(name)) {
      out.set(name, String(meta.version));
    }
    if (meta.dependencies) {
      walkV1(meta.dependencies, out);
    }
  }
}

export function inventoryFromNpm(text) {
  const map = parsePackageLock(text);
  return [...map.entries()].map(([name, version]) => ({
    ecosystem: 'npm',
    name,
    version,
    purl: `pkg:npm/${encodePurlName(name)}@${version}`,
  }));
}

function encodePurlName(name) {
  if (name.startsWith('@')) {
    const [scope, pkg] = name.slice(1).split('/');
    return `%40${scope}/${pkg}`;
  }
  return name;
}
