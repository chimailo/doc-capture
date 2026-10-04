/** ICAO 9303 machine-readable zone parsing for passports (TD3: 2 × 44). */

const WEIGHTS = [7, 3, 1];

function charValue(c: string): number {
  if (c === '<') return 0;
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
  return -1;
}

export function checkDigit(s: string): number {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += Math.max(0, charValue(s[i]!)) * WEIGHTS[i % 3]!;
  return sum % 10;
}

export interface Td3 {
  documentCode: string;
  issuingState: string;
  surname: string;
  givenNames: string;
  documentNumber: string;
  nationality: string;
  birthDate: string;
  sex: string;
  expiryDate: string;
  personalNumber: string;
  valid: {
    documentNumber: boolean;
    birthDate: boolean;
    expiryDate: boolean;
    composite: boolean;
  };
}

/** Fixes common OCR confusions in fields that must be digits. */
const digits = (s: string) => s.replace(/O/g, '0').replace(/[IL]/g, '1').replace(/S/g, '5').replace(/B/g, '8');

/** Normalises raw OCR text into candidate MRZ lines. */
export function findMrzLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.toUpperCase().replace(/\s+/g, '').replace(/[«‹]/g, '<').replace(/[^A-Z0-9<]/g, ''))
    .filter((l) => l.length >= 40 && l.includes('<'))
    .map((l) => l.slice(0, 44).padEnd(44, '<'));
}

export function parseTd3(line1: string, line2: string): Td3 | null {
  if (line1.length !== 44 || line2.length !== 44 || line1[0] !== 'P') return null;
  const [surname = '', given = ''] = line1.slice(5).split('<<');
  const docNo = line2.slice(0, 9);
  const birth = digits(line2.slice(13, 19));
  const expiry = digits(line2.slice(21, 27));
  const composite = docNo + line2[9] + birth + line2[19] + expiry + line2[27] + line2.slice(28, 43);
  return {
    documentCode: line1.slice(0, 2).replace(/</g, ''),
    issuingState: line1.slice(2, 5).replace(/</g, ''),
    surname: surname.replace(/</g, ' ').trim(),
    givenNames: given.replace(/</g, ' ').trim(),
    documentNumber: docNo.replace(/</g, ''),
    nationality: line2.slice(10, 13).replace(/</g, ''),
    birthDate: birth,
    sex: line2[20] === '<' ? 'X' : line2[20]!,
    expiryDate: expiry,
    personalNumber: line2.slice(28, 42).replace(/</g, ''),
    valid: {
      documentNumber: checkDigit(docNo) === Number(digits(line2[9]!)),
      birthDate: checkDigit(birth) === Number(digits(line2[19]!)),
      expiryDate: checkDigit(expiry) === Number(digits(line2[27]!)),
      composite: checkDigit(composite) === Number(digits(line2[43]!)),
    },
  };
}
