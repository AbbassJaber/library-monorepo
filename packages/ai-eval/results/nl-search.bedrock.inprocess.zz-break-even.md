### Cache padding break-even

Compact prompt: $0.00339 per query (p95 1980 ms). Padded prompt: $0.00749 for a query that writes the cache, $0.00166 for a query that reads it (p95 2460 ms).

Padding is cheaper from the **4th search in a 5-minute cache window** (each cache hit renews the window).
