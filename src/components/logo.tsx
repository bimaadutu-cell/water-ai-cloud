import { useId } from "react";

export function LogoMark({ size = 34 }: { size?: number }) {
  const id = useId().replace(/[:]/g, "");
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      aria-hidden
      style={{ filter: "drop-shadow(0 0 10px rgba(34,211,238,0.35))" }}
    >
      <defs>
        <linearGradient id={`g-${id}`} x1="8" y1="6" x2="42" y2="42" gradientUnits="userSpaceOnUse">
          <stop stopColor="#67e8f9" />
          <stop offset="0.5" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      {/* cloud */}
      <path
        d="M15 20.5a6.5 6.5 0 0 1 6.3-8.3 8 8 0 0 1 14.6 3.1 5.5 5.5 0 0 1 1.1 10.9H15z"
        fill="rgba(34,211,238,0.10)"
        stroke={`url(#g-${id})`}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      {/* droplet */}
      <path
        d="M24 23.5c3.4 4 5.8 7 5.8 10a5.8 5.8 0 1 1-11.6 0c0-3 2.4-6 5.8-10z"
        fill={`url(#g-${id})`}
        fillOpacity="0.9"
      />
      {/* ai network nodes */}
      <circle cx="14" cy="30" r="1.7" fill="#67e8f9" />
      <circle cx="35" cy="29" r="1.7" fill="#60a5fa" />
      <circle cx="24" cy="41.5" r="1.7" fill="#38bdf8" />
      <path d="M15.5 30.6 22.7 40.5M33.5 30.2 25.5 40.7M15.7 30 33.3 29.3" stroke={`url(#g-${id})`} strokeWidth="1" strokeOpacity="0.7" />
    </svg>
  );
}

export function Logo({ size = 34, dark = true }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5 select-none">
      <LogoMark size={size} />
      <span
        className={`font-display font-bold tracking-tight leading-none ${dark ? "text-white" : "text-ink-950"}`}
        style={{ fontSize: size * 0.52 }}
      >
        WATER <span className="text-gradient">AI CLOUD</span>
      </span>
    </span>
  );
}
