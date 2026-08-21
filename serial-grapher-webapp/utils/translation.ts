export const highlightColors = [
    'rgba(255, 99, 132, 0.4)',
    'rgba(54, 162, 235, 0.4)',
    'rgba(255, 206, 86, 0.4)',
    'rgba(75, 192, 192, 0.4)',
    'rgba(153, 102, 255, 0.4)',
    'rgba(255, 159, 64, 0.4)',
];

export interface Node {
    id: string;
    name: string;
    isTimestamp: boolean;
    buffer: Array<{ timestamp: number; value: string }>;
}

export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Extract all non‑overlapping matches from a line using the given regex pattern.
 */
export function extractMatches(line: string, regexPattern: string): string[] {
    if (!line || !regexPattern) return [];
    try {
        const regex = new RegExp(regexPattern, 'g');
        const matches: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = regex.exec(line)) !== null) {
            matches.push(match[0]);
        }
        return matches;
    } catch {
        return [];
    }
}

/**
 * Build an HTML string that highlights the matches with the given colors.
 * Colors are applied in order, cycling if needed.
 */
export function highlightMatches(
    line: string,
    matches: string[],
    colors: string[] = highlightColors,
): string {
    if (!line || matches.length === 0) return escapeHtml(line);

    // Build a regex that matches any of the match strings, escaping special chars.
    const escaped = matches.map((m) =>
        m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
    );
    const combined = new RegExp(escaped.join('|'), 'g');
    let result = '';
    let lastIndex = 0;
    let match: RegExpExecArray | null;
    let colorIndex = 0;

    while ((match = combined.exec(line)) !== null) {
        const matchText = match[0];
        const index = match.index;
        result += escapeHtml(line.substring(lastIndex, index));
        const color = colors[colorIndex % colors.length];
        result += `<span style="background-color: ${color}; padding: 0 2px; border-radius: 2px;">${escapeHtml(matchText)}</span>`;
        lastIndex = index + matchText.length;
        colorIndex++;
    }
    result += escapeHtml(line.substring(lastIndex));
    return result;
}

/**
 * Update node buffers with data from a new line.
 * Returns a new array of nodes with appended buffer entries.
 */
export function updateNodeBuffers(
    line: string,
    regexPattern: string,
    nodes: Node[],
): Node[] {
    if (!line || !regexPattern || nodes.length === 0) return nodes;

    const matches = extractMatches(line, regexPattern);
    const timestampNode = nodes.find((n) => n.isTimestamp);
    let commonTimestamp: number;

    if (timestampNode) {
        const idx = nodes.indexOf(timestampNode);
        const matchValue = matches[idx];
        if (matchValue !== undefined) {
            const parsed = parseFloat(matchValue);
            commonTimestamp = isNaN(parsed) ? Date.now() : parsed;
        } else {
            commonTimestamp = Date.now();
        }
    } else {
        commonTimestamp = Date.now();
    }

    return nodes.map((node, index) => ({
        ...node,
        buffer: [
            ...node.buffer,
            { timestamp: commonTimestamp, value: matches[index] ?? '' },
        ],
    }));
}
