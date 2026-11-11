#!/usr/bin/env python3
"""Run opt-in native IPC tests against a private app/core, never personal state."""
import argparse
import datetime
import json
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path

from harness import HarnessUnavailable, NativeSession
from scenarios import Scenarios
from vision import ScreenText


PACKAGES = ("muxcle-sizing", "muxcle-rotation", "muxcle-history", "muxcle-picker", "muxcle-sessionizer", "muxcle-tmux-keys")
LIMITATIONS = [
    "Native IPC, real core/PTYs, and full-window screenshots; not synthetic keyboard/click testing.",
    "Help is dismissed through native overlay.close; Close/Escape event bindings are not driven.",
    "Picker and Sessionizer verify visible content and dismissal, not search or selection interactions.",
    "Tmux key dispatch and interactive input require a separate isolated display/VM.",
]


def parser():
    result = argparse.ArgumentParser(
        description="Verify packaged Herdr Term features in a separate native Herdr window and private core.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""Prerequisites:
  macOS GUI login, herdr-app matching the packages' tested version,
  hc with versioned document API,
  Python 3.11+, Xcode Command Line Tools (swiftc), and current packages.
  Missing prerequisites fail; they are never silently skipped.

Examples:
  make e2e                                      # package and run all scenarios
  python3 -B tests/e2e/run.py --list             # list goals without launching
  python3 -B tests/e2e/run.py --output /tmp/muxcle-new-run
  python3 -B tests/e2e/run.py --app-bundle '/Applications/Herdr.app'

Safety:
  Opens a visible scratch window. No key/mouse injection, real profile,
  real project execution, clipboard writes, or default core operations.
  Output must be a NEW directory. Artifacts survive owned-resource cleanup.
""",
    )
    result.add_argument("--output", type=Path, help="new artifact directory (default: .tmp/e2e/<unique-run>)")
    result.add_argument("--app-bundle", type=Path, help="installed source .app bundle to COPY, never launch directly")
    result.add_argument("--list", action="store_true", help="list scenarios and coverage limits; do not start anything")
    return result


def revision():
    try:
        result = subprocess.run(["git", "rev-parse", "HEAD"], text=True, capture_output=True, timeout=5)
        return result.stdout.strip() if result.returncode == 0 else "unavailable"
    except (OSError, subprocess.TimeoutExpired):
        return "unavailable"


def error_details(error):
    return "\n".join([str(error), *getattr(error, "__notes__", [])])


def main(arguments=None):
    args = parser().parse_args(arguments)
    names = [name for name, _ in Scenarios(None, None).cases()]
    if args.list:
        print("\n".join(names))
        print("\nCoverage limits:\n- " + "\n- ".join(LIMITATIONS))
        return 0
    compiler = shutil.which("swiftc")
    if not compiler:
        print("Native E2E requires swiftc for offline screenshot text checks. Run: xcode-select --install", file=sys.stderr)
        return 2
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = args.output or Path(".tmp") / "e2e" / (stamp + "-" + secrets.token_hex(4))
    output = output.absolute()
    output.parent.mkdir(parents=True, exist_ok=True)
    summary = {"revision_head": revision(), "source_state": "working-tree packages", "limitations": LIMITATIONS, "results": []}
    failed = False
    artifact_identity = None
    cleanup_completed = False
    session = NativeSession(output, PACKAGES, args.app_bundle)
    try:
        with session:
            info = output.lstat()
            artifact_identity = (info.st_dev, info.st_ino)
            summary["scope"] = {key: getattr(session, key) for key in ("nonce", "core_pid", "core_id", "app_pid")}
            summary["scope"]["scratch"] = str(session.root)
            observer = ScreenText.compile(compiler, session.root, session.env)
            scenarios = Scenarios(session, observer)
            for name, run in scenarios.cases():
                started = time.monotonic()
                try:
                    run()
                    status = session.app("status")
                    if status["errors"]:
                        raise RuntimeError("Native mod errors: " + repr(status["errors"]))
                except Exception as error:
                    summary["results"].append({"name": name, "status": "failed", "error": str(error)})
                    failed = True
                    print("FAIL " + name + ": " + str(error), file=sys.stderr)
                    try:
                        session.snapshot("failure")
                        session.screenshot("failure")
                    except Exception as capture_error:
                        summary["failure_capture_error"] = str(capture_error)
                    break
                summary["results"].append({"name": name, "status": "passed", "seconds": round(time.monotonic() - started, 3)})
                print("PASS " + name, flush=True)
        cleanup_completed = True
    except HarnessUnavailable as error:
        failed = True
        summary["infrastructure_error"] = error_details(error)
        print("Native E2E unavailable: " + error_details(error), file=sys.stderr)
    except Exception as error:
        failed = True
        summary["infrastructure_error"] = error_details(error)
        print("Native E2E failed: " + error_details(error), file=sys.stderr)
    if failed and isinstance(session.root, Path):
        summary["scratch_requires_inspection"] = str(session.root)
        print("Scratch scope requires inspection (do not assume cleanup ownership): " + str(session.root), file=sys.stderr)
    completed = {item["name"] for item in summary["results"]}
    summary["results"].extend({"name": name, "status": "not-run"} for name in names if name not in completed)
    summary["status"] = "failed" if failed else "passed"
    summary["cleanup"] = "completed" if cleanup_completed else "not-confirmed"
    if artifact_identity is not None:
        try:
            info = output.lstat()
            if output.is_symlink() or (info.st_dev, info.st_ino) != artifact_identity:
                raise RuntimeError("Artifact output identity changed; refusing to write results")
            with (output / "results.json").open("x") as stream:
                stream.write(json.dumps(summary, indent=2) + "\n")
            print("Artifacts: " + str(output))
        except (OSError, RuntimeError) as error:
            failed = True
            print("Cannot preserve results: " + str(error), file=sys.stderr)
    print("Coverage: native IPC; keyboard/click/search/selection interactions are NOT verified.")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
