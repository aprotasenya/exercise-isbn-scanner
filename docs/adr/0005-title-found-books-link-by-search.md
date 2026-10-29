# A book found by title gets search links, not ISBN links

A title typed into the field is looked up through the worker (`/search`, then `/book`). The picked edition's ISBN may not be the edition in hand, and Ereadian's search misses a book when an author is spelled differently there. So the site links search instead: Ereadian by the title alone, Goodreads by the title and author (both from the candidate). A later search or scan by that ISBN goes back to ISBN links.
