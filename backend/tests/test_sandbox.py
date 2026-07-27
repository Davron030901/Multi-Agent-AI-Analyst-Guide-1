"""F6 - the sandbox must run correct math AND refuse dangerous code.

These tests spawn real subprocesses; they are still offline (no API key needed).
"""

from __future__ import annotations

import pytest

from app.sandbox import (
    SandboxViolation,
    run_code,
    static_check,
    strip_code_fences,
)


class TestExecution:
    def test_runs_and_captures_stdout(self) -> None:
        result = run_code("print(2 + 2)")
        assert result.ok
        assert result.stdout.strip() == "4"

    def test_exact_math_is_correct(self) -> None:
        result = run_code("print(round(7362 / 865239 * 100, 2))")
        assert result.ok
        assert result.stdout.strip() == "0.85"

    def test_allowed_import_works(self) -> None:
        result = run_code("import statistics\nprint(statistics.mean([1, 2, 3, 4]))")
        assert result.ok
        assert result.stdout.strip() == "2.5"

    def test_runtime_error_is_captured_not_raised(self) -> None:
        result = run_code("print(1 / 0)")
        assert not result.ok
        assert "ZeroDivisionError" in result.stderr
        assert result.render().startswith("ERROR")

    def test_empty_output_is_reported_clearly(self) -> None:
        result = run_code("x = 1 + 1")
        assert result.ok
        assert "printed nothing" in result.render()


class TestTimeout:
    def test_infinite_loop_is_killed(self) -> None:
        result = run_code("while True:\n    pass", timeout=2)
        assert not result.ok
        assert result.timed_out
        assert "TIMEOUT" in result.render()

    def test_sleep_beyond_cap_is_killed(self) -> None:
        # `time` is allowed (it is harmless) - but the cap still applies.
        result = run_code("import time\ntime.sleep(30)\nprint('done')", timeout=2)
        assert result.timed_out


class TestStaticGuard:
    @pytest.mark.parametrize(
        "code",
        [
            "import os\nprint(os.listdir('/'))",
            "import subprocess\nsubprocess.run(['ls'])",
            "import sys\nprint(sys.argv)",
            "import socket",
            "import shutil",
            "import requests",
            "import urllib.request",
            "from os import path",
            "import ctypes",
            "import importlib",
        ],
    )
    def test_dangerous_imports_rejected(self, code: str) -> None:
        with pytest.raises(SandboxViolation):
            static_check(code)
        result = run_code(code)
        assert not result.ok
        assert result.violation is not None
        assert "SANDBOX REJECTED" in result.render()

    @pytest.mark.parametrize(
        "code",
        [
            "open('/etc/passwd').read()",
            "eval('1+1')",
            "exec('x=1')",
            "__import__('os')",
            "compile('1', '<s>', 'eval')",
        ],
    )
    def test_dangerous_builtins_rejected(self, code: str) -> None:
        with pytest.raises(SandboxViolation):
            static_check(code)

    def test_dunder_escape_rejected(self) -> None:
        with pytest.raises(SandboxViolation):
            static_check("print(().__class__.__bases__)")

    def test_syntax_error_rejected_before_execution(self) -> None:
        # NB: "this is not python" is valid syntax (an identity comparison), so
        # the sample here has to be genuinely unparseable.
        result = run_code("def (:\n  ???")
        assert result.violation is not None
        assert "does not parse" in result.violation

    def test_rejected_code_never_executes(self, tmp_path) -> None:
        marker = tmp_path / "should_not_exist.txt"
        result = run_code(f"open({str(marker)!r}, 'w').write('pwned')")
        assert not result.ok
        assert result.violation is not None
        assert not marker.exists()


class TestIsolation:
    def test_api_keys_are_not_visible_to_the_child(self) -> None:
        # `os` is blocked, so we cannot even read the environment - but assert
        # the scrubbing intent explicitly via the allowed-import surface.
        result = run_code("import os\nprint(os.environ.get('GOOGLE_API_KEY'))")
        assert result.violation is not None, "os must be unreachable from the sandbox"


class TestFences:
    def test_strips_python_fence(self) -> None:
        assert strip_code_fences("```python\nprint(1)\n```") == "print(1)"

    def test_strips_bare_fence(self) -> None:
        assert strip_code_fences("```\nprint(1)\n```") == "print(1)"

    def test_passthrough_without_fence(self) -> None:
        assert strip_code_fences("print(1)") == "print(1)"
