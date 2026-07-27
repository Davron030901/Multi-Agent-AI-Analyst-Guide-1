"""Specialist agents (F3-F6), the supervisor (F7), the critic (F8), and the
answer-generation node.

Every agent is a plain function ``(AgentState) -> dict`` so it can be unit
tested in complete isolation - a hard requirement of the brief - and then
dropped into the LangGraph graph unchanged.
"""

from .retriever import retriever_agent
from .web import web_agent
from .data import data_agent
from .code import code_agent
from .supervisor import supervisor
from .critic import critic
from .generate import generate

__all__ = [
    "retriever_agent",
    "web_agent",
    "data_agent",
    "code_agent",
    "supervisor",
    "critic",
    "generate",
]
