| run | DPR | ring-relative (this card) | strongest-difference | fixed delta (> 20) |
|---|---|---|---|---|
| flat surface, full ring | 1 | 163/163 painted, 0 partly -> PASSES | 163/163 painted, 0 partly | 163/163 painted |
| flat surface, 1px slit, integer offset | 1 | 162/163 painted, 0 partly -> FAILS as coverage | 162/163 painted, 0 partly | 162/163 painted |
| flat surface, 1px slit, .25px offset | 1 | 161/163 painted, 2 partly -> FAILS as coverage | 161/163 painted, 2 partly | 163/163 painted |
| flat surface, 1px slit, .5px offset | 1 | 161/163 painted, 2 partly -> FAILS as coverage | 161/163 painted, 2 partly | 163/163 painted |
| flat surface, 1px slit, .75px offset | 1 | 161/163 painted, 2 partly -> FAILS as coverage | 161/163 painted, 2 partly | 163/163 painted |
| flat surface, 2px slit | 1 | 161/163 painted, 0 partly -> FAILS as coverage | 161/163 painted, 0 partly | 161/163 painted |
| flat surface, 5px slit (the old 97% control) | 1 | 158/163 painted, 0 partly -> FAILS as coverage | 158/163 painted, 0 partly | 158/163 painted |
| flat surface, 3% notch | 1 | 158/163 painted, 0 partly -> FAILS as coverage | 158/163 painted, 0 partly | 158/163 painted |
| flat surface, full ring at DPR 1.25 | 1.25 | 203/203 painted, 0 partly -> PASSES | 203/203 painted, 0 partly | 203/203 painted |
| flat surface, 1px slit at DPR 1.25, integer offset | 1.25 | 201/203 painted, 1 partly -> FAILS as coverage | 201/203 painted, 1 partly | 202/203 painted |
| flat surface, 1px slit at DPR 1.25, .5px offset | 1.25 | 201/203 painted, 2 partly -> FAILS as coverage | 201/203 painted, 2 partly | 203/203 painted |
| flat surface, 3% notch at DPR 1.25 | 1.25 | 196/203 painted, 2 partly -> FAILS as coverage | 196/203 painted, 2 partly | 198/203 painted |
| gradient surface, full ring | 1 | 163/163 painted, 0 partly -> PASSES | 163/163 painted, 0 partly | 163/163 painted |
| gradient surface, 1px slit | 1 | 162/163 painted, 0 partly -> FAILS as coverage | 162/163 painted, 0 partly | 162/163 painted |
| gradient surface, full ring at DPR 1.25 | 1.25 | 203/203 painted, 0 partly -> PASSES | 203/203 painted, 0 partly | 203/203 painted |
