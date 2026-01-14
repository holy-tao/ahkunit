import { Position, TestMessageStackFrame, Uri, Location } from 'vscode';

export class AhkError {
    message: string;

    location: Location;

    position: Position;

    stack: TestMessageStackFrame[];

    /**
     * Parses a raw AHK error json string in to a vscode-friendly object
     * @param {String} json JSON string of an AHK error 
     */
    constructor(json: string) {
        const raw: RawAhkError = JSON.parse(json);

        this.message = `${raw.type}: ${raw.message}`;
        if(raw.extra) {
            this.message += `\r\n    Specifically: ${raw.extra}`;
        }
        if(raw.stack) {
            this.message += "\r\n\r\n" + raw.stack;
        }

        this.location = new Location(Uri.file(raw.file), new Position(raw.line - 1, 0));
        this.position = new Position(raw.line - 1, 0);
        this.stack = parseAhkStack(raw.stack);
    }
}

interface RawAhkError {
    type: string;
    message: string;
    what?: string;
    extra?: string;
    file: string;
    line: number;
    stack: string;
}

function parseAhkStack(ahkStack: string): TestMessageStackFrame[] {
    const frameRegex = /^(.+)\s\((\d+)\)\s:\s\[(.*)\] (.+)$/;
    const frames: TestMessageStackFrame[] = ahkStack
        .split(/\r?\n/)                     // Handle both \r\n and \n
        .filter(line => line.trim() !== '') // Remove empty lines
        .map(ahkFrame => {
            if (ahkFrame.startsWith('>')) {
                return { label: ahkFrame };
            }

            const match = ahkFrame.match(frameRegex);
            if (!match) {
                // Return a generic frame
                return { label: ahkFrame.substring(2) };
            }

            const [, filePath, lineNum, context, code] = match;

            return {
                uri: Uri.file(filePath),
                position: new Position(parseInt(lineNum, 10) - 1, 0), // 0-index
                label: context || code
            };
        });

    return frames;
}