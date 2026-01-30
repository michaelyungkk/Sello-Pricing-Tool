
export const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  // Use a fallback if hex is invalid or empty
  if (!hex) return null;
  
  // Expand shorthand form (e.g. "03F") to full form (e.g. "0033FF")
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(fullHex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
};

export const extractFirstHex = (input: string): string | null => {
  if (!input) return null;
  // Match #RRGGBB or #RGB
  const match = input.match(/#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})/);
  return match ? match[0] : null;
};
