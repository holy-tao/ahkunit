import { Uri } from 'vscode';

export type TestItemCoverage = Map<string, Set<number>>;

export function parseExecutedLines(lines: string): TestItemCoverage {
    const fileRegex = /^---- (.*)$/;
    const lineRegex = /^(\d+): (.*)$/;

    const coverageMap = new Map<string, Set<number>>();

    let current: string = "";

    for(const line of lines.split(/\r?\n/g).map(l => l.trim())) {
        if(line.startsWith(">")) { continue ; }

        const fileMatch = line.match(fileRegex);
        if(fileMatch) {
            current = Uri.file(fileMatch[1]).toString();
            if(!coverageMap.has(current)) {
                coverageMap.set(current, new Set<number>);
            }

            continue;
        }

        const lineMatch = line.match(lineRegex);
        if(lineMatch && current !== undefined) {
            const lineNum = Number.parseInt(lineMatch[1]) - 1; // AHK is 1-based, we're 0-based
            if(lineNum < 0) {
                continue;   // Static initializer or implicit like __Init that isn't user-written code
            }

            coverageMap.get(current)?.add(lineNum);
        }
    }

    return coverageMap;
}