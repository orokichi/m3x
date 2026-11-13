'use client';

/**
 * EX Agent icon: a friendly bot face in a primary-container squircle,
 * with an antenna dot and an M3 Expressive four-point spark.
 * All colours come from the live theme tokens (--md-*), so it follows
 * the user's theme colour / dark mode automatically.
 */
export default function AgentIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" focusable="false" style={{ flexShrink: 0, display: 'block' }}>
      {/* four-point spark (top right) */}
      <path d="M38.5 2.5c.6 3.4 1.3 4.1 4.7 4.7-3.4.6-4.1 1.3-4.7 4.7-.6-3.4-1.3-4.1-4.7-4.7 3.4-.6 4.1-1.3 4.7-4.7Z" fill="var(--md-primary)" />
      {/* antenna */}
      <path d="M24 13.5v-4" stroke="var(--md-primary)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24" cy="6.5" r="2.7" fill="var(--md-primary)" />
      {/* head */}
      <rect x="6" y="13.5" width="36" height="28.5" rx="13" fill="var(--md-primary-container)" />
      {/* side knobs */}
      <rect x="2.6" y="24" width="4.4" height="8.5" rx="2.2" fill="var(--md-primary)" />
      <rect x="41" y="24" width="4.4" height="8.5" rx="2.2" fill="var(--md-primary)" />
      {/* eyes */}
      <circle cx="17.8" cy="26" r="2.8" fill="var(--md-on-primary-container)" />
      <circle cx="30.2" cy="26" r="2.8" fill="var(--md-on-primary-container)" />
      {/* smile */}
      <path d="M19.6 32.8c1.4 1.7 2.9 2.5 4.4 2.5s3-.8 4.4-2.5" stroke="var(--md-on-primary-container)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}
