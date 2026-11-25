const PATHS = {
    home: <path d="M3 10.5 12 3l9 7.5V21H3z"/>,
    calendar: <>
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
    </>,
    pay: <>
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <path d="M2 10h20"/>
    </>,
    people: <>
        <circle cx="9" cy="8" r="3.5"/>
        <path d="M2.5 20c1.2-3.4 3.6-5 6.5-5s5.3 1.6 6.5 5M16 4.5a3.5 3.5 0 0 1 0 7M18 15c1.8.6 3 2.2 3.5 5"/>
    </>,
    more: <>
        <circle cx="5" cy="12" r="1.6"/>
        <circle cx="12" cy="12" r="1.6"/>
        <circle cx="19" cy="12" r="1.6"/>
    </>,
    bell: <path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2.2 2.2 0 0 0 4 0"/>,
    user: <>
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>
    </>,
    card: <>
        <rect x="2.5" y="5" width="19" height="14" rx="2.5"/>
        <circle cx="8.5" cy="11" r="2.3"/>
        <path d="M5 16.2c.7-1.5 2-2.2 3.5-2.2s2.8.7 3.5 2.2M14.5 10h4.5M14.5 13.5h3"/>
    </>,
    back: <path d="M15 18l-6-6 6-6"/>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    chevron: <path d="M9 6l6 6-6 6"/>,
    camera: <>
        <path d="M4 8h3l2-3h6l2 3h3v11H4z"/>
        <circle cx="12" cy="13" r="3.5"/>
    </>,
    qr: <>
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>
    </>,
    scan: <>
        <path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3"/>
        <path d="M7 12h10"/>
    </>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="M5 12.5l4.5 4.5L19 7.5"/>,
    phone: <path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/>,
    school: <path d="M3 21h18M5 21V9l7-5 7 5v12M10 21v-6h4v6"/>,
    log: <>
        <path d="M6 3h9l4 4v14H6z"/>
        <path d="M9 11h7M9 15h7"/>
    </>,
    upload: <path d="M12 16V4M7 9l5-5 5 5M4 16v4h16v-4"/>,
    edit: <path d="M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4"/>,
    trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>,
    alert: <>
        <path d="M12 3 2 20h20z"/>
        <path d="M12 10v4M12 17.5v.01"/>
    </>,
    info: <>
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 11v6M12 7.5v.01"/>
    </>,
    search: <>
        <circle cx="11" cy="11" r="7"/>
        <path d="M20 20l-4-4"/>
    </>,
    clock: <>
        <circle cx="12" cy="12" r="9"/>
        <path d="M12 7v5l3 2"/>
    </>,
    room: <>
        <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/>
        <circle cx="12" cy="9.5" r="2.5"/>
    </>,
    repeat: <path d="M17 2l3 3-3 3M4 11V9a4 4 0 0 1 4-4h12M7 22l-3-3 3-3M20 13v2a4 4 0 0 1-4 4H4"/>,
    copy: <>
        <rect x="8" y="8" width="13" height="13" rx="2"/>
        <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>
    </>,
    download: <path d="M12 4v12M7 11l5 5 5-5M4 20h16"/>,
    file: <>
        <path d="M6 3h8l5 5v13H6z"/>
        <path d="M14 3v5h5"/>
    </>,
    logout: <path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>,
    star: <path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>,
    pin: <path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/>,
    heart: <path d="M12 20s-8-4.8-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6.2-8 11-8 11z"/>,
    swap: <path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>,
    chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>,
    userPlus: <>
        <circle cx="9" cy="8" r="4"/>
        <path d="M2 21c1.3-3.8 4-5.6 7-5.6s5.7 1.8 7 5.6M19 8v6M16 11h6"/>
    </>,
    mail: <>
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <path d="m3 7 9 6 9-6"/>
    </>,
} as const;

export type IconName = keyof typeof PATHS;

/** A line icon. Decorative: the button or link around it carries the accessible name. */
export function Icon({name, size = 22}: { name: IconName; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            {PATHS[name]}
        </svg>
    );
}
