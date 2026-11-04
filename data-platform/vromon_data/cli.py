"""
Command line: `python -m vromon_data <command>` (run from data-platform/ with its venv).

  registry check        validate source-registry/sources.yaml
  probe                 test every source URL, write probe-results.json
"""

from __future__ import annotations

import argparse
import sys


def _registry(args) -> int:
    from vromon_data import registry
    problems = registry.validate(registry.load())
    for p in problems:
        print("PROBLEM", p)
    print(f"{len(registry.load())} sources, {len(problems)} problems")
    return 1 if problems else 0


def _probe(args) -> int:
    from vromon_data import probe
    rows = probe.run()
    ok = sum(1 for r in rows if r["result"] == "ok")
    print(f"{ok}/{len(rows)} URLs reachable")
    return 0


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="vromon_data")
    sub = p.add_subparsers(dest="command", required=True)
    reg = sub.add_parser("registry", help="source registry")
    reg.add_argument("action", choices=["check"])
    reg.set_defaults(func=_registry)
    sub.add_parser("probe", help="test every source URL").set_defaults(func=_probe)
    return p


def main(argv: list[str] | None = None) -> None:
    args = build_parser().parse_args(argv)
    sys.exit(args.func(args))
