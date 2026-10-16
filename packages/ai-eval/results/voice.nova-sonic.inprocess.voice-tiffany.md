### voice — nova-sonic (amazon.nova-2-sonic-v1:0), voice tiffany, inprocess

| cases | tool calls right | right tools | pending action | nothing written | barge-in | recovers | first audio p50 | p95 | spoken answer p50 | p95 | cost / request |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 21 | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 100.0 % | 2302 ms | 3671 ms | 8809 ms | 16387 ms | $0.00638 |

Each request is a WAV streamed at real-time pace into a full session over the seed catalog. "Tool calls right": the expected tools ran (or none, or not the forbidden one) and the session proposed exactly the expected change (key arguments) or none, and after a refused ISBN it asked again or offered a title search ("recovers"). First audio: from the model's own end-of-speech mark to the first audio of the answer. Tokens: speech 5403 in / 8740 out, text 19857 / 3092. Total $0.1340 · 0 errors.
