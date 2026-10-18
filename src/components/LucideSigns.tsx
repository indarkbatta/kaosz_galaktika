import type {SVGProps} from 'react';
type Props=SVGProps<SVGSVGElement>;
const base={xmlns:'http://www.w3.org/2000/svg',width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:2,strokeLinecap:'round' as const,strokeLinejoin:'round' as const};
// Official Lucide plus / minus path geometry; no additional dependency or lockfile churn.
export function LucidePlus(props:Props){return <svg {...base} {...props} aria-hidden="true"><path d="M5 12h14M12 5v14"/></svg>}
export function LucideMinus(props:Props){return <svg {...base} {...props} aria-hidden="true"><path d="M5 12h14"/></svg>}

// Official Lucide zap outline for the editor-only energy refill control.
export function LucideZap(props:Props){return <svg {...base} {...props} aria-hidden="true"><path d="m13 2-3 8H3l8 12 3-8h7L13 2Z"/></svg>}
