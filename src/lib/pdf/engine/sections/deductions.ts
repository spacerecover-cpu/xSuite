/**
 * Deductions section — the payslip deductions component table (component /
 * calculation / amount, with a Total Deductions row). A thin wrapper over the
 * shared {@link buildPayComponentTable} builder (which earnings and deductions
 * share, since they are structurally identical). Reads
 * {@link EngineDocData.deductions}; returns null when there are no deductions.
 *
 * Generalized from the deductions `buildComponentTable` call in
 * `documents/PayslipDocument.ts` (lines ~201-207).
 */

import type { Content } from 'pdfmake/interfaces';
import type { EngineContext, EngineDocData, SectionRenderer } from '../types';
import { buildPayComponentTable } from './payComponentTable';

export const renderDeductions: SectionRenderer = (
  engine: EngineContext,
  data: EngineDocData,
): Content | null => buildPayComponentTable(engine, data.deductions);
