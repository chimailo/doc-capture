import type { DocumentType, Size } from './types';

export interface DocumentSpec {
  type: DocumentType;
  /** Long side ÷ short side. */
  aspectRatio: number;
  /** Physical size in millimetres, long side first. */
  sizeMm: [number, number];
  /** Output size at 300 DPI, landscape for cards, portrait for A4. */
  output: Size;
  /** Allowed relative error on the aspect ratio when scoring. */
  aspectTolerance: number;
}

const mmTo300Dpi = (mm: number) => Math.round((mm / 25.4) * 300);

function spec(
  type: DocumentType,
  longMm: number,
  shortMm: number,
  orientation: 'landscape' | 'portrait',
  aspectTolerance: number,
): DocumentSpec {
  const long = mmTo300Dpi(longMm);
  const short = mmTo300Dpi(shortMm);
  return {
    type,
    aspectRatio: longMm / shortMm,
    sizeMm: [longMm, shortMm],
    output:
      orientation === 'landscape'
        ? { width: long, height: short }
        : { width: short, height: long },
    aspectTolerance,
  };
}

/** ID-1 (ISO/IEC 7810), passport data page (ICAO 9303 TD3), ISO 216 A4. */
export const DOCUMENT_SPECS: Record<DocumentType, DocumentSpec> = {
  'id-card': spec('id-card', 85.6, 53.98, 'landscape', 0.12),
  passport: spec('passport', 125, 88, 'landscape', 0.12),
  a4: spec('a4', 297, 210, 'portrait', 0.1),
};
