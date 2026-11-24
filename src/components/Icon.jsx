// Schlichte Strich-Icons als SVG (keine externe Bibliothek nötig).
const PATHS = {
  back: <path d="M15 18l-6-6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  plus: <path d="M12 5v14M5 12h14" />,
  list: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
  notebook: <><path d="M6 3.5h11.5A1.5 1.5 0 0 1 19 5v14.5a1.5 1.5 0 0 1-1.5 1.5H6z" /><path d="M6 3.5v17.5M3.5 7.5H6M3.5 12H6M3.5 16.5H6" /><path d="M10 8.5h5.5M10 12h4" /></>,
  flame: <path d="M12 21c-3.6 0-6.5-2.6-6.5-6.2 0-2.6 1.6-4.4 3-5.9.4 1.5 1.2 2.5 2.2 3 0-3.2 1.2-6.2 4-8.4-.2 2.6.7 4.4 2.2 6 1 1.1 1.6 2.6 1.6 4.4C18.5 18.2 15.6 21 12 21z" />,
  chart: <path d="M4 20h16M7 16.5V11M12 16.5V6.5M17 16.5v-8" />,
  car: <><path d="M5 16.5V12l1.8-4.6A2 2 0 0 1 8.7 6h6.6a2 2 0 0 1 1.9 1.4L19 12v4.5" /><path d="M3.5 12h17v4.5h-17z" /><circle cx="7.5" cy="14.3" r=".6" fill="currentColor" /><circle cx="16.5" cy="14.3" r=".6" fill="currentColor" /><path d="M6 16.5V19M18 16.5V19" /></>,
  grid: <><rect x="4" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.2" /><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.2" /><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.2" /></>,
  shelf: <><rect x="5" y="4" width="4" height="12" rx=".8" /><rect x="10.5" y="6" width="4" height="10" rx=".8" /><path d="M16 6.5l3.2-.9 2.6 9.6-3.2.9z" /><path d="M2.5 19h19" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  bookmark: <path d="M6 3h12v18l-6-4.5L6 21z" />,
  bookmarkFilled: <path d="M6 3h12v18l-6-4.5L6 21z" fill="currentColor" />,
  text: <><path d="M4 19l5-14 5 14M5.8 14h6.4" /><path d="M15.5 19l3-8 3 8M16.4 16.5h4.2" /></>,
  play: <path d="M7 4.5v15l13-7.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" stroke="none" /></>,
  back30: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3 3.5v4h4" /><text x="12.2" y="15.6" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="600">30</text></>,
  fwd30: <><path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" /><path d="M21 3.5v4h-4" /><text x="11.8" y="15.6" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="600">30</text></>,
  prevChapter: <path d="M18 6l-8 6 8 6zM6 6v12" />,
  nextChapter: <path d="M6 6l8 6-8 6zM18 6v12" />,
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  more: <><circle cx="5" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="19" cy="12" r="1.3" fill="currentColor" /></>,
  cloud: <path d="M7 19h10.5a4.5 4.5 0 0 0 .6-8.96A6.5 6.5 0 0 0 5.6 9.2 5 5 0 0 0 7 19z" />,
  sync: <><path d="M20 11a8 8 0 0 0-14.3-4.9L4 8" /><path d="M4 3.5V8h4.5" /><path d="M4 13a8 8 0 0 0 14.3 4.9L20 16" /><path d="M20 20.5V16h-4.5" /></>,
  folder: <path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z" />,
  download: <><path d="M12 4v11M7 10.5l5 5 5-5" /><path d="M5 20h14" /></>,
  downloadOff: <><path d="M12 4v11M7 10.5l5 5 5-5" /><path d="M5 20h14" /><path d="M4 4l16 16" /></>,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />,
  headphones: <><path d="M4 16v-4a8 8 0 0 1 16 0v4" /><rect x="3" y="15" width="4" height="6" rx="1.5" /><rect x="17" y="15" width="4" height="6" rx="1.5" /></>,
  book: <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5zM4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5" />,
}

export default function Icon({ name, size = 22, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      {PATHS[name]}
    </svg>
  )
}
