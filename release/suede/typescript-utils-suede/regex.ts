export const hasNonWhiteSpace = (str: string) => /\S/.test(str);

export const word = (word: string, global = true) =>
  new RegExp(`\\b${word}\\b`, global ? "g" : "");
