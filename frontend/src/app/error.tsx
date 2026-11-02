"use client";

export default function Error({
  error: _error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-4 px-6 py-24 text-center">
      <h1 className="font-display text-2xl font-bold text-ink">Algo salió mal</h1>
      <p className="text-muted">No pudimos cargar esta página. Intenta de nuevo.</p>
      <button
        type="button"
        onClick={reset}
        className="flex h-11 items-center rounded-[10px] bg-accent px-5 text-sm font-medium text-white hover:bg-accent-hover"
      >
        Reintentar
      </button>
    </div>
  );
}
