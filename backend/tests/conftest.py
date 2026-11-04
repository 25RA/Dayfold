import pytest
from app.core.distributed_store import distributed_store
from app.core.rate_limit import limiter


@pytest.fixture(autouse=True)
def isolate_rate_limits():
    """Isolate rate limiting counters between test cases."""
    with distributed_store._in_memory._lock:
        distributed_store._in_memory._rate_limits.clear()
    with limiter._lock:
        limiter._records.clear()
    yield
    with distributed_store._in_memory._lock:
        distributed_store._in_memory._rate_limits.clear()
    with limiter._lock:
        limiter._records.clear()
