# Source-host DNS smoke

Not part of pytest. `tests/conftest.py` makes `socket.getaddrinfo` raise for the whole suite. A manual check, on a resolver that is not an intercepting benchmark network, is:

```sh
python3 -c 'from hackertube_core.http import connection_targets
for host in ("hn.algolia.com","itunes.apple.com","openlibrary.org","librivox.org"):
    print(host, connection_targets(host))'
```

Record the printed addresses with the date. Do not treat a sandbox answer in `198.18.0.0/15` as a pass.
