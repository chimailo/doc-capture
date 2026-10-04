import type { GuidanceState } from '../types';

export type GuidanceMessages = Record<GuidanceState, string> & {
  /** Label for the manual shutter button. */
  shutter: string;
  retake: string;
  usePhoto: string;
  /** Announced when a capture succeeds. */
  captured: string;
};

const en: GuidanceMessages = {
  INIT: 'Starting camera…',
  SEARCHING: 'Place your document in the frame',
  MOVE_CLOSER: 'Move closer',
  MOVE_BACK: 'Move back',
  ALIGN: 'Align the document with the frame',
  REDUCE_GLARE: 'Tilt slightly to reduce glare',
  MORE_LIGHT: 'Find better light',
  HOLD_STILL: 'Hold still',
  CAPTURING: 'Capturing…',
  REVIEW: 'Check the photo',
  shutter: 'Take photo',
  retake: 'Retake',
  usePhoto: 'Use photo',
  captured: 'Photo captured',
};

const fr: GuidanceMessages = {
  INIT: 'Démarrage de la caméra…',
  SEARCHING: 'Placez votre document dans le cadre',
  MOVE_CLOSER: 'Rapprochez-vous',
  MOVE_BACK: 'Reculez',
  ALIGN: 'Alignez le document avec le cadre',
  REDUCE_GLARE: 'Inclinez légèrement pour éviter les reflets',
  MORE_LIGHT: 'Trouvez un meilleur éclairage',
  HOLD_STILL: 'Ne bougez plus',
  CAPTURING: 'Capture…',
  REVIEW: 'Vérifiez la photo',
  shutter: 'Prendre la photo',
  retake: 'Reprendre',
  usePhoto: 'Utiliser la photo',
  captured: 'Photo prise',
};

const es: GuidanceMessages = {
  INIT: 'Iniciando la cámara…',
  SEARCHING: 'Coloca tu documento dentro del marco',
  MOVE_CLOSER: 'Acércate',
  MOVE_BACK: 'Aléjate',
  ALIGN: 'Alinea el documento con el marco',
  REDUCE_GLARE: 'Inclina un poco para evitar reflejos',
  MORE_LIGHT: 'Busca mejor iluminación',
  HOLD_STILL: 'No te muevas',
  CAPTURING: 'Capturando…',
  REVIEW: 'Revisa la foto',
  shutter: 'Tomar foto',
  retake: 'Repetir',
  usePhoto: 'Usar foto',
  captured: 'Foto tomada',
};

export const BUILT_IN_LOCALES: Record<string, GuidanceMessages> = { en, fr, es };

/**
 * Resolves messages for a locale tag (`fr-CA` falls back to `fr`, then `en`),
 * with optional per-message overrides.
 */
export function resolveMessages(
  locale: string | undefined,
  overrides: Partial<GuidanceMessages> = {},
): GuidanceMessages {
  const tag = (locale ?? (typeof navigator !== 'undefined' ? navigator.language : 'en')).toLowerCase();
  const base = BUILT_IN_LOCALES[tag] ?? BUILT_IN_LOCALES[tag.split('-')[0]!] ?? en;
  return { ...base, ...overrides };
}
