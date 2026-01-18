#Requires AutoHotkey v2.0
;@ahkunit-warn
ListLines(false)

; Ahk script that runs a single test method and prints its result to the command line. On failure, encodes
; the error as JSON

;@ahkunit-include

A_WorkingDir := A_Args[1]

try {
    DllCall("QueryPerformanceFrequency", "Int64*", &freq := 0)
    DllCall("QueryPerformanceCounter", "Int64*", &counterBefore := 0)
    ListLines(true)

    ;@ahkunit-call

    ListLines(false)
    DllCall("QueryPerformanceCounter", "Int64*", &counterAfter := 0)

    duration := (counterAfter - counterBefore) / freq * 1000    ; VSCode wants duration in milliseconds
    FileAppend(Format("<<<AHK_DURATION_START>>>{1}<<<AHK_DURATION_END>>>`r`n", duration), "*")

    ; Coverage preamble and "Press [F5] to refresh" are split from lines by a blank line
    lines := StrSplit(ScriptInfo("ListLines"), "`r`n`r`n")[2]
    FileAppend("<<<AHK_LINES_START>>>", "*")
    FileAppend(lines, "*")
    FileAppend("<<<AHK_LINES_END>>>", "*")

    FileAppend("PASS", "*")
} 
catch Error as err {
    errorJson := Format('
(
{
    "message": "{1}",
    "what": "{2}",
    "extra": "{3}",
    "file": "{4}",
    "line": {5},
    "stack": "{6}",
    "type": "{7}"
}
)',
    JsonEscape(err.Message),
    JsonEscape(err.What),
    JsonEscape(err.Extra),
    JsonEscape(err.File),
    err.Line,  ; Number, no escaping needed
    JsonEscape(err.Stack),
    JsonEscape(Type(err))
)
    FileAppend("<<<AHK_ERROR_START>>>", "*")
    FileAppend(errorJson, "*")
    FileAppend("<<<AHK_ERROR_END>>>", "*")

    DllCall("QueryPerformanceCounter", "Int64*", &counterAfter := 0)

    duration := (counterAfter - counterBefore) / freq * 1000    ; VSCode wants duration in milliseconds
    FileAppend(Format("<<<AHK_DURATION_START>>>{1}<<<AHK_DURATION_END>>>`r`n", duration), "*")

    ExitApp(1)
}

ExitApp(0)

; Escapes JSON for ingestion back into TypeScript
JsonEscape(str) {
    str := StrReplace(str, "\", "\\")    ; Backslashes first!
    str := StrReplace(str, '"', '\"')    ; Then quotes
    str := StrReplace(str, "`n", "\n")   ; Newlines
    str := StrReplace(str, "`r", "\r")   ; Carriage returns
    str := StrReplace(str, "`t", "\t")   ; Tabs
    return str
}

; ScriptInfo from here: https://www.autohotkey.com/boards/viewtopic.php?t=9656
ScriptInfo(Command) {
    static hEdit := 0, pfn, bkp, cmds := {ListLines:65406, ListVars:65407, ListHotkeys:65408, KeyHistory:65409}
    if !hEdit {
        hEdit := DllCall("GetWindow", "ptr", A_ScriptHwnd, "uint", 5, "ptr")
        user32 := DllCall("GetModuleHandle", "str", "user32.dll", "ptr")
        pfn := [], bkp := []
        for i, fn in ["SetForegroundWindow", "ShowWindow"] {
            pfn.Push(DllCall("GetProcAddress", "ptr", user32, "astr", fn, "ptr"))
            DllCall("VirtualProtect", "ptr", pfn[i], "ptr", 8, "uint", 0x40, "uint*", 0)
            bkp.Push(NumGet(pfn[i], 0, "int64"))
        }
    }
 
    if (A_PtrSize=8) {  ; Disable SetForegroundWindow and ShowWindow.
        NumPut("int64", 0x0000C300000001B8, pfn[1], 0)  ; return TRUE
        NumPut("int64", 0x0000C300000001B8, pfn[2], 0)  ; return TRUE
    } else {
        NumPut("int64", 0x0004C200000001B8, pfn[1], 0)  ; return TRUE
        NumPut("int64", 0x0008C200000001B8, pfn[2], 0)  ; return TRUE
    }
 
    cmds.%Command% ? DllCall("SendMessage", "ptr", A_ScriptHwnd, "uint", 0x111, "ptr", cmds.%Command%, "ptr", 0) : 0
 
    NumPut("int64", bkp[1], pfn[1], 0)  ; Enable SetForegroundWindow.
    NumPut("int64", bkp[2], pfn[2], 0)  ; Enable ShowWindow.

    return ControlGetText(hEdit)
}