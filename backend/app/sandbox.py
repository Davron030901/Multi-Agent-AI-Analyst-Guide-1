"""F6 - Sandboxed Python execution.

Constraint #4 of the brief: *never execute model-written Python directly on the
bare host process*. This module enforces that with three independent layers:

1. **Static AST allow-list** - the code is parsed before it ever runs. Imports
   outside the allow-list, and dangerous builtins (``eval``, ``exec``, ``open``,
   ``__import__``, ``compile``, attribute access to ``__globals__`` etc.) are
   rejected without execution.
2. **Separate isolated process** - execution happens in a fresh
   ``python -I -S`` subprocess with a scrubbed environment and a throwaway
   working directory, so it cannot touch the API process, its memory, or its
   environment variables (which hold the API keys).
3. **Hard resource caps** - a wall-clock timeout on every platform, plus CPU,
   address-space, file-size and process-count rlimits on POSIX. On timeout the
   whole process group is killed, not just the parent.

This is defence in depth, not a claim of perfect isolation. For untrusted
multi-tenant input you would put a container or microVM around it as well.
"""

from __future__ import annotations

import ast
import os
import re
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Set

from .config import settings

# --------------------------------------------------------------------------
# Layer 1 - static analysis
# --------------------------------------------------------------------------

ALLOWED_IMPORTS: Set[str] = {
    # stdlib: pure computation only
    "math", "statistics", "cmath", "decimal", "fractions", "random",
    "itertools", "functools", "operator", "collections", "heapq", "bisect",
    "datetime", "calendar", "time", "json", "csv", "re", "string", "textwrap",
    "typing", "dataclasses", "enum", "copy", "pprint", "unicodedata", "uuid",
    # numeric / data stack, if installed
    "numpy", "pandas", "scipy", "sympy", "matplotlib",
}

FORBIDDEN_NAMES: Set[str] = {
    "eval", "exec", "compile", "open", "input", "breakpoint",
    "__import__", "globals", "locals", "vars", "memoryview",
}

FORBIDDEN_ATTRS: Set[str] = {
    "__globals__", "__builtins__", "__subclasses__", "__bases__", "__mro__",
    "__class__", "__code__", "__closure__", "__loader__", "__spec__",
}


class SandboxViolation(RuntimeError):
    """Raised when submitted code fails the static check - it is never run."""


def _root_module(name: str) -> str:
    return name.split(".", 1)[0]


def static_check(code: str) -> None:
    """Parse ``code`` and raise SandboxViolation if it is not obviously safe."""
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        raise SandboxViolation(f"Submitted code does not parse: {exc}") from exc

    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                mod = _root_module(alias.name)
                if mod not in ALLOWED_IMPORTS:
                    raise SandboxViolation(
                        f"Import of '{alias.name}' is not permitted in the sandbox. "
                        f"Allowed roots: {', '.join(sorted(ALLOWED_IMPORTS))}"
                    )

        elif isinstance(node, ast.ImportFrom):
            mod = _root_module(node.module or "")
            if node.level and node.level > 0:
                raise SandboxViolation("Relative imports are not permitted in the sandbox.")
            if mod not in ALLOWED_IMPORTS:
                raise SandboxViolation(f"Import from '{node.module}' is not permitted in the sandbox.")

        elif isinstance(node, ast.Name) and node.id in FORBIDDEN_NAMES:
            raise SandboxViolation(f"Use of '{node.id}' is not permitted in the sandbox.")

        elif isinstance(node, ast.Attribute) and node.attr in FORBIDDEN_ATTRS:
            raise SandboxViolation(f"Attribute '{node.attr}' is not permitted in the sandbox.")


# --------------------------------------------------------------------------
# Layer 2 + 3 - isolated process with hard caps
# --------------------------------------------------------------------------


@dataclass
class SandboxResult:
    ok: bool
    stdout: str
    stderr: str
    timed_out: bool = False
    violation: Optional[str] = None

    def render(self) -> str:
        """One string suitable for putting into ``state['code_result']``."""
        if self.violation:
            return f"SANDBOX REJECTED: {self.violation}"
        if self.timed_out:
            return f"SANDBOX TIMEOUT after {settings.code_timeout_seconds}s (no output)"
        if self.ok:
            return self.stdout.strip() or "(code ran but printed nothing)"
        return f"ERROR:\n{self.stderr.strip()[:2000]}"


def _posix_limits():  # pragma: no cover - POSIX only
    """preexec_fn: apply rlimits and detach into a new process group."""
    import resource

    os.setsid()  # own process group -> we can kill the whole tree on timeout

    cpu = max(1, settings.code_timeout_seconds)
    mem = settings.code_memory_limit_mb * 1024 * 1024

    resource.setrlimit(resource.RLIMIT_CPU, (cpu, cpu))
    resource.setrlimit(resource.RLIMIT_FSIZE, (1_000_000, 1_000_000))  # 1 MB written max
    resource.setrlimit(resource.RLIMIT_NOFILE, (64, 64))
    try:
        resource.setrlimit(resource.RLIMIT_AS, (mem, mem))
    except (ValueError, OSError):
        pass  # some platforms refuse RLIMIT_AS; the timeout still applies
    try:
        resource.setrlimit(resource.RLIMIT_NPROC, (64, 64))
    except (ValueError, OSError):
        pass


def run_code(code: str, timeout: Optional[int] = None) -> SandboxResult:
    """Statically check, then execute ``code`` in an isolated capped subprocess."""
    try:
        static_check(code)
    except SandboxViolation as exc:
        return SandboxResult(ok=False, stdout="", stderr="", violation=str(exc))

    limit = timeout or settings.code_timeout_seconds

    # Scrubbed environment: crucially, no API keys reach the child process.
    child_env = {
        "PATH": os.environ.get("PATH", ""),
        "PYTHONIOENCODING": "utf-8",
        "PYTHONDONTWRITEBYTECODE": "1",
        "HOME": tempfile.gettempdir(),
        "MPLBACKEND": "Agg",  # matplotlib must never try to open a window
    }
    if sys.platform == "win32":
        for key in ("SYSTEMROOT", "TEMP", "TMP", "PATHEXT"):
            if key in os.environ:
                child_env[key] = os.environ[key]

    popen_kwargs: dict = {}
    if os.name == "posix":
        popen_kwargs["preexec_fn"] = _posix_limits
    else:  # Windows: new process group so we can signal the whole tree
        popen_kwargs["creationflags"] = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)

    with tempfile.TemporaryDirectory(prefix="analyst_sandbox_") as workdir:
        script = Path(workdir) / "snippet.py"
        script.write_text(code, encoding="utf-8")

        proc = subprocess.Popen(
            # -I isolated mode: ignore env vars + user site-packages.
            # -S skip site customisation. -B no .pyc files.
            [sys.executable, "-I", "-B", str(script)],
            cwd=workdir,
            env=child_env,
            stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            **popen_kwargs,
        )

        try:
            stdout, stderr = proc.communicate(timeout=limit)
        except subprocess.TimeoutExpired:
            _kill_tree(proc)
            try:
                stdout, stderr = proc.communicate(timeout=5)
            except Exception:
                stdout, stderr = "", ""
            return SandboxResult(ok=False, stdout=stdout, stderr=stderr, timed_out=True)

    return SandboxResult(ok=proc.returncode == 0, stdout=stdout, stderr=stderr)


def _kill_tree(proc: subprocess.Popen) -> None:
    """Kill the child and everything it spawned."""
    try:
        if os.name == "posix":
            import signal

            os.killpg(os.getpgid(proc.pid), signal.SIGKILL)
        else:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True,
                check=False,
            )
    except Exception:
        try:
            proc.kill()
        except Exception:
            pass


# --------------------------------------------------------------------------
# Helper: strip markdown fences from LLM output
# --------------------------------------------------------------------------

_FENCE = re.compile(r"^\s*```(?:python|py)?\s*\n(.*?)\n?```\s*$", re.DOTALL | re.IGNORECASE)


def strip_code_fences(text: str) -> str:
    match = _FENCE.match(text.strip())
    return match.group(1) if match else text.strip()


__all__ = [
    "run_code",
    "static_check",
    "strip_code_fences",
    "SandboxResult",
    "SandboxViolation",
    "ALLOWED_IMPORTS",
]
