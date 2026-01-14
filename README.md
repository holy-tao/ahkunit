# AHKUnit

A VS Code extension for running AutoHotkey v2 unit tests with full IDE integration. View and run tests in the test explorer, run tests via gutter icons, show detailed failure reports, and easily navigate through callstacks.

![Screenshot A screenshot of the extension in action](./assets/inline-error-information.png)

## Features

- **Test Explorer Integration**: View and manage all tests in VS Code's Test Explorer sidebar
- **Gutter Icons**: Run individual tests directly from the editor with inline run/debug icons
- **Detailed Failure Reports**: Comprehensive error messages with parsed stack traces for quick debugging
- **Callstack Navigation**: Click through error stacks to jump to the failing line in your code
- **Output Capture**: Automatically capture and display stdout/stderr from your tests
- **Hierarchical Organization**: Organize tests into nested class hierarchies for better structure
- **Test Filtering**: Easily run specific tests or entire test suites

## Table of Contents
- [Features](#features)
- [Table of Contents](#table-of-contents)
- [Usage](#usage)
  - [Test Structure](#test-structure)
  - [Test Discovery](#test-discovery)
- [Configuration](#configuration)

## Usage
###  Test Structure

AHKUnit expects tests organized as nested classes with methods as test cases. Classes can be nested at any level to produce a test heirarchy.

```ahk
class StringUtils {
    class Trim {
        LeadingWhitespace_Removed() {
            result := Trim("  hello")
            if (result != "hello")
                throw Error("Expected 'hello', got '" result "'")
        }
        
        TrailingWhitespace_Removed() {
            result := Trim("hello  ")
            if (result != "hello")
                throw Error("Expected 'hello', got '" result "'")
        }
    }
    
    class Split {
        WithDelimiter_ReturnsArray() {
            ; ...
        }
    }
}
```

This produces a test heirarchy in the VSCode [test explorer](https://code.visualstudio.com/docs/debugtest/testing) like so:

![TestHeirarchy A screenshot of an example test heirarchy in the VSCode test explorer](./assets/test-explorer.png)

#### The Test environment

The runner runs a single test method in isolation on a new instance of the test class. No other methods are invoked directly, though the `__New` and `__Delete` [meta-functions](https://www.autohotkey.com/docs/v2/Objects.htm#Custom_NewDelete) are called as usual. A test method cannot have required arguments, nor can the test class's static `Call` and `__New` methods.

A test passes if it finishes without throwing. A test fails if it throws any kind of [`Error`](https://www.autohotkey.com/docs/v2/lib/Error.htm). The error's stack is parsed and displayed in the failure information.

Tests can optionally log information to [stdout or stderr](https://www.autohotkey.com/docs/v2/lib/FileOpen.htm); this information is displayed along with the test result.

#### Assertions

AHKUnit does not provide a dedicated assertion library. Instead, tests use AutoHotkey's native error handling:

```ahk
TestAddition() {
    result := 2 + 2
    if (result != 4)
        throw Error("Expected 4, got " result)
}
```

The error message will be captured and displayed in the test failure report. You can throw any `Error` object, including custom error types. Use clear, descriptive error messages to make debugging easier.

### Test Discovery

By default, AHKUnit discovers files matching the [glob pattern](https://code.visualstudio.com/docs/editor/glob-patterns) `**/*.test.ahk`. This can be [configured](#configuration) with the `ahkunit.testFileGlob` setting. Place test files alongside your source or in a dedicated `tests/` folder. `#Include`-ed files are not parsed.

AHKUnit scans discovered files for classes and methods to form a heirarchy as described above. 

> [!WARNING]
> The extension currently has limited support for [fat arrow functions](https://www.autohotkey.com/docs/v2/Variables.htm#fat-arrow), as its parsing is somewhat basic. Any fat arrow functions you use as test methods must be one line only:
> ```autohotkey
> ; This will be parsed correctly
> ValidFatArrowTestMethod() => ExampleFunction(1, 2, 3)
>
> ; This will not
> InvalidFatArrowTestMethod() =>
>     ExampleFunction("param1", "param2", "param3")
> ```

#### Excluding Classes and Methods
The parser ignores methods starting with `_` (including builtins like `__New` and `__Delete`), which can be used as helpers. Additionally, you can explcitly exclude classes and methods using the `;@ahkunit-ignore` directive. Ignoring a class also ignores all of its methods. Static methods are also ignored.

```autohotkey
;@ahkunit-ignore
UtilityClass {
    InstanceMethod() {

    }
}

TestClass {
    TestMethod() {
        this.UtilityMethod()
        Assert(something)
    }

    ;@ahkunit-ignore
    UtilityMethod() {

    }
}
```

## Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `ahkunit.executablePath` | `C:\Program Files\AutoHotkey\v2\AutoHotkey64.exe` | Path to AutoHotkey v2 executable |
| `ahkunit.testFileGlob` | `**/*.test.ahk` | [Glob pattern](https://code.visualstudio.com/docs/editor/glob-patterns) used to identify test files |