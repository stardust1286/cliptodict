const TIMEOUT_MS = 5_000;
const API_BASE = 'https://api.tatoeba.org/v1/sentences';

interface TatoebaTranslation {
  text: string;
  lang: string;
}

interface TatoebaSentence {
  text: string;
  lang: string;
  translations: TatoebaTranslation[][];
}

interface TatoebaResponse {
  data: TatoebaSentence[];
}

/**
 * Fetch up to 3 Japanese–Chinese sentence pairs for a given word from Tatoeba.
 * Returns [] on any failure (network error, timeout, malformed response) — non-critical.
 */
export async function fetchExamples(word: string): Promise<Array<{ jp: string; zh: string }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const url = `${API_BASE}?lang=jpn&q=${encodeURIComponent(word)}&trans:lang=cmn&showtrans=matching&limit=3`;
    const response = await fetch(url, { signal: controller.signal });

    if (!response.ok) return [];

    const json: TatoebaResponse = await response.json();

    if (!Array.isArray(json.data)) return [];

    const results: Array<{ jp: string; zh: string }> = [];

    for (const sentence of json.data) {
      const jp = sentence.text;
      const zhTranslation = sentence.translations.flat().find(t => t.lang === 'cmn');
      if (jp && zhTranslation?.text) {
        results.push({ jp, zh: zhTranslation.text });
      }
    }

    return results;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
