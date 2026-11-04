"""
Regression tests for timezone-aware API datetime inputs.

Ensures that:
1. Valid UTC timestamps (e.g. ending in 'Z' or '+00:00') are accepted.
2. Valid timestamps with non-UTC offsets (e.g. '+05:30', '-08:00') are accepted with exact instant and offset preserved.
3. Naive timestamps lacking timezone offsets are rejected with a clear validation error.
4. None/null values are accepted for optional fields.

Targeted fields:
- TaskCreate.deadline_at
- TaskUpdate.deadline_at
- ProjectCreate.target_date
- ProjectUpdate.target_date
"""
from datetime import datetime, timezone, timedelta
import pytest
from pydantic import ValidationError

from app.api.routes.tasks import TaskCreate, TaskUpdate
from app.api.routes.projects import ProjectCreate, ProjectUpdate
from app.core.datetime_utils import validate_timezone_aware


@pytest.mark.parametrize(
    "model_cls,field_name,base_kwargs",
    [
        (TaskCreate, "deadline_at", {"title": "Test Task"}),
        (TaskUpdate, "deadline_at", {}),
        (ProjectCreate, "target_date", {"name": "Test Project"}),
        (ProjectUpdate, "target_date", {}),
    ],
)
class TestTimezoneAwareInputs:
    def test_valid_utc_timestamp_accepted(self, model_cls, field_name, base_kwargs):
        """ISO-8601 UTC timestamp with 'Z' is accepted and produces UTC-aware datetime."""
        payload = {**base_kwargs, field_name: "2026-11-04T18:00:00Z"}
        obj = model_cls(**payload)
        val = getattr(obj, field_name)
        assert isinstance(val, datetime)
        assert val.tzinfo is not None
        assert val.utcoffset() == timedelta(0)
        assert val == datetime(2026, 11, 4, 18, 0, tzinfo=timezone.utc)

    def test_valid_utc_offset_timestamp_accepted(self, model_cls, field_name, base_kwargs):
        """ISO-8601 UTC timestamp with explicit '+00:00' is accepted."""
        payload = {**base_kwargs, field_name: "2026-11-04T18:00:00+00:00"}
        obj = model_cls(**payload)
        val = getattr(obj, field_name)
        assert isinstance(val, datetime)
        assert val.tzinfo is not None
        assert val.utcoffset() == timedelta(0)
        assert val == datetime(2026, 11, 4, 18, 0, tzinfo=timezone.utc)

    def test_valid_non_utc_offset_timestamp_accepted_and_preserved(self, model_cls, field_name, base_kwargs):
        """Timestamps with non-UTC offsets (+05:30, -08:00) are accepted and preserve offset."""
        # IST (+05:30)
        payload_ist = {**base_kwargs, field_name: "2026-11-04T18:00:00+05:30"}
        obj_ist = model_cls(**payload_ist)
        val_ist = getattr(obj_ist, field_name)
        assert isinstance(val_ist, datetime)
        assert val_ist.tzinfo is not None
        assert val_ist.utcoffset() == timedelta(hours=5, minutes=30)
        # Instant corresponds to 12:30:00 UTC
        assert val_ist.astimezone(timezone.utc) == datetime(2026, 11, 4, 12, 30, tzinfo=timezone.utc)

        # PST (-08:00)
        payload_pst = {**base_kwargs, field_name: "2026-11-04T18:00:00-08:00"}
        obj_pst = model_cls(**payload_pst)
        val_pst = getattr(obj_pst, field_name)
        assert isinstance(val_pst, datetime)
        assert val_pst.tzinfo is not None
        assert val_pst.utcoffset() == timedelta(hours=-8)
        # Instant corresponds to 2026-11-05 02:00:00 UTC
        assert val_pst.astimezone(timezone.utc) == datetime(2026, 11, 5, 2, 0, tzinfo=timezone.utc)

    def test_naive_timestamp_rejected_with_validation_error(self, model_cls, field_name, base_kwargs):
        """Naive timestamp without timezone is rejected with explicit Pydantic ValidationError."""
        payload = {**base_kwargs, field_name: "2026-11-04T18:00:00"}
        with pytest.raises(ValidationError) as exc_info:
            model_cls(**payload)

        errors = exc_info.value.errors()
        assert len(errors) == 1
        err = errors[0]
        assert err["loc"] == (field_name,)
        assert "Timestamp must include an explicit timezone" in err["msg"]
        assert err["type"] == "value_error"

    def test_null_accepted_for_optional_field(self, model_cls, field_name, base_kwargs):
        """Explicit None/null is accepted for optional datetime fields."""
        payload = {**base_kwargs, field_name: None}
        obj = model_cls(**payload)
        assert getattr(obj, field_name) is None

    def test_omitted_field_defaults_to_none(self, model_cls, field_name, base_kwargs):
        """Omitted field defaults to None."""
        obj = model_cls(**base_kwargs)
        assert getattr(obj, field_name) is None


def test_validate_timezone_aware_direct_unit():
    """Unit test for validate_timezone_aware helper function directly."""
    # None
    assert validate_timezone_aware(None) is None

    # UTC aware
    now_utc = datetime.now(timezone.utc)
    assert validate_timezone_aware(now_utc) is now_utc

    # Custom offset aware
    tz_ist = timezone(timedelta(hours=5, minutes=30))
    now_ist = datetime.now(tz_ist)
    assert validate_timezone_aware(now_ist) is now_ist

    # Naive datetime
    naive = datetime(2026, 11, 4, 18, 0, 0)
    with pytest.raises(ValueError, match="Timestamp must include an explicit timezone"):
        validate_timezone_aware(naive)
