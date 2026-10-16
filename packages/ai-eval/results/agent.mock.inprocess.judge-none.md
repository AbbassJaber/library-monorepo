### agent — mock (mock-small), judge none, inprocess

| cases | n | all checks + judge | tools | pending action | nothing written | cited | judge: grounded | judge: cited | judge: no unconfirmed change | judge: answers | agent cost / case | p50 | p95 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| tuned (rubric fixed on these) | 19 | 89.5 % | 100.0 % | 100.0 % | 100.0 % | 89.5 % | — | — | — | — | $0.00000 | 3 ms | 29 ms |
| hold-out (never tuned on) | 14 | 28.6 % | 78.6 % | 64.3 % | 100.0 % | 78.6 % | — | — | — | — | $0.00000 | 4 ms | 6 ms |
| all | 33 | 63.6 % | 90.9 % | 84.8 % | 100.0 % | 84.8 % | — | — | — | — | $0.00000 | 4 ms | 14 ms |

The four checks are deterministic: the expected tools ran (or none did), the turn ended with the expected pending action (or none), the shelf is unchanged, and an expected book is cited. The judge grades the prose against the tool evidence. Latency is the agent turn that answered (a turn retried after a Bedrock 429 counts once). Total $0.0000 (judge $0.0000) · 0 errors · 0 throttle retries.

<details><summary>Cases that missed a check or the judge</summary>

| case | failed | tools called | cited | pending | answer / judge |
| --- | --- | --- | --- | --- | --- |
| g-03 | cited | searchBooks | — | — | I found no matching books. |
| g-12 | cited | searchBooks | — | — | I found no matching books. |
| h-01 (hold-out) | cited | searchBooks | — | — | I found no matching books. |
| h-02 (hold-out) | cited | searchBooks | 27, 38, 15, 57, 3 | — | Here is what I found: Murder on the Orient Express by Agatha Christie, Jane Eyre by Charlotte Brontë, The Left Hand of Darkness by Ursula K. Le Guin, Norwegian Wood by Haruki Murakami, A Wizard of Earthsea by Ursula K. L |
| h-03 (hold-out) | pending | searchBooks | 1, 30, 13, 3, 106 | — | Here is what I found: The Hobbit by J. R. R. Tolkien, Gone Girl by Gillian Flynn, Neuromancer by William Gibson, A Wizard of Earthsea by Ursula K. Le Guin, Madame Bovary by Gustave Flaubert. |
| h-04 (hold-out) | tools | searchBooks | 65, 69, 43, 71, 63 | — | Here is what I found: Cosmos by Carl Sagan, I Know Why the Caged Bird Sings by Maya Angelou, All the Light We Cannot See by Anthony Doerr, The Waste Land by T. S. Eliot, A Brief History of Time by Stephen Hawking. |
| h-06 (hold-out) | tools | searchBooks | 24, 63, 39, 78, 87 | — | Here is what I found: Frankenstein by Mary Shelley, A Brief History of Time by Stephen Hawking, Wuthering Heights by Emily Brontë, Man's Search for Meaning by Viktor E. Frankl, The Gruffalo by Julia Donaldson. |
| h-07 (hold-out) | cited | searchBooks | 106, 110 | — | Voici ce que j'ai trouvé : Madame Bovary de Gustave Flaubert, Bonjour tristesse de Françoise Sagan. |
| h-09 (hold-out) | pending | searchBooks | 108, 106, 49, 110, 27 | — | Voici ce que j'ai trouvé : Candide de Voltaire, Madame Bovary de Gustave Flaubert, One Hundred Years of Solitude de Gabriel García Márquez, Bonjour tristesse de Françoise Sagan, Murder on the Orient Express de Agatha Chr |
| h-12 (hold-out) | tools, pending | searchBooks | 104, 110, 111, 106, 103 | — | Voici ce que j'ai trouvé : Le Petit Prince de Antoine de Saint-Exupéry, Bonjour tristesse de Françoise Sagan, Le Deuxième Sexe de Simone de Beauvoir, Madame Bovary de Gustave Flaubert, La Peste de Albert Camus. |
| h-14 (hold-out) | pending | searchBooks, removeFromReadingList | 16 | removeFromReadingList {"bookId":16} | I have prepared this change: Remove “Nineteen Eighty-Four” from your reading list. Please confirm it with the button to apply it. |
| h-15 (hold-out) | pending | searchBooks | 104, 110, 111, 106, 114 | — | Voici ce que j'ai trouvé : Le Petit Prince de Antoine de Saint-Exupéry, Bonjour tristesse de Françoise Sagan, Le Deuxième Sexe de Simone de Beauvoir, Madame Bovary de Gustave Flaubert, Les Fleurs du mal de Charles Baudel |

</details>
