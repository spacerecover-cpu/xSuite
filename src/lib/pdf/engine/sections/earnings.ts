/**
 * Earnings section — the payslip earnings component table (component /
 * calculation / amount, with a Total Earnings row). A thin wrapper over the
 * shared {@link buildPayComponentTable} builder (which earnings and deductions
 * share, since they are structurally identical). Reads
 * {@link EngineDocData.earnings}; returns null when there are no earnings.
 *
 * Generalized from the earnings `buildComponentTable` call in
 * `documents/PayslipDocument.ts` (lines ~193-199).
 */

import type { Content } from 'pdfmake/interfaces';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { buildPayComponentTable } from './payComponentTable';

export const renderEarnings: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => buildPayComponentTable(engine, data.earnings);
