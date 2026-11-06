"""Keep the suite off live DNS. Tests that resolve pass an injected lookup."""

import socket

def _refuse_live_dns(*args, **kwargs):
    raise AssertionError("live DNS is disabled in tests")


socket.getaddrinfo = _refuse_live_dns
