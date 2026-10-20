export function ShipSystemIcon({kind}:{kind:string}){
 const paths:Record<string,string>={engine:'M8 3h8v11H8z M9 14l-3 6m6-6v7m3-7 3 6',reactor:'M12 2 4 14h7l-1 8 10-13h-8z',shield:'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6z',weapon:'M4 20 16 8m-3-3 6 6M3 14l7 7M16 3h5v5',hull:'M4 7 12 3l8 4v10l-8 4-8-4z M4 7l8 4 8-4m-8 4v10',sensor:'M12 12 20 4M12 3a9 9 0 1 0 9 9M12 7a5 5 0 1 0 5 5',utility:'M3 6h18v14H3z M8 6V3h8v3M3 11h18',crew:'M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0M4 22v-5a8 8 0 0 1 16 0v5'};
 return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={paths[kind]||paths.utility}/></svg>;
}
