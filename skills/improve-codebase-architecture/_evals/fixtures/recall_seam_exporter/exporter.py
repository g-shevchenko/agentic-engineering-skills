"""Export a list of report rows to a file in one of several formats.

`export_report(rows, path, fmt)` dispatches on `fmt` to a per-format writer.
Supported formats: csv, json, parquet.
"""
import json
import os

DEFAULT_FMT = os.environ.get("REPORT_FORMAT", "csv")
COMPRESSION = os.environ.get("REPORT_COMPRESSION", "none")


def export_report(rows: list[dict], path: str, fmt: str | None = None) -> str:
    """Write `rows` to `path` in `fmt` (defaults to REPORT_FORMAT). Returns path."""
    fmt = (fmt or DEFAULT_FMT).lower()
    if fmt == "csv":
        return _export_csv(rows, path)
    elif fmt == "json":
        return _export_json(rows, path)
    elif fmt == "parquet":
        return _export_parquet(rows, path)
    raise ValueError(f"unsupported format: {fmt}")


def _export_csv(rows: list[dict], path: str) -> str:
    import csv  # noqa: local import

    fieldnames = list(rows[0].keys()) if rows else []
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            # csv can't hold nested values — flatten to JSON strings
            w.writerow({k: (json.dumps(v) if isinstance(v, (dict, list)) else v) for k, v in r.items()})
    return path


def _export_json(rows: list[dict], path: str) -> str:
    payload = {"rows": rows, "count": len(rows)}
    with open(path, "w") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return path


def _export_parquet(rows: list[dict], path: str) -> str:
    import pyarrow as pa  # noqa: local import
    import pyarrow.parquet as pq  # noqa: local import

    if not rows:
        table = pa.table({})
    else:
        cols = {k: [r.get(k) for r in rows] for k in rows[0].keys()}
        table = pa.table(cols)
    compression = None if COMPRESSION == "none" else COMPRESSION
    pq.write_table(table, path, compression=compression)
    return path
