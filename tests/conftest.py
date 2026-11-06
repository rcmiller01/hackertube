"""Keep the suite off live DNS. Tests that resolve pass an injected lookup.

The outbound ledger is process-wide, so it is reset around every test: a
test that inherited another test's request counts could not tell "no
request was made" from "a request was made earlier".
"""

import socket

import pytest


def _refuse_live_dns(*args, **kwargs):
    raise AssertionError("live DNS is disabled in tests")


socket.getaddrinfo = _refuse_live_dns


@pytest.fixture(autouse=True)
def _reset_request_ledger():
    from hackertube_core import outbound

    outbound.reset()
    yield
    outbound.reset()
