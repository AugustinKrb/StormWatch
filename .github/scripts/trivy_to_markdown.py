"""Convert a Trivy JSON report into a GitHub-flavored markdown table for a PR comment."""

import json
import sys


def escape(cell: str) -> str:
    return str(cell).replace("|", "\\|").replace("\n", " ")


def main() -> None:
    json_path, title = sys.argv[1], sys.argv[2]
    with open(json_path, encoding="utf-8") as f:
        data = json.load(f)

    rows = []
    for result in data.get("Results", []) or []:
        target = result.get("Target", "")
        for v in result.get("Vulnerabilities", []) or []:
            rows.append(
                (
                    "Vuln",
                    target,
                    v.get("VulnerabilityID", ""),
                    v.get("Severity", ""),
                    v.get("PkgName", ""),
                    v.get("InstalledVersion", ""),
                    v.get("FixedVersion", "-"),
                    v.get("Status", ""),
                )
            )
        for s in result.get("Secrets", []) or []:
            rows.append(
                (
                    "Secret",
                    target,
                    s.get("RuleID", ""),
                    s.get("Severity", ""),
                    s.get("Title", ""),
                    "-",
                    "-",
                    "",
                )
            )
        for m in result.get("Misconfigurations", []) or []:
            rows.append(
                (
                    "Misconfig",
                    target,
                    m.get("ID", ""),
                    m.get("Severity", ""),
                    m.get("Title", ""),
                    "-",
                    "-",
                    m.get("Status", ""),
                )
            )

    print(f"### {title}")
    print()
    if not rows:
        print("No CRITICAL/HIGH findings.")
        return

    print("| Type | Target | ID | Severity | Package/Title | Installed | Fixed | Status |")
    print("|---|---|---|---|---|---|---|---|")
    for row in rows:
        print("| " + " | ".join(escape(c) for c in row) + " |")


if __name__ == "__main__":
    main()
