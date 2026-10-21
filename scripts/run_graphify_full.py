#!/usr/bin/env python3
"""Run full graphify analysis pipeline using Gemini and AST extraction."""

import datetime
import json
import os
import sys
import time
from pathlib import Path

from graphify.analyze import god_nodes, suggest_questions, surprising_connections
from graphify.build import build_from_json
from graphify.cluster import cluster, score_all
from graphify.diagnostics import diagnose_extraction, format_diagnostic_report
from graphify.export import to_html, to_json
from graphify.llm import extract_corpus_parallel, generate_community_labels
from graphify.report import generate


def main():
    root = Path(".").resolve()
    out_dir = root / "graphify-out"
    out_dir.mkdir(exist_ok=True)

    detect_file = out_dir / ".graphify_detect.json"
    if not detect_file.exists():
        print(f"Detect file not found: {detect_file}", file=sys.stderr)
        sys.exit(1)

    detect = json.loads(detect_file.read_text(encoding="utf-8"))
    non_code_files = [
        Path(f)
        for cat in ("document", "image")
        for f in detect.get("files", {}).get(cat, [])
    ]

    print(f"=== Step 3B: Semantic Extraction with Gemini ===")
    print(f"Extracting {len(non_code_files)} non-code files (docs & images)...")
    t0 = time.time()
    sem_result = extract_corpus_parallel(
        non_code_files,
        backend="gemini",
        root=root,
        chunk_size=20,
        token_budget=60_000,
        max_concurrency=4,
    )
    sem_time = round(time.time() - t0, 1)
    print(f"Semantic extraction completed in {sem_time}s:")
    print(
        f"  Nodes: {len(sem_result.get('nodes', []))}, Edges: {len(sem_result.get('edges', []))}"
    )
    print(
        f"  Tokens: {sem_result.get('input_tokens', 0):,} in / {sem_result.get('output_tokens', 0):,} out"
    )

    sem_file = out_dir / ".graphify_semantic.json"
    sem_file.write_text(
        json.dumps(sem_result, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print(f"\n=== Step 3C: Merging AST & Semantic ===")
    ast_file = out_dir / ".graphify_ast.json"
    if not ast_file.exists():
        print(f"AST file not found: {ast_file}", file=sys.stderr)
        sys.exit(1)

    ast_result = json.loads(ast_file.read_text(encoding="utf-8"))
    seen_nodes = {n["id"] for n in ast_result.get("nodes", [])}
    merged_nodes = list(ast_result.get("nodes", []))
    for n in sem_result.get("nodes", []):
        if n["id"] not in seen_nodes:
            merged_nodes.append(n)
            seen_nodes.add(n["id"])

    merged_edges = ast_result.get("edges", []) + sem_result.get("edges", [])
    merged_hyperedges = sem_result.get("hyperedges", [])
    extraction = {
        "nodes": merged_nodes,
        "edges": merged_edges,
        "hyperedges": merged_hyperedges,
        "input_tokens": sem_result.get("input_tokens", 0),
        "output_tokens": sem_result.get("output_tokens", 0),
    }

    extract_file = out_dir / ".graphify_extract.json"
    extract_file.write_text(
        json.dumps(extraction, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    print(
        f"Merged total: {len(merged_nodes)} nodes, {len(merged_edges)} edges ({len(ast_result.get('nodes', []))} AST + {len(sem_result.get('nodes', []))} semantic)"
    )

    print(f"\n=== Step 4: Graph Building & Clustering ===")
    G = build_from_json(extraction, root=root, directed=False)
    if G.number_of_nodes() == 0:
        print("ERROR: Graph is empty!", file=sys.stderr)
        sys.exit(1)

    communities = cluster(G)
    cohesion = score_all(G, communities)
    gods = god_nodes(G)
    surprises = surprising_connections(G, communities)
    print(
        f"Built graph: {G.number_of_nodes()} nodes, {G.number_of_edges()} edges, {len(communities)} communities"
    )

    print(f"\n=== Step 5: Community Labeling with Gemini ===")
    labels, model_used = generate_community_labels(
        G, communities, backend="gemini", gods=gods
    )
    print(
        f"Generated {len(labels)} community labels using model '{model_used}'"
    )

    labels_file = out_dir / ".graphify_labels.json"
    labels_file.write_text(
        json.dumps(
            {str(k): v for k, v in labels.items()},
            indent=2,
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    questions = suggest_questions(G, communities, labels)

    print(f"\n=== Step 6: Exporting Outputs ===")
    # Commit hash
    try:
        import subprocess

        head_commit = (
            subprocess.check_output(
                ["git", "rev-parse", "HEAD"], stderr=subprocess.DEVNULL
            )
            .decode()
            .strip()
        )
    except Exception:
        head_commit = None

    tokens = {
        "input": extraction.get("input_tokens", 0),
        "output": extraction.get("output_tokens", 0),
    }

    # 1. Export graph.json
    to_json(
        G,
        communities,
        str(out_dir / "graph.json"),
        force=True,
        community_labels=labels,
        built_at_commit=head_commit,
    )
    print(f"Exported: {out_dir / 'graph.json'}")

    # 2. Export GRAPH_REPORT.md
    report = generate(
        G,
        communities,
        cohesion,
        labels,
        gods,
        surprises,
        detect,
        tokens,
        str(root),
        suggested_questions=questions,
        built_at_commit=head_commit,
    )
    (out_dir / "GRAPH_REPORT.md").write_text(report, encoding="utf-8")
    print(f"Exported: {out_dir / 'GRAPH_REPORT.md'}")

    # 3. Export graph.html
    to_html(G, communities, str(out_dir / "graph.html"), community_labels=labels)
    print(f"Exported: {out_dir / 'graph.html'}")

    # 4. Diagnostics
    print(f"\n=== Health & Diagnostics ===")
    diag_summary = diagnose_extraction(extraction, directed=False, root=root)
    print(format_diagnostic_report(diag_summary))

    # 5. Cost logging
    cost_file = out_dir / "cost.json"
    runs = []
    if cost_file.exists():
        try:
            old_cost = json.loads(cost_file.read_text(encoding="utf-8"))
            runs = old_cost.get("runs", [])
        except Exception:
            pass
    now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
    runs.append(
        {
            "date": now_iso,
            "input_tokens": extraction.get("input_tokens", 0),
            "output_tokens": extraction.get("output_tokens", 0),
            "files": len(detect.get("files", {}).get("code", []))
            + len(non_code_files),
        }
    )
    tot_in = sum(r.get("input_tokens", 0) for r in runs)
    tot_out = sum(r.get("output_tokens", 0) for r in runs)
    cost_data = {
        "runs": runs,
        "total_input_tokens": tot_in,
        "total_output_tokens": tot_out,
    }
    cost_file.write_text(
        json.dumps(cost_data, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    print("\n✓ Full Graphify analysis complete!")


if __name__ == "__main__":
    main()
