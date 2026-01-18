// src/runner.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import { AhkError } from './ahkError';
import { parseExecutedLines, TestItemCoverage } from './coverage';

const coverageRegex = /<<<AHK_LINES_START>>>(.*?)<<<AHK_LINES_END>>>/s;
const errRegex = /<<<AHK_ERROR_START>>>(.*?)<<<AHK_ERROR_END>>>/s;
const warningRegex = /^(.+) \((\d+)\) : ==> (.+)$/gm;

export enum TestStatus {
    Passed, Failed, Errored, Skipped
}

export interface TestResult {
    status: TestStatus;
    message: string;
    duration?: number;
    error?: AhkError;
    output?: string;
    coverage?: TestItemCoverage;
}

export class TestRunner {
    private readonly templateContent: string;
    private readonly ahkPath: string;
    private warningStatements: string;
    private failOnWarnings: boolean;

    constructor(private context: vscode.ExtensionContext) {
        // Load template once at construction
        const templatePath = vscode.Uri.joinPath(
            context.extensionUri,
            'templates',
            'test-runner.ahk'
        );
        this.templateContent = fs.readFileSync(templatePath.fsPath, 'utf8');

        // Get AHK path from settings
        const config = vscode.workspace.getConfiguration('ahkunit');
        this.ahkPath = config.get<string>('executablePath') || 'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe';

        const warnings = config.get<string[]>('enabledWarnings') || [];
        this.warningStatements = warnings
            .map(text => `#Warn ${text}, StdOut`)
            .join('\r\n') + '\r\n';
        this.failOnWarnings = config.get<boolean>('failOnWarnings') || false;
    }

    /**
     * Updates any updateable config from vscode settings - call before starting a test suite
     */
    public UpdateConfig() {
        const config = vscode.workspace.getConfiguration('ahkunit');

        const warnings = config.get<string[]>('enabledWarnings') || [];
        this.warningStatements = warnings
            .map(text => `#Warn ${text}, StdOut`)
            .join('\r\n') + '\r\n';
        this.failOnWarnings = config.get<boolean>('failOnWarnings') || false;
    }

    async runTest(test: vscode.TestItem, token: vscode.CancellationToken): Promise<TestResult> {
        // Parse test ID: "file://path::ClassName::NestedClass::MethodName"
        const parts = test.id.split('::');
        const methodName = parts.pop()!;
        const classChain = parts.slice(1);
        const callChain = classChain.join('.') + '().' + methodName + '()';

        const fileUri = test.uri!;
        const filePath = fileUri.fsPath;

        // Build the script from template
        const script = this.templateContent
            .replace(
                ';@ahkunit-warn',
                this.warningStatements
            )
            .replace(
                ';@ahkunit-include',
                `#Include "${filePath.replace(/\\/g, '/')}"`
            )
            .replace(
                ';@ahkunit-call',
                callChain
            );

        // Write to temp file
        const tempFile = path.join(
            os.tmpdir(),
            `ahkunit-${classChain.join('.')}.${methodName}.temp.ahk`
        );
        fs.writeFileSync(tempFile, script, 'utf8');

        return this.executeTest(tempFile, filePath, token);
    }

    private executeTest(tempFile: string, workingDir: string, token: vscode.CancellationToken): Promise<TestResult> {
        return new Promise((resolve) => {
            const startTime = Date.now();

            const proc = cp.spawn(
                this.ahkPath,
                ['/ErrorStdOut=UTF-8', tempFile, path.dirname(workingDir)],
                { cwd: path.dirname(workingDir) }
            );

            let stdout = '';
            let stderr = '';

            proc.stdout.on('data', (data) => { stdout += data.toString(); });
            proc.stderr.on('data', (data) => { stderr += data.toString(); });

            token.onCancellationRequested(() => proc.kill());

            proc.on('close', (code) => {
                // Clean up temp file
                try { fs.unlinkSync(tempFile); } catch {}

                const duration = Date.now() - startTime;
                let output = this.normalizeToCRLF((stdout + stderr).trim());

                // Extract coverage information from between delimiters
                const coverageMatch = output.match(coverageRegex);
                output = output.replace(coverageRegex, '');

                if (code === 0 && output.includes('PASS') && !(this.failOnWarnings && output.match(warningRegex))) {
                    resolve({ 
                        status: TestStatus.Passed, 
                        message: '', 
                        duration: duration,
                        output: output.replace('PASS', '').trim(),
                        coverage: parseExecutedLines(coverageMatch ? coverageMatch[1].trim() : "")
                    });
                } 
                else {
                    try {
                        // Extract error JSON from between delimiters
                        const errorMatch = output.match(errRegex);
                        if (errorMatch && errorMatch[1]) {
                            const errorJson = errorMatch[1].trim();
                            const error = new AhkError(errorJson);
                            resolve({
                                status: TestStatus.Failed,
                                message: error.message,
                                duration,
                                error,
                                output: output.replace(errRegex, '').replace(coverageRegex, '')
                            });
                        } 
                        else {
                            // Fallback: treat output as error message
                            output = output.trim();
                            resolve({
                                status: TestStatus.Failed,
                                message: output || `Exit code: ${code}`,
                                duration,
                                output: output
                            });
                        }
                    } 
                    catch {
                        resolve({
                            status: TestStatus.Errored,
                            message: output.trim() || `Exit code: ${code}`,
                            duration
                        });
                    }
                }
            });

            proc.on('error', (err) => {
                resolve({
                    status: TestStatus.Errored,
                    message: `Failed to start AHK: ${err.message}`
                });
            });
        });
    }

    private normalizeToCRLF(str: string): string {
        return str
            .replace(/\r\n|\r/g, '\n')  // Normalize to LF
            .replace(/\n/g, '\r\n');    // Normalize back to CRLF
    }
}