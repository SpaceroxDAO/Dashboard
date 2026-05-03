#!/usr/bin/env python3
"""Query ~/.hermes/kanban.db and print JSON to stdout."""
import sqlite3, json, os, sys

DB_PATH = os.path.expanduser("~/.hermes/kanban.db")

try:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    tasks = [dict(r) for r in db.execute(
        "SELECT id, title, body, assignee, status, priority, "
        "created_at, completed_at, result, spawn_failures, "
        "last_spawn_error, worker_pid FROM tasks ORDER BY created_at DESC LIMIT 200"
    )]
    run_counts = {}
    for r in db.execute("SELECT task_id, COUNT(*) as n FROM task_runs GROUP BY task_id"):
        run_counts[r["task_id"]] = r["n"]
    for t in tasks:
        t["run_count"] = run_counts.get(t["id"], 0)
    print(json.dumps(tasks))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(0)
