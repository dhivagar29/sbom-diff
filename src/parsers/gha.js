/**
 * Extract GitHub Actions `uses:` refs from workflow YAML.
 * Line-oriented scanner — no YAML dependency.
 */

const USES_RE = /^\s*(?:-\s*)?uses:\s*['"]?([^'"\s#]+)['"]?/;

export function parseWorkflowUses(text, sourcePath = '') {
  const out = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const m = raw.match(USES_RE);
    if (!m) continue;
    const ref = m[1];
    if (ref.startsWith('./') || ref.startsWith('.\\')) continue;
    let name;
    let version;
    if (ref.startsWith('docker://')) {
      const image = ref.slice('docker://'.length);
      const at = image.lastIndexOf(':');
      if (at > 0) {
        name = `docker://${image.slice(0, at)}`;
        version = image.slice(at + 1);
      } else {
        name = `docker://${image}`;
        version = 'latest';
      }
    } else {
      const at = ref.lastIndexOf('@');
      if (at < 0) {
        name = ref;
        version = 'unpinned';
      } else {
        name = ref.slice(0, at);
        version = ref.slice(at + 1);
      }
    }
    const key = `${name}@${version}`;
    if (!out.has(key)) {
      out.set(key, {
        ecosystem: 'github-actions',
        name,
        version,
        purl: `pkg:github/actions/${name}@${version}`,
        source: sourcePath || undefined,
      });
    }
  }
  return [...out.values()];
}

export function inventoryFromWorkflows(files) {
  const byKey = new Map();
  for (const [filePath, text] of Object.entries(files)) {
    if (!/\.(yml|yaml)$/i.test(filePath)) continue;
    for (const item of parseWorkflowUses(text, filePath)) {
      const key = `${item.name}@${item.version}`;
      if (!byKey.has(key)) byKey.set(key, item);
    }
  }
  return [...byKey.values()];
}
