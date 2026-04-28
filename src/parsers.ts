export interface ParsedNotice {
  min: number | null;
  max: number | null;
  fullText: string;
}

const WRITTEN_NUMBERS: Record<string, number> = {
  eins: 1,
  one: 1,
  zwei: 2,
  two: 2,
  drei: 3,
  three: 3,
  vier: 4,
  four: 4,
  fünf: 5,
  five: 5,
  sechs: 6,
  six: 6,
  sieben: 7,
  seven: 7,
  acht: 8,
  eight: 8,
  neun: 9,
  nine: 9,
  zehn: 10,
  ten: 10,
};

function parseNumber(str: string): number | null {
  const trimmed = str.toLowerCase().trim();
  if (/^\d+$/.test(trimmed)) {
    return parseInt(trimmed, 10);
  }
  return WRITTEN_NUMBERS[trimmed] || null;
}

export function parseDefamationNotice(text: string): ParsedNotice {
  const result: ParsedNotice = {
    min: null,
    max: null,
    fullText: text,
  };

  // Pattern: "51 bis 100 Bewertungen" or "Sechs bis zehn Bewertungen" or "Zwei bis fünf Bewertungen"
  // Use [^\s]+ to match any non-whitespace (includes umlauts)
  const rangeMatch = text.match(/([^\s]+)\s+bis\s+([^\s]+)\s+Bewertung/i);
  if (rangeMatch) {
    const minNum = parseNumber(rangeMatch[1]);
    const maxNum = parseNumber(rangeMatch[2]);
    if (minNum !== null && maxNum !== null) {
      result.min = minNum;
      result.max = maxNum;
    }
  }

  // Pattern: "mehr als 100 Bewertungen" or "mehr als zehn Bewertungen"
  const moreMatch = text.match(/mehr\s+als\s+([^\s]+)\s+Bewertung/i);
  if (moreMatch && !result.min) {
    const num = parseNumber(moreMatch[1]);
    if (num !== null) {
      result.min = num + 1;
      result.max = null;
    }
  }

  // Pattern: "weniger als 50" or "weniger als zehn"
  const lessMatch = text.match(/weniger\s+als\s+([^\s]+)\s+Bewertung/i);
  if (lessMatch && !result.max) {
    const num = parseNumber(lessMatch[1]);
    if (num !== null) {
      result.max = num - 1;
    }
  }

  // Pattern: "Eine Bewertung aufgrund einer Beschwerde..."
  const singleMatch = text.match(/eine\s+bewertung\s+aufgrund/i);
  if (singleMatch && !result.min) {
    result.min = 1;
    result.max = 1;
  }

  // Pattern: "X Bewertungen aufgrund von Beschwerden..." (leading number/word)
  const leadingMatch = text.match(/^([^\s]+)\s+Bewertung/i);
  if (leadingMatch && !result.min) {
    const num = parseNumber(leadingMatch[1]);
    if (num !== null) {
      result.min = num;
      result.max = num;
    }
  }

  return result;
}

export function containsDefamationNotice(text: string): boolean {
  // Look for German defamation removal patterns
  // "X Bewertung(en) aufgrund von Beschwerden wegen Diffamierung entfernt"
  // "Eine Bewertung aufgrund einer Beschwerde wegen Diffamierung entfernt"
  return /bewertung[en]?\s+aufgrund\s+(?:von\s+)?beschwerden\s+wegen\s+diffamierung\s+entfernt/i.test(
    text
  );
}
