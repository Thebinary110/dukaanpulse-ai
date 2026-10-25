export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="var(--dp-surface-raised)" stroke="var(--dp-border-strong)" />
        <path
          d="M5 17h6l3-7 4 13 3-6h6"
          fill="none"
          stroke="var(--dp-accent)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="text-[15px] font-semibold tracking-tight text-text">
        DukaanPulse
        <span className="ml-1.5 rounded-md bg-accent-soft px-1.5 py-0.5 text-[11px] font-semibold tracking-wide text-accent">
          AI
        </span>
      </span>
    </span>
  );
}
