class BroadCategory {
    class Subcategory1 {
        Test1_Condition_ExpectedBehavior() {
            ; Test implementation
        }
        
        ; Fat arrow functions should be allowed
        Test2_AnotherCondition_ExpectedResult() => true

        ; But read-only properties defined with fat arrow functions should not
        ReadOnlyFatArrow => "Should be ignored"

        _IgnoredFunction() {
            ; Should be ignored by parser
        }

        __Delete() {
            ; should be ignored by parser
        }
    }

    class Subcategory2 {
        property := "should be ignored"

        static staticProp := "should be ignored"

        propertyWithGetterAndSetter {
            get => "test"
            set {
                ; Set has a code block
            }
        }

        Test3_Condition_ExpectedBehavior() {
            ; Test implementation
        }


        static StaticMethod_WhichShouldBeIgnored() {
            ; Should be ignored
        }

        class DoublyNestedSubcategory {
            SuperNestedFunction() {
                ; Test implementation
            }
        }
    }

    class EmptyClass {
        ; Should be ignored
    }
}

class AnotherTopLevel 
{
    TestAtTopLevel() 
    {
        ; Direct method on top-level class
    }

    static StaticMethod()
    {
        ; Should be ignored
    }
}

FreeFunction() {
    ; Should be ignored
}