# uol-simple-api-futebol
Uma API Simples para buscar os jogos que irão acontecer no dia através do portal UOL

## Como utilizar?
Instale o projeto utilizando `npm install uol-simple-api-futebol`

```
import getGames from 'uol-simple-api-futebol';

const games = await getGames("21-08-2025");
```

Agora é só utilizar o retorno para o que precisa:
Exemplo do retorno:

```
// Exemplo de retorno que terá
[
  {
    campeonato: 'Paulista Feminino',
    hora: '15H',
    times: [ 'REA', 'COR' ],
    canais: [ 'Space/Max', 'CazéTV', 'Record News' ],
    date: 2025-08-21T18:00:00.000Z
  },
  {
    campeonato: 'Libertadores',
    hora: '19H',
    times: [ 'LDU', 'BOT' ],
    canais: [ 'Paramount+' ],
    date: 2025-08-21T22:00:00.000Z
  },
  {
    campeonato: 'Copa Sul-Americana',
    hora: '19H',
    times: [ 'GOD', 'CAM' ],
    canais: [ 'ESPN', 'Disney+' ],
    date: 2025-08-21T22:00:00.000Z
  },
  {
    campeonato: 'Libertadores',
    hora: '21H30',
    times: [ 'PAL', 'UNI' ],
    canais: [ 'ESPN', 'Disney+' ],
    date: 2025-08-22T00:30:00.000Z
  },
  {
    campeonato: 'Copa Sul-Americana',
    hora: '21H30',
    times: [ 'LAN', 'CEN' ],
    canais: [ 'Paramount+' ],
    date: 2025-08-22T00:30:00.000Z
  },
  {
    campeonato: 'Libertadores',
    hora: '21H30',
    times: [ 'RIV', 'LIB' ],
    canais: [ 'Paramount+' ],
    date: 2025-08-22T00:30:00.000Z
  }
]
```