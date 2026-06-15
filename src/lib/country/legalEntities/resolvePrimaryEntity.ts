// Pure Q4 legal-entity primary-resolution. No supabase / React import — entities
// are injected, so this is a unit-testable seam (mirrors resolveFeatures.ts).
//
// Q4 rule (confirmed): exactly 1 entity → silent auto-assign; >1 → pre-select the
// user's home entity (else the primary) but REQUIRE explicit confirmation (never
// a silent commit); lock the entity on the first financial document.
//
// DORMANT TODAY: every tenant auto-collapses to exactly 1 entity (migration 2),
// so resolveCaseEntityDefault always takes the silent 1-entity branch in
// production. The >1 branches are exercised only by these unit tests until a
// named multi-entity customer triggers Phase 4 WS-B. We ship them correct now so
// activation is a flag flip, not a rewrite.

export interface EntityRef {
  id: string;
  is_primary: boolean;
  currency_code: string;
  tax_system: string;
}

/** The tenant's primary entity: the single is_primary row. */
export function resolvePrimaryEntity(entities: EntityRef[]): EntityRef | null {
  if (entities.length === 0) return null;
  if (entities.length === 1) return entities[0];
  const primaries = entities.filter((e) => e.is_primary);
  if (primaries.length > 1) {
    throw new Error(
      'resolvePrimaryEntity: more than one primary entity — uq_legal_entity_primary breached',
    );
  }
  return primaries[0] ?? null;
}

export interface CaseEntityDefault {
  entityId: string | null;
  /** True when the user MUST deliberately submit the entity (>1 entity tenants). */
  requiresConfirmation: boolean;
  /** True when no entity can be assigned at all → case creation is blocked. */
  blocked: boolean;
}

/** Q4: silent for 1 entity; pre-select + forced confirmation for >1. */
export function resolveCaseEntityDefault(
  entities: EntityRef[],
  ctx: { homeEntityId: string | null },
): CaseEntityDefault {
  if (entities.length === 0) return { entityId: null, requiresConfirmation: false, blocked: true };
  if (entities.length === 1) {
    return { entityId: entities[0].id, requiresConfirmation: false, blocked: false };
  }
  const home = ctx.homeEntityId && entities.some((e) => e.id === ctx.homeEntityId)
    ? ctx.homeEntityId
    : (resolvePrimaryEntity(entities)?.id ?? null);
  return { entityId: home, requiresConfirmation: true, blocked: false };
}

/** Lock boundary = first financial document issued (numbered quote OR invoice). */
export function isEntityLocked(docs: { hasNumberedQuote: boolean; hasInvoice: boolean }): boolean {
  return docs.hasNumberedQuote || docs.hasInvoice;
}
