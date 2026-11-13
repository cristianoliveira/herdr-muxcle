# Port Forward

Optional native popup for remote TCP listeners and owned SSH tunnels. No assembly layout or mounted observer is required.

## Requirements

- Herdr 0.1.13, its existing `hc` command, Python 3, and OpenSSH on macOS or Linux.
- A registered permanent machine with an SSH target. Custom `--via` transports are not supported for forwarding.
- Verified SSH host keys and non-interactive authentication. Check `hc machine ls --json` and `ssh -- user@host` before forwarding.
- Remote Python 3 plus `lsof` or `ss` for optional listener discovery. Manual port entry works without discovery.

## Install

Extract this package, then run `sh check-install-targets.sh APP_HOME`. Copy only `mods/muxcle-port-forward` into `APP_HOME/mods/`. Merge selected bindings from `keys.json` into the existing keymap after checking conflicts; do not replace it. Alternatively, open `muxcle-port-forward` from the native mod picker.

For an update or removal, run the preflight with `--update` or `--remove`. Replace or remove only the marked mod directory. Preserve `APP_HOME/data/port-forward` and its ownership marker. Package removal does not stop active tunnels.

## Use

Opening the popup lists machines, discovers listeners on the selected machine, and checks owned tunnel status. Select a listener or enter its remote port and optional local port. **Forward** creates a tunnel bound only to `127.0.0.1`; **Stop** affects only that owned tunnel, not the remote server. Closing the popup leaves tunnels running. Browser opening requires an explicit action. A forwarding status does not prove application health.

User and agent operations share `APP_HOME/data/port-forward`. Agents can invoke the bundled helper directly; no separate CLI installation is needed:

```sh
python3 APP_HOME/mods/muxcle-port-forward/forward.py --help
python3 APP_HOME/mods/muxcle-port-forward/forward.py machines
python3 APP_HOME/mods/muxcle-port-forward/forward.py start --machine mac --port 3000 --local-port 3001
python3 APP_HOME/mods/muxcle-port-forward/forward.py status
python3 APP_HOME/mods/muxcle-port-forward/forward.py stop --machine mac --port 3000 --local-port 3001
```

Set `HERDR_APP_HOME` for an alternate app home, or pass `--state-dir APP_HOME/data/port-forward` before the subcommand. Alternate app homes do not isolate Core machines or sessions. Invalid or foreign state is refused, not deleted. Review the reported path before retrying.
