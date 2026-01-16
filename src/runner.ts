// src/runner.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import * as os from 'os';
import { AhkError } from './ahkError';

export interface TestResult {
    passed: boolean;
    message: string;
    duration?: number;
    error?: AhkError;
    output?: string;
}

export class TestRunner {
    private templateContent: string;
    private ahkPath: string;

    constructor(private context: vscode.ExtensionContext) {
        // Load template once at construction
        const templatePath = vscode.Uri.joinPath(
            context.extensionUri,
            'templates',
            'test-runner.ahk'
        );
        this.templateContent = fs.readFileSync(templatePath.fsPath, 'utf8');

        // Get AHK path from settings
        const config = vscode.workspace.getConfiguration('ahkTestRunner');
        this.ahkPath = config.get<string>('executablePath') || 'C:\\Program Files\\AutoHotkey\\v2\\AutoHotkey64.exe';
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
                const output = (stdout + stderr).trim();

                if (code === 0 && output.includes('PASS')) {
                    resolve({ 
                        passed: true, 
                        message: '', 
                        duration: duration,
                        output: output.replace('PASS', '').trim()
                    });
                } else {
                    try {
                        // Extract error JSON from between delimiters
                        const errRegex = /<<<AHK_ERROR_START>>>(.*?)<<<AHK_ERROR_END>>>/s;

                        const errorMatch = output.match(errRegex);
                        const testOutput = output.replace(errRegex, '');
                        if (errorMatch && errorMatch[1]) {
                            const errorJson = errorMatch[1].trim();
                            const error = new AhkError(errorJson);
                            resolve({
                                passed: false,
                                message: error.message,
                                duration,
                                error,
                                output: testOutput
                            });
                        } else {
                            // Fallback: treat output as error message
                            resolve({
                                passed: false,
                                message: output || `Exit code: ${code}`,
                                duration,
                                output: output
                            });
                        }
                    } catch {
                        resolve({
                            passed: false,
                            message: output || `Exit code: ${code}`,
                            duration
                        });
                    }
                }
            });

            proc.on('error', (err) => {
                resolve({
                    passed: false,
                    message: `Failed to start AHK: ${err.message}`
                });
            });
        });
    }
}