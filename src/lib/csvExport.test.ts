import { describe, it, expect } from 'vitest';
import { rowsToCSV, type ExportColumn } from './csvExport';

type Row = { name: string; amount: number };
const columns: ExportColumn<Row>[] = [
  { key: 'name', label: 'Name' },
  { key: 'amount', label: 'Amount' },
];

const dataLine = (csv: string) => csv.split('\r\n')[1];

describe('rowsToCSV formula-injection neutralization', () => {
  it('neutralizes a leading = so the cell is not evaluated as a formula', () => {
    const csv = rowsToCSV([{ name: '=HYPERLINK("http://evil.com","click")', amount: 1 }], columns);
    expect(dataLine(csv)).toBe('"\'=HYPERLINK(""http://evil.com"",""click"")",1');
  });

  it.each(['+1+1', '@SUM(A1)', '\tcalc', '\rcalc'])('neutralizes a leading %j', (name) => {
    expect(dataLine(rowsToCSV([{ name, amount: 1 }], columns))).toContain(`'${name}`);
  });

  it('neutralizes a leading - when the value is not a plain number', () => {
    const csv = rowsToCSV([{ name: "-2+3+cmd|' /C calc'!A0", amount: 1 }], columns);
    expect(dataLine(csv)).toBe(`'-2+3+cmd|' /C calc'!A0,1`);
  });

  it('leaves plain negative numbers numeric so amount columns still parse', () => {
    expect(dataLine(rowsToCSV([{ name: 'Refund', amount: -1234.5 }], columns))).toBe(
      'Refund,-1234.5',
    );
    expect(dataLine(rowsToCSV([{ name: '-1,234.50', amount: 0 }], columns))).toBe(
      '"-1,234.50",0',
    );
  });

  it('leaves ordinary values untouched', () => {
    expect(dataLine(rowsToCSV([{ name: 'Acme Ltd', amount: 10 }], columns))).toBe('Acme Ltd,10');
  });
});
