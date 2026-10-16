### voice — nova-sonic (amazon.nova-2-sonic-v1:0), voice tiffany, inprocess

| cases | tool calls right | right tools | pending action | nothing written | barge-in | first audio p50 | p95 | spoken answer p50 | p95 | cost / request |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 20 | 95.0 % | 95.0 % | 100.0 % | 100.0 % | 100.0 % | 2216 ms | 2978 ms | 7957 ms | 14534 ms | $0.00530 |

Each request is a WAV streamed at real-time pace into a full session over the seed catalog. "Tool calls right": the expected tools ran (or none, or not the forbidden one) and the session proposed exactly the expected change (key arguments) or none. First audio: from the model's own end-of-speech mark to the first audio of the answer. Tokens: speech 5064 in / 6648 out, text 15823 / 2703. Total $0.1060 · 0 errors.

<details><summary>Requests that missed</summary>

| case | heard | tools | pending | answer |
| --- | --- | --- | --- | --- |
| v-09 | draft a catalog entry for the isbn nine seven eight zero four four one one seven two seven one nine | draftBook (error) | — | Sorry, I could not draft the book. The ISBN you gave is not valid. Please check it and try again. |

</details>
