const CRBadge = () => (
  <span title="Class Representative" className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-amber-800 shadow-sm" aria-label="CR, Class Representative">
    <svg aria-hidden="true" className="h-3.5 w-3.5 text-amber-500" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.5 14.8 8l6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 8.9 9.2 8 12 2.5Z" />
    </svg>
    CR <span className="hidden sm:inline">· Class Representative</span>
  </span>
);

export default CRBadge;
