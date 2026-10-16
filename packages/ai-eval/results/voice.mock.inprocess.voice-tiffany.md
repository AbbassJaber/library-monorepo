### voice — mock (mock-voice), voice tiffany, inprocess

| cases | tool calls right | right tools | pending action | nothing written | barge-in | recovers | first audio p50 | p95 | spoken answer p50 | p95 | cost / request |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 21 | 47.6 % | 66.7 % | 81.0 % | 100.0 % | 0.0 % | 0.0 % | 33 ms | 36 ms | 78 ms | 82 ms | $0.00000 |

Each request is a WAV streamed at real-time pace into a full session over the seed catalog. "Tool calls right": the expected tools ran (or none, or not the forbidden one) and the session proposed exactly the expected change (key arguments) or none, and after a refused ISBN it asked again or offered a title search ("recovers"). First audio: from the model's own end-of-speech mark to the first audio of the answer. Tokens: speech 1354 in / 210 out, text 11532 / 282. Total $0.0000 · 0 errors.

<details><summary>Requests that missed</summary>

| case | heard | tools | pending | answer |
| --- | --- | --- | --- | --- |
| v-03 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |
| v-04 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |
| v-06 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |
| v-07 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |
| v-09 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |
| v-11 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |
| v-13 | des livres de tolkien | searchBooks {"q":"tolkien","limit":5} | — | J'ai trouvé The Fellowship of the Ring et The Hobbit. |
| v-15 | des livres de tolkien | searchBooks {"q":"tolkien","limit":5} | — | J'ai trouvé The Fellowship of the Ring et The Hobbit. |
| v-16 | des livres de tolkien | searchBooks {"q":"tolkien","limit":5} | — | J'ai trouvé The Fellowship of the Ring et The Hobbit. |
| v-17 | des livres de tolkien | searchBooks {"q":"tolkien","limit":5} | — | J'ai trouvé The Fellowship of the Ring et The Hobbit. |
| v-18 | des livres de tolkien | searchBooks {"q":"tolkien","limit":5} | — | J'ai trouvé The Fellowship of the Ring et The Hobbit. |
| v-21 | books by tolkien | searchBooks {"q":"tolkien","limit":5} | — | I found The Fellowship of the Ring and The Hobbit. |

</details>
