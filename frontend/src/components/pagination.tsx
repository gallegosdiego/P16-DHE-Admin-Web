type Props = {
  currentPage: number;
  lastPage: number;
  onPageChange: (page: number) => void;
};

export function Pagination({ currentPage, lastPage, onPageChange }: Props) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-2 pt-3">
      <button
        type="button"
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        disabled={currentPage <= 1}
        className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        Anterior
      </button>
      <span className="text-xs text-slate-600">
        Página {currentPage} de {lastPage}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(Math.min(lastPage, currentPage + 1))}
        disabled={currentPage >= lastPage}
        className="rounded border border-slate-300 px-2 py-1 text-xs disabled:opacity-50"
      >
        Siguiente
      </button>
    </div>
  );
}
