import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { DownloadIcon } from 'lucide-react';
import { useT } from '../i18n';

interface QrCodeProps {
  /** The full link the code opens, e.g. https://skillpass.ng/verify/SP-2BNC-8QPE */
  value: string;
  /** Short line under the code, e.g. "Scan to verify". */
  caption: string;
  /** File name for the downloaded PNG, without the extension. */
  fileName: string;
  size?: number;
}

/**
 * A scannable QR code on a white tile (scanners need dark modules on a light background, whatever the page theme),
 * with a button to save it as a PNG for WhatsApp or printing. Any phone camera opens the link directly.
 */
export function QrCode({ value, caption, fileName, size = 132 }: QrCodeProps) {
  const tileRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const { t } = useT();

  const download = async () => {
    setFailed(false);
    const svg = tileRef.current?.querySelector('svg');
    if (!svg) return;
    try {
      const scale = 4;
      const pad = 24 * scale;
      const qr = size * scale;
      const textHeight = 28 * scale;
      const canvas = document.createElement('canvas');
      canvas.width = qr + pad * 2;
      canvas.height = qr + pad * 2 + textHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('no canvas');

      const markup = new XMLSerializer().serializeToString(svg);
      const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('svg'));
        img.src = url;
      });

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, pad, pad, qr, qr);
      URL.revokeObjectURL(url);
      ctx.fillStyle = '#070B14';
      ctx.textAlign = 'center';
      ctx.font = `600 ${14 * scale}px Inter, system-ui, sans-serif`;
      ctx.fillText(caption, canvas.width / 2, qr + pad * 1.5 + 6 * scale);

      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('png');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${fileName}.png`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    } catch {
      setFailed(true);
    }
  };

  return (
    <figure className="flex flex-col items-center gap-2">
      <div ref={tileRef} className="rounded-2xl bg-white p-3 shadow-glow print:shadow-none">
        <QRCodeSVG value={value} size={size} level="M" marginSize={0} bgColor="#ffffff" fgColor="#070B14" title={`QR code: ${caption}`} />
      </div>
      <figcaption className="text-center text-xs font-medium text-ink-muted">{caption}</figcaption>
      <button type="button" onClick={download} className="no-print inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-line transition-colors duration-150 hover:bg-canvas">
        <DownloadIcon className="h-3.5 w-3.5" aria-hidden="true" /> {t('qr.save')}
      </button>
      {failed && <p role="alert" className="no-print text-xs text-bad-700">{t('qr.failed')}</p>}
    </figure>);

}
