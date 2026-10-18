// hello.c — deterministic lab binary for the Ghidra headless smoke [G8].
// Compiled at run time; the analyzer must recover add(2,40)=42 semantics from the ELF.
#include <stdio.h>
int add(int a, int b) { return a + b; }
int main(void) { printf("%d\n", add(2, 40)); return 0; }
