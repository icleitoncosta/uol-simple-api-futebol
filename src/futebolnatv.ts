import * as cheerio from "cheerio";
import { Match } from "./types/api";
import { parseDataHoraBR } from ".";
import * as fs from "fs";
import * as path from "path";

interface LivewireData {
  token: string;
  snapshot: string;
  lazyLoadParam: string;
  path: string;
}

function getCookies(): string {
  try {
    // Tentar diferentes caminhos possíveis
    const possiblePaths = [
      path.join(__dirname, 'cookies.txt'),
      path.join(process.cwd(), 'src', 'cookies.txt'),
      path.join(process.cwd(), 'cookies.txt'),
      'src/cookies.txt',
      'cookies.txt'
    ];
    
    for (const cookiesPath of possiblePaths) {
      if (fs.existsSync(cookiesPath)) {
        const cookies = fs.readFileSync(cookiesPath, 'utf-8').trim();
        if (cookies) {
          return cookies;
        }
      }
    }
  } catch (err) {
    console.warn('Erro ao ler cookies.txt:', err);
  }
  return '';
}

function extractCookiesFromResponse(response: Response): string {
  try {
    const setCookieHeader = response.headers.get('set-cookie');
    if (!setCookieHeader) return '';
    
    const cookies: string[] = [];
    
    // Se for array, processar cada um
    if (Array.isArray(setCookieHeader)) {
      setCookieHeader.forEach(cookie => {
        const cookiePart = cookie.split(';')[0].trim();
        if (cookiePart) {
          cookies.push(cookiePart);
        }
      });
    } else {
      // Se for string única, pode ter múltiplos cookies separados por vírgula
      const cookieStrings = setCookieHeader.split(',').map(c => c.trim());
      cookieStrings.forEach(cookie => {
        const cookiePart = cookie.split(';')[0].trim();
        if (cookiePart) {
          cookies.push(cookiePart);
        }
      });
    }
    
    return cookies.join('; ');
  } catch (err) {
    console.warn('Erro ao extrair cookies da resposta:', err);
    return '';
  }
}

function mergeCookies(existingCookies: string, newCookies: string): string {
  if (!newCookies) return existingCookies;
  if (!existingCookies) return newCookies;
  
  // Criar um mapa para armazenar cookies únicos (por nome)
  const cookieMap = new Map<string, string>();
  
  // Primeiro, adicionar cookies existentes
  existingCookies.split('; ').forEach(cookie => {
    const [name, ...valueParts] = cookie.split('=');
    if (name && valueParts.length > 0) {
      cookieMap.set(name.trim(), valueParts.join('='));
    }
  });
  
  // Depois, sobrescrever com cookies novos (prioridade)
  newCookies.split('; ').forEach(cookie => {
    const [name, ...valueParts] = cookie.split('=');
    if (name && valueParts.length > 0) {
      cookieMap.set(name.trim(), valueParts.join('='));
    }
  });
  
  // Converter mapa de volta para string
  return Array.from(cookieMap.entries())
    .map(([name, value]) => `${name}=${value}`)
    .join('; ');
}

function getUrlByDate(diaFormatado: string): string {
  const hoje = new Date();
  const dia = String(hoje.getDate()).padStart(2, '0');
  const mes = String(hoje.getMonth() + 1).padStart(2, '0');
  const ano = hoje.getFullYear();
  const hojeFormatado = `${dia}-${mes}-${ano}`;
  
  // Calcular amanhã
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);
  const diaAmanha = String(amanha.getDate()).padStart(2, '0');
  const mesAmanha = String(amanha.getMonth() + 1).padStart(2, '0');
  const anoAmanha = amanha.getFullYear();
  const amanhaFormatado = `${diaAmanha}-${mesAmanha}-${anoAmanha}`;
  
  // Calcular ontem
  const ontem = new Date(hoje);
  ontem.setDate(hoje.getDate() - 1);
  const diaOntem = String(ontem.getDate()).padStart(2, '0');
  const mesOntem = String(ontem.getMonth() + 1).padStart(2, '0');
  const anoOntem = ontem.getFullYear();
  const ontemFormatado = `${diaOntem}-${mesOntem}-${anoOntem}`;
  
  if (diaFormatado === hojeFormatado) {
    return `https://www.futebolnatv.com.br/jogos-hoje/`;
  } else if (diaFormatado === amanhaFormatado) {
    return `https://www.futebolnatv.com.br/jogos-amanha/`;
  } else if (diaFormatado === ontemFormatado) {
    return `https://www.futebolnatv.com.br/jogos-ontem/`;
  } else {
    // Se não for hoje, amanhã ou ontem, usar jogos-hoje como padrão
    return `https://www.futebolnatv.com.br/jogos-hoje/`;
  }
}

function getPathFromUrl(url: string): string {
  if (url.includes('jogos-hoje')) return 'jogos-hoje';
  if (url.includes('jogos-amanha')) return 'jogos-amanha';
  if (url.includes('jogos-ontem')) return 'jogos-ontem';
  return 'jogos-hoje';
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

function extractLivewireData(html: string, path: string): LivewireData | null {
  try {
    const $ = cheerio.load(html);
    
    // Extrair token CSRF - pode estar em vários lugares
    let token = '';
    
    // 1. Tentar extrair do atributo data-csrf do script do Livewire (mais comum)
    const livewireScript = $('script[data-csrf]');
    if (livewireScript.length > 0) {
      token = livewireScript.attr('data-csrf') || '';
    }
    
    // 2. Tentar meta tag
    if (!token) {
      const metaToken = $('meta[name="csrf-token"]').attr('content');
      token = metaToken || '';
    }
    
    // 3. Tentar input hidden
    if (!token) {
      const inputToken = $('input[name="_token"]').attr('value');
      token = inputToken || '';
    }
    
    // 4. Tentar extrair do JavaScript inline ou do window.Livewire
    if (!token) {
      const scriptContent = $('script').text();
      const tokenMatch = scriptContent.match(/['"]_token['"]\s*:\s*['"]([^'"]+)['"]/) ||
                        scriptContent.match(/window\.Livewire\s*=\s*\{[^}]*_token['"]\s*:\s*['"]([^'"]+)['"]/);
      if (tokenMatch) {
        token = tokenMatch[1];
      }
    }
    
    // 5. Tentar buscar no HTML bruto usando regex (fallback)
    if (!token) {
      const dataCsrfMatch = html.match(/data-csrf=["']([^"']+)["']/);
      if (dataCsrfMatch) {
        token = dataCsrfMatch[1];
      }
    }
    
    if (!token) {
      console.warn('Token CSRF não encontrado');
      return null;
    }
    
    // Extrair snapshot do wire:snapshot
    let snapshot = '';
    const wireSnapshotAttr = $('[wire\\:snapshot]').attr('wire:snapshot');
    if (wireSnapshotAttr) {
      snapshot = decodeHtmlEntities(wireSnapshotAttr);
    }
    
    // Se não encontrou no atributo, tentar buscar no HTML bruto
    if (!snapshot) {
      const snapshotMatch = html.match(/wire:snapshot="([^"]+)"/);
      if (snapshotMatch) {
        snapshot = decodeHtmlEntities(snapshotMatch[1]);
      }
    }
    
    if (!snapshot) {
      console.warn('Snapshot não encontrado');
      return null;
    }
    
    // Extrair o parâmetro do __lazyLoad de x-intersect
    let lazyLoadParam = '';
    const xIntersectAttr = $('[x-intersect]').attr('x-intersect');
    if (xIntersectAttr) {
      // Procurar por __lazyLoad('...') ou __lazyLoad("...")
      const lazyLoadMatch = xIntersectAttr.match(/\$wire\.__lazyLoad\(['"]([^'"]+)['"]\)/) ||
                           xIntersectAttr.match(/__lazyLoad\(['"]([^'"]+)['"]\)/);
      if (lazyLoadMatch) {
        lazyLoadParam = decodeHtmlEntities(lazyLoadMatch[1]);
      }
    }
    
    // Se não encontrou no atributo, tentar buscar no HTML bruto
    if (!lazyLoadParam) {
      const lazyLoadMatch = html.match(/x-intersect="[^"]*__lazyLoad\(['"]([^'"]+)['"]\)/);
      if (lazyLoadMatch) {
        lazyLoadParam = decodeHtmlEntities(lazyLoadMatch[1]);
      }
    }
    
    if (!lazyLoadParam) {
      console.warn('Parâmetro lazyLoad não encontrado');
      return null;
    }
    
    return {
      token,
      snapshot,
      lazyLoadParam,
      path
    };
  } catch (err: any) {
    console.error('Erro ao extrair dados do Livewire:', err.message);
    return null;
  }
}

async function fetchLivewireUpdate(livewireData: LivewireData, cookies?: string): Promise<string> {
  try {
    const url = 'https://www.futebolnatv.com.br/livewire/update';
    
    const payload = {
      _token: livewireData.token,
      components: [{
        snapshot: livewireData.snapshot,
        updates: {},
        calls: [{
          path: "",
          method: "__lazyLoad",
          params: [livewireData.lazyLoadParam]
        }]
      }]
    };
    
    // Usar cookies passados como parâmetro, ou tentar ler do arquivo
    const cookiesToUse = cookies || getCookies();
    const headers: Record<string, string> = {
      'accept': '*/*',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      'origin': 'https://www.futebolnatv.com.br',
      'pragma': 'no-cache',
      'referer': `https://www.futebolnatv.com.br/${livewireData.path}/`,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'x-livewire': ''
    };
    
    if (cookiesToUse) {
      headers['cookie'] = cookiesToUse;
    }
    
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    // A resposta do Livewire pode ter diferentes estruturas
    // Tentar extrair HTML de várias formas possíveis
    
    // 1. Efeitos no primeiro componente (estrutura mais comum)
    if (data.components && Array.isArray(data.components) && data.components.length > 0) {
      const firstComponent = data.components[0];
      
      // Prioridade 1: effects.html (estrutura mostrada no exemplo)
      if (firstComponent.effects && firstComponent.effects.html) {
        // O HTML pode estar como string ou já processado
        const html = firstComponent.effects.html;
        return typeof html === 'string' ? html : String(html);
      }
      
      // Prioridade 2: HTML direto no componente
      if (firstComponent.html) {
        return typeof firstComponent.html === 'string' 
          ? firstComponent.html 
          : String(firstComponent.html);
      }
      
      // Prioridade 3: HTML em snapshot do componente
      if (firstComponent.snapshot) {
        try {
          const snapshotData = typeof firstComponent.snapshot === 'string' 
            ? JSON.parse(firstComponent.snapshot) 
            : firstComponent.snapshot;
          
          if (snapshotData && snapshotData.html) {
            return typeof snapshotData.html === 'string' 
              ? snapshotData.html 
              : String(snapshotData.html);
          }
        } catch (e) {
          // Ignorar erro de parsing
        }
      }
    }
    
    // 2. Efeitos diretos na raiz (menos comum)
    if (data.effects && data.effects.html) {
      return typeof data.effects.html === 'string' 
        ? data.effects.html 
        : String(data.effects.html);
    }
    
    // 3. Tentar buscar HTML em qualquer lugar da resposta (fallback)
    // Usar uma busca mais robusta que lida com strings JSON escapadas
    const jsonString = JSON.stringify(data);
    
    // Tentar encontrar "html": seguido de uma string (pode ter quebras de linha)
    const htmlMatch = jsonString.match(/"html"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
    if (htmlMatch && htmlMatch[1]) {
      // Decodificar escapes JSON
      let html = htmlMatch[1]
        .replace(/\\n/g, '\n')
        .replace(/\\r/g, '\r')
        .replace(/\\t/g, '\t')
        .replace(/\\"/g, '"')
        .replace(/\\\\/g, '\\');
      
      // Decodificar entidades HTML
      html = decodeHtmlEntities(html);
      return html;
    }
    
    // Se ainda não tiver, retornar string vazia
    console.warn('HTML não encontrado na resposta do Livewire. Estrutura:', JSON.stringify(data).substring(0, 500));
    return '';
  } catch (err: any) {
    console.error('Erro ao fazer chamada Livewire:', err.message);
    throw err;
  }
}

export async function getFutebolNaTVData(diaFormatado: any): Promise<Match[]> {
  const url = getUrlByDate(diaFormatado);
  const path = getPathFromUrl(url);
  
  try {
    // 1. Fazer fetch na página inicial
    let cookies = getCookies(); // Começar com cookies do arquivo (fallback)
    const headers: Record<string, string> = {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7'
    };
    
    if (cookies) {
      headers['cookie'] = cookies;
    }
    
    const response = await fetch(url, {
      headers
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    // Capturar cookies da resposta e mesclar com os existentes
    const responseCookies = extractCookiesFromResponse(response);
    if (responseCookies) {
      cookies = mergeCookies(cookies, responseCookies);
    }
    
    const html = await response.text();
    
    if (!html) {
      console.warn('Não foi possível obter HTML, retornando array vazio');
      return [];
    }
    
    // 2. Extrair dados do Livewire do HTML
    const livewireData = extractLivewireData(html, path);
    
    if (!livewireData) {
      console.warn('Não foi possível extrair dados do Livewire');
      return [];
    }
    
    // 3. Fazer chamada para /livewire/update (usando cookies atualizados)
    const livewireHtml = await fetchLivewireUpdate(livewireData, cookies);
    
    if (!livewireHtml) {
      console.warn('Não foi possível obter HTML do Livewire');
      return [];
    }
    
    // 4. Parsear o HTML retornado e extrair jogos
    const $ = cheerio.load(livewireHtml);
    const games = parseGamesFromHTML($, $, diaFormatado);
    
    return games;
    
  } catch (err: any) {
    console.error('Erro ao buscar jogos do Futebol na TV:', err.message);
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
    // Cada jogo tem 2 divs com classe "p-3 win", cada uma com um span contendo o nome do time
    const timesDivs = $gamecard.find('.p-3.win');
    const times: string[] = [];
    
    timesDivs.each((i, el) => {
      // Pegar o primeiro span dentro de cada div (pode ter outros elementos, mas o nome do time está no primeiro span)
      const $span = $(el).find('span').first();
      const timeTexto = $span.text().trim();
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
    const time2 = times[1];
    
    // Extrair canais - estão em divs com classe "bcmact" dentro de spans com ícone de TV
    // Formato: <div class="col bcmact ag bord-n"><span class="svg-icon..."><i class="fas fa-tv"></i> CANAL GOAT</span></div>
    const canais: string[] = [];
    $gamecard.find('.bcmact').each((i, el) => {
      const $canalEl = $(el);
      
      // Pegar todo o texto do elemento (inclui o texto após o ícone)
      let canalTexto = $canalEl.text().trim();
      
      // Se não encontrou, tentar pegar do span
      if (!canalTexto) {
        const $span = $canalEl.find('span');
        canalTexto = $span.text().trim();
      }
      
      // Remover espaços extras e quebras de linha
      const canalNormalizado = canalTexto
        .replace(/\s+/g, ' ')
        .trim();
      
      // Remover tags HTML se houver
      const canalFinal = canalNormalizado.replace(/<[^>]*>/g, '').trim();
      
      if (canalFinal && canalFinal.length > 0 && !canais.includes(canalFinal)) {
        canais.push(canalFinal);
      }
    });
    
    // Se não encontrou canais, pular este jogo (seguindo o padrão do UOL)
    if (canais.length === 0) {
      return null;
    }
    
    // Extrair escudos (se disponível) - estão nas imagens de ligas/países
    // As imagens podem usar lazy loading com data-src
    const escudos: string[] = [];
    $gamecard.find('img').each((i, img) => {
      // Verificar primeiro data-src (lazy loading), depois src
      let src = $(img).attr('data-src') || $(img).attr('src');
      
      if (src && (src.includes('ligas') || src.includes('countries') || src.includes('team') || src.includes('upload'))) {
        // Ignorar imagens de placeholder/loading
        if (src.includes('load.png') || src.includes('placeholder')) {
          return;
        }
        
        const fullUrl = src.startsWith('http') ? src : `https://www.futebolnatv.com.br${src.startsWith('/') ? '' : '/'}${src}`;
        if (!escudos.includes(fullUrl)) {
          escudos.push(fullUrl);
        }
      }
    });
    
    // Se não encontrou escudos, usar placeholders vazios
    while (escudos.length < 2) {
      escudos.push('');
    }
    
    // Estádio não está disponível na estrutura mostrada
    const estadio = 'Não informado';
    
    return {
      campeonato: campeonato,
      logoCampeonato: null,
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
