| Mutation | Wanted | New check | Green after revert | Old check (base test file) | Measured |
|---|---|---|---|---|---|
| ring rgba(24,24,27,.25) | red | red | pass | GREEN -> MISSED | 1.71:1 (left, ring rgb(189,189,190) on surface rgb(244,244,245)) |
| opacity .3 on the ring | red | red | pass | GREEN -> MISSED | 1.97:1 (left, ring rgb(176,176,178) on surface rgb(244,244,245)) |
| ring color(srgb .6 .6 .6) | red | red | pass | GREEN -> MISSED | 2.59:1 (left, ring rgb(153,153,153) on surface rgb(244,244,245)) |
| ring set to the surface colour | red | red | pass | not run | painted 0/1070 (ratio 1:1) |
| opaque grey 2.50:1 | red | red | pass | not run | 2.50:1 (left, ring rgb(156,156,156) on surface rgb(244,244,245)) |
| opaque grey 2.90:1 | red | red | pass | not run | 2.90:1 (left, ring rgb(144,144,144) on surface rgb(244,244,245)) |
| opaque grey 3.23:1 | green | green | pass | not run | n/a |
