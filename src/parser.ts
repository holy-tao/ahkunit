
export interface TestMethod {
    name: string;
    line?: number;
}

export interface TestClass {
    name: string;
    line?: number;
    methods: TestMethod[];
    children: TestClass[];
}

export function parseTestFile(content: string): TestClass[] {
    // Normalize line endings (CRLF -> LF, CR -> LF)
    const normalized = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const lines = normalized.split('\n');
    
    const classes = parseTopLevelClasses(lines);
    return filterEmptyClasses(classes);
}

function parseTopLevelClasses(lines: string[]): TestClass[] {
    const classes: TestClass[] = [];
    let i = 0;
    let ignoreNext = false;

    while (i < lines.length) {
        if(isIgnoreComment(lines, i)) {
            ignoreNext = true;
            i++;
            continue;
        }

        const result = tryParseClass(lines, i);
        if (result) {
            if(!ignoreNext) {
                classes.push(result.cls);
            }

            i = result.endLine + 1;
            ignoreNext = false;
        } 
        else {
            i++;
        }
    }

    return classes;
}

function tryParseClass(lines: string[], startLine: number): { cls: TestClass; endLine: number } | null {
    const classPattern = /^(\s*)class\s+(\w+)(?:\s+extends\s+\w+)?\s*(\{)?\s*$/;
    const match = lines[startLine].match(classPattern);

    if (!match) {
        return null;
    }

    const className = match[2];
    const hasBraceOnSameLine = match[3] === '{';

    let braceOpenLine = startLine;
    if (!hasBraceOnSameLine) {
        braceOpenLine = findOpeningBrace(lines, startLine + 1);
        if (braceOpenLine === -1) {
            return null;
        }
    }

    const braceCloseLine = findMatchingBrace(lines, braceOpenLine);

    const cls: TestClass = {
        name: className,
        line: startLine,
        methods: [],
        children: []
    };

    parseClassInterior(lines, braceOpenLine + 1, braceCloseLine, cls);

    return { cls, endLine: braceCloseLine };
}

function parseClassInterior(lines: string[], start: number, end: number, cls: TestClass) {
    // Match: Name() { OR Name() OR Name() => expression
    // The required () distinguishes methods from property getters like `Prop => value`
    // !BUG: assumes that fat arrow functions are always one line
    const methodPattern = /^(\s*)(\w+)\s*\(\s*\)\s*(?:(\{)|(=>).*)?$/;

    let i = start;
    let ignoreNext = false;

    while (i < end) {
        const line = lines[i];
        // Check for ignore comment
        if(isIgnoreComment(lines, i)) {
            ignoreNext = true;
            i++;
            continue;
        }

        // Try nested class first
        const classResult = tryParseClass(lines, i);
        if (classResult) {
            if(!ignoreNext) {
                cls.children.push(classResult.cls);
            }

            ignoreNext = false;
            i = classResult.endLine + 1;
            continue;
        }

        // Try method
        const methodMatch = line.match(methodPattern);
        if (methodMatch) {
            const methodName = methodMatch[2];
            const hasBraceOnSameLine = methodMatch[3] === '{';
            const isFatArrow = methodMatch[4] === '=>';

            const isPrivate = methodName.startsWith('_');

            if (!isPrivate && !ignoreNext) {
                cls.methods.push({ name: methodName, line: i });
            }

            ignoreNext = false;

            // Fat arrow functions are single-line, no body to skip
            if (isFatArrow) {
                i++;
                continue;
            }

            // Skip past traditional method body
            let braceOpenLine = i;
            if (!hasBraceOnSameLine) {
                braceOpenLine = findOpeningBrace(lines, i + 1);
            }

            if (braceOpenLine !== -1) {
                const braceCloseLine = findMatchingBrace(lines, braceOpenLine);
                i = braceCloseLine + 1;
                continue;
            }
        }

        i++;
    }
}

function findOpeningBrace(lines: string[], startLine: number): number {
    for (let i = startLine; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed === '{') {
            return i;
        }
        if (trimmed !== '') {
            return -1;
        }
    }
    return -1;
}

function findMatchingBrace(lines: string[], openBraceLine: number): number {
    let depth = 0;

    for (let i = openBraceLine; i < lines.length; i++) {
        for (const char of lines[i]) {
            if (char === '{') {
                depth++;
            } else if (char === '}') {
                depth--;
                // Only check after closing brace, not after every character
                if (depth === 0) {
                    return i;
                }
            }
        }
    }

    return lines.length - 1;
}

function isIgnoreComment(lines: string[], lineIndex: number): boolean {
    const line = lines[lineIndex].trim();
    return line.includes(";@ahkunit-ignore");
}

function filterEmptyClasses(classes: TestClass[]): TestClass[] {
    return classes
        .map(cls => ({
            ...cls,
            children: filterEmptyClasses(cls.children)
        }))
        .filter(cls => cls.methods.length > 0 || cls.children.length > 0);
}