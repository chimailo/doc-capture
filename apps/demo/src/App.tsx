import type { CaptureResult, DocumentType } from '@doc-capture/core';
import { DocumentCapture, prewarm } from '@doc-capture/react';
import { useEffect, useMemo, useState } from 'react';
import { opencv } from './opencv';
import { mrzPlugin } from './ocr/mrz-plugin';

const TYPES: { value: DocumentType; label: string }[] = [
  { value: 'id-card', label: 'ID card' },
  { value: 'passport', label: 'Passport' },
  { value: 'a4', label: 'A4 page' },
];

function ResultView({ result, onAgain }: { result: CaptureResult; onAgain: () => void }) {
  const url = useMemo(() => URL.createObjectURL(result.image), [result.image]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  const meta = {
    size: `${result.width}×${result.height}`,
    bytes: result.image.size,
    type: result.image.type,
    documentType: result.documentType,
    captureMode: result.captureMode,
    seconds: ((result.timings.capturedAt - result.timings.startedAt) / 1000).toFixed(2),
    quality: Object.fromEntries(Object.entries(result.quality).map(([k, v]) => [k, +v.toFixed(2)])),
    ocr: result.ocr,
  };
  return (
    <section className="result">
      <img src={url} alt="Captured document" />
      <pre>{JSON.stringify(meta, null, 2)}</pre>
      <div className="row">
        <a className="button" href={url} download={`document.${result.image.type.split('/')[1]}`}>
          Download
        </a>
        <button className="button primary" onClick={onAgain}>
          Capture another
        </button>
      </div>
    </section>
  );
}

export function App() {
  const [type, setType] = useState<DocumentType>('id-card');
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [ocr, setOcr] = useState(false);

  // Load OpenCV while the user reads the start screen.
  useEffect(() => {
    prewarm({ opencv }).catch(() => {});
  }, []);

  if (capturing) {
    return (
      <main className="capture">
        <DocumentCapture
          key={type + ocr}
          documentType={type}
          opencv={opencv}
          output={{ format: 'jpeg', quality: 0.92 }}
          enhance={{ autoRotate: true }}
          plugins={ocr && type === 'passport' ? [mrzPlugin()] : []}
          onCapture={(r) => {
            setResult(r);
            setCapturing(false);
          }}
        />
        <button className="close" aria-label="Close camera" onClick={() => setCapturing(false)}>
          ×
        </button>
      </main>
    );
  }

  return (
    <main className="home">
      <h1>Document capture</h1>
      {result ? (
        <ResultView result={result} onAgain={() => setCapturing(true)} />
      ) : (
        <>
          <p>Everything runs on this device. No images are uploaded.</p>
          <fieldset>
            <legend>Document</legend>
            {TYPES.map((t) => (
              <label key={t.value}>
                <input type="radio" name="type" checked={type === t.value} onChange={() => setType(t.value)} />
                {t.label}
              </label>
            ))}
          </fieldset>
          <label>
            <input type="checkbox" checked={ocr} onChange={(e) => setOcr(e.target.checked)} />
            Read passport MRZ (sample on-device OCR plugin)
          </label>
          <button className="button primary" onClick={() => setCapturing(true)}>
            Open camera
          </button>
        </>
      )}
    </main>
  );
}
