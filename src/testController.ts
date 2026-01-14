// src/testController.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { parseTestFile, TestClass } from './parser.js';
import { TestRunner } from './runner.js';

export class AhkTestController implements vscode.Disposable {
    private controller: vscode.TestController;
    private runner: TestRunner;
    private disposables: vscode.Disposable[] = [];

    //* NOTE: glob patterns are case insensitive in the Nov 26 release, I think this is changing though
    //* https://github.com/microsoft/vscode/issues/10633?timeline_page=1
    private testFileGlob: string;

    constructor(context: vscode.ExtensionContext) {
        this.controller = vscode.tests.createTestController(
            'ahkTestController',
            'AutoHotkey Tests'
        );

        // Run profile - the play button behavior
        this.controller.createRunProfile(
            'Run Tests',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runHandler(request, token),
            true // isDefault
        );

        this.runner = new TestRunner(context);        

        const config = vscode.workspace.getConfiguration('ahkunit');
        this.testFileGlob = config.get<string>('testFileGlob') || '**/*.test.ahk';
        vscode.workspace.onDidChangeConfiguration(evt => this.reloadSettings());

        // Watch for test files
        this.discoverTests();
        this.watchForChanges();
    }

    private async reloadSettings() {
        const config = vscode.workspace.getConfiguration('ahkunit');
        this.testFileGlob = config.get<string>('testFileGlob') || '**/*.test.ahk';
    }

    private async discoverTests() {
        const files = await vscode.workspace.findFiles(this.testFileGlob);
        await Promise.all(
            files.map(async file => this.parseTestFile(file))
        );
    }

    private async parseTestFile(uri: vscode.Uri) {
        const content = await vscode.workspace.fs.readFile(uri);
        const text = Buffer.from(content).toString('utf8');
        const testClasses = parseTestFile(text);

        // Create a test item for the file
        const fileItem = this.controller.createTestItem(
            uri.toString(),
            path.basename(uri.fsPath),
            uri
        );
        this.controller.items.add(fileItem);

        // Recursively add nested classes
        this.addTestClasses(fileItem, testClasses, uri);
    }

    private addTestClasses(parent: vscode.TestItem, classes: TestClass[], uri: vscode.Uri) {
        for (const cls of classes) {
            const classItem = this.controller.createTestItem(
                `${parent.id}::${cls.name}`,
                cls.name,
                uri
            );
            
            // Set location for "go to test" functionality
            if (cls.line !== undefined) {
                classItem.range = new vscode.Range(cls.line, 0, cls.line, 0);
            }

            parent.children.add(classItem);

            // Add methods as leaf test items
            for (const method of cls.methods) {
                const methodItem = this.controller.createTestItem(
                    `${classItem.id}::${method.name}`,
                    method.name,
                    uri
                );
                if (method.line !== undefined) {
                    methodItem.range = new vscode.Range(method.line, 0, method.line, 0);
                }
                classItem.children.add(methodItem);
            }

            // Recurse into nested classes
            this.addTestClasses(classItem, cls.children, uri);
        }
    }

    private async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
        const run = this.controller.createTestRun(request);
        const testsToRun = this.collectTests(request);

        run.appendOutput(`🧪 Collected ${testsToRun.length} tests to run\r\n`);

        let numPassed: number = 0, numFailed: number = 0, numErrored: number = 0;

        for (const test of testsToRun) {
            const testName = test.id.split('::').slice(1).join('.');
            if (token.isCancellationRequested) {
                run.appendOutput("Cancelling test run\r\n");
                break; 
            }

            run.started(test);
            
            try {
                const result = await this.runner.runTest(test, token);
                
                if (result.passed) {
                    run.passed(test, result.duration);
                    run.appendOutput(`✅ PASS: ${testName}\r\n`, undefined, test);
                    numPassed++;
                } 
                else {
                    const testMessage: vscode.TestMessage = {
                        message: result.message, 
                        location: result.error?.location, 
                        stackTrace: result.error?.stack 
                    };
                    run.appendOutput(`❌ FAIL: ${testName}\r\n`, undefined, test);
                    run.failed(test, testMessage, result.duration); 
                    numFailed++;
                }
                
                if(result.output){
                    run.appendOutput(`${result.output}\r\n`, undefined, test);
                }
            } 
            catch (err) {
                run.appendOutput(`🚨 ERROR: ${testName}\r\n`, undefined, test);
                run.appendOutput(`${err}\r\n`, undefined, test);

                run.errored(test, new vscode.TestMessage(String(err)));
                numErrored++;
            }
        }

        const numTotal = numPassed + numFailed + numErrored;
        run.appendOutput(`🧪 Run complete! Ran ${numTotal} tests\r\n`);
        if(numPassed > 0) { run.appendOutput(`    ✅ ${numPassed} passed\r\n`); }
        if(numFailed > 0) { run.appendOutput(`    ❌ ${numFailed} failed\r\n`); }
        if(numErrored > 0) { run.appendOutput(`    🚨 ${numErrored} errored\r\n`); }
        if(numTotal !== testsToRun.length) { run.appendOutput(`    ➖ ${testsToRun.length - numTotal} skipped\r\n`); }

        run.end();
    }

    private collectTests(request: vscode.TestRunRequest): vscode.TestItem[] {
        const tests: vscode.TestItem[] = [];
        
        if (request.include) {
            // Specific tests requested
            for (const item of request.include) {
                this.collectLeafTests(item, tests);
            }
        } else {
            // Run all tests
            this.controller.items.forEach(item => {
                this.collectLeafTests(item, tests);
            });
        }
        
        return tests;
    }

    private collectLeafTests(item: vscode.TestItem, acc: vscode.TestItem[]) {
        if (item.children.size === 0) {
            acc.push(item); // Leaf node = actual test method
        } else {
            item.children.forEach(child => this.collectLeafTests(child, acc));
        }
    }

    private watchForChanges() {
        const watcher = vscode.workspace.createFileSystemWatcher(this.testFileGlob);
        watcher.onDidChange(uri => this.parseTestFile(uri));
        watcher.onDidCreate(uri => this.parseTestFile(uri));
        watcher.onDidDelete(uri => this.controller.items.delete(uri.toString()));
        
        // https://stackoverflow.com/questions/73780808/is-there-a-match-function-for-vscode-globpattern
        const onDidOpen = vscode.workspace.onDidOpenTextDocument(async doc => {
            if(vscode.languages.match({ pattern: this.testFileGlob}, doc)) {
                this.parseTestFile(doc.uri);
            }
        });

        this.disposables.push(watcher);
        this.disposables.push(onDidOpen);
    }

    dispose() {
        this.controller.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}