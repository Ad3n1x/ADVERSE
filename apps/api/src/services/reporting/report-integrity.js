import crypto from 'node:crypto';

/**
 * Hash the serialized report before the manifest is attached. This is a
 * reproducibility aid for the exported JSON payload, not a signature,
 * timestamp authority, or proof that source material is authentic.
 */
export function createReportIntegrityManifest(report) {
  const serialized = JSON.stringify(report);
  return {
    algorithm: 'SHA-256',
    scope: 'JSON serialization of the report object before integrityManifest is attached',
    sha256: crypto.createHash('sha256').update(serialized, 'utf8').digest('hex'),
  };
}
