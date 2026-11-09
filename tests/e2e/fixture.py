"""Harmless long-lived terminal program for owned native E2E sessions."""
import os
import sys


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: fixture.py LABEL")
    print("MUXCLE E2E " + sys.argv[1], flush=True)
    print("Scope: " + os.environ.get("HC_SESSION", "missing"), flush=True)
    for line in sys.stdin:
        print("Received text: " + line.rstrip("\r\n"), flush=True)


if __name__ == "__main__":
    main()
