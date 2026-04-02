'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, Search, ZoomIn, ZoomOut } from 'lucide-react';
import clsx from 'clsx';

type ReactPdfModule = typeof import('react-pdf');

type PdfReviewReaderProps = {
  fileUrl: string;
  fileName?: string;
  onLookupTerm?: (term: string) => void;
};

type SelectionState = {
  text: string;
  x: number;
  y: number;
};

const MIN_SCALE = 0.8;
const MAX_SCALE = 2.2;

export default function PdfReviewReader({ fileUrl, fileName, onLookupTerm }: PdfReviewReaderProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pageWrapRef = useRef<HTMLDivElement>(null);

  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [pageWidth, setPageWidth] = useState<number>(860);
  const [selection, setSelection] = useState<SelectionState | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pdfModule, setPdfModule] = useState<ReactPdfModule | null>(null);
  const [pdfLoadError, setPdfLoadError] = useState<string | null>(null);

  const canPrev = pageNumber > 1;
  const canNext = pageNumber < numPages;

  const clearSelection = useCallback(() => {
    setSelection(null);
    if (typeof window !== 'undefined') {
      window.getSelection()?.removeAllRanges();
    }
  }, []);

  useEffect(() => {
    const el = pageWrapRef.current;
    if (!el) return;
    const updateWidth = () => {
      const containerWidth = el.clientWidth || 860;
      setPageWidth(Math.max(320, Math.floor(containerWidth - 16)));
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
      clearSelection();
    };
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, [clearSelection]);

  useEffect(() => {
    let mounted = true;
    import('react-pdf')
      .then((mod) => {
        mod.pdfjs.GlobalWorkerOptions.workerSrc =
          `https://unpkg.com/pdfjs-dist@${mod.pdfjs.version}/build/pdf.worker.min.mjs`;
        if (mounted) {
          setPdfModule(mod);
          setPdfLoadError(null);
        }
      })
      .catch((err) => {
        if (mounted) {
          setPdfLoadError(err?.message || 'PDF 阅读器加载失败');
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const onDocumentLoadSuccess = useCallback(({ numPages: total }: { numPages: number }) => {
    setNumPages(total);
    setPageNumber((prev) => Math.min(Math.max(1, prev), total));
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const container = rootRef.current;
    if (!container) return;
    if (!document.fullscreenElement) {
      await container.requestFullscreen();
      return;
    }
    await document.exitFullscreen();
  }, []);

  const handleTextSelection = useCallback(() => {
    if (!rootRef.current) return;
    const selected = (window.getSelection()?.toString() || '').trim().replace(/\s+/g, ' ');
    if (!selected || selected.length < 2 || selected.length > 80) {
      setSelection(null);
      return;
    }

    const range = window.getSelection()?.rangeCount ? window.getSelection()!.getRangeAt(0) : null;
    const rect = range?.getBoundingClientRect();
    if (!rect) {
      setSelection(null);
      return;
    }

    const containerRect = rootRef.current.getBoundingClientRect();
    const x = rect.left - containerRect.left + rect.width / 2;
    const y = rect.top - containerRect.top - 10;
    setSelection({
      text: selected,
      x: Math.max(12, x),
      y: Math.max(12, y),
    });
  }, []);

  const zoomLabel = useMemo(() => `${Math.round(scale * 100)}%`, [scale]);
  const DocumentComp = pdfModule?.Document;
  const PageComp = pdfModule?.Page;

  return (
    <div
      ref={rootRef}
      className={clsx(
        'relative h-[calc(100vh-220px)] min-h-[640px] rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-100/60 dark:bg-gray-950 overflow-hidden',
        isFullscreen && 'h-screen min-h-0 rounded-none border-0'
      )}
      onMouseUp={handleTextSelection}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-2 py-2 bg-gradient-to-b from-black/35 to-transparent">
        <div className="text-xs text-white/90 truncate max-w-[50%]">{fileName || '复习文档'}</div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setScale((s) => Math.max(MIN_SCALE, Number((s - 0.1).toFixed(1))))}
            className="p-1.5 rounded-md bg-black/45 hover:bg-black/60 text-white"
            title="缩小"
          >
            <ZoomOut size={14} />
          </button>
          <span className="text-[11px] text-white/90 px-1">{zoomLabel}</span>
          <button
            type="button"
            onClick={() => setScale((s) => Math.min(MAX_SCALE, Number((s + 0.1).toFixed(1))))}
            className="p-1.5 rounded-md bg-black/45 hover:bg-black/60 text-white"
            title="放大"
          >
            <ZoomIn size={14} />
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-1.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white"
            title={isFullscreen ? '退出全屏' : '全屏阅读'}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      <div ref={pageWrapRef} className="absolute inset-0 overflow-auto px-2 py-14">
        <div className="mx-auto w-fit rounded-lg shadow-lg overflow-hidden bg-white">
          {!pdfModule || !DocumentComp || !PageComp ? (
            <div className="w-[360px] h-[520px] grid place-items-center text-sm text-gray-500">
              {pdfLoadError || '正在加载 PDF 阅读器...'}
            </div>
          ) : (
            <DocumentComp
              file={fileUrl}
              onLoadSuccess={onDocumentLoadSuccess}
              loading={
                <div className="w-[360px] h-[520px] grid place-items-center text-sm text-gray-500">
                  正在加载 PDF...
                </div>
              }
              error={
                <div className="w-[360px] h-[520px] grid place-items-center text-sm text-rose-500">
                  PDF 加载失败，请稍后重试
                </div>
              }
            >
              <PageComp
                pageNumber={pageNumber}
                width={pageWidth}
                scale={scale}
                renderTextLayer
                renderAnnotationLayer
              />
            </DocumentComp>
          )}
        </div>
      </div>

      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-2 py-1.5 rounded-lg bg-black/60 text-white">
        <button
          type="button"
          onClick={() => setPageNumber((p) => Math.max(1, p - 1))}
          disabled={!canPrev}
          className="p-1 rounded hover:bg-white/15 disabled:opacity-35"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs tabular-nums">
          {pageNumber}/{Math.max(1, numPages)}
        </span>
        <button
          type="button"
          onClick={() => setPageNumber((p) => Math.min(Math.max(1, numPages), p + 1))}
          disabled={!canNext}
          className="p-1 rounded hover:bg-white/15 disabled:opacity-35"
        >
          <ChevronRight size={14} />
        </button>
      </div>

      {selection && onLookupTerm && (
        <button
          type="button"
          onClick={() => {
            onLookupTerm(selection.text);
            clearSelection();
          }}
          className="absolute z-30 inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs bg-violet-600 text-white hover:bg-violet-700"
          style={{ left: selection.x, top: selection.y, transform: 'translate(-50%, -100%)' }}
        >
          <Search size={12} />
          查询“{selection.text.length > 18 ? `${selection.text.slice(0, 18)}...` : selection.text}”
        </button>
      )}
    </div>
  );
}
