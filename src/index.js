export { collectInventory } from './collect.js';
export { diffInventories, packagesForOsv, compareVersions } from './diff.js';
export { queryOsv, attachVulns } from './osv.js';
export { buildArtifact, validateArtifact, SCHEMA_VERSION } from './schema.js';
export { formatComment, esc, COMMENT_MARKER } from './format.js';
export { run as runCli } from './cli.js';
export { postStickyComment } from './comment.js';
