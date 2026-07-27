"""F14 - Gradio UI + public share link (the zero-cost, zero-card deploy path).

This is the fastest way to satisfy "a live public link that answers a real
question": run it in Google Colab and ``share=True`` gives you a public URL for
about 72 hours, with no server, no card, and enough RAM for local embeddings.

Run:
    cd backend && pip install gradio && python app_gradio.py
Colab:
    see notebooks/Colab_Multi_Agent_Analyst.ipynb
"""

from __future__ import annotations

import argparse
import asyncio
import html
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

try:
    import gradio as gr
except ImportError:  # pragma: no cover
    sys.exit("Gradio is not installed. Run:  pip install gradio")

from app.config import MissingKeyError, settings  # noqa: E402
from app.graph import astream_events  # noqa: E402

NODE_STYLE = {
    "supervisor": ("#6366f1", "SUPERVISOR"),
    "retriever": ("#0ea5e9", "RETRIEVER"),
    "web": ("#14b8a6", "WEB"),
    "data": ("#f59e0b", "DATA / SQL"),
    "code": ("#a855f7", "CODE"),
    "generate": ("#64748b", "GENERATE"),
    "critic": ("#ef4444", "CRITIC"),
}

EXAMPLES = [
    "How many customers churned in Q2 2026, and why did they leave?",
    "What percentage of our total active MRR did we lose to churn in Q2 2026?",
    "Does our average P1 resolution time meet the target in our SLA policy?",
    "What are our churn reason codes and what does each one mean?",
    "Give me the breakdown of Q2 2026 churn by reason code.",
    "What is committed on the Q4 2026 product roadmap?",
]


def _step_html(steps: list[str]) -> str:
    chips = []
    for step in steps:
        node = step.split("(")[0].split(":")[0].split("->")[0].strip()
        colour, _ = NODE_STYLE.get(node, ("#94a3b8", node.upper()))
        chips.append(
            f"<span style='display:inline-block;margin:3px 4px;padding:4px 10px;"
            f"border-radius:999px;background:{colour}22;border:1px solid {colour};"
            f"color:{colour};font-size:12px;font-family:ui-monospace,monospace'>"
            f"{html.escape(step)}</span>"
        )
    return "<div style='line-height:2'>" + "".join(chips) + "</div>"


def _sources_md(sources: list[dict]) -> str:
    if not sources:
        return "_No sources recorded._"
    lines = ["### Sources", ""]
    seen = set()
    for src in sources:
        key = (src.get("type"), src.get("title"), src.get("url"))
        if key in seen:
            continue
        seen.add(key)
        kind = src.get("type", "?")
        title = src.get("title", "untitled")
        url = src.get("url")
        head = f"**[{kind}]** [{title}]({url})" if url else f"**[{kind}]** {title}"
        snippet = (src.get("snippet") or "").strip()
        lines.append(f"- {head}" + (f"\n  > {snippet[:200]}" if snippet else ""))
    return "\n".join(lines)


async def _run(question: str, enable_critic: bool, use_memory: bool):
    """Async generator feeding the three output panes as the graph runs."""
    if not question.strip():
        yield "_Ask something._", "", ""
        return

    try:
        settings.require_llm_key()
    except MissingKeyError as exc:
        yield f"**Configuration error**\n\n```\n{exc}\n```", "", ""
        return

    steps: list[str] = []
    answer = "_Working..._"
    sources_md = ""

    async for event in astream_events(
        question, enable_critic=enable_critic, use_memory=use_memory
    ):
        if event["type"] == "step":
            steps = event.get("steps", steps)
            detail = event.get("detail", "")
            yield answer, _step_html(steps), f"`{event['node']}` — {html.escape(detail)}"
        elif event["type"] == "final":
            answer = event.get("answer") or "_(no answer)_"
            steps = event.get("steps", steps)
            sources_md = _sources_md(event.get("sources", []))
            yield answer, _step_html(steps), sources_md
        elif event["type"] == "error":
            yield f"**Run failed:** {event.get('message')}", _step_html(steps), sources_md


def run_sync(question: str, enable_critic: bool, use_memory: bool):
    """Bridge the async generator into Gradio's sync streaming interface."""
    loop = asyncio.new_event_loop()
    try:
        agen = _run(question, enable_critic, use_memory)
        while True:
            try:
                yield loop.run_until_complete(agen.__anext__())
            except StopAsyncIteration:
                break
    finally:
        loop.close()


def build_ui() -> "gr.Blocks":
    with gr.Blocks(title="Multi-Agent AI Analyst", theme=gr.themes.Soft()) as demo:
        gr.Markdown(
            "# Multi-Agent AI Analyst\n"
            "A supervisor routes your question to specialist agents — **documents**, "
            "**web**, **SQL**, **code** — and a **critic** verifies the answer before you see it."
        )

        with gr.Row():
            question = gr.Textbox(
                label="Question",
                placeholder="How many customers churned in Q2 2026, and why?",
                scale=5,
                lines=2,
            )
            submit = gr.Button("Ask", variant="primary", scale=1)

        with gr.Row():
            enable_critic = gr.Checkbox(value=True, label="Critic enabled (verification gate)")
            use_memory = gr.Checkbox(value=True, label="Long-term memory")

        live = gr.Markdown("", label="Live")
        trace = gr.HTML(label="Agent trace")
        answer = gr.Markdown(label="Answer")
        sources = gr.Markdown(label="Sources")

        gr.Examples(examples=[[e] for e in EXAMPLES], inputs=[question])

        submit.click(
            run_sync,
            inputs=[question, enable_critic, use_memory],
            outputs=[answer, trace, sources],
        )
        question.submit(
            run_sync,
            inputs=[question, enable_critic, use_memory],
            outputs=[answer, trace, sources],
        )

        gr.Markdown(f"<sub>{settings.capability_report()}</sub>".replace("\n", "<br>"))
        _ = live
    return demo


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--share", action="store_true", help="create a public link (Colab)")
    parser.add_argument("--port", type=int, default=int(os.getenv("GRADIO_PORT", "7860")))
    args = parser.parse_args()

    print(settings.capability_report())
    build_ui().queue().launch(share=args.share, server_port=args.port, server_name="0.0.0.0")


if __name__ == "__main__":
    main()
