import * as assert from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { parseExecutedLines } from '../../coverage';

suite('Coverage Parsing Test Suite', () => {

    test('parses coverage with single file and statement', () => {
        const lines = `
        ---- C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk
        013: MagickWandSmokeTests().WriteImage_WithFilePath_WritesImage()
        `;

        const parsed = parseExecutedLines(lines);
        const expectedFile = vscode.Uri.file('C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk').toString();

        assert.strictEqual(parsed.size, 1, "Coverage should have exactly 1 file");
        assert.ok(parsed.has(expectedFile), `Coverage should have ${expectedFile}`);

        const actualLines = parsed.get(expectedFile);        
        assert.strictEqual(actualLines?.size, 1, 'Coverage should have exactly 1 line');
        assert.ok(actualLines.has(12), 'Coverage for file should have line 13');
    });

    test('skips implicit lines', () => {
        const lines = `
        ---- c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk
        000: Super.__Init()
        178: this.ThrowForWarnings := false
        000: }
        `;

        const parsed = parseExecutedLines(lines);

        const expectedFile = vscode.Uri.file('c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk').toString();
        
        assert.strictEqual(parsed.size, 1, "Coverage should have exactly 1 file");
        assert.ok(parsed.has(expectedFile), `Coverage should have ${expectedFile}`);

        const actualLines = parsed.get(expectedFile);        
        assert.strictEqual(actualLines?.size, 1, 'Coverage should have exactly 1 line');
        assert.ok(!actualLines.has(0), 'Coverage for file should not have line 0');
        assert.ok(actualLines.has(177), 'Coverage for file should have line 177');
    });

    test('handles multiple files', () => {
        const lines = `
        ---- C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk
        013: MagickWandSmokeTests().WriteImage_WithFilePath_WritesImage()
        ---- c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\tests\\MagickWandSmoke.test.ahk
        041: wand := MagickWand()
        `;

        const parsed = parseExecutedLines(lines);

        const expectedFile1 = vscode.Uri.file('C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk').toString();
        const expectedFile2 = vscode.Uri.file('c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\tests\\MagickWandSmoke.test.ahk').toString();
        
        assert.strictEqual(parsed.size, 2, "Coverage should have exactly 2 files");
        assert.ok(parsed.has(expectedFile1), `Coverage should have ${expectedFile1}`);
        assert.ok(parsed.has(expectedFile2), `Coverage should have ${expectedFile2}`);

        const actualLines1 = parsed.get(expectedFile1);
        assert.ok(actualLines1, `Lines from ${expectedFile1} should exist`);  
        assert.strictEqual(actualLines1?.size, 1, `Coverage from ${expectedFile1} should have exactly 1 line`);
        assert.ok(actualLines1.has(12), `Coverage from ${expectedFile1} for file should have line 178`);

        const actualLines2 = parsed.get(expectedFile2);
        assert.ok(actualLines1, `Lines from ${expectedFile2} should exist`);       
        assert.strictEqual(actualLines2?.size, 1, `Coverage from ${actualLines2} should have exactly 1 line`);
        assert.ok(actualLines2.has(40), `Coverage from ${actualLines2} for file should have line 40`);
    });

    test('handles lines called more than once', () => {
        const lines = `
        ---- c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk
        178: this.ThrowForWarnings := false
        178: this.ThrowForWarnings := false
        `;

        const parsed = parseExecutedLines(lines);

        const expectedFile = vscode.Uri.file('c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk').toString();
        
        assert.strictEqual(parsed.size, 1, "Coverage should have exactly 1 file");
        assert.ok(parsed.has(expectedFile), `Coverage should have ${expectedFile}`);

        const actualLines = parsed.get(expectedFile);       
        assert.ok(actualLines, 'Lines should exist'); 
        assert.strictEqual(actualLines.size, 1, 'Coverage should have exactly 1 line');
        assert.ok(!actualLines.has(0), 'Coverage for file should not have line 0');
        assert.ok(actualLines.has(177), 'Coverage for file should have line 178');
    });

    test('handles recurring file', () => {
        const lines = `
        ---- c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk
        845: If (fileOrFileName is String)
        846: IsSpace(fileOrFileName) ? DllCall("CORE_RL_MagickWand_\MagickWriteImage", "ptr", this, "ptr", 0, "int") : DllCall("CORE_RL_MagickWand_\MagickWriteImage", "ptr", this, "astr", fileOrFileName, "
        849: }
        854: this.ThrowForMagickException(fileOrFileName)
        1115: threshold := this.ThrowForWarnings ? MagickExceptionType.Warn_Min : MagickExceptionType.Error_Min
        ---- c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\Errors\\MagickExceptionType.ahk
        083: Return 400
        ---- c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk
        1116: exCode := this.GetExceptionType()
        1084: Return DllCall("CORE_RL_MagickWand_\\MagickGetExceptionType", "ptr", this)
        1118: If (exCode > threshold)
        1124: }
        855: Return this
        `;

        const parsed = parseExecutedLines(lines);

        const recurringFile = vscode.Uri.file('c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\MagickWand.ahk').toString();
        const uniqueFile = vscode.Uri.file('c:\\Users\\taorc\\Documents\\AutoHotkey\\Lib\\ImageMagick\\Wand\\Errors\\MagickExceptionType.ahk').toString();

        assert.strictEqual(parsed.size, 2, 'Coverage should have exactly 2 files');
        assert.ok(parsed.has(recurringFile), `Coverage should have ${recurringFile}`);
        assert.ok(parsed.has(uniqueFile), `Coverage should have ${uniqueFile}`);

        const recurringFileLines = parsed.get(recurringFile);
        assert.ok(recurringFileLines, `Lines from ${recurringFileLines} should exist`);
        assert.strictEqual(recurringFileLines.size, 10, `Coverage for ${recurringFileLines} should have exactly 10 lines`);

        [844, 845, 848, 853, 1114, 1115, 1083, 1117, 1123, 854].forEach(
            num => assert.ok(recurringFileLines.has(num), `Coverage for ${recurringFileLines} should have line ${num}`));

        const uniqueFileLines = parsed.get(uniqueFile);
        assert.ok(uniqueFileLines, `Lines from ${uniqueFile} should exist`);
        assert.strictEqual(uniqueFileLines.size, 1, `Coverage for ${uniqueFileLines} should have exactly 1 line`);
        assert.ok(uniqueFileLines.has(82), `Coverage for ${uniqueFile} should have line 82`);
    });

    test('handles empty inputs', () => {
        // Unlikely, but output might be empty or fragmented if the tested code changes ListLines
        const parsed = parseExecutedLines('');
        assert.strictEqual(parsed.size, 0, 'Parsed coverage should have 0 lines');
    });

    test('handles malformed inputs', () => {
        const parsed = parseExecutedLines('Ooglyboogly');
        assert.strictEqual(parsed.size, 0, 'Parsed coverage should have 0 lines');
    });

    test('ignores blank lines in line list', () => {
        const lines = `
        ---- C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk

        013: MagickWandSmokeTests().WriteImage_WithFilePath_WritesImage()

        `;

        const parsed = parseExecutedLines(lines);
        const expectedFile = vscode.Uri.file('C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk').toString();

        assert.strictEqual(parsed.size, 1, "Coverage should have exactly 1 file");
        assert.ok(parsed.has(expectedFile), `Coverage should have ${expectedFile}`);

        const actualLines = parsed.get(expectedFile);        
        assert.strictEqual(actualLines?.size, 1, 'Coverage should have exactly 1 line');
        assert.ok(actualLines.has(12), 'Coverage for file should have line 12');
    });

    test('handles input without leading or trailing newlines', () => {
        const lines = `---- C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk
        013: MagickWandSmokeTests().WriteImage_WithFilePath_WritesImage()`;

        const parsed = parseExecutedLines(lines);
        const expectedFile = vscode.Uri.file('C:\\Users\\taorc\\AppData\\Local\\Temp\\ahkunit-MagickWandSmokeTests.WriteImage_WithFilePath_WritesImage.temp.ahk').toString();

        assert.strictEqual(parsed.size, 1, "Coverage should have exactly 1 file");
        assert.ok(parsed.has(expectedFile), `Coverage should have ${expectedFile}`);

        const actualLines = parsed.get(expectedFile);        
        assert.strictEqual(actualLines?.size, 1, 'Coverage should have exactly 1 line');
        assert.ok(actualLines.has(12), 'Coverage for file should have line 12');
    });
});