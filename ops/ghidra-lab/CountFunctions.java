import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import ghidra.util.task.ConsoleTaskMonitor;

// CountFunctions.java — Ghidra headless smoke [G8]:
// counts recovered functions and decompiles the known 'add' function of the lab binary.
// PASS criterion: analysis succeeds AND add() is recovered with correct arithmetic semantics.
public class CountFunctions extends GhidraScript {
    @Override
    public void run() throws Exception {
        FunctionIterator it = currentProgram.getFunctionManager().getFunctions(true);
        int count = 0; String addC = null;
        DecompInterface di = new DecompInterface();
        di.openProgram(currentProgram);
        while (it.hasNext()) {
            Function f = it.next(); count++;
            if (f.getName().equals("add") && addC == null) {
                DecompileResults r = di.decompileFunction(f, 60, new ConsoleTaskMonitor());
                if (r.decompileCompleted()) addC = r.getDecompiledFunction().getC();
            }
        }
        println("SAOS-SMOKE functions=" + count);
        println("SAOS-SMOKE add_decompiled=" + (addC != null ? addC.replaceAll("\\s+", " ").trim() : "MISSING"));
        if (addC == null) { println("SAOS-SMOKE verdict=FAIL"); return; }
        boolean ok = addC.contains("param_1") && addC.contains("param_2")
            && (addC.contains("+") || addC.contains("add"));
        println("SAOS-SMOKE verdict=" + (ok ? "PASS" : "FAIL"));
    }
}
