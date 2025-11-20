import * as cheerio from "cheerio";
import { chromium, Browser, Page } from "playwright";
import { Match } from "./types/api";
import { parseDataHoraBR, prepareCacheMatchs } from ".";

export async function getFutebolNaTVData(diaFormatado: any): Promise<Match[]> {
  const url = `https://www.futebolnatv.com.br/jogos-hoje/`;
  
  let browser: Browser | null = null;
  
  try {
    // Iniciar o navegador com timeout
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      timeout: 15000 // 15 segundos para iniciar
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 },
      locale: 'pt-BR'
    });

    const page: Page = await context.newPage();
    
    // Navegar para a página com waitUntil mais permissivo e timeout menor
    await Promise.race([
      page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 20000 // 20 segundos
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout ao carregar página')), 25000)
      )
    ]).catch((err) => {
      console.warn('Timeout ou erro ao carregar página, tentando continuar...', err.message);
    });

    // Aguardar o componente Livewire carregar (com timeouts menores)
    try {
      await Promise.race([
        page.waitForSelector('[wire\\:id]', { timeout: 10000 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 12000))
      ]).catch(() => {
        console.log('Elemento Livewire não encontrado, continuando...');
      });

      // Aguardar elementos de jogos aparecerem (cards, etc)
      await Promise.race([
        page.waitForSelector('.gamecard', { timeout: 10000 }),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), 12000))
      ]).catch(() => {
        console.log('Elementos de jogos podem não estar visíveis ainda');
      });

      // Aguardar um pouco mais para garantir que o JavaScript terminou de executar
      await page.waitForTimeout(2000).catch(() => {});
    } catch (e) {
      console.warn('Algum timeout ocorreu, mas continuando mesmo assim...');
    }

    // Obter o HTML renderizado
    const html = await page.content().catch(() => '');
    
    if (browser) {
      await browser.close().catch(() => {});
      browser = null;
    }

    if (!html) {
      console.warn('Não foi possível obter HTML, retornando array vazio');
      return [];
    }
    
    // Parsear o HTML com cheerio
    const $ = cheerio.load(html);
    
    // Extrair jogos do HTML renderizado
    const games = parseGamesFromHTML($, $, diaFormatado);
    
    return games;
    
  } catch (err: any) {
    console.error('Erro ao buscar jogos do Futebol na TV:', err.message);
    
    // Garantir que o browser seja fechado mesmo em caso de erro
    if (browser) {
      try {
        await browser.close();
      } catch (e) {
        // Ignorar erros ao fechar
      }
    }
    
    // Retornar array vazio em vez de lançar erro
    return [];
  }
}

function parseGamesFromHTML($: cheerio.CheerioAPI, $original: cheerio.CheerioAPI, diaFormatado: string): Match[] {
  const games: Match[] = [];
  
  // A estrutura real usa .gamecard para cada jogo
  $('.gamecard').each((index, element) => {
    try {
      const $gamecard = $(element);
      
      // Ignorar gamecards que são anúncios (têm adsbygoogle)
      if ($gamecard.find('ins.adsbygoogle').length > 0) {
        return;
      }
      
      // Extrair informações do jogo
      const game = extractGameFromGamecard($, $gamecard, diaFormatado);
      if (game) {
        games.push(game);
      }
    } catch (err) {
      // Ignorar erros em elementos individuais
      console.warn('Erro ao processar gamecard:', err);
    }
  });
  
  return games;
}

function extractGameFromGamecard($: cheerio.CheerioAPI, $gamecard: cheerio.Cheerio<any>, diaFormatado: string): Match | null {
  try {
    // Extrair campeonato
    const campeonatoEl = $gamecard.find('.all-scores-widget-competition-header-container-hora .col-sm-8');
    let campeonato = 'Campeonato não informado';
    
    // Tentar pegar do elemento <b>
    const boldEl = campeonatoEl.find('b');
    if (boldEl.length > 0) {
      campeonato = boldEl.text().trim();
    } else {
      // Se não tiver <b>, pegar todo o texto e limpar
      const campeonatoTexto = campeonatoEl.text().trim();
      // Remover " - " e tudo depois (ex: " - League Stage - 4")
      const campeonatoLimpo = campeonatoTexto.split(' - ')[0].trim();
      if (campeonatoLimpo) {
        campeonato = campeonatoLimpo;
      }
    }
    
    // Extrair horário
    const boxTime = $gamecard.find('.box_time');
    const dataDt = boxTime.attr('data-dt');
    let hora = '';
    
    if (dataDt) {
      // Formato: "2025-11-19 14:45:00-03:00"
      const horaMatch = dataDt.match(/(\d{2}):(\d{2})/);
      if (horaMatch) {
        hora = `${horaMatch[1]}h${horaMatch[2]}`;
      }
    }
    
    // Se não encontrou no data-dt, pegar do texto
    if (!hora) {
      const horaTexto = boxTime.text().trim();
      const horaMatch = horaTexto.match(/(\d{1,2}):(\d{2})/);
      if (horaMatch) {
        hora = `${horaMatch[1]}h${horaMatch[2]}`;
      }
    }
    
    if (!hora) {
      return null; // Sem horário, não é um jogo válido
    }
    
    // Extrair times - estão em divs com classe "p-3 win" dentro de spans
    const timesDivs = $gamecard.find('.p-3.win span');
    const times: string[] = [];
    
    timesDivs.each((i, el) => {
      const timeTexto = $(el).text().trim();
      // Remover quebras de linha e espaços extras
      const timeLimpo = timeTexto.replace(/\s+/g, ' ').trim();
      if (timeLimpo && timeLimpo.length > 0) {
        times.push(timeLimpo);
      }
    });
    
    if (times.length < 2) {
      return null; // Precisa ter pelo menos 2 times
    }
    const time1 = times[0];
    const time2 = times?.[2] ?? times[1];
    
    // Extrair canais - estão em divs com classe "bcmact" dentro de spans com ícone de TV
    const canais: string[] = [];
    $gamecard.find('.bcmact').each((i, el) => {
      const $canalEl = $(el);
      const $span = $canalEl.find('span');
      
      // O texto do canal está no span, após o ícone
      let canalTexto = $span.text().trim();
      
      // Se não encontrou no span, pegar do elemento inteiro
      if (!canalTexto) {
        canalTexto = $canalEl.text().trim();
      }
      
      // Remover o ícone "fa-tv" e outros ícones, pegar apenas o texto do canal
      // O formato é: "DISNEY+ PREMIUM" ou "SPORTV" etc
      const canalLimpo = canalTexto
        .replace(/^\s*/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (canalLimpo && canalLimpo.length > 0) {
        // Pode ter badges HTML, remover tags
        const canalFinal = canalLimpo.replace(/<[^>]*>/g, '').trim();
        
        // Remover espaços extras e quebras de linha
        const canalNormalizado = canalFinal.replace(/\s+/g, ' ').trim();
        
        if (canalNormalizado && canalNormalizado.length > 0 && !canais.includes(canalNormalizado)) {
          canais.push(canalNormalizado);
        }
      }
    });
    
    // Se não encontrou canais, pular este jogo (seguindo o padrão do UOL)
    if (canais.length === 0) {
      return null;
    }
    
    // Extrair escudos (se disponível) - estão nas imagens de ligas/países
    const escudos: string[] = [];
    $gamecard.find('img').each((i, img) => {
      const src = $(img).attr('src');
      if (src && (src.includes('ligas') || src.includes('countries') || src.includes('team'))) {
        const fullUrl = src.startsWith('http') ? src : `https://www.futebolnatv.com.br${src.startsWith('/') ? '' : '/'}${src}`;
        escudos.push(fullUrl);
      }
    });
    
    // Se não encontrou escudos, usar placeholders
    if (escudos.length < 2) {
      escudos.push('', '');
    }
    
    // Estádio não está disponível na estrutura mostrada
    const estadio = 'Não informado';
    
    return {
      campeonato: campeonato,
      estadio: estadio,
      hora: hora,
      times: [time1.substring(0, 3).toUpperCase(), time2.substring(0, 3).toUpperCase()],
      nomeTimes: [time1, time2],
      canais: canais,
      escudos: escudos.slice(0, 2),
      date: parseDataHoraBR(diaFormatado, hora),
    };
  } catch (err) {
    console.warn('Erro ao extrair jogo do gamecard:', err);
    return null;
  }
}
