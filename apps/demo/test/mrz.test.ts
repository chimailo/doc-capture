import { describe, expect, it } from 'vitest';
import { checkDigit, findMrzLines, parseTd3 } from '../src/ocr/mrz';

// ICAO 9303 part 4 specimen.
const L1 = 'P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<';
const L2 = 'L898902C36UTO7408122F1204159ZE184226B<<<<<10';

describe('MRZ', () => {
  it('computes check digits', () => {
    expect(checkDigit('L898902C3')).toBe(6);
    expect(checkDigit('740812')).toBe(2);
    expect(checkDigit('120415')).toBe(9);
  });

  it('parses the ICAO specimen', () => {
    const r = parseTd3(L1, L2)!;
    expect(r).toMatchObject({
      issuingState: 'UTO',
      surname: 'ERIKSSON',
      givenNames: 'ANNA MARIA',
      documentNumber: 'L898902C3',
      nationality: 'UTO',
      birthDate: '740812',
      sex: 'F',
      expiryDate: '120415',
    });
    expect(Object.values(r.valid).every(Boolean)).toBe(true);
  });

  it('cleans OCR text and flags corrupted digits', () => {
    const lines = findMrzLines(`noise\n${L1.replace('<<ANNA', '« ANNA')}\n${L2.replace('7408122', '74O8122')}\n`);
    expect(lines).toHaveLength(2);
    const r = parseTd3(lines[0]!, lines[1]!)!;
    expect(r.birthDate).toBe('740812');
    const bad = parseTd3(L1, L2.replace('L898902C3', 'L898902C8'))!;
    expect(bad.valid.documentNumber).toBe(false);
  });
});
