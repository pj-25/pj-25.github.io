// Pure model for EvidenceMark (SPEC-002 R2). Kept separate from the .astro file so it is unit-testable.
export const KINDS = ['verified', 'described', 'in-progress'];
const DEFAULT_TEXT = { verified: 'Verified · source', described: 'Described, not shown', 'in-progress': 'In progress' };

/** Validate props and compute the visible text. Throws (build error) on misuse. */
export function evidenceModel({ kind, href, label } = {}) {
  if (!KINDS.includes(kind)) throw new Error(`EvidenceMark: unknown kind "${kind}" (expected ${KINDS.join(' | ')})`);
  if (kind === 'verified' && !href) throw new Error('EvidenceMark: kind "verified" requires an href (VIS-11: verified is always linked)');
  if (kind !== 'verified' && href) throw new Error(`EvidenceMark: kind "${kind}" must not carry an href`);
  // For verified, a label is the suffix after "Verified · "; for the other kinds it replaces the text.
  const text = kind === 'verified' ? `Verified · ${label ?? 'source'}` : (label ?? DEFAULT_TEXT[kind]);
  return { kind, href, text };
}
