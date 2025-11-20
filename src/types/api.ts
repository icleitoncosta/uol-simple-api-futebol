export interface Match {
    campeonato: string,
    estadio: string,
    hora: string, // 21h30
    times: string[], // [ 'SAN', 'GRE' ]
    nomeTimes: string[], // [ 'Santos', 'Grêmio' ]
    canais: string[], // [ 'SporTV', 'Premiere' ]
    escudos: string[], // [ 'url1', 'url2' ]
    date: Date,
}