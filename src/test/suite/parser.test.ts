// src/test/suite/parser.test.ts

import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import { parseTestFile, TestClass } from '../../parser';

suite('Parser Test Suite', () => {
    
    let fixturesPath: string;
    
    suiteSetup(() => {
        // Path to fixtures folder
        fixturesPath = path.resolve(__dirname, '..', '..', '..', 'src', 'test', 'fixtures');
    });

    test('parses simple nested class structure', () => {
        const content = fs.readFileSync(
            path.join(fixturesPath, 'parser-smoke.test.ahk'),
            'utf8'
        );
        
        const classes = parseTestFile(content);
        
        // Should find two top-level classes
        assert.strictEqual(classes.length, 2, 'Expected 2 top-level classes');
        
        // Check first top-level class
        const broadCategory = classes.find(c => c.name === 'BroadCategory');
        assert.ok(broadCategory, 'BroadCategory should exist');
        assert.strictEqual(broadCategory.children.length, 2, 'BroadCategory should have 2 nested classes');
        assert.strictEqual(broadCategory.methods.length, 0, 'BroadCategory should have no direct methods');
        
        // Check nested classes
        const subcategory1 = broadCategory.children.find(c => c.name === 'Subcategory1');
        assert.ok(subcategory1, 'Subcategory1 should exist');
        assert.strictEqual(subcategory1.methods.length, 2, 'Subcategory1 should have 2 test methods');
        
        const methodNames = subcategory1.methods.map(m => m.name);
        assert.ok(methodNames.includes('Test1_Condition_ExpectedBehavior'));
        assert.ok(methodNames.includes('Test2_AnotherCondition_ExpectedResult'));
        
        const subcategory2 = broadCategory.children.find(c => c.name === 'Subcategory2');
        assert.ok(subcategory2, 'Subcategory2 should exist');
        assert.strictEqual(subcategory2.methods.length, 1, 'Subcategory 2 should have 1 test method');

        const doublyNestedTestClass = subcategory2.children.find(c => c.name === 'DoublyNestedSubcategory');
        assert.ok(doublyNestedTestClass, 'DoublyNestedSubcategory should exist');
        assert.strictEqual(doublyNestedTestClass.methods.length, 1, 'DoublyNestedSubcategory should have 1 test method');
    });

    test('ignores classes and methods preceded by ";@ahkunit-ignore"', () => {
        const content = fs.readFileSync(
            path.join(fixturesPath, 'parser-ignore.test.ahk'),
            'utf8'
        );
        
        const classes = parseTestFile(content);

        assert.strictEqual(classes.length, 2, 'Expected 2 top-level classes');
        assert.ok(!classes.find(c => c.name === "IgnoredTopLevelClass"), 'IgnoredTopLevelClass should be ignored');

        // Ignored method
        const topLevelWithIgnoredMethod = classes.find(c => c.name === 'TopLevelClassWithIgnoredMethod');
        assert.ok(topLevelWithIgnoredMethod, 'TopLevelClassWithIgnoredMethod should exist');
        assert.strictEqual(topLevelWithIgnoredMethod.methods.length, 2, 'TopLevelClassWithIgnoredMethod should have 2 test methods');
        assert.ok(topLevelWithIgnoredMethod.methods.find(c => c.name === 'NormalMethod'), 'TopLevelClassWithIgnoredMethod should have method NormalMethod');
        assert.ok(topLevelWithIgnoredMethod.methods.find(c => c.name === 'AnotherNormalMethod'), 'TopLevelClassWithIgnoredMethod should have method AnotherNormalMethod');

        // Nested ignored class
        const topWithNestedIgnoredClass = classes.find(c => c.name === 'TopLevelClassWithNestedIgnoredClass');
        assert.ok(topWithNestedIgnoredClass, 'TopLevelClassWithNestedIgnoredClass should exist');
        assert.strictEqual(topWithNestedIgnoredClass.methods.length, 1, 'TopLevelClassWithNestedIgnoredClass should have 1 method');
        assert.strictEqual(topWithNestedIgnoredClass.children.length, 1, 'TopLevelClassWithNestedIgnoredClass should have 1 nested class');

        const notIgnoredClass = topWithNestedIgnoredClass.children.find(c => c.name === 'NotIgnoredClass');
        assert.ok(notIgnoredClass, 'TopLevelClassWithNestedIgnoredClass.NotIgnoredClass should exist');
        assert.strictEqual(notIgnoredClass.methods.length, 1, 'TopLevelClassWithNestedIgnoredClass.NotIgnoredClass should have 1 method');
    });

    test('parses top-level class with direct methods', () => {
        const content = fs.readFileSync(
            path.join(fixturesPath, 'parser-smoke.test.ahk'),
            'utf8'
        );
        
        const classes = parseTestFile(content);
        
        const anotherTopLevel = classes.find(c => c.name === 'AnotherTopLevel');
        assert.ok(anotherTopLevel, 'AnotherTopLevel should exist');
        assert.strictEqual(anotherTopLevel.methods.length, 1);
        assert.strictEqual(anotherTopLevel.methods[0].name, 'TestAtTopLevel');
    });

    test('records correct line numbers', () => {
        const content = fs.readFileSync(
            path.join(fixturesPath, 'parser-smoke.test.ahk'),
            'utf8'
        );
        
        const classes = parseTestFile(content);
        const broadCategory = classes.find(c => c.name === 'BroadCategory')!;
        
        // Line numbers should be 0-indexed
        assert.ok(broadCategory.line !== undefined, 'Should have line number');
        assert.ok(broadCategory.line >= 0, 'Line number should be non-negative');
        
        // First nested class should be after the parent
        const subcategory1 = broadCategory.children.find(c => c.name === 'Subcategory1')!;
        assert.ok(subcategory1.line! > broadCategory.line!, 
            'Nested class should be on a later line');
    });

    test('handles empty file', () => {
        const classes = parseTestFile('');
        assert.strictEqual(classes.length, 0);
    });

    test('handles file with no classes', () => {
        const content = `
            ; Just a comment
            MsgBox("Hello")
        `;
        const classes = parseTestFile(content);
        assert.strictEqual(classes.length, 0);
    });

    test('skips empty classes', () => {
        const content = `
            class NotATestClass {
                ; No body
            }
        `;
        const classes = parseTestFile(content);
        assert.strictEqual(classes.length, 0);
    });

    test('skips classes with only private methods', () => {
        const content = `
            class NotATestClass {
                _Private() {
                    ; Body
                }
            }
        `;
        const classes = parseTestFile(content);
        assert.strictEqual(classes.length, 0);
    });

    test('builds correct fully-qualified test paths', () => {
        const content = fs.readFileSync(
            path.join(fixturesPath, 'parser-smoke.test.ahk'),
            'utf8'
        );
        
        const classes = parseTestFile(content);
        
        // Helper to build FQN paths
        function collectPaths(classes: TestClass[], prefix = ''): string[] {
            const paths: string[] = [];
            for (const cls of classes) {
                const clsPath = prefix ? `${prefix}.${cls.name}` : cls.name;
                for (const method of cls.methods) {
                    paths.push(`${clsPath}.${method.name}`);
                }
                paths.push(...collectPaths(cls.children, clsPath));
            }
            return paths;
        }
        
        const paths = collectPaths(classes);
        
        assert.ok(paths.includes('BroadCategory.Subcategory1.Test1_Condition_ExpectedBehavior'));
        assert.ok(paths.includes('BroadCategory.Subcategory1.Test2_AnotherCondition_ExpectedResult'));
        assert.ok(paths.includes('BroadCategory.Subcategory2.Test3_Condition_ExpectedBehavior'));
        assert.ok(paths.includes('AnotherTopLevel.TestAtTopLevel'));
    });
});