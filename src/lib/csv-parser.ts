
export const parseCSV = (text: string): Record<string, string>[] => {
  const lines = text.split(/[\r\n]+/).filter(line => line.trim() !== '');
  if (lines.length < 2) return [];

  // Function to parse a CSV row, handling quoted fields
  const parseRow = (row: string): string[] => {
    const values: string[] = [];
    let current = '';
    let inQuote = false;
    for (let i = 0; i < row.length; i++) {
      const char = row[i];
      if (char === '"') {
        inQuote = !inQuote;
      } else if (char === ',' && !inQuote) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const headers = parseRow(lines[0]).map(h => h.trim().replace(/^"|"$/g, ''));
  
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const entry: Record<string, string> = {};
    headers.forEach((header, index) => {
      entry[header] = values[index] ? values[index].replace(/^"|"$/g, '').trim() : '';
    });
    return entry;
  });
};
