from __future__ import annotations
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator
import re

DATE_REGEX = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class DailyReflectionCreate(BaseModel):
    target_date: str = Field(..., description="Local calendar date in YYYY-MM-DD format")
    went_well: str = Field(..., min_length=1, description="What went well today?")
    remained_unfinished: str = Field(..., min_length=1, description="What remained unfinished?")
    do_differently: str = Field(..., min_length=1, description="What would you do differently tomorrow?")
    additional_notes: Optional[str] = Field(None, description="Optional extra thoughts or notes")
    voice_used: bool = Field(False, description="Whether voice dictation was used")

    @field_validator("target_date")
    @classmethod
    def validate_target_date(cls, v: str) -> str:
        if not DATE_REGEX.match(v):
            raise ValueError("target_date must be in YYYY-MM-DD format")
        return v


class DailyReflectionUpdate(BaseModel):
    went_well: Optional[str] = Field(None, min_length=1)
    remained_unfinished: Optional[str] = Field(None, min_length=1)
    do_differently: Optional[str] = Field(None, min_length=1)
    additional_notes: Optional[str] = None
    voice_used: Optional[bool] = None


class DailyReflectionOut(BaseModel):
    id: str
    user_id: str
    target_date: str
    went_well: str
    remained_unfinished: str
    do_differently: str
    additional_notes: Optional[str] = None
    voice_used: bool = False
    created_at: str
    updated_at: str


class WeeklyReviewOut(BaseModel):
    start_date: str
    end_date: str
    reflections_count: int
    has_sufficient_data: bool
    message: Optional[str] = None
    accomplishments: List[str] = Field(default_factory=list)
    recurring_challenges: List[str] = Field(default_factory=list)
    key_learnings: List[str] = Field(default_factory=list)
    supporting_dates: List[str] = Field(default_factory=list)


class PatternCitation(BaseModel):
    date: str
    quote_or_summary: str


class PatternItem(BaseModel):
    theme: str
    category: str
    observation: str
    evidence_citations: List[PatternCitation] = Field(default_factory=list)
    frequency_count: int
    takeaway: Optional[str] = None


class PatternDiscoveryOut(BaseModel):
    reflections_analyzed_count: int
    has_sufficient_data: bool
    message: Optional[str] = None
    patterns: List[PatternItem] = Field(default_factory=list)

