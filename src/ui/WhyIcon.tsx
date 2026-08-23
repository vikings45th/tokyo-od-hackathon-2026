type WhyIconName = 'calendar' | 'ranking' | 'data';
export function WhyIcon({ name }: { name: WhyIconName }) {
  return <svg className="why-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{name === 'calendar' && <><rect x="9" y="11" width="30" height="28" rx="5" /><path d="M15 8v7M33 8v7M9 19h30M17 27h5M26 27h5M17 33h5" /></>}{name === 'ranking' && <><path d="M10 39h28M14 35V24h7v11M27 35V15h7v20M16 15l6-6 5 5 10-10M32 4h5v5" /></>}{name === 'data' && <><path d="M11 10h26v28H11zM17 17h14M17 23h14M17 29h8M7 15v25h23" /></>}</svg>;
}
