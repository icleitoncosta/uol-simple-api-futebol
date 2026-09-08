export interface Match {
    campeonato: string,
    logoCampeonato: string | null,
    estadio: string,
    hora: string, // 21h30
    times: string[], // [ 'SAN', 'GRE' ]
    nomeTimes: string[], // [ 'Santos', 'Grêmio' ]
    idFootballApiTimes: number[], // [ 126, 130 ] - ids dos times na api-sports.io
    canais: string[], // [ 'SporTV', 'Premiere' ]
    escudos: string[], // [ 'url1', 'url2' ]
    date: Date,
    destaque: boolean,
    sub20: boolean,
    feminino: boolean
}