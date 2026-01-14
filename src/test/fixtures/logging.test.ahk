class LoggingTests {
    TestWithLogging_PrintsOutput_Works() {
        ; This test logs to stdout and should still pass
        FileAppend("Logging test output`n", "*")
        ; Test passes
    }

    TestWithLoggingAndError_PrintsOutputThenFails() {
        ; This test logs to stdout before failing
        FileAppend("About to fail`n", "*")
        throw Error("Intentional test failure", -1)
    }

    TestLoggingBeforeThrow_HasDetailedOutput() {
        ; Multiple log lines before failure
        FileAppend("First log message`n", "*")
        FileAppend("Second log message`n", "*")
        FileAppend("Third log message - about to throw`n", "*")
        throw Error("Test failed after logging", -1)
    }
}
