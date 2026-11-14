#!/usr/bin/env python3
"""Normalize staged regular-file modes against a verified Git base commit."""

import argparse
import os
import subprocess


def git(*args):
    return subprocess.run([b"git", *args], check=True, stdout=subprocess.PIPE).stdout


def has_shebang(oid):
    with subprocess.Popen([b"git", b"cat-file", b"blob", oid],
                          stdout=subprocess.PIPE) as proc:
        prefix = proc.stdout.read(2)
        while proc.stdout.read(65536):
            pass
        if proc.wait() != 0:
            raise SystemExit("Cannot read staged blob")
    return prefix == b"#!"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("base", help="verified base commit ID")
    args = parser.parse_args()

    if git(b"rev-parse", b"--show-prefix") != b"\n":
        raise SystemExit("Run from the root of the validated target worktree")

    base = git(b"rev-parse", b"--verify", b"--end-of-options",
               os.fsencode(args.base) + b"^{commit}").strip()
    tree = {}
    for record in git(b"ls-tree", b"-rz", b"--full-tree", base).split(b"\0"):
        if record:
            meta, path = record.split(b"\t", 1)
            tree[path] = meta.split(b" ", 1)[0]

    index = {}
    for record in git(b"ls-files", b"--stage", b"-z").split(b"\0"):
        if record:
            meta, path = record.split(b"\t", 1)
            mode, oid, stage = meta.split(b" ")
            if stage != b"0":
                raise SystemExit("Unmerged index entries; resolve them before normalization")
            index[path] = (mode, oid)

    changed = git(b"diff", b"--cached", b"--no-ext-diff", b"--no-renames",
                  b"--diff-filter=ACMT", b"--name-only", b"-z").split(b"\0")
    changes = []
    for path in filter(None, changed):
        mode, oid = index[path]
        if mode not in (b"100644", b"100755"):
            continue
        base_mode = tree.get(path)
        if base_mode in (b"100644", b"100755"):
            executable = base_mode == b"100755"
        else:
            executable = has_shebang(oid)
        desired = b"100755" if executable else b"100644"
        if mode != desired:
            changes.append((path, executable))

    for path, executable in changes:
        git(b"update-index", b"--chmod=+x" if executable else b"--chmod=-x",
            b"--", path)


if __name__ == "__main__":
    main()
