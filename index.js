import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Busca e retorna a lista de jogos de futebol do dia especificado a partir do site da UOL.
 *
 * @async
 * @param {string} [dia] - Data no formato 'dd-mm-aaaa'. Se não for fornecida, utiliza a data atual.
 * @returns {Promise<Array<{gameName: string, campeonato: string, hora: string, times: string[], canais: string[]}>>}
 *          Retorna uma Promise que resolve para um array de objetos contendo informações dos jogos:
 *          - gameName: Nome do jogo (ex: "Corinthians x Palmeiras")
 *          - campeonato: Nome do campeonato
 *          - hora: Horário do jogo
 *          - times: Array com as siglas dos times
 *          - canais: Array com os canais de transmissão
 * @throws {Error} Caso ocorra algum erro na requisição ou no processamento dos dados.
 */
export default async function getJogos(dia) {
    if(typeof dia !== 'string' || !/^\d{2}-\d{2}-\d{4}$/.test(dia)) {
        console.warn("Data inválida. Usando data atual.");
        dia = getDataAtualFormatada();
    }
  const url = `https://www.uol.com.br/esporte/futebol/central-de-jogos/#/${dia ?? getDataAtualFormatada()}`;

  try {
    const { data: html } = await axios.get(url);
    const $ = cheerio.load(html);
    const jogosHoje = $(`li[data-ts="${dia ?? getDataAtualFormatada()}"]`);

    let games = [];
    const el = jogosHoje.first();
    el.find('.match-content').each((i, el) => {
    const campeonato = $(el).find('.match-info > div:first-child').text().trim();

        // Pegando as siglas dos times
        const times = $(el).find('.team-abbr').map((i, t) => $(t).text().trim()).get();
        const hora = $(el).find('.match-info-hora').text().trim();

        const canais = $(el)
            .find('.match-footer .container-status .transmitions a')
            .map((i, c) => {
                const ariaLabel = $(c).attr('aria-label');
                const canal = ariaLabel ? ariaLabel.replace('transmissão ', '') : $(c).text().trim();
                return canal;
            })
            .get();
            if(canais.length > 0) {
                games.push({
                    campeonato,
                    hora,
                    times,
                    canais,
                    date: parseDataHoraBR(dia, hora),
                });
            }
    });
    games = ordenarPorData(games);
    return games;
  } catch (err) {
    console.error('Erro ao buscar os jogos:', err.message);
  }
}

function getDataAtualFormatada() {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = hoje.getFullYear();
  return `${dia}-${mes}-${ano}`;
}

function parseDataHoraBR(dataStr, horaStr) {
  const [dia, mes, ano] = dataStr.split("-").map(Number);

  const horaMatch = horaStr.match(/^(\d{1,2})H(\d{1,2})?$/i);
  if (!horaMatch) {
    throw new Error("Formato de hora inválido. Use ex: 21H30, 19H, 15H");
  }

  const horas = parseInt(horaMatch[1], 10);
  const minutos = horaMatch[2] ? parseInt(horaMatch[2], 10) : 0;

  return new Date(ano, mes - 1, dia, horas, minutos);
}

function ordenarPorData(jogos) {
  return jogos.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
}