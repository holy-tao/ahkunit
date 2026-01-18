// src/testController.ts
import * as vscode from 'vscode';
import * as path from 'path';
import { parseTestFile, TestClass } from './parser.js';
import { TestResult, TestRunner, TestStatus } from './runner.js';
import { TestItemCoverage } from './coverage.js';

export class AhkTestController implements vscode.Disposable {
    private controller: vscode.TestController;
    private runner: TestRunner;
    private disposables: vscode.Disposable[] = [];

    private coverageDetails = new WeakMap<vscode.FileCoverage, vscode.StatementCoverage[]>();
    private perTestCoverage = new Map<vscode.TestItem, TestItemCoverage>();

    //* NOTE: glob patterns are case insensitive in the Nov 26 release, I think this is changing though
    //* https://github.com/microsoft/vscode/issues/10633?timeline_page=1
    private testFileGlob: string;

    //#region Initialization

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

        // Coverage profile
        const coverageProfile = this.controller.createRunProfile(
            'Run with Coverage',
            vscode.TestRunProfileKind.Coverage,
            (request, token) => this.runHandler(request, token),
            false
        );
        coverageProfile.loadDetailedCoverage = this.loadDetailedCoverage.bind(this);

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

    //#endregion

    //#region Test Discovery

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

    //#endregion
    
    //#region Test Running

    private async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken) {
        const withCoverage = request.profile?.kind === vscode.TestRunProfileKind.Coverage;
        this.runner.UpdateConfig();

        const run = this.controller.createTestRun(request);
        const testsToRun = this.collectTests(request);

        // Clear previous coverage data
        if (withCoverage) {
            this.perTestCoverage.clear();
            this.coverageDetails = new WeakMap();
        }

        run.appendOutput(`🧪 Collected ${testsToRun.length} tests to run\r\n`);

        let numPassed: number = 0, numFailed: number = 0, numErrored: number = 0;

        await Promise.all(testsToRun.map(async test => {
            const testName = test.id.split('::').slice(1).join('.');
            run.started(test);
            const result = await this.runSingleTest(test, token, withCoverage);

            switch(result.status) {
                case TestStatus.Passed:
                    run.passed(test, result.duration);
                    run.appendOutput(`✅ PASS: ${testName}\r\n`, undefined, test);
                    numPassed++;

                    if (withCoverage && result.coverage) {
                        this.perTestCoverage.set(test, result.coverage);
                    }
                    break;
                case TestStatus.Failed:
                    const failureMessage: vscode.TestMessage = {
                        message: result.message, 
                        location: result.error?.location, 
                        stackTrace: result.error?.stack 
                    };
                    run.appendOutput(`❌ FAIL: ${testName}\r\n`, undefined, test);
                    run.failed(test, failureMessage, result.duration); 
                    numFailed++;
                    break;
                case TestStatus.Skipped:
                    run.appendOutput(`➖ SKIPPED: ${testName}\r\n`, undefined, test);
                    run.skipped(test);
                    break;
                case TestStatus.Errored:
                    const errorMessage: vscode.TestMessage = {
                        message: result.message, 
                        location: result.error?.location, 
                        stackTrace: result.error?.stack 
                    };
                    run.appendOutput(`🚨 ERROR: ${testName}\r\n`, undefined, test);
                    run.failed(test, errorMessage, result.duration); 
                    numErrored++;
                    break;
            }
            
            if(result.output){
                run.appendOutput(`${result.output}\r\n`, undefined, test);
            }
        }));

        const numTotal = numPassed + numFailed + numErrored;
        run.appendOutput(`🧪 Run complete! Ran ${numTotal} tests\r\n`);
        if(numPassed > 0) { run.appendOutput(`    ✅ ${numPassed} passed\r\n`); }
        if(numFailed > 0) { run.appendOutput(`    ❌ ${numFailed} failed\r\n`); }
        if(numErrored > 0) { run.appendOutput(`    🚨 ${numErrored} errored\r\n`); }
        if(numTotal !== testsToRun.length) { run.appendOutput(`    ➖ ${testsToRun.length - numTotal} skipped\r\n`); }

        // After all tests, build and report file coverage
        if (withCoverage) {
            console.log("Reporting test coverage");
            await this.reportCoverage(run);
        }

        run.end();
    }

    private async runSingleTest(test: vscode.TestItem, token: vscode.CancellationToken, withCoverage: boolean) : Promise<TestResult> {
        if(token.isCancellationRequested) {
            return { message: "Skipped", status: TestStatus.Skipped };
        }

        try{
            return await this.runner.runTest(test, token);
        }
        catch (err: any) {
            return {message: err.toString(), status: TestStatus.Errored };
        }
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

    //#endregion

    //#region Test Coverage
    private async reportCoverage(run: vscode.TestRun) {
        // Merge all per-test coverage into per-file
        const mergedByFile = new Map<string, Set<number>>();
        
        for (const [_test, coverage] of this.perTestCoverage) {
            for (const [uriString, lines] of coverage) {
                if (!mergedByFile.has(uriString)) {
                    mergedByFile.set(uriString, new Set());
                }
                for (const line of lines) {
                    mergedByFile.get(uriString)!.add(line);
                }
            }
        }

        // Create FileCoverage for each file
        for (const [uriString, coveredLines] of mergedByFile) {
            const uri = vscode.Uri.parse(uriString);
            if (uri.fsPath.includes('\\Temp\\') || uri.fsPath.includes('/tmp/')) {
                continue;   // Skip temp files
            }

            const totalLines = await this.countExecutableLines(uri);
            
            const fileCoverage = new vscode.FileCoverage(
                uri,
                new vscode.TestCoverageCount(coveredLines.size, totalLines)
            );

            // Build detailed statement coverage
            const details = Array.from(coveredLines)
                .sort((a, b) => a - b)
                .map(line => new vscode.StatementCoverage(
                    true, // executed once (or could track actual count)
                    new vscode.Position(line, 0)
                ));
            
            this.coverageDetails.set(fileCoverage, details);
            run.addCoverage(fileCoverage);
        }
    }

    private async loadDetailedCoverage(_testRun: vscode.TestRun, fileCoverage: vscode.FileCoverage, _token: vscode.CancellationToken): Promise<vscode.StatementCoverage[]> {
        // ts80007 expected, loadDetailedCoverage needs a Promise<StatementCoverage[]> so we give it one
        console.log("loadDetailedCoverage called");
        return await this.coverageDetails.get(fileCoverage) ?? [];
    }

    private async countExecutableLines(uri: vscode.Uri): Promise<number> {
        let text: string;
        try {
            const content = await vscode.workspace.fs.readFile(uri);
            text = Buffer.from(content).toString('utf8');
        } 
        catch(err) {
            console.error(err);
            return 0;
        }
        
        let count = 0;
        let inBlockComment = false;

        for(const line of text.split(/\r?\n/g)) {
            const trimmed = line.trim();

            if(inBlockComment) {
                if(trimmed.endsWith('*/')) {
                    inBlockComment = false;
                }

                continue;
            }

            if(trimmed.startsWith('/*')) {
                inBlockComment = true;
                continue;
            }

            if(trimmed && !trimmed.startsWith(';') && !trimmed.startsWith('#')) {
                count++;
            }
        }

        return count;
    }

    //#endregion

    dispose() {
        this.controller.dispose();
        this.disposables.forEach(d => d.dispose());
    }
}