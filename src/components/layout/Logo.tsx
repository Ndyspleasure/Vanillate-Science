export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path
        d="M8 10 L14.5 23 L17 18"
        fill="none"
        stroke="var(--accent-contrast)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M17.5 13.5 H25 M21.25 9.75 V17.25"
        stroke="var(--accent-contrast)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M18.5 22.5 H25"
        stroke="var(--accent-contrast)"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}
