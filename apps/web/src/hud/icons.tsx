/** 24×24 line glyphs for the command card — drawn for this app, stroke = currentColor. */
const P: Record<string, string> = {
  engine: 'M4 9h3l2-2h6v3h2l2-2v8l-2-2h-2v3H9l-2-2H4z M9 7V5h4',
  cooling: 'M12 3v18 M5 7l14 10 M19 7L5 17 M9 3l3 3 3-3 M9 21l3-3 3 3',
  belts: 'M7 8a3 3 0 1 0 0.01 0 M17 13a4 4 0 1 0 0.01 0 M7 5l10 4 M7 11l10 6',
  ignition: 'M10 2h4v4h-4z M9 6h6v4H9z M12 10v5 M10 15h4l-2 6z',
  filters: 'M6 4h12v4l-3 3v9H9v-9L6 8z M9 14h6 M9 17h6',
  electrical: 'M5 7h14v12H5z M8 4h2v3 M14 4h2v3 M12 10l-2 4h4l-2 4',
  fluids: 'M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z M9 15a3 3 0 0 0 3 3',
  brakes: 'M12 4a8 8 0 1 0 0.01 0 M12 9a3 3 0 1 0 0.01 0 M17 5l3 3-3 4',
  suspension: 'M12 2v3 M7 5h10 M8 8l8 2-8 2 8 2-8 2 8 2 M7 20h10 M12 20v2',
  steering: 'M12 3a9 9 0 1 0 0.01 0 M12 10a2 2 0 1 0 0.01 0 M3.5 10h6.5 M14 10h6.5 M12 12v9',
  drivetrain: 'M3 12h18 M6 8v8 M18 8v8 M10 9h4v6h-4z',
  lighting: 'M4 8c0-2 2-3 4-3h3v14H8c-2 0-4-1-4-3z M14 7h7 M14 12h7 M14 17h7',
  wipers: 'M3 19a12 12 0 0 1 18 0 M12 19L7 8 M7 8l-1-2',
  xray: 'M3 12s3-6 9-6 9 6 9 6-3 6-9 6-9-6-9-6z M12 9a3 3 0 1 0 0.01 0 M2 2l20 20',
  rotate: 'M20 12a8 8 0 1 1-3-6.2 M20 4v5h-5',
  sound: 'M4 9h4l5-4v14l-5-4H4z M16 9a4 4 0 0 1 0 6 M18.5 6.5a8 8 0 0 1 0 11',
  mute: 'M4 9h4l5-4v14l-5-4H4z M16 9l5 6 M21 9l-5 6',
  palette: 'M4 5h16v14H4z M7 9l3 3-3 3 M12 15h5',
  gear: 'M12 9a3 3 0 1 0 0.01 0 M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9l2.1 2.1 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1',
  help: 'M12 3a9 9 0 1 0 0.01 0 M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6 M12 17.5v.01',
  reset: 'M4 4h6 M4 4v6 M20 20h-6 M20 20v-6 M4 20l6-6 M20 4l-6 6',
};

export function Icon({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[name] ?? ''} />
    </svg>
  );
}
