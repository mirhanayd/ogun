import type { SVGProps } from 'react'

export type OgunIconProps = SVGProps<SVGSVGElement>
export type OgunIconComponent = (props: OgunIconProps) => React.JSX.Element

// Ogun's open-corner geometry: 24px grid, 1.75px strokes, rounded terminals.
// These are interface symbols, independent of the clinical chart palette.
function icon(paths: string[]): OgunIconComponent {
  return function OgunIcon(props) {
    return <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...props}>{paths.map((d, i) => <path key={i} d={d} />)}</svg>
  }
}

export const OgunPanel = icon(['M4 10V6a2 2 0 0 1 2-2h4v6H4Z M14 4h4a2 2 0 0 1 2 2v4h-6V4Z M4 14h6v6H6a2 2 0 0 1-2-2v-4Z', 'M14 17h6 M17 14v6'])
export const OgunClients = icon(['M14.5 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z M4 20v-2a6 6 0 0 1 12 0v2', 'M18 5a3 3 0 0 1 0 6 M20 20v-2a6 6 0 0 0-2-4.5'])
export const OgunCalendar = icon(['M5 6h14a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z M7 3v6 M17 3v6 M3 11h18', 'm8 16 2 2 5-4'])
export const OgunPlan = icon(['M8 5H5a2 2 0 0 0-2 2v13h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3 M8 3h6v4H8V3Z', 'M7 12h8 M7 16h5 M19 12h2v9'])
export const OgunRecipe = icon(['M4 12h16a8 8 0 0 1-16 0Z M7 21h10', 'M9 9C5 4 9 2 12 6c3-4 7-2 3 3 M12 6v6'])
export const OgunFinance = icon(['M20 8V6a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h15v10H6a3 3 0 0 1-3-3V7', 'M21 13h-6v4h6 M17 15h.01'])
export const OgunSettings = icon(['M4 6h7 M15 6h5 M4 12h2 M10 12h10 M4 18h10 M18 18h2', 'M11 3v6 M6 9v6 M14 15v6'])
export const OgunMeasure = icon(['M5 4h14a2 2 0 0 1 2 2v13H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z', 'M8 10a4 4 0 0 1 8 0 M12 10l2-3 M8 15h8'])
export const OgunHealth = icon(['M6 3h9l4 4v14H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M14 3v5h5', 'M8 14h7 M11.5 10.5v7'])
export const OgunLab = icon(['M9 3h6 M10 3v7L4 19a1.3 1.3 0 0 0 1 2h14a1.3 1.3 0 0 0 1-2l-6-9V3', 'M8 15h8 M10 18h.01'])
export const OgunFolder = icon(['M3 8V5h6l3 3h9v12H5a2 2 0 0 1-2-2V8Z', 'M3 11h13'])
export const OgunAddClient = icon(['M13 7a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0Z M3 20v-2a6 6 0 0 1 10-4.5', 'M18 13v8 M14 17h8'])
