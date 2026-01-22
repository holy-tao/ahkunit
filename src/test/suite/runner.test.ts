// src/test/suite/runner.test.ts

import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import { TestRunner, TestStatus } from '../../runner';

/**
 * Tests for running unit tests. These require AHKv2 to be installed on your local machine
 * in the default location at C:\Program Files\AutoHotkey\v2
 */

/**
 * Mock TestItem for runner tests
 * Since VS Code doesn't expose TestItem constructor, we create a minimal mock
 */
function createMockTestItem(id: string, label: string, uri: vscode.Uri): vscode.TestItem {
    return {
        id,
        label,
        uri,
        range: new vscode.Range(0, 0, 0, 0),
        children: {
            replace: () => {},
            add: () => {},
            delete: () => {},
            forEach: () => {},
            get: () => undefined,
            size: 0,
            [Symbol.iterator]: function* () {}
        } as any,
        parent: undefined,
        canResolveChildren: false,
        tags: [],
        error: undefined,
        busy: false,
        expand: () => {}
    } as any;
}

suite('Test Runner Integration Suite', () => {
    let runner: TestRunner;
    // Skip tests in GitHub Actions CI environment
    let skipTests = process.env.GITHUB_ACTIONS === 'true' || process.env.CI === 'true';

    suiteSetup(async () => {
        // Create a minimal context object for the TestRunner
        // We need to provide the extension URI path
        const testContext = {
            extensionUri: vscode.Uri.file(
                path.resolve(__dirname, '..', '..', '..')
            )
        } as any;

        // Initialize runner with test context
        runner = new TestRunner(testContext);
    });

    test('test with logging passes successfully', async function() {
        // Skip if AutoHotkey is not available
        if (skipTests) {
            this.skip();
        }

        const fixturesPath = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');
        const loggingTestFile = vscode.Uri.file(
            path.join(fixturesPath, 'logging.test.ahk')
        );

        const testItem = createMockTestItem(
            `file://${loggingTestFile.fsPath}::LoggingTests::TestWithLogging_PrintsOutput_Works`,
            'TestWithLogging_PrintsOutput_Works',
            loggingTestFile
        );

        const token = new vscode.CancellationTokenSource().token;
        const result = await runner.runTest(testItem, token);

        assert.strictEqual(result.status, TestStatus.Passed, `Test should pass but got: ${result.message}`);
        assert.strictEqual(result.message, '', 'Passing test should have empty message');
        assert.ok(result.duration !== undefined, 'Result should have duration');
    });

    test('test with logging and error captures error correctly', async function() {
        // Skip if AutoHotkey is not available
        if (skipTests) {
            this.skip();
        }

        const fixturesPath = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');
        const loggingTestFile = vscode.Uri.file(
            path.join(fixturesPath, 'logging.test.ahk')
        );

        const testItem = createMockTestItem(
            `file://${loggingTestFile.fsPath}::LoggingTests::TestWithLoggingAndError_PrintsOutputThenFails`,
            'TestWithLoggingAndError_PrintsOutputThenFails',
            loggingTestFile
        );

        const token = new vscode.CancellationTokenSource().token;
        const result = await runner.runTest(testItem, token);

        assert.strictEqual(result.status, TestStatus.Failed, 'Test should fail');
        assert.ok(result.message.includes('Intentional test failure'), 
            'Error message should contain the thrown error');
        assert.ok(result.error !== undefined, 'Result should have error object');
        if (result.error) {
            assert.ok(result.error.message.includes('Intentional test failure'),
                `Error object should contain error message: "${result.error.message}"`);
        }
    });

    test('test with multiple log lines before error captures error', async function() {
        // Skip if AutoHotkey is not available
        if (skipTests) {
            this.skip();
        }

        const fixturesPath = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');
        const loggingTestFile = vscode.Uri.file(
            path.join(fixturesPath, 'logging.test.ahk')
        );

        const testItem = createMockTestItem(
            `file://${loggingTestFile.fsPath}::LoggingTests::TestLoggingBeforeThrow_HasDetailedOutput`,
            'TestLoggingBeforeThrow_HasDetailedOutput',
            loggingTestFile
        );

        const token = new vscode.CancellationTokenSource().token;
        const result = await runner.runTest(testItem, token);

        assert.strictEqual(result.status, TestStatus.Failed, 'Test should fail');
        assert.ok(result.message.includes('Test failed after logging'),
            `Error message should contain the test failure message: "${result.message}"`);
        assert.ok(result.error !== undefined, 'Result should have error object');
    });

    test('test with load-time error fails and captures error output', async function() {
        // Skip if AutoHotkey is not available
        if (skipTests) {
            this.skip();
        }

        const testCode = `
        #Include NonExistentFile.ahk
        `;
        const tempTestFile = path.join(os.tmpdir(),'ahkunit-InvalidIncludeTest.temp.ahk');
        fs.writeFileSync(tempTestFile, testCode, 'utf8');

        const testItem = createMockTestItem(
            `file://${tempTestFile}::InvalidIncludeTests::Test_InvalidInclude_Fails`,
            'Test_InvalidInclude_Fails',
            vscode.Uri.file(tempTestFile)
        );
        const token = new vscode.CancellationTokenSource().token;
        const result = await runner.runTest(testItem, token);

        assert.strictEqual(result.status, TestStatus.Failed, 'Test should fail due to load-time error');
        assert.ok(result.message.includes('#Include file "NonExistentFile.ahk" cannot be opened'), 
            `Error message should contain the include error: "${result.message}"`);
    });

    /**
     * Tests a critical error from an invalid memory access. Note that these can't be caught, so you'll need to
     * dismiss the AHK popup manually when it appears or the test will time out
     */
    test('test with fatal error fails', async function() {
        // Skip if AutoHotkey is not available
        if (skipTests) {
            this.skip();
        }

        const testCode = `
        class InvalidMemoryAccessTests {
            Test_InvalidMemoryAccess_FatalError() => NumGet(-1, "ptr")
        }
        `;
        const tempTestFile = path.join(os.tmpdir(),'ahkunit-InvalidMemoryAccessTests.temp.ahk');
        fs.writeFileSync(tempTestFile, testCode, 'utf8');

        const testItem = createMockTestItem(
            `file://${tempTestFile}::InvalidMemoryAccessTests::Test_InvalidMemoryAccess_FatalError`,
            'Test_InvalidMemoryAccess_FatalError',
            vscode.Uri.file(tempTestFile)
        );
        const token = new vscode.CancellationTokenSource().token;
        const result = await runner.runTest(testItem, token);

        assert.strictEqual(result.status, TestStatus.Failed, 'Test should fail due to critical memory error');
    });
});
    