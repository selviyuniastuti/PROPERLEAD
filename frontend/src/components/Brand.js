export function Wordmark({ className = "", size = "text-xl" }) {
  return (
    <span className={`font-extrabold tracking-tight ${size} ${className}`} data-testid="brand-wordmark">
      <span className="text-[#065F46]">PROPER</span>
      <span className="text-[#D97706]">LEAD</span>
    </span>
  );
}

export function BrandMark({ className = "" }) {
  return (
    <div
      className={`flex items-center justify-center rounded-xl bg-gradient-to-br from-[#065F46] to-[#0b7a5a] text-white shadow-md ${className}`}
      data-testid="brand-mark"
    >
      <svg viewBox="0 0 24 24" fill="none" className="h-6 w-6">
        <path d="M3 12l9-8 9 8" stroke="#ECFDF5" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M6 10.5V20h12v-9.5" stroke="#ECFDF5" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity="0.5" />
        <path d="M8 16l3-3 2 2 4-5" stroke="#F5C451" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M14 10h3v3" stroke="#F5C451" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}
