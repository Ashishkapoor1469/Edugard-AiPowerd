const CRBadge = () => (
  <span className="group relative inline-flex" aria-label="CR, Class Representative">
    <span className="h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-white" aria-hidden="true" />
    <span role="tooltip" className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900 px-2.5 py-1.5 text-[10px] font-bold text-white shadow-lg group-hover:block group-focus-within:block">
      CR - Class Representative
    </span>
  </span>
);

export default CRBadge;
