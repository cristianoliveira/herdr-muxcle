import contextlib
import io
import json
import unittest

import port_processes


LSOF_OUTPUT = """p210
cnode
u501
f21
n*:3000 (LISTEN)
p210
cnode
u501
f22
n*:3001 (LISTEN)
p211
cpython3
u501
f12
n127.0.0.1:8000 (LISTEN)
"""


def identity(pid, uid=501, started_at="Tue Nov 10 10:11:12 2026", command="node api.js"):
    return {"pid": pid, "uid": uid, "startedAt": started_at, "command": command}


def process(pid=210, ports=(3000, 3001), **changes):
    return {**identity(pid), "ports": list(ports), **changes}


class PortProcessHelperTests(unittest.TestCase):
    def test_parses_lsof_records_into_deduplicated_local_listener_ports(self):
        result = port_processes.parse_lsof_output(LSOF_OUTPUT)

        self.assertEqual(result, {
            210: {"uid": 501, "command": "node", "ports": [3000, 3001]},
            211: {"uid": 501, "command": "python3", "ports": [8000]},
        })

    def test_rejects_unbounded_or_malformed_listener_data(self):
        with self.assertRaisesRegex(ValueError, "PID"):
            port_processes.parse_lsof_output("p0\ncnode\nu501\nn*:80 (LISTEN)\n")
        with self.assertRaisesRegex(ValueError, "port"):
            port_processes.parse_lsof_output("p210\ncnode\nu501\nn*:http (LISTEN)\n")
        with self.assertRaisesRegex(ValueError, "limit"):
            port_processes.parse_lsof_output("".join(f"p{i}\ncx\nu1\nn*:{i} (LISTEN)\n" for i in range(1, 502)))

    def test_port_and_review_counts_are_bounded(self):
        listeners = "".join(f"p210\ncnode\nu501\nn*:{port} (LISTEN)\n" for port in range(1, 258))
        with self.assertRaisesRegex(ValueError, "port count"):
            port_processes.parse_lsof_output(listeners)
        with self.assertRaisesRegex(ValueError, "limit"):
            port_processes.validate_review([process(pid=pid, ports=(3000,)) for pid in range(1, 34)])

    def test_parses_process_identity_with_spaces_without_losing_start_time_or_command(self):
        result = port_processes.parse_ps_identity(
            210, " 210  501 Tue Nov 10 10:11:12 2026 /usr/bin/node api.js --listen\n"
        )

        self.assertEqual(result, identity(210, command="/usr/bin/node api.js --listen"))

    def test_inventory_uses_injected_runner_and_reports_gone_processes_without_shelling_out(self):
        calls = []

        def runner(args, **options):
            calls.append((args, options))
            if args[0] == "lsof":
                return port_processes.CommandResult(0, LSOF_OUTPUT, "")
            self.assertEqual(args[2], "210,211")
            return port_processes.CommandResult(
                0, "210 501 Tue Nov 10 10:11:12 2026 node\n", ""
            )

        result = port_processes.inventory(runner=runner)

        self.assertEqual([entry[0][0] for entry in calls], ["lsof", "ps"])
        self.assertTrue(all(entry[1]["timeout"] <= 10 for entry in calls))
        self.assertEqual(result["processes"], [process(command="node")])
        self.assertEqual(len(result["warnings"]), 1)

    def test_inventory_accepts_tool_specific_command_name_rendering(self):
        def runner(args, **_options):
            if args[0] == "lsof":
                return port_processes.CommandResult(0, LSOF_OUTPUT, "")
            return port_processes.CommandResult(
                0, "210 501 Tue Nov 10 10:11:12 2026 /usr/local/bin/node\n", ""
            )

        result = port_processes.inventory(runner=runner)

        self.assertEqual(result["processes"], [process(command="/usr/local/bin/node")])

    def test_inventory_accepts_platform_truncated_process_names(self):
        listeners = LSOF_OUTPUT.replace("cnode", "clong-process-name-with-suffix")

        def runner(args, **_options):
            if args[0] == "lsof":
                return port_processes.CommandResult(0, listeners, "")
            return port_processes.CommandResult(
                0, "210 501 Tue Nov 10 10:11:12 2026 long-process-na\n", ""
            )

        result = port_processes.inventory(runner=runner)

        self.assertEqual(result["processes"], [process(command="long-process-na")])

    def test_inventory_rejects_unrelated_process_names(self):
        def runner(args, **_options):
            if args[0] == "lsof":
                return port_processes.CommandResult(0, LSOF_OUTPUT, "")
            return port_processes.CommandResult(
                0, "210 501 Tue Nov 10 10:11:12 2026 unrelated-process\n", ""
            )

        with self.assertRaisesRegex(RuntimeError, "identity changed"):
            port_processes.inventory(runner=runner)

    def test_owner_change_during_inventory_fails_closed(self):
        def runner(args, **_options):
            if args[0] == "lsof":
                return port_processes.CommandResult(0, LSOF_OUTPUT, "")
            return port_processes.CommandResult(
                0, "210 502 Tue Nov 10 10:11:12 2026 node\n", ""
            )

        with self.assertRaisesRegex(RuntimeError, "identity changed"):
            port_processes.inventory(runner=runner)

    def test_partial_lsof_failure_is_not_presented_as_a_complete_inventory(self):
        def runner(_args, **_options):
            return port_processes.CommandResult(1, "p210\ncnode\nu501\nn*:3000 (LISTEN)\n", "permission denied")

        with self.assertRaisesRegex(RuntimeError, "incomplete"):
            port_processes.inventory(runner=runner)

    def test_signal_revalidates_exact_identity_and_listener_ports_before_each_unique_pid(self):
        seen = []
        identities = {210: identity(210), 211: identity(211, command="python server.py")}
        ports = {210: [3000, 3001], 211: [8000]}

        results = port_processes.signal_review(
            [process(), process(211, [8000], command="python server.py")],
            "TERM",
            identity_reader=lambda pid: identities.get(pid),
            ports_reader=lambda pid: ports.get(pid, []),
            signal_sender=lambda pid, signal_number: seen.append((pid, signal_number)),
        )

        self.assertEqual(seen, [(210, port_processes.signal.SIGTERM), (211, port_processes.signal.SIGTERM)])
        self.assertEqual([result["status"] for result in results], ["sent", "sent"])

    def test_identity_is_rechecked_after_ports_to_reject_pid_reuse_before_signal(self):
        identities = iter([identity(210), identity(210, command="replacement")])
        sent = []

        result = port_processes.signal_review(
            [process()],
            "TERM",
            identity_reader=lambda _pid: next(identities),
            ports_reader=lambda _pid: [3000, 3001],
            signal_sender=lambda pid, number: sent.append((pid, number)),
        )

        self.assertEqual(result[0]["status"], "stale")
        self.assertIn("after port revalidation", result[0]["message"])
        self.assertEqual(sent, [])

    def test_pid_reuse_changed_start_uid_command_or_ports_is_rejected_without_signal(self):
        cases = [
            (identity(210, started_at="Wed Nov 11 10:11:12 2026"), [3000, 3001]),
            (identity(210, uid=502), [3000, 3001]),
            (identity(210, command="other"), [3000, 3001]),
            (identity(210), [3000]),
        ]
        for current, current_ports in cases:
            sent = []
            result = port_processes.signal_review(
                [process()], "TERM", identity_reader=lambda _pid: current,
                ports_reader=lambda _pid: current_ports,
                signal_sender=lambda pid, number: sent.append((pid, number)),
            )
            self.assertEqual(result[0]["status"], "stale")
            self.assertEqual(sent, [])

    def test_stale_process_is_skipped_while_the_next_reviewed_target_gets_one_signal(self):
        identities = {210: identity(210, started_at="Wed Nov 11 10:11:12 2026"), 211: identity(211, command="python server.py")}
        ports = {210: [3000, 3001], 211: [8000]}
        sent = []
        results = port_processes.signal_review(
            [process(), process(211, [8000], command="python server.py")],
            "TERM",
            identity_reader=lambda pid: identities[pid],
            ports_reader=lambda pid: ports[pid],
            signal_sender=lambda pid, number: sent.append((pid, number)),
        )

        self.assertEqual([result["status"] for result in results], ["stale", "sent"])
        self.assertEqual(sent, [(211, port_processes.signal.SIGTERM)])

    def test_missing_or_denied_process_reports_partial_outcome_without_retry(self):
        for identity_value, sender, expected in [
            (None, lambda *_args: None, "gone"),
            (identity(210), lambda *_args: (_ for _ in ()).throw(PermissionError("denied")), "denied"),
        ]:
            calls = []

            def count_signal(pid, number):
                calls.append((pid, number))
                sender(pid, number)

            result = port_processes.signal_review(
                [process()], "KILL", identity_reader=lambda _pid: identity_value,
                ports_reader=lambda _pid: [3000, 3001], signal_sender=count_signal,
            )
            self.assertEqual(result[0]["status"], expected)
            self.assertEqual(len(calls), 1 if identity_value else 0)

    def test_signal_payload_rejects_duplicate_pids_and_unsupported_signal(self):
        with self.assertRaisesRegex(ValueError, "duplicate"):
            port_processes.validate_review([process(), process()])
        with self.assertRaisesRegex(ValueError, "signal"):
            port_processes.signal_review([process()], "HUP", lambda _pid: identity(210), lambda _pid: [3000, 3001], lambda *_args: None)

    def test_cli_list_and_signal_emit_json_using_injected_boundaries(self):
        original_inventory = port_processes.inventory
        original_signal = port_processes.signal_review
        try:
            port_processes.inventory = lambda: {"schema": 1, "processes": [process()], "warnings": []}
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(port_processes.main(["list"]), 0)
            self.assertEqual(json.loads(stdout.getvalue())["processes"][0]["pid"], 210)

            port_processes.signal_review = lambda _review, signal_name: [
                {"pid": 210, "status": "sent", "signal": signal_name}
            ]
            stdout = io.StringIO()
            with contextlib.redirect_stdout(stdout):
                self.assertEqual(port_processes.main(["signal", "--kind", "TERM", "--review-json", json.dumps([process()])]), 0)
            self.assertEqual(json.loads(stdout.getvalue())["results"][0]["status"], "sent")
        finally:
            port_processes.inventory = original_inventory
            port_processes.signal_review = original_signal


if __name__ == "__main__":
    unittest.main()
