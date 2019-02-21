# atom-folding
A service to add custom folding rules to Atom

This package overrides core folding methods, but never modifies / deletes text itself (providers are separate packages and their behaviour is not guaranteeded by this statement). All changes are visual and will be reset if the tab is closed. Having said that, please always make a backup of your files.

## Featured providers
- `latex-folding`
- `folding-markdown`

## API
Still in development, but this is how it currently works. A provider must be an object with the following interface (TypeScript). Note that the methods are called by Atom, not this package. All this package does is replace the existing methods on the editor's languagemode.

```ts
interface FoldProvider {
  allowDefaultFolds?: boolean; // if your method returns a falsey result, the original method will be tried
  isFoldableAtRow (params: IsFoldableParams): boolean; // called a lot; used to add the fold carets to the gutter
  getFoldableRangeContainingPoint (params: GetPointFoldableParams): Range | undefined;
  getFoldableRangesAtIndentLevel (params: GetIndentFoldableParams): Range[] | undefined;
  destroy? (): void; // use this to clean up any subscriptions. Note it will be called multiple times if you have the same provider for multiple root scopes
}
```
