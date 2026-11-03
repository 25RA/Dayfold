from __future__ import annotations
import logging
import asyncio
from typing import List, Optional, Dict, Any
from collections import defaultdict
import re

from app.models.models import DailyReflection
from app.schemas.reflection import (
    WeeklyReviewOut,
    PatternDiscoveryOut,
    PatternItem,
    PatternCitation,
)
from app.core.config import settings
from app.services.agent.gemini_extractor import get_gemini_client

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    genai = None  # type: ignore
    genai_types = None  # type: ignore
    GENAI_AVAILABLE = False


def synthesize_weekly_review_deterministic(
    reflections: List[DailyReflection],
    start_date: str,
    end_date: str,
) -> WeeklyReviewOut:
    """
    Deterministic factual summary of reflections for a weekly window.
    Used when Gemini is unavailable or as a strict baseline.
    """
    count = len(reflections)
    if count < 3:
        return WeeklyReviewOut(
            start_date=start_date,
            end_date=end_date,
            reflections_count=count,
            has_sufficient_data=False,
            message=f"You have recorded {count} reflection{'s' if count != 1 else ''} for this period. Dayfold requires at least 3 saved reflections to synthesize grounded weekly observations without guessing.",
            accomplishments=[],
            recurring_challenges=[],
            key_learnings=[],
            supporting_dates=[r.target_date for r in reflections],
        )

    accomplishments: List[str] = []
    challenges: List[str] = []
    learnings: List[str] = []
    dates: List[str] = []

    for r in reflections:
        dates.append(r.target_date)
        # Extract clean bullet points / sentences
        if r.went_well.strip():
            accomplishments.append(f"[{r.target_date}] {r.went_well.strip()}")
        if r.remained_unfinished.strip():
            challenges.append(f"[{r.target_date}] {r.remained_unfinished.strip()}")
        if r.do_differently.strip():
            learnings.append(f"[{r.target_date}] {r.do_differently.strip()}")

    return WeeklyReviewOut(
        start_date=start_date,
        end_date=end_date,
        reflections_count=count,
        has_sufficient_data=True,
        message=None,
        accomplishments=accomplishments[:5],
        recurring_challenges=challenges[:5],
        key_learnings=learnings[:5],
        supporting_dates=sorted(list(set(dates))),
    )


async def synthesize_weekly_review(
    reflections: List[DailyReflection],
    start_date: str,
    end_date: str,
) -> WeeklyReviewOut:
    """
    Synthesize weekly accomplishments, challenges, and lessons.
    Enforces minimum 3-reflection threshold.
    """
    count = len(reflections)
    if count < 3:
        return WeeklyReviewOut(
            start_date=start_date,
            end_date=end_date,
            reflections_count=count,
            has_sufficient_data=False,
            message=f"You have recorded {count} reflection{'s' if count != 1 else ''} for this period. Dayfold requires at least 3 saved reflections to synthesize grounded weekly observations without guessing.",
            accomplishments=[],
            recurring_challenges=[],
            key_learnings=[],
            supporting_dates=[r.target_date for r in reflections],
        )

    if not GENAI_AVAILABLE or not getattr(settings, "GEMINI_API_KEY", None):
        return synthesize_weekly_review_deterministic(reflections, start_date, end_date)

    prompt = f"""You are the Dayfold Reflection Assistant.
Below are {count} real, private daily reflections written by a user between {start_date} and {end_date}.

STRICT INSTRUCTIONS:
1. Synthesize actual accomplishments, recurring challenges, and key learnings from the provided text only.
2. DO NOT invent, extrapolate, or hallucinate activities, events, or outcomes not explicitly stated.
3. Keep observations grounded in reality and supportive in tone.
4. Distinguish facts from interpretations.

REFLECTIONS DATA:
"""
    for r in reflections:
        prompt += f"\n--- Date: {r.target_date} ---\n"
        prompt += f"What went well: {r.went_well}\n"
        prompt += f"What remained unfinished: {r.remained_unfinished}\n"
        prompt += f"What to do differently: {r.do_differently}\n"
        if r.additional_notes:
            prompt += f"Notes: {r.additional_notes}\n"

    try:
        client = get_gemini_client()
        model_name = getattr(settings, "GEMINI_MODEL", "gemini-3.6-flash")
        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=WeeklyReviewOut,
            temperature=0.2,
        )
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            ),
            timeout=25.0,
        )
        if response.text:
            parsed = WeeklyReviewOut.model_validate_json(response.text)
            parsed.reflections_count = count
            parsed.has_sufficient_data = True
            parsed.start_date = start_date
            parsed.end_date = end_date
            parsed.supporting_dates = sorted(list(set(r.target_date for r in reflections)))
            return parsed
    except asyncio.TimeoutError:
        logger.warning("Gemini weekly review synthesis timed out after 25s. Falling back to deterministic.")
    except Exception as e:
        logger.warning(f"Gemini weekly review synthesis failed: {e}. Falling back to deterministic.")

    return synthesize_weekly_review_deterministic(reflections, start_date, end_date)


def discover_patterns_deterministic(
    reflections: List[DailyReflection],
) -> PatternDiscoveryOut:
    """
    Deterministic pattern discovery that groups recurring keywords/themes across reflections.
    Guarantees every returned pattern has evidence citations from at least 2 distinct dates.
    """
    count = len(reflections)
    if count < 4:
        return PatternDiscoveryOut(
            reflections_analyzed_count=count,
            has_sufficient_data=False,
            message=f"Dayfold has analyzed {count} reflection{'s' if count != 1 else ''}. Pattern discovery requires at least 4 saved reflections to identify recurring themes with confidence.",
            patterns=[],
        )

    # Keyword and theme definitions
    THEME_RULES = [
        {
            "theme": "Energy & Morning Deep Work",
            "category": "Energy & Focus",
            "keywords": ["morning", "early", "sleep", "wake", "energy", "tired", "fatigue", "rested"],
            "takeaway": "Starting demanding focus tasks earlier aligns with your reported peak clarity.",
        },
        {
            "theme": "Pacing & Over-committing",
            "category": "Planning & Estimates",
            "keywords": ["too much", "unfinished", "overestimate", "underestimate", "rush", "ambitious", "delay", "postpone"],
            "takeaway": "Leaving larger buffer intervals helps protect your commitments from unexpected spillover.",
        },
        {
            "theme": "Rest & Structured Breaks",
            "category": "Habit & Routine",
            "keywords": ["break", "walk", "stretch", "screen", "exhausted", "burnout", "lunch", "pause"],
            "takeaway": "Short, intentional pauses between focus sessions consistently improve your afternoon momentum.",
        },
        {
            "theme": "Context Switching & Distraction",
            "category": "Focus & Momentum",
            "keywords": ["distracted", "switch", "phone", "interrupt", "slack", "email", "lost focus", "rabbit hole"],
            "takeaway": "Clustering communications into dedicated check-ins reduces cognitive fragmentation.",
        },
        {
            "theme": "Preparation & Prior Night Planning",
            "category": "Planning & Estimates",
            "keywords": ["prepare", "night before", "setup", "outline", "prioritize", "start early"],
            "takeaway": "Defining your top 2 priorities before the day begins reduces morning decision friction.",
        },
    ]

    discovered: List[PatternItem] = []

    for rule in THEME_RULES:
        citations_by_date: Dict[str, str] = {}
        for r in reflections:
            combined_text = f"{r.went_well} {r.remained_unfinished} {r.do_differently} {r.additional_notes or ''}".lower()
            matching_kw = [kw for kw in rule["keywords"] if re.search(r'\b' + re.escape(kw) + r'\b', combined_text)]
            if matching_kw:
                # Find the sentence containing the keyword for a grounded citation
                sentences = re.split(r'[.!?\n]', f"{r.went_well}. {r.remained_unfinished}. {r.do_differently}")
                for s in sentences:
                    s_clean = s.strip()
                    if s_clean and any(kw in s_clean.lower() for kw in matching_kw):
                        citations_by_date[r.target_date] = s_clean[:140]
                        break

        # Mandatory safeguard: Every pattern must have evidence from at least 2 distinct dates
        if len(citations_by_date) >= 2:
            citations = [
                PatternCitation(date=d, quote_or_summary=q)
                for d, q in sorted(citations_by_date.items(), reverse=True)
            ]
            discovered.append(
                PatternItem(
                    theme=rule["theme"],
                    category=rule["category"],
                    observation=f"Mentioned in {len(citations)} reflections across this period.",
                    evidence_citations=citations,
                    frequency_count=len(citations),
                    takeaway=rule["takeaway"],
                )
            )

    return PatternDiscoveryOut(
        reflections_analyzed_count=count,
        has_sufficient_data=True,
        message=None,
        patterns=discovered,
    )


async def discover_patterns(
    reflections: List[DailyReflection],
) -> PatternDiscoveryOut:
    """
    Discover recurring themes across saved reflections with strict evidence citations.
    Enforces minimum 4-reflection threshold and minimum 2 distinct date citations per pattern.
    """
    count = len(reflections)
    if count < 4:
        return PatternDiscoveryOut(
            reflections_analyzed_count=count,
            has_sufficient_data=False,
            message=f"Dayfold has analyzed {count} reflection{'s' if count != 1 else ''}. Pattern discovery requires at least 4 saved reflections to identify recurring themes with confidence.",
            patterns=[],
        )

    # Run deterministic discovery as the solid baseline
    baseline = discover_patterns_deterministic(reflections)

    if not GENAI_AVAILABLE or not getattr(settings, "GEMINI_API_KEY", None):
        return baseline

    prompt = f"""You are the Dayfold Reflection Pattern Discovery Agent.
Analyze the following {count} reflections to find genuine recurring themes.

STRICT SAFETY AND GROUNDING RULES:
1. ONLY identify patterns supported by explicit evidence in the reflections.
2. EVERY pattern MUST include 'evidence_citations' citing at least 2 DISTINCT DATES.
3. If an observation appears only on 1 date, DISCARD IT. Do NOT include it as a pattern.
4. Do NOT invent statistics, percentages, or hypothetical days.
5. Keep takeaways constructive and modest.

REFLECTIONS:
"""
    for r in reflections:
        prompt += f"\n[Date: {r.target_date}]\n"
        prompt += f"- Went well: {r.went_well}\n"
        prompt += f"- Unfinished: {r.remained_unfinished}\n"
        prompt += f"- Do differently: {r.do_differently}\n"

    try:
        client = get_gemini_client()
        model_name = getattr(settings, "GEMINI_MODEL", "gemini-3.6-flash")
        config = genai_types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=PatternDiscoveryOut,
            temperature=0.2,
        )
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model_name,
                contents=prompt,
                config=config,
            ),
            timeout=25.0,
        )
        if response.text:
            parsed = PatternDiscoveryOut.model_validate_json(response.text)
            # Filter strictly: Every pattern must have >= 2 distinct dates
            valid_patterns = []
            for p in parsed.patterns:
                unique_dates = set(c.date for c in p.evidence_citations)
                if len(unique_dates) >= 2:
                    p.frequency_count = len(unique_dates)
                    valid_patterns.append(p)
            parsed.patterns = valid_patterns
            parsed.reflections_analyzed_count = count
            parsed.has_sufficient_data = True
            return parsed
    except asyncio.TimeoutError:
        logger.warning("Gemini pattern discovery timed out after 25s. Falling back to deterministic.")
    except Exception as e:
        logger.warning(f"Gemini pattern discovery failed: {e}. Falling back to deterministic.")

    return baseline

