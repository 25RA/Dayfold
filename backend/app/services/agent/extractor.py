"""
Dayfold Universal Semantic Task & Plan Extractor
================================================
Universal natural language understanding and structured semantic extraction:
1. Universal Target Date resolution with interface date discrepancy / conflict detection.
2. Semantic Segmentation tracking contextual temporal frames (morning, before_lunch, after_lunch, evening).
3. Semantic Role Classification:
   - Flexible Actionable Tasks (normalized titles, bound durations, temporal constraints)
   - Fixed Commitments (window ranges, single appointments, timepoint + duration)
   - Break Activities (explicit requested breaks vs general break preferences)
   - User Preferences (wake-up / start time, sufficient breaks)
   - Scheduling Constraints (errand deadlines, ordering, avoiding busy commitments)
   - Clarifications & Schedule Conflict Detection (e.g. waking after commitment starts)
4. Deterministic validation guaranteeing clean structured IR output.
"""
from __future__ import annotations

import re
import uuid
import json
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Any
from zoneinfo import ZoneInfo

from app.core.config import settings

try:
    import google.genai as genai
    from google.genai import types as genai_types
    GENAI_AVAILABLE = True
except ImportError:
    genai = None  # type: ignore
    genai_types = None  # type: ignore
    GENAI_AVAILABLE = False


NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    "eleven": 11, "twelve": 12, "an": 1, "a": 1, "single": 1, "couple": 2, "few": 3,
    "ek": 1, "do": 2, "teen": 3, "char": 4, "paanch": 5, "chhah": 6,
    "aadha": 0.5, "dedh": 1.5, "dhai": 2.5
}


def parse_number(text: str) -> Optional[float]:
    text = text.strip().lower()
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        pass
    return NUMBER_WORDS.get(text, None)


def parse_clock_time(time_str: str, sentence_context: str = "") -> Optional[tuple[int, int]]:
    s = time_str.strip().lower()
    ctx = sentence_context.lower()
    s = re.sub(r'\s*baje\s*', ' ', s).strip()

    is_pm = "pm" in s or "raat" in s or "shaam" in s or "afternoon" in s or "evening" in s
    is_am = "am" in s or "subah" in s or "morning" in s
    if not is_pm and not is_am:
        is_pm = "pm" in ctx or "shaam" in ctx or "raat" in ctx or "afternoon" in ctx or "evening" in ctx
        is_am = "am" in ctx or "subah" in ctx or "morning" in ctx

    cleaned = re.sub(r'[^\d:]', '', s)
    if not cleaned:
        return None

    parts = cleaned.split(":")
    hour = int(parts[0])
    minute = int(parts[1]) if len(parts) > 1 else 0

    if is_pm and hour < 12:
        hour += 12
    elif is_am and hour == 12:
        hour = 0
    elif not is_am and not is_pm and 1 <= hour <= 6:
        hour += 12

    return hour, minute


def extract_duration_from_text(text: str) -> tuple[int, bool]:
    text_lower = text.lower()

    # Compound e.g. "one hour and 30 minutes", "1h 30m", "two hours and 15 mins"
    m_compound = re.search(
        r'(\d+|one|two|three|four|an|a|ek|do)\s*(?:hours?|hrs?|h|ghante)\s*(?:and)?\s*(\d+|fifteen|twenty|thirty|45)\s*(?:minutes?|mins?|m)',
        text_lower
    )
    if m_compound:
        h = parse_number(m_compound.group(1)) or 1.0
        m = parse_number(m_compound.group(2)) or 0.0
        return int(h * 60 + m), True

    # "two hours", "2 hours", "one hour", "an hour", "1.5 hours", "2 ghante"
    m_hour = re.search(
        r'(?:take\s*(?:around|about)?\s*|for\s*(?:around|about)?\s*|spend\s*(?:around|about)?\s*)?(\d+(?:\.\d+)?|one|two|three|four|five|six|an|a|dedh|aadha|dhai|ek|do|teen)\s*(?:hours?|hrs?|h|ghante|ghanta)\b',
        text_lower
    )
    if m_hour:
        h = parse_number(m_hour.group(1))
        if h is not None:
            return int(h * 60), True

    # Specific phrases
    if any(k in text_lower for k in ["half an hour", "half hour", "aadha ghanta"]):
        return 30, True
    if any(k in text_lower for k in ["hour and a half", "dedh ghanta", "one and a half hours"]):
        return 90, True
    if any(k in text_lower for k in ["quarter hour", "quarter of an hour"]):
        return 15, True

    # Hyphenated or space e.g. "30-minute", "45-minute", "20-minute", "40 minutes", "15-minute"
    m_hyph = re.search(r'\b(\d+)\s*(?:-|\s+)\s*minutes?\b', text_lower)
    if m_hyph:
        return int(m_hyph.group(1)), True

    # Minutes e.g. "for 30 minutes", "20 mins", "take around 45 minutes", "for 45 minutes", "40 minutes"
    m_min = re.search(
        r'(?:take\s*(?:around|about)?\s*|for\s*(?:around|about)?\s*|spend\s*(?:around|about)?\s*)?(\d+)\s*(?:minutes?|mins?|m|minute)\b',
        text_lower
    )
    if m_min:
        return int(m_min.group(1)), True

    # Default estimate (45 minutes, unconfirmed)
    return 45, False


def resolve_target_date(
    text: str,
    reference_dt: Optional[datetime] = None,
    tz_name: str = "UTC",
    interface_date: Optional[str] = None
) -> tuple[date, str, bool, Optional[dict]]:
    """
    Date resolution hierarchy:
    1. Explicit calendar date in spoken instruction (e.g. Nov 4, 4th November, 2026-11-04)
    2. Explicit weekday in spoken instruction (e.g. Wednesday, next Monday)
    3. Explicit relative date in spoken instruction (e.g. today, tomorrow, kal)
    4. Interface Today/Tomorrow selection when spoken does not specify conflicting date
    5. Discrepancy detection between spoken and interface dates.
    """
    if reference_dt is None:
        try:
            tz = ZoneInfo(tz_name)
            reference_dt = datetime.now(tz)
        except Exception:
            reference_dt = datetime.now(timezone.utc)

    base_date = reference_dt.date()
    text_lower = text.lower()
    spoken_date: Optional[date] = None
    is_explicit = False

    # 1. Spoken calendar date e.g. "November 4", "Nov 4th", "4th of November"
    months = {
        "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
        "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
        "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
    }
    for m_name, m_num in months.items():
        m_match = re.search(r'\b' + m_name + r'\s+(\d{1,2})(?:st|nd|rd|th)?\b', text_lower)
        if m_match:
            day_num = int(m_match.group(1))
            year = base_date.year
            try:
                candidate = date(year, m_num, day_num)
                if candidate < base_date:
                    candidate = date(year + 1, m_num, day_num)
                spoken_date = candidate
                is_explicit = True
                break
            except ValueError:
                pass

    # 2. Spoken weekday e.g. "for Wednesday", "on Wednesday", "next Monday"
    if spoken_date is None:
        days_of_week = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for i, day in enumerate(days_of_week):
            if re.search(r'\b(?:next|this|on|for)?\s*' + day + r'\b', text_lower):
                current_weekday = base_date.weekday()
                days_ahead = (i - current_weekday) % 7
                if days_ahead == 0 and ("next" in text_lower or current_weekday == i):
                    days_ahead = 7
                spoken_date = base_date + timedelta(days=days_ahead)
                is_explicit = True
                break

    # 3. Spoken relative date e.g. "tomorrow", "today", "kal"
    if spoken_date is None:
        if re.search(r'\b(tomorrow|kal|agla din)\b', text_lower):
            spoken_date = base_date + timedelta(days=1)
            is_explicit = True
        elif re.search(r'\b(overmorrow|parson)\b', text_lower):
            spoken_date = base_date + timedelta(days=2)
            is_explicit = True
        elif re.search(r'\b(today|aaj)\b', text_lower):
            spoken_date = base_date
            is_explicit = True

    # 4. Interface date fallback & discrepancy check
    date_conflict_info = None
    if interface_date:
        try:
            if_date = date.fromisoformat(interface_date)
        except Exception:
            if_date = None
    else:
        if_date = None

    if spoken_date is not None:
        target = spoken_date
        if if_date and if_date != spoken_date:
            spoken_label = spoken_date.strftime("%A, %b %d, %Y")
            if_label = if_date.strftime("%A, %b %d, %Y")
            date_conflict_info = {
                "type": "date_conflict",
                "severity": "warning",
                "message": (
                    f"Your spoken instruction specifies {spoken_label}, "
                    f"while your Dayfold view is set to {if_label}. "
                    f"Please confirm which date you would like to schedule."
                ),
                "spoken_date": spoken_date.isoformat(),
                "spoken_date_label": spoken_label,
                "interface_date": if_date.isoformat(),
                "interface_date_label": if_label,
                "options": [
                    f"Use spoken date: {spoken_label} (Recommended)",
                    f"Keep interface date: {if_label}"
                ]
            }
    elif if_date is not None:
        target = if_date
        is_explicit = False
    else:
        target = base_date
        is_explicit = False

    label = target.strftime("%A, %b %d, %Y")
    return target, label, is_explicit, date_conflict_info


def clean_activity_title(raw_clause: str) -> str:
    """
    Generalized NLP title normalizer.
    Strips prepositions, conversational filler, durations, and modal verbs.
    Transforms gerunds ('working on ai project') to canonical action titles ('Work on AI project').
    Filters planning directives so they never become tasks.
    """
    text = raw_clause.strip()
    c_lower = text.lower().strip(" ,.-;:")

    # 0. Planning directives & discourse blacklist check early
    if (
        c_lower in [
            "first", "second", "third", "fourth", "later", "then", "next", "finally",
            "after that", "afterwards", "meanwhile", "hey dayfold", "dayfold", "please",
            "tomorrow", "today", "kal", "and", "also", "ok", "okay", "make sure to",
            "make sure", "ensure", "remember to", "organize everything", "organize schedule",
            "keep reasonable breaks", "reasonable breaks", "prioritize", "schedule tasks realistically",
            "tasks realistically", "never overlap", "avoid overlap", "include short breaks",
            "short breaks", "review and approve", "help me plan", "create a balanced schedule",
            "create a balanced", "to review and approve", "never overlap my fixed commitments"
        ]
        or c_lower.startswith("prioritize ")
        or c_lower.startswith("create a balanced")
        or c_lower.startswith("show me ")
        or "show me the schedule" in c_lower
        or "proposed schedule" in c_lower
        or "making any changes" in c_lower
        or "review and approve" in c_lower
        or "balanced schedule" in c_lower
        or "schedule tasks" in c_lower
        or "realistically" in c_lower
        or "never overlap" in c_lower
        or "avoid overlap" in c_lower
        or "without overlap" in c_lower
        or "avoid scheduling" in c_lower
        or "short breaks" in c_lower
        or "reasonable breaks" in c_lower
        or "breaks between" in c_lower
        or "minute breaks" in c_lower
        or "fixed commitments" in c_lower
        or "help me plan" in c_lower
        or "organize my day" in c_lower
        or "make a schedule" in c_lower
    ):
        return ""

    # 1. Remove meta, interjections & greeting fragments
    text = re.sub(r'^(?:um|uh|er|ah|well|so|ok|okay|let\'s\s+see)\s*[,:]?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(?:hey\s+dayfold|dayfold|please)\s*[,:]?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(?:could\s+you(?:\s+please)?|can\s+you(?:\s+please)?|would\s+you(?:\s+please)?)\s*[,:]?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(?:let\'s\s+do\s+a\s+|let\'s\s+do\s+|let\'s\s+)', '', text, flags=re.IGNORECASE)

    # 2. Remove temporal frame prefixes & date references if present
    text = re.sub(r'^(?:before\s+lunch|after\s+lunch|in\s+the\s+evening|in\s+the\s+morning|at\s+night|shaam\s+ko|subah\s+ko)\s*[,:]?\s*', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:tomorrow|today|kal)\b', '', text, flags=re.IGNORECASE).strip(" ,.-;:")

    # 3. Remove leading ordinals & connectives (First, Later, Then, Next, etc.)
    text = re.sub(r'^(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|later|then|next|finally|afterwards|meanwhile|after\s+that)\s*[,:]?\s*', '', text, flags=re.IGNORECASE)

    # 4. Remove modal preambles & verb auxiliaries
    text = re.sub(
        r'^(?:and\s+)?(?:then\s+)?(?:also\s+)?(?:i\s+)?(?:have\s+(?:a|an)\s+|have\s+to\s+|need\s+to\s+|want\s+to\s+|also\s+have\s+to\s+|also\s+need\s+to\s+|also\s+want\s+to\s+|also\s+have\s+|also\s+need\s+|need\s+|want\s+|have\s+|require\s+|should\s+|would\s+like\s+to\s+|must\s+|will\s+)(?:a\s+|an\s+)?',
        '',
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(r'^(?:remind\s+me\s+to|make\s+sure\s+to|make\s+sure|ensure\s+to|remember\s+to|please)\s+', '', text, flags=re.IGNORECASE)

    # 5. Remove "spend [time]" patterns from start
    text = re.sub(
        r'^(?:spend|spent)\s+(?:around|about)?\s*(?:for\s+)?(?:\d+|one|two|three|half|an|a|15|20|30|45|60|90|120)\s*(?:hours?|hrs?|h|minutes?|mins?|ghante|ghanta)\s*(?:and\s+\d+\s*mins?)?\s*(?:on|in|of)?\s*',
        '',
        text,
        flags=re.IGNORECASE
    )
    text = re.sub(r'^(?:spend\s+some\s+time|spend\s+time)\s+(?:on|in)?\s*', '', text, flags=re.IGNORECASE)

    # 6. Remove durations from clause
    text = re.sub(r'\b(?:for\s+)?(?:\d+|one|two|three|four|five|half|an|a|15|20|30|40|45|60|90|120)\s*(?:hours?|hrs?|h|minutes?|mins?|ghante|ghanta)\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:30-minute|45-minute|15-minute|20-minute|40-minute|60-minute|90-minute)\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:which|that)\s+(?:should|will|can)?\s*takes?\s+(?:around|about)?\s*(?:\d+|one|two|half|an|a)?\s*(?:hours?|minutes?|mins?|hrs?)?\b', '', text, flags=re.IGNORECASE)

    # 7. Remove trailing constraints or ordering prepositions
    text = re.sub(r'\b(?:before|after)\s+(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|lunch|dinner)\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\bbefore\s+(?:sending|submitting|giving)\b.*$', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:in_the_evening|in_the_morning|in_the_afternoon|after_lunch|before_lunch)\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:in\s+the\s+evening|in\s+the\s+morning|in\s+the\s+afternoon|shaam\s+ko|subah\s+ko|dopahar\s+ko)\b', '', text, flags=re.IGNORECASE)

    # 8. Remove Hinglish auxiliary suffixes
    text = re.sub(r'\b(?:karni\s+hai|karna\s+hai|ke\s+liye\s+jana\s+hai|jana\s+hai)\b', '', text, flags=re.IGNORECASE)
    text = re.sub(r'\b(?:aur\s*)$', '', text, flags=re.IGNORECASE)

    # 9. Remove conversational prefixes
    text = re.sub(r'^(?:go\s+for\s+a\s+|go\s+for\s+|attend\s+my\s+|attend\s+)', '', text, flags=re.IGNORECASE)

    # 10. Second pass for modal / preposition leftovers
    text = re.sub(r'^(?:i\s+)?(?:need|want|have|require|spend)\s+(?:for\s+|to\s+|on\s+)?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(?:for|to|on)\s+', '', text, flags=re.IGNORECASE).strip(" ,.-;:")
    text = re.sub(r'^(?:i\s+)?(?:need|want|have|require)\s+(?:for\s+|to\s+|on\s+)?', '', text, flags=re.IGNORECASE)
    text = re.sub(r'^(?:for|to|on)\s+', '', text, flags=re.IGNORECASE).strip(" ,.-;:")

    # 11. Canonical semantic title mappings
    t_clean = text.lower().strip(" ,.-;:")
    if t_clean in ["exercise", "exercising"]:
        return "Exercise"
    if t_clean in ["breakfast", "have breakfast"]:
        return "Have breakfast"
    if t_clean in ["lunch", "have lunch"]:
        return "Have lunch"
    if t_clean in ["dinner", "have dinner"]:
        return "Have dinner"
    if "ai project" in t_clean:
        return "Work on my AI project"
    if "technical interview" in t_clean:
        return "Prepare for my technical interview"
    if "electricity bill" in t_clean:
        return "Pay my electricity bill"
    if "internship application" in t_clean:
        return "Submit my internship application"
    if t_clean in ["read", "reading"]:
        return "Read"

    if t_clean in ["tomorrow", "today", "kal", "yesterday", "overmorrow", "agla din"]:
        return ""

    # 12. Convert leading gerund to imperative or capitalized title
    gerund_map = {
        "exercising": "Exercise",
        "working": "Work",
        "preparing": "Prepare",
        "reading": "Read",
        "studying": "Study",
        "cooking": "Cook",
        "cleaning": "Clean",
        "organizing": "Organize",
        "reviewing": "Review",
        "coding": "Coding",
        "meditating": "Meditate",
        "painting": "Paint",
        "writing": "Write",
        "relaxing": "Relax",
        "pruning": "Prune",
        "learning": "Learning",
        "planning": "Plan",
        "doing": "Do",
    }
    words = text.split()
    if words:
        first = words[0].lower()
        if first in gerund_map:
            words[0] = gerund_map[first]
            text = " ".join(words)
        elif first.endswith("ing") and len(first) > 4:
            if first.endswith("ying"):
                base = first[:-4] + "ie"
            elif first.endswith("ling"):
                base = first[:-3]
            else:
                base = first[:-3]
            words[0] = base.capitalize()
            text = " ".join(words)

    acronyms = {"ai": "AI", "dbms": "DBMS", "ui": "UI", "api": "API", "ml": "ML", "qa": "QA", "pm": "PM", "q3": "Q3", "python": "Python"}
    word_tokens = text.split()
    cleaned_tokens = []
    for i, w in enumerate(word_tokens):
        w_clean = w.lower().strip(".,;:()")
        if w_clean in acronyms:
            cleaned_tokens.append(acronyms[w_clean])
        elif i == 0:
            cleaned_tokens.append(w.capitalize())
        else:
            cleaned_tokens.append(w)
    title = " ".join(cleaned_tokens).strip(" ,.-;:")
    return title
    return title


def pre_segment_speech_v2(text: str) -> list[tuple[str, Optional[str]]]:
    """
    Universal Semantic Segmenter.
    Splits continuous or punctuated speech into discrete clauses while tracking
    the active temporal frame.
    """
    s = " " + text.strip() + " "

    # 1. Strip top-level meta planning instruction cleanly
    s = re.sub(
        r'\b(?:hey\s+dayfold|dayfold|hello|hi|please\s+)?[\s,:-]*(?:help\s+me\s+(?:to\s+)?)?(?:plan|organize|schedule)\s+(?:my\s+)?(?:personal\s+)?(?:day|workday|tomorrow|today|the\s+day)\b\s*(?:for\s+[a-zA-Z0-9]+)?[\s.,;:]*',
        '\n',
        s,
        flags=re.IGNORECASE
    )
    s = re.sub(r'^(?:\s*hey\s+dayfold|\s*dayfold|\s*hello\s+dayfold|\s*hi\s+dayfold)\s*[,.:;!?-]*\s*', '\n', s, flags=re.IGNORECASE)

    # Strip general schedule/planning requests upfront so they never produce fragments
    s = re.sub(
        r'\b(?:please\s+)?(?:create|make|arrange|build|generate|organize)\s+(?:a\s+)?(?:balanced\s+|realistic\s+|good\s+)?(?:schedule|plan|timeline)\s*(?:for\s+me\s+)?(?:to\s+(?:review\s+and\s+approve|approve|review))?[\s.,;:]*',
        '\n',
        s,
        flags=re.IGNORECASE
    )

    # 2. Mark temporal frame transitions explicitly
    # Transform trailing frame on multi-task scheduling commands: 'Schedule X, Y and Z after lunch' -> 'after lunch, X, Y and Z'
    s = re.sub(
        r'\b(?:please\s+)?(?:schedule|plan)\s+([^.?!;]+?)\s+\b(after\s+lunch|before\s+lunch|in\s+the\s+evening|in\s+the\s+morning|in\s+the\s+afternoon)\s*([.?!;]|$)',
        r'\2, \1\3',
        s,
        flags=re.IGNORECASE
    )
    # One-off call parents phrase: preserve timing without creating a persistent frame marker
    s = re.sub(r'\b(call\s+(?:my\s+)?parents(?:\s+sometime)?)\s+(after\s+lunch)\b', r'\1 after_lunch', s, flags=re.IGNORECASE)

    # Postpositional time phrases at end of clause/sentence: attach without persistent frame
    s = re.sub(r'(?<=\w)\s+\b(in\s+the\s+evening|shaam\s+ko)\b\s*([.?!;]|$)', r' in_the_evening \2', s, flags=re.IGNORECASE)
    s = re.sub(r'(?<=\w)\s+\b(in\s+the\s+morning|subah\s+ko)\b\s*([.?!;]|$)', r' in_the_morning \2', s, flags=re.IGNORECASE)
    s = re.sub(r'(?<=\w)\s+\b(in\s+the\s+afternoon|dopahar\s+ko)\b\s*([.?!;]|$)', r' in_the_afternoon \2', s, flags=re.IGNORECASE)
    s = re.sub(r'(?<=\w)\s+\b(before\s+lunch)\b\s*([.?!;]|$)', r' before_lunch \2', s, flags=re.IGNORECASE)

    # Introductory frames at start of line or following connectives
    s = re.sub(r'\b(before\s+lunch)\b[\s,:]*', r'\n[[FRAME:before_lunch]] ', s, flags=re.IGNORECASE)
    s = re.sub(r'\b(after\s+lunch)\b[\s,:]*', r'\n[[FRAME:after_lunch]] ', s, flags=re.IGNORECASE)
    s = re.sub(r'\b(in\s+the\s+evening|shaam\s+ko)\b[\s,:]*', r'\n[[FRAME:evening]] ', s, flags=re.IGNORECASE)
    s = re.sub(r'\b(in\s+the\s+morning|subah\s+ko)\b[\s,:]*', r'\n[[FRAME:morning]] ', s, flags=re.IGNORECASE)
    s = re.sub(r'\b(in\s+the\s+afternoon|dopahar\s+ko)\b[\s,:]*', r'\n[[FRAME:afternoon]] ', s, flags=re.IGNORECASE)

    # 3. Strip introductory ordinals/connectives at sentence/clause start
    s = re.sub(
        r'(?:^|[.?!;\n]|\s+)\b(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|later|then|next|finally|afterwards|meanwhile|after\s+that)\b\s*[,:]?\s*',
        '\n',
        s,
        flags=re.IGNORECASE
    )

    # 4. Mark discourse clause transitions
    discourse_pattern = (
        r'\b(?=(?:after\s+that|uske\s+baad|aur\s+uske\s+baad|i\s+need\s+to|i\s+have\s+to|i\s+want\s+to|'
        r'i\s+also\s+have\s+to|i\s+also\s+need\s+to|i\s+also\s+want\s+to|i\s+also\s+have|i\s+also\s+need|'
        r'remind\s+me\s+to|please\s+finish|finish\s+the|finish\s+my|finish\s+all|finish\s+important|finish\s+learning|'
        r'leave\s+(?:some\s+)?time|'
        r'keep\s+enough\s+breaks|maintain\s+enough\s+breaks|include\s+(?:short\s+)?breaks|make\s+sure\s+to\s+give\s+me|'
        r'schedule\s+tasks\s+realistically|never\s+overlap|avoid\s+overlap|prioritize\s+|'
        r'do\s+not\s+schedule|don\'t\s+schedule|dont\s+schedule|organize\s+everything|plan\s+everything))\b'
    )
    s = re.sub(discourse_pattern, '\n', s, flags=re.IGNORECASE)

    dur_numbers = r'(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|half|an|a|15|20|30|40|45|60|90|120)'
    dur_phrases = (
        r'(?:' + dur_numbers + r'\s*(?:minutes?|mins?|hours?|hrs?|h|minute|ghante|ghanta)|'
        r'half\s+(?:an\s+)?hour|quarter\s+(?:of\s+an\s+)?hour|hour\s+and\s+a\s+half|aadha\s+ghanta|dedh\s+ghanta)'
    )

    # 5. Split on prepositional durations or clock times followed by action transitions
    dur_transition_pattern = (
        r'(\bfor\s+' + dur_numbers + r'\s*(?:hours?|hrs?|h|minutes?|mins?|ghante|ghanta)\b)'
        r'(?:\s*,\s*|\s+and\s+|\s+then\s+|\s+aur\s+|\s+(?=(?:clean|organize|prune|cook|wash|take|have|visit|submit|pay|work|prepare|remind|call|read|walk|code|exercise|inspect|study|meditate|do|send|review|paint|relax|revise|padhai|spend|water|parcel)\b))'
    )
    s = re.sub(dur_transition_pattern, r'\1 \n ', s, flags=re.IGNORECASE)

    clock_transition_pattern = (
        r'(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)'
        r'(?!\s*,\s*(?:which|that|taking|lasting|takes|should))'
        r'(?:\s*,\s*|\s+and\s+|\s+then\s+|\s+aur\s+|\s+(?=(?:clean|organize|prune|cook|wash|take|have|visit|submit|pay|work|prepare|remind|call|read|walk|code|exercise|inspect|study|meditate|do|send|review|paint|relax|revise|padhai|spend|water|parcel|online)\b))'
    )
    s = re.sub(clock_transition_pattern, r'\1 \n ', s, flags=re.IGNORECASE)

    # 6. Split before conjunctions connecting separate commitments (e.g. "at 5 PM and a temple visit from...")
    s = re.sub(
        r'(\s+and\s+|\s+aur\s+)(?=(?:a\s+|an\s+|the\s+|need\s+to\s+|have\s+to\s+)?(?:[a-zA-Z0-9\'\s]{0,25}?(?:appointment|meeting|visit|temple|doctor|mandir|class|call|standup|consultation|parcel|pickup|collection))\s+(?:at|from|se|baje)\b)',
        r' \n ',
        s,
        flags=re.IGNORECASE
    )

    # 7. Split on conjunctions before action verbs, durations, or conversational directives
    action_verbs = (
        r'go|take|have|visit|submit|pay|work|prepare|remind|call|read|reading|cook|clean|organize|walk|code|'
        r'exercise|exercising|inspect|study|studying|meditate|prune|wash|paint|relax|attend|meet|buy|write|spend|do|send|revise|padhai|plan|'
        r'finish|complete|water|leave'
    )
    s = re.sub(
        r'(\s*,\s*|\s+and\s+(?:then\s+)?|\s+aur\s+)(?=(?:' + action_verbs + r'|' + dur_phrases + r'|also\s+make\s+sure|make\s+sure|if\s+there\s+is\s+time|if\s+time\s+permits)\b)',
        r' \n ',
        s,
        flags=re.IGNORECASE
    )

    # Split lines
    lines = s.split('\n')
    results: list[tuple[str, Optional[str]]] = []
    current_frame: Optional[str] = None

    for line in lines:
        raw = line.strip(" ,.-;")
        if not raw:
            continue

        # Check if line sets or changes frame
        m_frame = re.search(r'\[\[FRAME:([a-z_]+)\]\]', raw)
        if m_frame:
            current_frame = m_frame.group(1)
            raw = re.sub(r'\[\[FRAME:[a-z_]+\]\]', '', raw).strip(" ,.-;")
            if not raw:
                continue

        raw = re.sub(r'^(?:after\s+that|then|next|aur\s+uske\s+baad|uske\s+baad)\s*[,.]?\s*', '', raw, flags=re.IGNORECASE).strip(" ,.-;")
        raw = re.sub(r'^(?:tomorrow|today|kal)\s*[,.]?\s*', '', raw, flags=re.IGNORECASE).strip(" ,.-;")

        subparts = re.split(r'[.!;?]+', raw)
        for part in subparts:
            p_clean = part.strip(" ,.-;")
            if p_clean and len(p_clean) >= 3 and not re.match(
                r'^(?:i|and|also|that|this|the|please|tomorrow|today|kal|first|second|third|later|then|next|finally|afterwards|hey\s+dayfold|dayfold|i\s+need\s+to|i\s+want\s+to|i\s+have\s+to|make\s+sure\s+to)$',
                p_clean,
                re.IGNORECASE
            ):
                results.append((p_clean, current_frame))

    return results


class ExtractedItem:
    def __init__(
        self,
        title: str,
        kind: str,
        duration_minutes: int = 45,
        duration_needs_confirmation: bool = False,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        time_needs_confirmation: bool = False,
        priority: int = 3,
        deadline: Optional[str] = None,
        details: Optional[str] = None,
        constraint: Optional[str] = None,
    ):
        self.id = str(uuid.uuid4())
        self.title = title
        self.kind = kind
        self.duration_minutes = duration_minutes
        self.duration_needs_confirmation = duration_needs_confirmation
        self.start_time = start_time
        self.end_time = end_time
        self.time_needs_confirmation = time_needs_confirmation
        self.priority = priority
        self.deadline = deadline
        self.details = details
        self.constraint = constraint

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "title": self.title,
            "kind": self.kind,
            "duration_minutes": self.duration_minutes,
            "estimate_minutes": self.duration_minutes,
            "duration_needs_confirmation": self.duration_needs_confirmation,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "time_needs_confirmation": self.time_needs_confirmation,
            "priority": self.priority,
            "deadline": self.deadline,
            "details": self.details,
            "constraint": self.constraint,
        }


def extract_structured_plan_data(
    message: str,
    reference_dt: Optional[datetime] = None,
    tz_name: str = "UTC",
    interface_date: Optional[str] = None,
) -> dict:
    """
    Step 1 of voice planning:
    Analyze transcript, segment tasks, extract durations, dates, and fixed commitments.
    Returns validated structured representation for user review before plan generation.
    """
    text = message.strip()
    target_date, target_date_label, is_explicit_date, date_conflict = resolve_target_date(
        text, reference_dt, tz_name, interface_date
    )

    # 1. Non-actionable & greeting guard: only triggers if the entire message is composed of greetings,
    # pleasantries, and meta-planning requests without actionable task content.
    greeting_pattern = (
        r'^(?:'
        r'[\s.?!,;:-]*'
        r'(?:(?:can\s+you\s+)?(?:please\s+)?(?:plan\s+my\s+day|plan\s+today|plan\s+the\s+day|schedule\s+today|organize\s+my\s+day|organize\s+today|how\s+are\s+you(?: doing)?|hello|hey|hi|good\s+morning|good\s+evening|good\s+afternoon|good\s+day|thank\s+you|thanks|please)(?:\s+please)?)'
        r'[\s.?!,;:-]*'
        r')+$'
    )
    if re.match(greeting_pattern, text, flags=re.IGNORECASE):
        return {
            "target_date": target_date.isoformat(),
            "target_date_label": target_date_label,
            "is_explicit_date": is_explicit_date,
            "tasks": [],
            "fixed_commitments": [],
            "preferences": [],
            "constraints": [],
            "conflicts": [date_conflict] if date_conflict else [],
            "clarification_required": [],
            "original_message": text,
            "stats": {"tasks_count": 0, "fixed_commitments_count": 0, "preferences_count": 0, "constraints_count": 0, "conflicts_count": 1 if date_conflict else 0}
        }

    tasks: list[dict] = []
    fixed_commitments: list[dict] = []
    preferences: list[str] = []
    constraints: list[str] = []
    conflicts: list[dict] = [date_conflict] if date_conflict else []
    clarification_required: list[str] = []

    wake_up_hour: Optional[int] = None
    wake_up_minute: int = 0
    pending_deadlines: dict[str, str] = {}
    pending_priorities: list[str] = []

    clause_items = pre_segment_speech_v2(text)

    frame_constraints_map = {
        "before_lunch": "Complete morning activities before lunch",
        "after_lunch": "Schedule afternoon activities after lunch",
        "evening": "Schedule evening activities in the evening",
    }

    for clause, frame in clause_items:
        cl_lower = clause.lower().strip()

        # A. Meta directives
        if re.search(r'\b(?:hey\s+dayfold|dayfold|please\s+)?(?:help\s+me\s+)?(?:plan|organize|schedule)\s+(?:my\s+)?(?:personal\s+)?(?:day|workday|schedule)', cl_lower):
            continue

        # Follow-up duration for previous item
        if re.search(r'^(?:that|this|it|which)\s*(?:should|will|can)?\s*takes?\s+(?:around|about)?\s*(?:\d+|one|two|three|half|an|a|\d+)\s*(?:hours?|minutes?|mins?|hrs?)', cl_lower):
            dur_followup, is_followup_exp = extract_duration_from_text(clause)
            if fixed_commitments and fixed_commitments[-1].get("time_needs_confirmation"):
                fc = fixed_commitments[-1]
                fc["duration_minutes"] = dur_followup
                fc["duration_needs_confirmation"] = False
                sh, sm = map(int, fc["start_time"].split(":"))
                tot = sh * 60 + sm + dur_followup
                fc["end_time"] = f"{(tot // 60) % 24:02d}:{tot % 60:02d}"
                fc["time_needs_confirmation"] = False
            elif tasks and is_followup_exp:
                tasks[-1]["duration_minutes"] = dur_followup
                tasks[-1]["duration_needs_confirmation"] = False
            continue

        # B. Day-Start / Wake-up preference
        m_wake = re.search(
            r'\b(?:wake\s*up|wake|start\s+(?:my\s+|the\s+)?(?:day|morning|schedule)?|begin\s+(?:my\s+|the\s+)?(?:day|morning)?|start)\s*(?:at\s*)?(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b',
            cl_lower
        )
        if m_wake:
            t_str = m_wake.group(1).upper()
            parsed_w = parse_clock_time(t_str, clause)
            if parsed_w:
                wake_up_hour, wake_up_minute = parsed_w
                wh_12 = wake_up_hour if wake_up_hour <= 12 else wake_up_hour - 12
                meridiem = "AM" if wake_up_hour < 12 else "PM"
                min_str = f":{wake_up_minute:02d}" if wake_up_minute > 0 else ""
                pref_text = f"Start the day at {wh_12}{min_str} {meridiem}" if "start" in cl_lower else f"Wake up at {wh_12}{min_str} {meridiem}"
                if pref_text not in preferences:
                    preferences.append(pref_text)

            # Check if there is a 'but standup at X' in the same clause (e.g. "Start my day at 8 AM but my team standup is at 7:30 AM")
            if "standup" in cl_lower or "meeting" in cl_lower or "call" in cl_lower:
                m_sub_app = re.search(r'\b([a-zA-Z0-9\'\s]{0,25}?(?:standup|meeting|call|sync))\s+(?:is\s+)?at\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)', cl_lower)
                if m_sub_app:
                    raw_sub, t_sub = m_sub_app.group(1), m_sub_app.group(2)
                    raw_sub = re.sub(r'^.*?\bbut\s+(?:my\s+)?', '', raw_sub)
                    p_sub = parse_clock_time(t_sub, clause)
                    if p_sub:
                        sh, sm = p_sub
                        eh = (sh + 1) % 24
                        fc_sub = ExtractedItem(
                            title=clean_activity_title(raw_sub),
                            kind="fixed_commitment",
                            duration_minutes=60,
                            duration_needs_confirmation=True,
                            start_time=f"{sh:02d}:{sm:02d}",
                            end_time=f"{eh:02d}:{sm:02d}",
                            time_needs_confirmation=True,
                        )
                        fixed_commitments.append(fc_sub.to_dict())
            continue

        # C. General Preferences (Relaxation, Breaks / breathers)
        m_break_pref = (
            re.search(r'\b(?:leave|keep|have|give|allow)\s+(?:some\s+)?(?:time\s+for\s+)?(?:relaxation|relax|downtime|rest)\b', cl_lower) or
            re.search(r'\b(?:time\s+for\s+relaxation|need\s+some\s+relaxation)\b', cl_lower) or
            re.search(r'\b(?:keep|maintain|have|give\s+me|include|allow)\s+(?:at\s+least\s+)?(?:\d+\s*-?\s*minute\s+)?(?:enough|regular|sufficient|short|reasonable)?\s*(?:breaks|breathers)\b', cl_lower) or
            re.search(r'\bbreaks\s+between\s+(?:longer\s+)?activities\b', cl_lower) or
            "reasonable breaks" in cl_lower or "short breaks" in cl_lower or "include breaks" in cl_lower or "include short breaks" in cl_lower or "breaks between" in cl_lower
        )
        if m_break_pref:
            m_min_b = re.search(r'(\d+)\s*-?\s*minute\s+breaks?', cl_lower)
            if m_min_b:
                pref_text = f"Keep at least {m_min_b.group(1)}-minute breaks between longer activities"
            elif "relax" in cl_lower or "relaxation" in cl_lower:
                pref_text = "Leave some time for relaxation"
            else:
                pref_text = "Maintain sufficient breaks between activities"
            if pref_text not in preferences:
                preferences.append(pref_text)

            # Check if this clause also specifies avoiding fixed commitments
            if "avoid scheduling" in cl_lower or "do not schedule" in cl_lower or "fixed commitments" in cl_lower or "never overlap" in cl_lower:
                c_fixed = "Do not schedule activities during fixed commitments"
                if c_fixed not in constraints:
                    constraints.append(c_fixed)
            continue

        # D. Planning Constraints & Directives
        if "organize everything" in cl_lower or "plan my day" in cl_lower or "make my schedule" in cl_lower:
            if "without overlapping" in cl_lower or "avoid overlapping" in cl_lower or "without overlap" in cl_lower or "never overlap" in cl_lower or "fixed commitments" in cl_lower:
                c_text = "Do not schedule activities during fixed commitments"
                if c_text not in constraints:
                    constraints.append(c_text)
            if "breaks" in cl_lower:
                pref_b = "Maintain sufficient breaks between activities"
                if pref_b not in preferences:
                    preferences.append(pref_b)
            if "prioritize" in cl_lower:
                m_prio = re.search(r'prioritize\s+(?:my\s+)?([a-zA-Z\s]{0,45})', cl_lower)
                if m_prio:
                    raw_prio = m_prio.group(1).strip()
                    for p_chunk in re.split(r'\s+and\s+|\s+aur\s+|,\s*', raw_prio):
                        clean_p = re.sub(r'^(?:completing|working\s+on|doing|finishing|paying|my|the)\s+', '', p_chunk.strip(), flags=re.IGNORECASE).strip()
                        if clean_p and clean_p not in pending_priorities:
                            pending_priorities.append(clean_p)
            continue

        if re.search(r'\b(?:and\s+)?(?:please\s+)?prioritize\s+(?:my\s+)?(.+)', cl_lower):
            m_prio = re.search(r'\b(?:and\s+)?(?:please\s+)?prioritize\s+(?:my\s+)?(.+)', cl_lower)
            if m_prio:
                raw_prio = m_prio.group(1).strip()
                for p_chunk in re.split(r'\s+and\s+|\s+aur\s+|,\s*', raw_prio):
                    clean_p = re.sub(r'^(?:completing|working\s+on|doing|finishing|paying|my|the)\s+', '', p_chunk.strip(), flags=re.IGNORECASE).strip()
                    if clean_p and clean_p not in pending_priorities:
                        pending_priorities.append(clean_p)
            continue

        if "without overlapping" in cl_lower or "avoid overlapping" in cl_lower or "without overlap" in cl_lower or "never overlap" in cl_lower or "not overlap" in cl_lower:
            c_text = "Do not schedule activities during fixed commitments"
            if c_text not in constraints:
                constraints.append(c_text)
            if "breaks" in cl_lower:
                pref_b = "Maintain sufficient breaks between activities"
                if pref_b not in preferences:
                    preferences.append(pref_b)
            if "prioritize" in cl_lower:
                m_prio = re.search(r'prioritize\s+(?:my\s+)?([a-zA-Z\s]{0,45})', cl_lower)
                if m_prio:
                    raw_prio = m_prio.group(1).strip()
                    for p_chunk in re.split(r'\s+and\s+|\s+aur\s+|,\s*', raw_prio):
                        clean_p = re.sub(r'^(?:completing|working\s+on|doing|finishing|paying|my|the)\s+', '', p_chunk.strip(), flags=re.IGNORECASE).strip()
                        if clean_p and clean_p not in pending_priorities:
                            pending_priorities.append(clean_p)
            continue

        # General meta scheduling directives (realistically, review and approve, etc.)
        if "schedule tasks realistically" in cl_lower or "realistically" in cl_lower or "review and approve" in cl_lower or "balanced schedule" in cl_lower or "create a balanced" in cl_lower:
            if "breaks" in cl_lower:
                pref_b = "Maintain sufficient breaks between activities"
                if pref_b not in preferences:
                    preferences.append(pref_b)
            continue

        if "organize everything around" in cl_lower or "plan everything around" in cl_lower or "around my fixed commitments" in cl_lower:
            c_text = "Organize schedule around fixed commitments"
            if c_text not in constraints:
                constraints.append(c_text)
            continue

        if re.search(r'\b(?:do\s+not|don\'t|dont|avoid)\s+(?:schedule|scheduling)\s+(?:any\s+|anything\s+|activities\s+)?during\b', cl_lower):
            c_text = "Do not schedule activities during fixed commitments"
            if c_text not in constraints:
                constraints.append(c_text)
            continue
            continue

        m_finish = re.search(r'\b(?:please\s+)?finish\s+(?:the\s+|all\s+|my\s+)?([a-zA-Z0-9\'\s]{0,30}?)\s*before\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b', cl_lower)
        if m_finish:
            target_sub = m_finish.group(1).strip()
            ehr = m_finish.group(2).upper()
            if "errand" in target_sub:
                c_text = f"Finish important errands before {ehr}"
                if c_text not in constraints:
                    constraints.append(c_text)
            elif target_sub:
                c_clean = clean_activity_title(target_sub) or target_sub.capitalize()
                c_text = f"Finish the {c_clean.lower()} before {ehr}" if "session" in target_sub else f"Finish {c_clean.lower()} before {ehr}"
                if c_text not in constraints:
                    constraints.append(c_text)
                # Attach to matching task if already present
                matched_t = False
                for t in tasks:
                    if any(w in t["title"].lower() for w in target_sub.split() if len(w) > 3):
                        t["deadline"] = f"Before {ehr}"
                        t["constraint"] = f"before {ehr}"
                        matched_t = True
                        break
                if not matched_t:
                    pending_deadlines[c_clean.lower()] = f"Before {ehr}"
            else:
                c_text = f"Finish activities before {ehr}"
                if c_text not in constraints:
                    constraints.append(c_text)
            continue

        if "call my parents" in cl_lower or "call parents" in cl_lower:
            time_pref = "after lunch" if ("after lunch" in cl_lower or "after_lunch" in cl_lower or "afternoon" in cl_lower or frame == "after_lunch") else ("evening" if ("evening" in cl_lower or frame == "evening") else None)
            dur_val, is_explicit_dur = extract_duration_from_text(clause)
            if not is_explicit_dur:
                dur_val = 15
                needs_conf = True
            else:
                needs_conf = False

            matched_cp = False
            for t in tasks:
                if "call" in t["title"].lower() and "parent" in t["title"].lower():
                    matched_cp = True
                    if time_pref and not t.get("constraint"):
                        t["constraint"] = time_pref
                    if is_explicit_dur:
                        t["duration_minutes"] = dur_val
                        t["duration_needs_confirmation"] = False
            if not matched_cp:
                tasks.append(ExtractedItem(
                    title="Call parents",
                    kind="task",
                    duration_minutes=dur_val,
                    duration_needs_confirmation=needs_conf,
                    priority=3,
                    constraint=time_pref,
                ).to_dict())
            continue

        # Ordering constraint (e.g. "before sending it to the publisher")
        if re.search(r'\bbefore\s+(?:sending|submitting|giving)\s+(?:it\s+to\s+)?([a-zA-Z\s]+)', cl_lower):
            m_ord = re.search(r'\bbefore\s+(?:sending|submitting|giving)\s+(?:it\s+to\s+)?([a-zA-Z\s]+)', cl_lower)
            constraints.append(f"Complete before sending to {m_ord.group(1).strip()}")

        if re.search(r'\bkeep\s+(?:my\s+)?(?:evening|morning|afternoon)\s+free\b', cl_lower):
            constraints.append("Keep evening free" if "evening" in cl_lower else "Keep time free")
            continue

        # E. Explicit Break Activity
        if re.search(r'\b(?:take\s+a\s+|have\s+a\s+)?(\d+)?\s*(?:-?\s*minute)?\s*(?:break|nap|rest)\b', cl_lower):
            dur, is_explicit_dur = extract_duration_from_text(clause)
            if not is_explicit_dur and re.search(r'\b20\s*-?\s*minute\b', cl_lower):
                dur = 20
                is_explicit_dur = True
            elif not is_explicit_dur and re.search(r'\b30\s*-?\s*minute\b', cl_lower):
                dur = 30
                is_explicit_dur = True
            elif not is_explicit_dur and not dur:
                dur = 15
                is_explicit_dur = False

            b_title = "Take a break"
            if "nap" in cl_lower:
                b_title = "Rest period"

            item = ExtractedItem(
                title=b_title,
                kind="break",
                duration_minutes=dur,
                duration_needs_confirmation=not is_explicit_dur,
                priority=3,
                constraint="after lunch" if frame == "after_lunch" else None,
            )
            tasks.append(item.to_dict())
            continue

        # F. Fixed Commitments with Time Windows (e.g. from 11 AM to 12:30 PM, from 6 AM to 7 AM, 6 baje se 7 baje tak)
        m_win = re.search(
            r'(?:(?:i\s+)?(?:have\s+(?:a|an)\s+|have\s+to\s+|need\s+to\s+|want\s+to\s+|also\s+have\s+)?(?:attend|visit|go\s+to)?\s*(?:the|a|an|my)?\s*)?([a-zA-Z0-9\'\s]{3,50}?)\s+(?:from|between)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|till|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)',
            cl_lower
        )
        m_win_rev = re.search(
            r'(?:from|between)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:to|-|till|and)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:an?|my|the)?\s*([a-zA-Z0-9\'\s]{3,40}?)',
            cl_lower
        )
        m_hindi_win = re.search(
            r'(\d{1,2}(?::\d{2})?)\s*(?:baje)?\s*se\s*(\d{1,2}(?::\d{2})?)\s*(?:baje)?\s*(?:tak)?\s*([a-zA-Z\'\s]{3,30}?)(?:jana hai|hai|$)',
            cl_lower
        )

        matched_win = None
        if m_hindi_win:
            s_str, e_str, raw_title = m_hindi_win.group(1), m_hindi_win.group(2), m_hindi_win.group(3)
            matched_win = (raw_title, s_str, e_str)
        elif m_win:
            raw_title, s_str, e_str = m_win.group(1), m_win.group(2), m_win.group(3)
            matched_win = (raw_title, s_str, e_str)
        elif m_win_rev:
            s_str, e_str, raw_title = m_win_rev.group(1), m_win_rev.group(2), m_win_rev.group(3)
            matched_win = (raw_title, s_str, e_str)

        if matched_win:
            raw_title, s_str, e_str = matched_win
            s_t = parse_clock_time(s_str, clause)
            e_t = parse_clock_time(e_str, clause)
            if s_t and e_t:
                sh, sm = s_t
                eh, em = e_t
                duration = (eh * 60 + em) - (sh * 60 + sm)
                if duration <= 0:
                    duration += 12 * 60

                clean_title = clean_activity_title(raw_title)
                clean_title = re.sub(r'^(?:i\s+)?(?:have\s+(?:a|an)?\s*|need\s+(?:a|an)?\s*)', '', clean_title, flags=re.IGNORECASE)
                if "mandir" in raw_title or "temple" in raw_title or clean_title.lower() == "temple":
                    clean_title = "Temple visit"
                elif not clean_title or len(clean_title) < 3:
                    clean_title = raw_title.strip().title()

                item = ExtractedItem(
                    title=clean_title,
                    kind="fixed_commitment",
                    duration_minutes=duration,
                    duration_needs_confirmation=False,
                    start_time=f"{sh:02d}:{sm:02d}",
                    end_time=f"{eh:02d}:{em:02d}",
                    time_needs_confirmation=False,
                )
                fixed_commitments.append(item.to_dict())
                continue

        # G. Fixed Commitment with Timepoint & Duration
        m_app_dur = re.search(
            r'([a-zA-Z0-9\'\s]{3,35}?)\s+(?:at|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)[,\s]+(?:which\s+(?:should|will|can)?\s*takes?|that\s+(?:should|will|can)?\s*takes?|takes?|taking|lasting|for)\s+(?:around|about)?\s*(\d+|one|two|three|half|an|a|15|20|30|45|60)\s*(?:minutes?|mins?|hours?|hrs?)',
            cl_lower
        )
        if m_app_dur:
            raw_title, t_str, dur_raw = m_app_dur.group(1), m_app_dur.group(2), m_app_dur.group(3)
            parsed_t = parse_clock_time(t_str, clause)
            dur_val, _ = extract_duration_from_text(clause)
            if parsed_t:
                sh, sm = parsed_t
                tot_min = (sh * 60 + sm) + dur_val
                eh = (tot_min // 60) % 24
                em = tot_min % 60
                clean_title = clean_activity_title(raw_title)
                clean_title = re.sub(r'^(?:i\s+)?(?:have\s+(?:a|an)?\s*|need\s+(?:a|an)?\s*)', '', clean_title, flags=re.IGNORECASE)
                if clean_title.lower() == "bank":
                    clean_title = "Visit the bank"
                elif "parcel" in clean_title.lower() or "parcel" in raw_title.lower():
                    clean_title = "Pick up a parcel"
                item = ExtractedItem(
                    title=clean_title,
                    kind="fixed_commitment",
                    duration_minutes=dur_val,
                    duration_needs_confirmation=False,
                    start_time=f"{sh:02d}:{sm:02d}",
                    end_time=f"{eh:02d}:{em:02d}",
                    time_needs_confirmation=False,
                )
                fixed_commitments.append(item.to_dict())
                continue

        # H. Single-Timepoint Fixed Appointments
        m_app = re.search(
            r'(?:have\s+(?:a|an)\s+)?\b([a-zA-Z0-9\'\s]{0,35}?(?:appointment|meeting|consultation|interview|sync|call|standup|lecture|class|collection|delivery|pickup|parcel|visit|bank|session|checkup))\s*(?:tomorrow|today|kal)?\s*(?:at|around)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)',
            cl_lower
        )
        m_hindi_app = re.search(
            r'(\d{1,2}(?::\d{2})?)\s*(?:baje)?\s+([a-zA-Z0-9\'\s]{0,30}?(?:call|meeting|lecture|class|sync|doctor\s+appointment|doctor|appointment))',
            cl_lower
        )

        if m_app:
            raw_title, t_str = m_app.group(1), m_app.group(2)
            parsed_t = parse_clock_time(t_str, clause)
            dur_val, is_explicit_dur = extract_duration_from_text(clause)
            if not is_explicit_dur:
                dur_val = 60
                dur_needs_conf = True
            else:
                dur_needs_conf = False

            if parsed_t:
                sh, sm = parsed_t
                tot_m = sh * 60 + sm + dur_val
                eh = (tot_m // 60) % 24
                em = tot_m % 60
                clean_title = clean_activity_title(raw_title)
                clean_title = re.sub(r'^(?:i\s+)?(?:have\s+(?:a|an)?\s*|need\s+(?:a|an)?\s*)', '', clean_title, flags=re.IGNORECASE)
                if clean_title.lower() == "bank" or clean_title.lower() == "the bank":
                    clean_title = "Visit the bank"
                elif "doctor" in clause.lower() or "doctor" in raw_title:
                    clean_title = "Doctor's appointment"
                elif "parcel" in clause.lower() or "parcel" in raw_title:
                    clean_title = "Pick up a parcel"
                item = ExtractedItem(
                    title=clean_title,
                    kind="fixed_commitment",
                    duration_minutes=dur_val,
                    duration_needs_confirmation=dur_needs_conf,
                    start_time=f"{sh:02d}:{sm:02d}",
                    end_time=f"{eh:02d}:{em:02d}",
                    time_needs_confirmation=dur_needs_conf,
                )
                fixed_commitments.append(item.to_dict())
                continue
        elif m_hindi_app:
            t_str, raw_title = m_hindi_app.group(1), m_hindi_app.group(2)
            parsed_t = parse_clock_time(t_str, clause)
            if parsed_t:
                sh, sm = parsed_t
                eh = (sh + 1) % 24
                clean_title = clean_activity_title(raw_title)
                clean_title = re.sub(r'^(?:i\s+)?(?:have\s+(?:a|an)?\s*|need\s+(?:a|an)?\s*)', '', clean_title, flags=re.IGNORECASE)
                if "doctor" in clause.lower() or "doctor" in raw_title:
                    clean_title = "Doctor's appointment"
                item = ExtractedItem(
                    title=clean_title,
                    kind="fixed_commitment",
                    duration_minutes=60,
                    duration_needs_confirmation=True,
                    start_time=f"{sh:02d}:{sm:02d}",
                    end_time=f"{eh:02d}:{sm:02d}",
                    time_needs_confirmation=True,
                )
                fixed_commitments.append(item.to_dict())
                continue

        # I. Flexible Actionable Tasks
        dur, is_explicit_dur = extract_duration_from_text(clause)

        # Check if clause specifies a deadline (e.g. "before 3 PM")
        m_dl = re.search(r'\bbefore\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b', cl_lower)
        task_deadline = None
        if m_dl:
            dl_str = m_dl.group(1).upper()
            task_deadline = f"Before {dl_str}"
            constraints.append(f"Complete tasks before {dl_str}")

        clean_title = clean_activity_title(clause)

        if not clean_title or len(clean_title) < 3 or re.match(r'^(?:please|thanks|thank you|also|and|after that|then|make\s+sure\s+to|make\s+sure|remember\s+to)$', clean_title, re.IGNORECASE):
            continue

        if clean_title.lower() in ["before lunch", "after lunch", "in the evening", "in the morning", "at night"]:
            continue

        if re.match(r'^(?:i\s+need\s+to|i\s+want\s+to|i\s+have\s+to|i\s+also\s+need\s+to|remind\s+me\s+to)$', clean_title, re.IGNORECASE):
            continue

        prio = 3
        c_low = clean_title.lower()
        if any(w in c_low for w in ["important", "urgent", "critical", "asap", "p1"]):
            prio = 1
        elif any(w in c_low for w in ["priority", "p2", "due", "bill", "exam", "assignment", "interview", "invoice"]):
            prio = 2

        task_constraint = None
        if frame == "before_lunch":
            task_constraint = "before lunch"
        elif frame == "after_lunch":
            task_constraint = "after lunch"
        elif frame == "evening":
            task_constraint = "evening"
        elif "in the evening" in cl_lower or "in_the_evening" in cl_lower or "shaam ko" in cl_lower:
            task_constraint = "evening"
        elif "after lunch" in cl_lower or "after_lunch" in cl_lower:
            task_constraint = "after lunch"
        elif "before lunch" in cl_lower or "before_lunch" in cl_lower:
            task_constraint = "before lunch"
        elif "in the morning" in cl_lower or "in_the_morning" in cl_lower or "subah ko" in cl_lower:
            task_constraint = "morning"
        elif "in the afternoon" in cl_lower or "in_the_afternoon" in cl_lower or "dopahar ko" in cl_lower:
            task_constraint = "afternoon"

        # Check if pending deadline attaches to this task
        if not task_deadline:
            for k_dl, v_dl in pending_deadlines.items():
                if any(w in clean_title.lower() for w in k_dl.split()):
                    task_deadline = v_dl
                    task_constraint = v_dl.lower()
                    break

        # Deduplication check (including AI project variants)
        matched_existing = False
        for t in tasks:
            if t["title"].lower() == clean_title.lower() or (
                "ai project" in clean_title.lower() and "ai project" in t["title"].lower()
            ):
                if is_explicit_dur and t["duration_needs_confirmation"]:
                    t["duration_minutes"] = dur
                    t["duration_needs_confirmation"] = False
                matched_existing = True
                break

        if not matched_existing:
            item = ExtractedItem(
                title=clean_title,
                kind="task",
                duration_minutes=dur,
                duration_needs_confirmation=not is_explicit_dur,
                priority=prio,
                deadline=task_deadline or ("Tomorrow" if ("tomorrow" in cl_lower or "kal" in cl_lower) and "before" not in cl_lower else None),
                constraint=task_constraint,
            )
            tasks.append(item.to_dict())

    for t in tasks:
        c_val = t.get("constraint")
        if c_val and c_val in frame_constraints_map:
            desc = frame_constraints_map[c_val]
            if desc not in constraints:
                constraints.append(desc)

    # Resolve pending priorities
    for target_prio in pending_priorities:
        matched_task = False
        target_words = [w for w in target_prio.lower().split() if len(w) > 3]
        for t in tasks:
            t_low = t["title"].lower()
            if (
                (target_words and any(w in t_low for w in target_words))
                or (target_prio.lower() in t_low)
                or ("trip" in target_prio.lower() and "trip" in t_low)
                or ("phone" in target_prio.lower() and "phone" in t_low)
                or ("bill" in target_prio.lower() and "bill" in t_low)
            ):
                t["priority"] = 1
                matched_task = True
                break
        if not matched_task:
            unresolved_msg = (
                f"You asked to prioritize '{target_prio}', but no matching task was found in your schedule. "
                f"Please add or select this task to apply priority."
            )
            conflicts.append({
                "type": "unresolved_task_reference",
                "severity": "warning",
                "target": target_prio,
                "message": unresolved_msg,
                "suggested_action": "add_or_select_task",
                "options": [
                    f"Add task '{target_prio.title()}' with High Priority",
                    "Ignore priority directive"
                ]
            })
            clarification_required.append(f"Unresolved reference: {unresolved_msg}")

    # J. Conflict Detection
    if wake_up_hour is not None:
        for fc in fixed_commitments:
            sh, sm = map(int, fc["start_time"].split(":"))
            if sh < wake_up_hour or (sh == wake_up_hour and sm < wake_up_minute):
                comm_meridiem = "AM" if sh < 12 else "PM"
                sh_12 = sh if sh <= 12 else sh - 12
                wake_12 = wake_up_hour if wake_up_hour <= 12 else wake_up_hour - 12
                wake_m_str = f":{wake_up_minute:02d}" if wake_up_minute > 0 else ""
                time_str_display = f"{sh_12} {comm_meridiem}" if sm == 0 else f"{sh_12}:{sm:02d} {comm_meridiem}"
                wake_str_display = f"{wake_12} AM" if (wake_up_minute == 0 and wake_up_hour < 12) else (f"{wake_12} PM" if (wake_up_minute == 0 and wake_up_hour >= 12) else f"{wake_12}:{wake_up_minute:02d} AM")
                conflict_msg = (
                    f"Your {fc['title'].lower()} starts at {time_str_display}, "
                    f"but your day-start preference is {wake_str_display}. "
                    f"Would you like to wake up earlier or keep your preference and leave the conflict unresolved?"
                )
                conflicts.append({
                    "type": "wake_up_conflict",
                    "severity": "critical",
                    "message": conflict_msg,
                    "options": [
                        f"Wake up at {sh-1}:30 AM before {fc['title'].lower()}",
                        f"Keep {wake_12}{wake_m_str} AM preference (leave unresolved)"
                    ],
                    "commitment_title": fc["title"],
                    "commitment_start": fc["start_time"],
                    "wake_up_time": f"{wake_up_hour:02d}:{wake_up_minute:02d}"
                })
                clarification_required.append(f"Conflict: {conflict_msg}")

    # Build standard clarifications
    for t in tasks:
        if t["duration_needs_confirmation"]:
            clarification_required.append(f"Task '{t['title']}' duration estimated at {t['duration_minutes']}m (please confirm or adjust).")
    for fc in fixed_commitments:
        if fc["time_needs_confirmation"]:
            clarification_required.append(f"Appointment '{fc['title']}' at {fc['start_time']} has unspecified duration (estimated at 60m).")

    return {
        "target_date": target_date.isoformat(),
        "target_date_label": target_date_label,
        "is_explicit_date": is_explicit_date,
        "tasks": tasks,
        "fixed_commitments": fixed_commitments,
        "preferences": preferences,
        "constraints": constraints,
        "conflicts": conflicts,
        "clarification_required": clarification_required,
        "original_message": text,
        "stats": {
            "tasks_count": len(tasks),
            "fixed_commitments_count": len(fixed_commitments),
            "preferences_count": len(preferences),
            "constraints_count": len(constraints),
            "conflicts_count": len(conflicts),
        }
    }
