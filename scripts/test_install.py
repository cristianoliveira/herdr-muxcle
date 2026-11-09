import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from io import StringIO
from pathlib import Path
from unittest.mock import patch

REPOSITORY_ROOT = Path(__file__).resolve().parents[1]
INSTALLER = REPOSITORY_ROOT / "scripts" / "install.py"
sys.path.insert(0, str(INSTALLER.parent))
import install as package_installer


class UniversalInstallerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="muxcle-installer-test-")
        self.root = Path(self.temporary.name)
        self.source = self.root / "vendor" / "muxcle-package"
        self.source.mkdir(parents=True)
        (self.root / "home").mkdir()
        self.target = self.root / "home" / "herdr-app"

    def tearDown(self):
        self.temporary.cleanup()

    def make_bundle(self, name, files, version="0.1.1", include_installer=True):
        shutil.rmtree(self.source)
        self.source.mkdir(parents=True)
        payload = dict(files)
        if include_installer:
            payload["install.py"] = INSTALLER.read_bytes()
        for relative, content in payload.items():
            path = self.source / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            if isinstance(content, bytes):
                path.write_bytes(content)
            else:
                path.write_text(content, encoding="utf-8")

        manifest = {
            "name": name,
            "version": version,
            "testedHerdrAppVersion": "0.1.13",
            "files": sorted([*payload, "manifest.json"]),
        }
        (self.source / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        return manifest

    def run_installer(self, *arguments):
        return subprocess.run(
            [sys.executable, str(INSTALLER), "--source", str(self.source), "--target", str(self.target), *arguments],
            check=False,
            capture_output=True,
            text=True,
        )

    def pack_files(self):
        files = {
            "keys.json": json.dumps({"global": {"ctrl-a c": "tab.new"}, "terminal": {}}),
            "layouts/muxcle-pack.json": '{"id":"pack-layout"}',
            "config.example.json": '{"folders":[]}',
            "components/muxcle-picker/INSTALLATION.md": "reference only\n",
            "scaffold/layouts/muxcle.json": '{"id":"scaffold-layout"}',
        }
        for name in ("muxcle-sessionizer", "muxcle-picker", "muxcle-history", "muxcle-rotation", "muxcle-sizing"):
            files[f"mods/{name}/mod.json"] = json.dumps({"name": name})
            files[f"mods/{name}/main.js"] = "throw new Error('must not execute');\n"
            files[f"mods/{name}/package-owner.json"] = json.dumps({"package": name, "schema": 1})
        return files

    def test_legacy_archive_without_bundled_installer_works_with_source_option(self):
        self.make_bundle(
            "muxcle-tmux-keys",
            {"keys.json": '{"global":{"ctrl-a c":"tab.new"}}'},
            version="0.1.0",
            include_installer=False,
        )
        result = self.run_installer("--apply")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(
            json.loads((self.target / "keys.json").read_text(encoding="utf-8")),
            {"global": {"ctrl-a c": "tab.new"}},
        )

    def test_pack_preview_is_read_only_and_apply_deploys_only_active_payload(self):
        self.make_bundle("muxcle-pack", self.pack_files())

        preview = self.run_installer()
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertIn("Preview only", preview.stdout)
        self.assertFalse(self.target.exists())

        applied = self.run_installer("--apply")
        self.assertEqual(applied.returncode, 0, applied.stderr)
        self.assertEqual((self.target / "keys.json").read_text(encoding="utf-8"), '{\n  "global": {\n    "ctrl-a c": "tab.new"\n  }\n}\n')
        self.assertEqual((self.target / "layouts/muxcle-pack.json").read_text(encoding="utf-8"), '{"id":"pack-layout"}')
        for name in ("muxcle-sessionizer", "muxcle-picker", "muxcle-history", "muxcle-rotation", "muxcle-sizing"):
            self.assertTrue((self.target / "mods" / name / "main.js").is_file())
        self.assertFalse((self.target / "config.example.json").exists())
        self.assertFalse((self.target / "components").exists())
        self.assertFalse((self.target / "scaffold").exists())

    def test_individual_archives_select_only_their_owned_runtime_files(self):
        cases = {
            "herdr-muxcle": {
                "layouts/muxcle.json": '{"id":"starter"}',
                "mods/muxcle-compat/mod.json": '{"name":"compat"}',
                "mods/muxcle-compat/main.js": "export {};\n",
                "docs/INSTALLATION.md": "reference\n",
            },
            "muxcle-tmux-keys": {
                "keys.json": '{"global":{"ctrl-a c":"tab.new"}}',
                "RECIPE.md": "reference\n",
            },
            "muxcle-sessionizer": {
                "keys.json": '{"global":{"ctrl-a s":"muxcle.sessionizer"}}',
                "config.example.json": '{"folders":[]}',
                "host.json": '{"type":"block"}',
                "mods/muxcle-sessionizer/mod.json": '{"name":"sessionizer"}',
                "mods/muxcle-sessionizer/package-owner.json": '{"package":"muxcle-sessionizer","schema":1}',
                "mods/muxcle-sessionizer/main.js": "export {};\n",
            },
        }
        expected = {
            "herdr-muxcle": {"layouts/muxcle.json", "mods/muxcle-compat/mod.json", "mods/muxcle-compat/main.js"},
            "muxcle-tmux-keys": {"keys.json"},
            "muxcle-sessionizer": {"keys.json", "mods/muxcle-sessionizer/mod.json", "mods/muxcle-sessionizer/package-owner.json", "mods/muxcle-sessionizer/main.js"},
        }
        for name in ("muxcle-picker", "muxcle-history", "muxcle-rotation", "muxcle-sizing"):
            prefix = f"mods/{name}/"
            cases[name] = {
                "keys.json": '{"global":{"ctrl-a n":"package.action"}}',
                prefix + "main.js": "export {};\n",
                prefix + "mod.json": json.dumps({"name": name}),
                prefix + "package-owner.json": json.dumps({"package": name, "schema": 1}),
            }
            expected[name] = {
                "keys.json",
                prefix + "main.js",
                prefix + "mod.json",
                prefix + "package-owner.json",
            }
        for name, files in cases.items():
            self.temporary.cleanup()
            self.setUp()
            with self.subTest(package=name):
                self.make_bundle(name, files)
                result = self.run_installer("--apply")
                self.assertEqual(result.returncode, 0, result.stderr)
                actual = {
                    path.relative_to(self.target).as_posix()
                    for path in self.target.rglob("*")
                    if path.is_file()
                }
                self.assertEqual(actual, expected[name])
                self.assertFalse((self.target / "config.example.json").exists())
                self.assertFalse((self.target / "host.json").exists())

    def test_file_conflicts_abort_all_writes_unless_replacement_is_explicit(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "new mod\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        existing_mod = self.target / "mods/muxcle-picker/main.js"
        existing_mod.parent.mkdir(parents=True)
        existing_mod.write_text("user edit\n", encoding="utf-8")

        conflict = self.run_installer("--apply")
        self.assertNotEqual(conflict.returncode, 0)
        self.assertIn("--replace", conflict.stderr)
        self.assertFalse((self.target / "keys.json").exists())
        self.assertEqual(existing_mod.read_text(encoding="utf-8"), "user edit\n")

        replaced = self.run_installer("--apply", "--replace")
        self.assertEqual(replaced.returncode, 0, replaced.stderr)
        self.assertEqual(existing_mod.read_text(encoding="utf-8"), "new mod\n")
        backups = list(self.target.parent.glob(".herdr-app.muxcle-backup-*"))
        self.assertEqual(len(backups), 1)
        self.assertEqual((backups[0] / "mods/muxcle-picker/main.js").read_text(encoding="utf-8"), "user edit\n")

    def test_key_merge_preserves_unrelated_settings_and_is_idempotent(self):
        self.make_bundle("muxcle-tmux-keys", {
            "keys.json": '{"global":{"ctrl-a c":"tab.new"},"terminal":{"ctrl-a ctrl-a":"send:\\u0001"}}',
        })
        self.target.mkdir(parents=True)
        current = self.target / "keys.json"
        current.write_text(json.dumps({
            "global": {"ctrl-shift-x": "app.palette"},
            "terminal": {},
            "layout:terminals": {"ctrl-shift-z": "terminal"},
            "mod:editor": {"ctrl-s": "editor.save"},
            "settings": {"theme": "dark"},
        }), encoding="utf-8")

        first = self.run_installer("--apply")
        self.assertEqual(first.returncode, 0, first.stderr)
        merged = json.loads(current.read_text(encoding="utf-8"))
        self.assertEqual(merged["global"]["ctrl-shift-x"], "app.palette")
        self.assertEqual(merged["global"]["ctrl-a c"], "tab.new")
        self.assertEqual(merged["terminal"]["ctrl-a ctrl-a"], "send:\u0001")
        self.assertEqual(merged["layout:terminals"], {"ctrl-shift-z": "terminal"})
        self.assertEqual(merged["mod:editor"], {"ctrl-s": "editor.save"})
        self.assertEqual(merged["settings"], {"theme": "dark"})
        first_bytes = current.read_bytes()

        second = self.run_installer("--apply")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(current.read_bytes(), first_bytes)

    def test_exact_key_conflict_needs_replace_and_backup(self):
        self.make_bundle("muxcle-tmux-keys", {"keys.json": '{"global":{"ctrl-a c":"tab.new"}}'})
        self.target.mkdir(parents=True)
        current = self.target / "keys.json"
        original = '{"global":{"ctrl-a c":"app.palette","ctrl-x":"keep"}}\n'
        current.write_text(original, encoding="utf-8")

        rejected = self.run_installer("--apply")
        self.assertNotEqual(rejected.returncode, 0)
        self.assertEqual(current.read_text(encoding="utf-8"), original)

        replaced = self.run_installer("--apply", "--replace")
        self.assertEqual(replaced.returncode, 0, replaced.stderr)
        result = json.loads(current.read_text(encoding="utf-8"))
        self.assertEqual(result["global"], {"ctrl-a c": "tab.new", "ctrl-x": "keep"})
        backup = next(self.target.parent.glob(".herdr-app.muxcle-backup-*"))
        self.assertEqual((backup / "keys.json").read_text(encoding="utf-8"), original)

    def test_precedence_conflict_can_skip_keys_without_skipping_mod_install(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-a c":"picker.open"},"terminal":{"ctrl-a ctrl-a":"send:x"}}',
            "mods/muxcle-picker/main.js": "new mod\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        self.target.mkdir(parents=True)
        keys = self.target / "keys.json"
        original = '{"global":{"ctrl-a ctrl-a":"custom.terminal"},"layout:personal":{"ctrl-a c":"custom.action"}}\n'
        keys.write_text(original, encoding="utf-8")

        rejected = self.run_installer("--apply")
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("shadowed-by-existing", rejected.stdout)
        self.assertIn("overrides-existing", rejected.stdout)
        self.assertFalse((self.target / "mods/muxcle-picker/main.js").exists())

        skipped = self.run_installer("--apply", "--skip-keys")
        self.assertEqual(skipped.returncode, 0, skipped.stderr)
        self.assertEqual(keys.read_text(encoding="utf-8"), original)
        self.assertTrue((self.target / "mods/muxcle-picker/main.js").is_file())

    def test_replace_exact_binding_does_not_override_precedence_conflicts(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-a c":"tab.new"}}',
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        self.target.mkdir()
        keys = self.target / "keys.json"
        original = '{"global":{"ctrl-a c":"old.command"},"terminal":{"ctrl-a c":"terminal.command"}}\n'
        keys.write_text(original, encoding="utf-8")

        replaced = self.run_installer("--apply", "--replace")
        self.assertNotEqual(replaced.returncode, 0)
        self.assertIn("shadowed-by-existing", replaced.stdout)
        self.assertEqual(keys.read_text(encoding="utf-8"), original)
        self.assertFalse((self.target / "mods/muxcle-picker/main.js").exists())

        skipped = self.run_installer("--apply", "--replace", "--skip-keys")
        self.assertEqual(skipped.returncode, 0, skipped.stderr)
        self.assertEqual(keys.read_text(encoding="utf-8"), original)
        self.assertTrue((self.target / "mods/muxcle-picker/main.js").is_file())

    def test_skip_keys_bypasses_malformed_existing_map_but_keeps_mod_install(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        self.target.mkdir()
        keys = self.target / "keys.json"
        keys.write_text("[]\n", encoding="utf-8")

        rejected = self.run_installer("--apply")
        self.assertNotEqual(rejected.returncode, 0)
        self.assertIn("--skip-keys", rejected.stderr)
        self.assertFalse((self.target / "mods/muxcle-picker/main.js").exists())

        skipped = self.run_installer("--apply", "--skip-keys")
        self.assertEqual(skipped.returncode, 0, skipped.stderr)
        self.assertEqual(keys.read_text(encoding="utf-8"), "[]\n")
        self.assertTrue((self.target / "mods/muxcle-picker/main.js").is_file())

    def test_rejects_unsafe_manifest_paths_and_missing_or_symlinked_sources(self):
        manifest = self.make_bundle("muxcle-picker", {
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        manifest["files"] = ["../outside", *manifest["files"]]
        (self.source / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        self.assertNotEqual(self.run_installer().returncode, 0)

        manifest = self.make_bundle("muxcle-picker", {
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        (self.source / "mods/muxcle-picker/main.js").unlink()
        (self.source / "mods/muxcle-picker/main.js").symlink_to(self.root / "outside")
        self.assertNotEqual(self.run_installer().returncode, 0)

    def test_rejects_terminal_controls_in_paths_and_key_chords(self):
        escape = "\x1b[2J"
        self.make_bundle("muxcle-picker", {
            f"mods/muxcle-picker/{escape}main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
        })
        invalid_manifest = self.run_installer()
        self.assertNotEqual(invalid_manifest.returncode, 0)
        self.assertIn("printable", invalid_manifest.stderr)
        self.assertNotIn("\x1b", invalid_manifest.stderr)

        self.make_bundle("muxcle-tmux-keys", {"keys.json": json.dumps({"global": {"ctrl-a\n": "tab.new"}})})
        invalid_chord = self.run_installer()
        self.assertNotEqual(invalid_chord.returncode, 0)
        self.assertIn("non-printable key chord", invalid_chord.stderr)

        target_with_control = self.root / f"target-{escape}"
        invalid_target = subprocess.run(
            [sys.executable, str(INSTALLER), "--source", str(self.source), "--target", str(target_with_control)],
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertNotEqual(invalid_target.returncode, 0)
        self.assertNotIn("\x1b", invalid_target.stderr)

        duplicate_manifest = self.source / "manifest.json"
        duplicate_manifest.write_text('{"\\u001b[2J":1,"\\u001b[2J":2}', encoding="utf-8")
        duplicate_key = self.run_installer()
        self.assertNotEqual(duplicate_key.returncode, 0)
        self.assertNotIn("\x1b", duplicate_key.stderr)
        self.assertIn("\\x1b", duplicate_key.stderr)

    def test_rejects_hard_links_and_special_source_entries(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        main_file = self.source / "mods/muxcle-picker/main.js"
        main_file.unlink()
        outside = self.root / "outside.js"
        outside.write_text("outside content\n", encoding="utf-8")
        os.link(outside, main_file)
        self.assertNotEqual(self.run_installer().returncode, 0)

        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        if not hasattr(os, "mkfifo"):
            self.skipTest("FIFO entries are not supported on this platform")
        os.mkfifo(self.source / "payload-pipe")
        self.assertNotEqual(self.run_installer().returncode, 0)

    def test_target_root_created_after_preview_is_not_adopted(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        plan = package_installer.build_plan(self.source, self.target, replace=False, skip_keys=False)
        self.target.mkdir()

        with self.assertRaisesRegex(package_installer.InstallError, "appeared after preview"):
            package_installer.apply_plan(plan)
        self.assertFalse((self.target / "keys.json").exists())
        self.assertFalse((self.target / "mods").exists())

    def test_target_changes_after_preview_are_not_overwritten(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "package version\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        destination = self.target / "mods/muxcle-picker/main.js"
        destination.parent.mkdir(parents=True)
        destination.write_text("user version\n", encoding="utf-8")
        plan = package_installer.build_plan(self.source, self.target, replace=True, skip_keys=False)
        destination.write_text("concurrent edit\n", encoding="utf-8")

        with redirect_stdout(StringIO()), self.assertRaises(package_installer.InstallError):
            package_installer.apply_plan(plan)
        self.assertEqual(destination.read_text(encoding="utf-8"), "concurrent edit\n")
        self.assertFalse((self.target / "keys.json").exists())

    def test_partial_write_failure_reports_completed_paths_and_preserves_backups(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "package version\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        canonical_target = self.target.parent.resolve() / self.target.name
        existing = canonical_target / "mods/muxcle-picker/main.js"
        existing.parent.mkdir(parents=True)
        existing.write_text("old version\n", encoding="utf-8")
        plan = package_installer.build_plan(self.source, self.target, replace=True, skip_keys=False)
        write_file = package_installer.atomic_write

        def fail_on_mod_json(destination, content, *, mode, create_only, parent_fd):
            if destination == canonical_target / "mods/muxcle-picker/mod.json":
                raise OSError("simulated disk error")
            return write_file(
                destination,
                content,
                mode=mode,
                create_only=create_only,
                parent_fd=parent_fd,
            )

        with redirect_stdout(StringIO()), patch.object(package_installer, "atomic_write", side_effect=fail_on_mod_json):
            with self.assertRaises(package_installer.InstallError) as failure:
                package_installer.apply_plan(plan)

        self.assertIn("mods/muxcle-picker/main.js", str(failure.exception))
        self.assertIn("No rollback was attempted", str(failure.exception))
        self.assertEqual(existing.read_text(encoding="utf-8"), "package version\n")
        self.assertFalse((self.target / "keys.json").exists())
        backup = next(self.target.parent.glob(".herdr-app.muxcle-backup-*"))
        self.assertEqual((backup / "mods/muxcle-picker/main.js").read_text(encoding="utf-8"), "old version\n")

    def test_keyboard_interrupt_reports_completed_write_and_backup(self):
        self.make_bundle("muxcle-picker", {
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
            "mods/muxcle-picker/main.js": "package version\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        canonical_target = self.target.parent.resolve() / self.target.name
        existing = canonical_target / "mods/muxcle-picker/main.js"
        existing.parent.mkdir(parents=True)
        existing.write_text("old version\n", encoding="utf-8")
        plan = package_installer.build_plan(self.source, self.target, replace=True, skip_keys=False)
        write_file = package_installer.atomic_write

        def write_then_interrupt(destination, content, *, mode, create_only, parent_fd):
            write_file(destination, content, mode=mode, create_only=create_only, parent_fd=parent_fd)
            if destination == existing:
                raise KeyboardInterrupt

        output = StringIO()
        with redirect_stdout(output), patch.object(
            package_installer, "atomic_write", side_effect=write_then_interrupt
        ):
            with self.assertRaises(KeyboardInterrupt):
                package_installer.apply_plan(plan)

        self.assertIn("Backup directory:", output.getvalue())
        self.assertIn("Backed up: mods/muxcle-picker/main.js", output.getvalue())
        self.assertIn("Applied: mods/muxcle-picker/main.js", output.getvalue())
        backup = next(self.target.parent.glob(".herdr-app.muxcle-backup-*"))
        self.assertEqual((backup / "mods/muxcle-picker/main.js").read_text(encoding="utf-8"), "old version\n")
        self.assertEqual(existing.read_text(encoding="utf-8"), "package version\n")

    def test_replace_keeps_writes_pinned_when_parent_is_swapped_for_symlink(self):
        self.make_bundle("muxcle-picker", {
            "mods/muxcle-picker/main.js": "package version\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
        })
        canonical_target = self.target.parent.resolve() / self.target.name
        existing = canonical_target / "mods/muxcle-picker/main.js"
        existing.parent.mkdir(parents=True)
        existing.write_text("old version\n", encoding="utf-8")
        outside = self.root / "outside"
        outside.mkdir()
        (outside / "main.js").write_text("outside must stay intact\n", encoding="utf-8")
        plan = package_installer.build_plan(self.source, self.target, replace=True, skip_keys=False)
        write_file = package_installer.atomic_write
        swapped = False

        def swap_parent_before_write(destination, content, *, mode, create_only, parent_fd):
            nonlocal swapped
            if destination == existing and not swapped:
                original_parent = existing.parent
                original_parent.rename(original_parent.with_name("muxcle-picker-original"))
                original_parent.symlink_to(outside, target_is_directory=True)
                swapped = True
            return write_file(
                destination,
                content,
                mode=mode,
                create_only=create_only,
                parent_fd=parent_fd,
            )

        with redirect_stdout(StringIO()), patch.object(
            package_installer, "atomic_write", side_effect=swap_parent_before_write
        ):
            with self.assertRaises(package_installer.InstallError) as failure:
                package_installer.apply_plan(plan)

        self.assertIn("mods/muxcle-picker/main.js", str(failure.exception))
        self.assertEqual((outside / "main.js").read_text(encoding="utf-8"), "outside must stay intact\n")
        self.assertTrue(existing.parent.is_symlink())
        self.assertEqual(
            (self.target / "mods/muxcle-picker-original/main.js").read_text(encoding="utf-8"),
            "package version\n",
        )

    def test_manifest_identity_and_missing_payload_are_rejected(self):
        manifest = self.make_bundle("muxcle-picker", {
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
        })
        manifest["name"] = "unknown-package"
        (self.source / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
        self.assertNotEqual(self.run_installer().returncode, 0)

        self.make_bundle("muxcle-picker", {
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
            "keys.json": '{"global":{"ctrl-p":"picker.open"}}',
        })
        (self.source / "mods/muxcle-picker/main.js").unlink()
        self.assertNotEqual(self.run_installer().returncode, 0)

    def test_rejects_target_symlinks_and_overlapping_source_target(self):
        self.make_bundle("muxcle-picker", {
            "mods/muxcle-picker/main.js": "main\n",
            "mods/muxcle-picker/mod.json": '{"name":"picker"}',
            "mods/muxcle-picker/package-owner.json": '{"package":"muxcle-picker","schema":1}',
        })
        self.target.parent.mkdir(parents=True, exist_ok=True)
        self.target.symlink_to(self.root / "elsewhere")
        self.assertNotEqual(self.run_installer().returncode, 0)

        self.target.unlink()
        self.target.mkdir()
        (self.target / "mods").symlink_to(self.root / "elsewhere")
        self.assertNotEqual(self.run_installer().returncode, 0)
        (self.target / "mods").unlink()

        self.target = self.source / "target-inside-source"
        overlap = self.run_installer()
        self.assertNotEqual(overlap.returncode, 0)

    def test_help_documents_preview_apply_replace_and_skip_keys(self):
        result = subprocess.run([sys.executable, str(INSTALLER), "--help"], check=False, capture_output=True, text=True)
        self.assertEqual(result.returncode, 0)
        for phrase in ("Python 3.11+", "--target", "--source", "--apply", "--replace", "--skip-keys", "Preview", "dotfiles"):
            self.assertIn(phrase.lower(), result.stdout.lower())


if __name__ == "__main__":
    unittest.main()
