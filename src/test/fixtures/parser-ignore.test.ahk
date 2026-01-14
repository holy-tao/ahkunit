#Requires AutoHotkey v2.0

;@ahkunit-ignore
class IgnoredTopLevelClass {
    IgnoredMethod() {
        ; This class should be ignored
    }
}

class TopLevelClassWithIgnoredMethod {

    NormalMethod() {
        ; Not skipped
    }

    ;@ahkunit-ignore
    IgnoredMethod() {
        ; Skipped
    }

    AnotherNormalMethod() {
        ; Not skipped
    }
}

class TopLevelClassWithNestedIgnoredClass {
    NormalMethod() {
        ; Not ignored
    }

    ;@ahkunit-ignore
    class NestedIgnoredClass {
        NotExplictlyIgnoredMethod() {
            ; Everything in this class should be ignored
        }

        AnotherMethod() {
            ; Everything in this class should be ignored
        }
    }

    class NotIgnoredClass {
        NormalMethod() => "test"
    }
}