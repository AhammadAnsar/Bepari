import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from '@zxing/library';
import {
  AlertCircle,
  Camera,
  Flashlight,
  ImageUp,
  RefreshCw,
  ScanBarcode,
  SwitchCamera,
  X,
} from 'lucide-react';
import type { Language, Product } from '../engine/types';
import { findProductByScannedCode, normalizeScanCode } from '../lib/productDirectory';

interface Props {
  open: boolean;
  products: Product[];
  lang: Language;
  onClose: () => void;
  onMatch: (product: Product, scannedCode: string) => void;
}

interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
}

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => NativeBarcodeDetector;
  }
}

const SUPPORTED_NATIVE_FORMATS = [
  'code_128',
  'ean_13',
  'ean_8',
  'code_39',
  'upc_a',
  'upc_e',
  'itf',
  'codabar',
  'qr_code',
];

function createZxingReader(): MultiFormatReader {
  const reader = new MultiFormatReader();
  const hints = new Map();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [
    BarcodeFormat.CODE_128,
    BarcodeFormat.EAN_13,
    BarcodeFormat.EAN_8,
    BarcodeFormat.CODE_39,
    BarcodeFormat.UPC_A,
    BarcodeFormat.UPC_E,
    BarcodeFormat.ITF,
    BarcodeFormat.CODABAR,
    BarcodeFormat.QR_CODE,
  ]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader;
}

function decodeCanvasWithZxing(
  canvas: HTMLCanvasElement,
  reader: MultiFormatReader
): string | null {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx || canvas.width === 0 || canvas.height === 0) return null;
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rgba = imgData.data;
  const pixelCount = canvas.width * canvas.height;
  const luminances = new Uint8ClampedArray(pixelCount);
  for (let i = 0, p = 0; i < pixelCount; i++, p += 4) {
    luminances[i] = (rgba[p] + (rgba[p + 1] << 1) + rgba[p + 2]) >> 2;
  }
  try {
    const source = new RGBLuminanceSource(luminances, canvas.width, canvas.height);
    const bitmap = new BinaryBitmap(new HybridBinarizer(source));
    const result = reader.decode(bitmap);
    return result?.getText() || null;
  } catch {
    return null;
  }
}

export function BarcodeScannerModal({ open, products, lang, onClose, onMatch }: Props) {
  const isBn = lang === 'bn';

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const scanningFrameRef = useRef(false);
  const zxingReaderRef = useRef<MultiFormatReader | null>(null);
  const nativeDetectorRef = useRef<NativeBarcodeDetector | null>(null);

  const [cameraStatus, setCameraStatus] = useState<'idle' | 'starting' | 'active' | 'error'>('idle');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [notFoundCode, setNotFoundCode] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchSupported(false);
    setTorchOn(false);
  }, []);

  const handleDetectedCode = useCallback(
    (rawCode: string) => {
      const cleaned = normalizeScanCode(rawCode);
      if (!cleaned) return;
      const matched = findProductByScannedCode(products, cleaned);
      if (matched) {
        stopCamera();
        setNotFoundCode(null);
        setImageError(null);
        onMatch(matched, cleaned);
      } else {
        setNotFoundCode(cleaned);
      }
    },
    [products, onMatch, stopCamera]
  );

  const startCamera = useCallback(
    async (preferredFacing: 'environment' | 'user') => {
      stopCamera();
      setCameraStatus('starting');
      setCameraError(null);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setCameraStatus('error');
        setCameraError(
          isBn
            ? 'এই ব্রাউজারে ক্যামেরা অ্যাক্সেস সমর্থিত নয়। নিচের বক্সে বারকোড বা SKU লিখে খুঁজুন অথবা ছবি আপলোড করুন।'
            : 'Camera access is not available in this browser. Enter a barcode/SKU below or upload a barcode photo.'
        );
        return;
      }

      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: preferredFacing },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
            audio: false,
          });
        } catch {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        }

        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) {
          stopCamera();
          return;
        }
        video.srcObject = stream;
        await video.play();

        const [track] = stream.getVideoTracks();
        const caps = track?.getCapabilities?.() as ({ torch?: boolean } | undefined);
        setTorchSupported(Boolean(caps?.torch));
        setCameraStatus('active');

        if (!nativeDetectorRef.current && typeof window !== 'undefined' && window.BarcodeDetector) {
          try {
            nativeDetectorRef.current = new window.BarcodeDetector({
              formats: SUPPORTED_NATIVE_FORMATS,
            });
          } catch {
            nativeDetectorRef.current = null;
          }
        }
        if (!zxingReaderRef.current) {
          zxingReaderRef.current = createZxingReader();
        }

        scanTimerRef.current = window.setInterval(async () => {
          if (scanningFrameRef.current) return;
          const v = videoRef.current;
          if (!v || v.readyState < 2 || v.videoWidth === 0 || v.videoHeight === 0) return;

          scanningFrameRef.current = true;
          try {
            let detected: string | null = null;

            if (nativeDetectorRef.current) {
              try {
                const hits = await nativeDetectorRef.current.detect(v);
                if (hits.length > 0 && hits[0].rawValue) {
                  detected = hits[0].rawValue;
                }
              } catch {
                // Fall back to ZXing canvas decode
              }
            }

            if (!detected && canvasRef.current && zxingReaderRef.current) {
              const canvas = canvasRef.current;
              const maxW = 720;
              const scale = Math.min(1, maxW / v.videoWidth);
              canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
              canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
              const ctx = canvas.getContext('2d', { willReadFrequently: true });
              if (ctx) {
                ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
                detected = decodeCanvasWithZxing(canvas, zxingReaderRef.current);
              }
            }

            if (detected) {
              handleDetectedCode(detected);
            }
          } finally {
            scanningFrameRef.current = false;
          }
        }, 200);
      } catch (err) {
        const msg = err instanceof Error ? err.name : '';
        setCameraStatus('error');
        if (msg === 'NotAllowedError' || msg === 'PermissionDeniedError') {
          setCameraError(
            isBn
              ? 'ক্যামেরা অনুমতি পাওয়া যায়নি। ব্রাউজার সেটিংস থেকে ক্যামেরা চালু করুন অথবা নিচে বারকোড/SKU দিন।'
              : 'Camera permission was denied. Allow camera access in your browser or enter/upload a barcode below.'
          );
        } else {
          setCameraError(
            isBn
              ? 'এই ডিভাইসে সক্রিয় ক্যামেরা পাওয়া যায়নি। ইউএসবি স্ক্যানার, ম্যানুয়াল কোড বা ছবি দিয়ে খুঁজতে পারেন।'
              : 'No active camera detected on this device. Use a barcode photo or enter/scan the code below.'
          );
        }
      }
    },
    [handleDetectedCode, isBn, stopCamera]
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      setCameraStatus('idle');
      setCameraError(null);
      setNotFoundCode(null);
      setImageError(null);
      setManualCode('');
      return;
    }

    startCamera(facingMode);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      stopCamera();
    };
  }, [open, facingMode, startCamera, stopCamera, onClose]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleImageUpload = async (file: File | null) => {
    if (!file) return;
    setImageError(null);
    setNotFoundCode(null);

    try {
      const bitmap = await createImageBitmap(file);
      let detected: string | null = null;

      if (typeof window !== 'undefined' && window.BarcodeDetector) {
        try {
          const det = nativeDetectorRef.current || new window.BarcodeDetector({ formats: SUPPORTED_NATIVE_FORMATS });
          nativeDetectorRef.current = det;
          const hits = await det.detect(bitmap);
          if (hits.length > 0 && hits[0].rawValue) {
            detected = hits[0].rawValue;
          }
        } catch {
          // Fall through to ZXing
        }
      }

      if (!detected && canvasRef.current) {
        const canvas = canvasRef.current;
        const maxW = 1000;
        const scale = Math.min(1, maxW / bitmap.width);
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (ctx) {
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          if (!zxingReaderRef.current) zxingReaderRef.current = createZxingReader();
          detected = decodeCanvasWithZxing(canvas, zxingReaderRef.current);
        }
      }

      bitmap.close();

      if (detected) {
        handleDetectedCode(detected);
      } else {
        setImageError(
          isBn
            ? 'ছবিতে কোনো স্পষ্ট বারকোড শনাক্ত করা যায়নি। আরও পরিষ্কার ছবি দিন অথবা কোড লিখুন।'
            : 'No readable barcode detected in that image. Try a clearer photo or enter the code manually.'
        );
      }
    } catch {
      setImageError(
        isBn
          ? 'ছবিটি পড়া যায়নি। অনুগ্রহ করে JPG বা PNG ছবি চেষ্টা করুন।'
          : 'Could not read that image file. Please try a JPG or PNG photo.'
      );
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setImageError(null);
    handleDetectedCode(manualCode);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/50 backdrop-blur-[2px] p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="barcode-scanner-title"
        data-testid="barcode-scanner-modal"
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl border border-slate-200 shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-[#0F766E]/10 text-[#0F766E] flex items-center justify-center shrink-0">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 id="barcode-scanner-title" className="text-sm font-semibold text-slate-900 truncate">
                {isBn ? 'বারকোড / SKU স্ক্যান করুন' : 'Scan Product Barcode'}
              </h2>
              <p className="text-xs text-slate-500 truncate">
                {isBn
                  ? 'ক্যামেরার সামনে বারকোড ধরুন — তালিকা থেকে সাথে সাথে পণ্য চিহ্নিত হবে'
                  : 'Point your camera at a barcode to highlight the product instantly'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={isBn ? 'বন্ধ করুন' : 'Close scanner'}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Camera Viewfinder */}
          <div className="relative aspect-[16/10] bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`w-full h-full object-cover ${cameraStatus === 'active' ? 'opacity-100' : 'opacity-0'}`}
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Alignment Frame when camera active */}
            {cameraStatus === 'active' && (
              <>
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
                  <div className="relative w-full max-w-[280px] h-28 border border-white/25 rounded-lg">
                    <span className="absolute -top-0.5 -left-0.5 w-5 h-5 border-t-2 border-l-2 border-teal-400 rounded-tl-md" />
                    <span className="absolute -top-0.5 -right-0.5 w-5 h-5 border-t-2 border-r-2 border-teal-400 rounded-tr-md" />
                    <span className="absolute -bottom-0.5 -left-0.5 w-5 h-5 border-b-2 border-l-2 border-teal-400 rounded-bl-md" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 border-b-2 border-r-2 border-teal-400 rounded-br-md" />
                    <div className="absolute inset-x-3 top-1/2 h-px bg-teal-400/80" />
                  </div>
                </div>

                {/* Camera Action Controls */}
                <div className="absolute bottom-2.5 right-2.5 flex items-center gap-1.5">
                  {torchSupported && (
                    <button
                      type="button"
                      onClick={toggleTorch}
                      aria-label={isBn ? 'ফ্ল্যাশলাইট টগল' : 'Toggle flashlight'}
                      className={`p-2 rounded-lg text-white backdrop-blur-sm border transition-colors ${
                        torchOn
                          ? 'bg-amber-500/90 border-amber-400'
                          : 'bg-slate-900/70 border-white/20 hover:bg-slate-900/90'
                      }`}
                    >
                      <Flashlight className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))}
                    aria-label={isBn ? 'ক্যামেরা পরিবর্তন' : 'Switch camera'}
                    className="p-2 rounded-lg bg-slate-900/70 border border-white/20 text-white hover:bg-slate-900/90 backdrop-blur-sm"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}

            {/* Starting State */}
            {cameraStatus === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-300 px-6 text-center">
                <Camera className="w-7 h-7 text-teal-400" />
                <div className="text-xs font-medium">
                  {isBn ? 'ডিভাইসের ক্যামেরা চালু হচ্ছে...' : 'Starting device camera...'}
                </div>
              </div>
            )}

            {/* Camera Unavailable / Permission Denied State */}
            {cameraStatus === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-slate-900">
                <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300">
                  <Camera className="w-5 h-5" />
                </div>
                <p className="text-xs text-slate-300 max-w-sm leading-relaxed">{cameraError}</p>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => startCamera(facingMode)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isBn ? 'আবার চেষ্টা করুন' : 'Retry Camera'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#0F766E] hover:bg-[#115E59] rounded-lg"
                  >
                    <ImageUp className="w-3.5 h-3.5" />
                    <span>{isBn ? 'বারকোড ছবি দিন' : 'Scan from Photo'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Inline Not Found or Image Decode Warning */}
          {(notFoundCode || imageError) && (
            <div
              role="alert"
              className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl border border-amber-300 bg-amber-50/70 text-xs text-amber-900"
            >
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                {notFoundCode ? (
                  <>
                    <span className="font-semibold">
                      {isBn ? 'কোনো পণ্য পাওয়া যায়নি:' : 'No product matched:'}
                    </span>{' '}
                    <span className="font-mono">{notFoundCode}</span>
                  </>
                ) : (
                  imageError
                )}
              </div>
            </div>
          )}

          {/* USB Scanner / Manual Code Input + Photo Upload */}
          <form onSubmit={handleManualSubmit} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="scanner-manual-input" className="text-xs font-medium text-slate-700">
                {isBn ? 'অথবা বারকোড / SKU লিখুন (ইউএসবি স্ক্যানার সাপোর্টেড)' : 'Or enter / scan barcode or SKU'}
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#0F766E] hover:underline whitespace-nowrap"
              >
                <ImageUp className="w-3.5 h-3.5" />
                <span>{isBn ? 'ছবি থেকে স্ক্যান' : 'Upload Photo'}</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] ?? null;
                  e.target.value = '';
                  handleImageUpload(file);
                }}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="scanner-manual-input"
                data-testid="scanner-manual-input"
                type="text"
                value={manualCode}
                onChange={(e) => {
                  setManualCode(e.target.value);
                  if (notFoundCode) setNotFoundCode(null);
                }}
                placeholder={isBn ? 'যেমন: 890201002022 বা HRD-202' : 'e.g. 890201002022 or HRD-202'}
                className="flex-1 min-w-0 h-10 px-3 text-sm sm:text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg focus:bg-white focus:outline-none focus:border-[#0F766E]"
              />
              <button
                type="submit"
                data-testid="scanner-manual-submit"
                disabled={!manualCode.trim()}
                className="h-10 px-4 text-xs font-semibold text-white bg-[#0F766E] hover:bg-[#115E59] disabled:opacity-50 rounded-xl sm:rounded-lg whitespace-nowrap shrink-0"
              >
                {isBn ? 'চিহ্নিত করুন' : 'Locate'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>,
    document.body
  );
}
