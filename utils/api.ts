
// URL do Google Apps Script
export const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzUN00s5Tdxxbs1SpOl9MWBnlJYuDDFuUW4cBASlHjdqlMnwlV1vdhPbFIqwx7jkQz_Mg/exec';

interface FetchOptions extends RequestInit {
  timeout?: number;
}

/**
 * Realiza um fetch com sistema de retentativa automática (retry) em caso de falha.
 * Otimizado para "Rede Pobre": Cabeçalhos simplificados para evitar pre-flight OPTIONS excessivos.
 */
export const fetchWithRetry = async (
  url: string, 
  options: FetchOptions = {}, 
  retries = 4, 
  backoff = 800
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(new Error("Request timed out")), options.timeout || 45000);

  const defaultOptions: RequestInit = {
    ...options,
    signal: controller.signal,
    // Modo de "Rede Pobre": Prioriza requisições simples que não disparam pre-flight CORS complexo
    mode: 'cors',
    credentials: 'omit',
  };

  try {
    const response = await fetch(url, defaultOptions);
    clearTimeout(timeoutId);
    
    if (!response.ok && (response.status === 429 || response.status >= 500)) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    return response;
  } catch (error: any) {
    clearTimeout(timeoutId);
    // Retry on network errors AND timeouts (AbortError)
    if (retries > 0) {
      console.warn(`Erro de conexão ou timeout (${error.message}). Tentando novamente em ${backoff}ms...`);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return fetchWithRetry(url, options, retries - 1, backoff * 1.5);
    }
    throw error;
  }
};

// Helper to generate UUIDs safely
export const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};
