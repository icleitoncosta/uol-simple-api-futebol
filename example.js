// Exemplo de uso da biblioteca uol-simple-api-futebol
const getJogos = require('./dist/index.js').default;

async function main() {
    try {
        console.log('=== Buscando jogos de HOJE ===\n');
        
        const jogosHoje = await getJogos();

        if (jogosHoje.length === 0) {
            console.log('Nenhum jogo com transmissão encontrado para hoje.');
        } else {
            console.log(`Total de jogos com transmissão: ${jogosHoje.length}\n`);
            
            jogosHoje.forEach((jogo, index) => {
                console.log(`\n--- Jogo ${index + 1} ---`);
                console.log(`${jogo.campeonato}`);
                console.log(`${jogo.nomeTimes[0]} x ${jogo.nomeTimes[1]}`);
                console.log(`Horário: ${jogo.hora}`);
                console.log(`Estádio: ${jogo.estadio}`);
                console.log(`Transmissão: ${jogo.canais.join(', ')}`);
            });
        }
    } catch (error) {
        console.error('❌ Erro:', error.message);
    }
}

main();

