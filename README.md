# atom-folding
A service to add custom folding rules to Atom

This package overrides core folding methods, but never modifies / deletes text itself (providers are separate packages and their behaviour is not guaranteeded by this statement). All changes are visual and will be reset if the tab is closed. Having said that, please always make a backup of your files.

### Featured providers
- `latex-folding`
- `folding-markdown`
