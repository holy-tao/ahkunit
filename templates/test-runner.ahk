#Requires AutoHotkey v2.0

; Ahk script that runs a single test method and prints its result to the command line. On failure, encodes
; the error as JSON

;@ahkunit-include

; Escapes JSON for ingestion back into TypeScript
JsonEscape(str) {
    str := StrReplace(str, "\", "\\")    ; Backslashes first!
    str := StrReplace(str, '"', '\"')    ; Then quotes
    str := StrReplace(str, "`n", "\n")   ; Newlines
    str := StrReplace(str, "`r", "\r")   ; Carriage returns
    str := StrReplace(str, "`t", "\t")   ; Tabs
    return str
}

try {
    ;@ahkunit-call
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
    ExitApp(1)
}
ExitApp(0)