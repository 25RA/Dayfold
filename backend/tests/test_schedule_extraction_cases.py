"""
Tests for Natural Language Schedule Extraction (Cases A through H and Extended Scenarios).
Verifies deterministic extraction of fixed commitments, flexible tasks,
relative constraints, durations, midnight crossing, and Hinglish phrases.
"""

from datetime import datetime, timezone
import pytest
from app.services.agent.extractor import extract_structured_plan_data


def test_case_a_single_time_appointment():
    """Case A: 'Class at 5pm' -> 1 commitment, 0 tasks, 60m default duration."""
    res = extract_structured_plan_data("Class at 5pm")
    assert len(res["fixed_commitments"]) == 1
    assert len(res["tasks"]) == 0
    fc = res["fixed_commitments"][0]
    assert "class" in fc["title"].lower()
    assert fc["start_time"] == "17:00"
    assert fc["duration_minutes"] == 60


def test_case_b_explicit_window():
    """Case B: 'Class from 5pm to 6pm' -> 1 commitment, 17:00-18:00, 60m."""
    res = extract_structured_plan_data("Class from 5pm to 6pm")
    assert len(res["fixed_commitments"]) == 1
    assert len(res["tasks"]) == 0
    fc = res["fixed_commitments"][0]
    assert "class" in fc["title"].lower()
    assert fc["start_time"] == "17:00"
    assert fc["end_time"] == "18:00"
    assert fc["duration_minutes"] == 60


def test_case_c_time_with_duration():
    """Case C: 'Class at 5pm for 90 minutes' -> 1 commitment, 17:00-18:30, 90m."""
    res = extract_structured_plan_data("Class at 5pm for 90 minutes")
    assert len(res["fixed_commitments"]) == 1
    assert len(res["tasks"]) == 0
    fc = res["fixed_commitments"][0]
    assert "class" in fc["title"].lower()
    assert fc["start_time"] == "17:00"
    assert fc["end_time"] == "18:30"
    assert fc["duration_minutes"] == 90


def test_case_d_relative_day_until_noon():
    """Case D: 'Meeting tomorrow at 10:30am until noon' -> 1 commitment, 10:30-12:00, 90m, target date = tomorrow."""
    ref_dt = datetime(2026, 11, 1, 9, 0, 0, tzinfo=timezone.utc)
    res = extract_structured_plan_data("Meeting tomorrow at 10:30am until noon", reference_dt=ref_dt)
    assert res["target_date"] == "2026-11-02"
    assert len(res["fixed_commitments"]) == 1
    assert len(res["tasks"]) == 0
    fc = res["fixed_commitments"][0]
    assert "meeting" in fc["title"].lower()
    assert fc["start_time"] == "10:30"
    assert fc["end_time"] == "12:00"
    assert fc["duration_minutes"] == 90


def test_case_e_sequential_commitment_and_task():
    """Case E: 'Lab from 2pm to 4pm and study DBMS after that' -> 1 commitment (Lab, 120m), 1 task (Study DBMS, after lab)."""
    res = extract_structured_plan_data("Lab from 2pm to 4pm and study DBMS after that")
    assert len(res["fixed_commitments"]) == 1
    assert len(res["tasks"]) == 1
    fc = res["fixed_commitments"][0]
    assert "lab" in fc["title"].lower()
    assert fc["start_time"] == "14:00"
    assert fc["end_time"] == "16:00"
    assert fc["duration_minutes"] == 120

    tk = res["tasks"][0]
    assert "dbms" in tk["title"].lower()
    assert tk.get("constraint") == "after lab"
    assert any("after lab" in c.lower() for c in res["constraints"])


def test_case_f_chained_commitments():
    """Case F: 'I have class at 5pm, then gym at 7pm' -> 2 commitments (17:00, 19:00), 0 tasks."""
    res = extract_structured_plan_data("I have class at 5pm, then gym at 7pm")
    assert len(res["fixed_commitments"]) == 2
    assert len(res["tasks"]) == 0
    c_times = {fc["title"].lower(): fc["start_time"] for fc in res["fixed_commitments"]}
    assert any("class" in k and v == "17:00" for k, v in c_times.items())
    assert any("gym" in k and v == "19:00" for k, v in c_times.items())


def test_case_g_multi_task_temporal_frame():
    """Case G: 'Schedule reading, exercise and studying after lunch' -> 3 tasks with after-lunch constraint, 0 commitments."""
    res = extract_structured_plan_data("Schedule reading, exercise and studying after lunch")
    assert len(res["fixed_commitments"]) == 0
    assert len(res["tasks"]) == 3
    for t in res["tasks"]:
        assert t["constraint"] == "after lunch"
    assert any("after lunch" in c.lower() for c in res["constraints"])
    titles = [t["title"].lower() for t in res["tasks"]]
    assert any("read" in t for t in titles)
    assert any("exercise" in t for t in titles)
    assert any("study" in t for t in titles)


def test_case_h_hinglish_variations():
    """Case H: Hinglish expressions for appointments, time windows, and after-lunch study."""
    ref_dt = datetime(2026, 11, 1, 9, 0, 0, tzinfo=timezone.utc)

    # H1: Kal 5 baje class hai
    res1 = extract_structured_plan_data("Kal 5 baje class hai", reference_dt=ref_dt)
    assert res1["target_date"] == "2026-11-02"
    assert len(res1["fixed_commitments"]) == 1
    assert "class" in res1["fixed_commitments"][0]["title"].lower()
    assert res1["fixed_commitments"][0]["start_time"] == "17:00"

    # H2: 5 baje se 6 baje tak meeting hai
    res2 = extract_structured_plan_data("5 baje se 6 baje tak meeting hai", reference_dt=ref_dt)
    assert len(res2["fixed_commitments"]) == 1
    fc2 = res2["fixed_commitments"][0]
    assert "meeting" in fc2["title"].lower()
    assert fc2["start_time"] == "17:00"
    assert fc2["end_time"] == "18:00"
    assert fc2["duration_minutes"] == 60

    # H3: Lunch ke baad DBMS padhna hai
    res3 = extract_structured_plan_data("Lunch ke baad DBMS padhna hai", reference_dt=ref_dt)
    assert len(res3["tasks"]) == 1
    tk3 = res3["tasks"][0]
    assert "dbms" in tk3["title"].lower()
    assert tk3["constraint"] == "after lunch"
    assert any("after lunch" in c.lower() for c in res3["constraints"])


def test_extended_cases_class_at_5_and_evening():
    """Test 'Class at 5' and 'Class at 5 in the evening' both resolve to 17:00."""
    res1 = extract_structured_plan_data("Class at 5")
    assert len(res1["fixed_commitments"]) == 1
    assert res1["fixed_commitments"][0]["start_time"] == "17:00"

    res2 = extract_structured_plan_data("Class at 5 in the evening")
    assert len(res2["fixed_commitments"]) == 1
    assert res2["fixed_commitments"][0]["start_time"] == "17:00"


def test_extended_cases_noon_and_midnight():
    """Test 'Meeting at noon' -> 12:00, 'Meeting at midnight' -> 00:00."""
    res_noon = extract_structured_plan_data("Meeting at noon")
    assert len(res_noon["fixed_commitments"]) == 1
    assert res_noon["fixed_commitments"][0]["start_time"] == "12:00"
    assert res_noon["fixed_commitments"][0]["end_time"] == "13:00"

    res_mid = extract_structured_plan_data("Meeting at midnight")
    assert len(res_mid["fixed_commitments"]) == 1
    assert res_mid["fixed_commitments"][0]["start_time"] == "00:00"
    assert res_mid["fixed_commitments"][0]["end_time"] == "01:00"


def test_extended_case_study_afterwards():
    """Test 'I have a call at 5pm and need to study afterwards'."""
    res = extract_structured_plan_data("I have a call at 5pm and need to study afterwards")
    assert len(res["fixed_commitments"]) == 1
    assert res["fixed_commitments"][0]["start_time"] == "17:00"
    assert len(res["tasks"]) == 1
    assert "study" in res["tasks"][0]["title"].lower()
    assert res["tasks"][0]["constraint"] == "after call"


def test_extended_case_schedule_multiple_commitments():
    """Test 'Schedule gym at 7pm and dinner at 8pm'."""
    res = extract_structured_plan_data("Schedule gym at 7pm and dinner at 8pm")
    assert len(res["fixed_commitments"]) == 2
    titles = [fc["title"].lower() for fc in res["fixed_commitments"]]
    assert any("gym" in t for t in titles)
    assert any("dinner" in t for t in titles)
    assert res["fixed_commitments"][0]["start_time"] == "19:00"
    assert res["fixed_commitments"][1]["start_time"] == "20:00"


def test_extended_case_duration_crosses_midnight():
    """Test 'Party from 10pm to 2am' correctly calculates 240m duration across midnight."""
    res = extract_structured_plan_data("Party from 10pm to 2am")
    assert len(res["fixed_commitments"]) == 1
    fc = res["fixed_commitments"][0]
    assert fc["start_time"] == "22:00"
    assert fc["end_time"] == "02:00"
    assert fc["duration_minutes"] == 240


def test_extended_case_am_pm_disambiguation():
    """Test AM vs PM disambiguation: 9am -> 09:00, 9pm -> 21:00."""
    res_am = extract_structured_plan_data("Standup at 9am")
    assert res_am["fixed_commitments"][0]["start_time"] == "09:00"

    res_pm = extract_structured_plan_data("Standup at 9pm")
    assert res_pm["fixed_commitments"][0]["start_time"] == "21:00"
