import { Point, Range, CompositeDisposable, TextEditor } from "atom";

interface IsFoldableParams {
  row: number;
  editor: TextEditor;
}

interface GetPointFoldableParams {
  point: Point;
  tabLength: number;
  editor: TextEditor;
}

interface GetIndentFoldableParams {
  level: number;
  tabLength: number;
  editor: TextEditor;
}

interface FoldProvider {
  isFoldableAtRow (params: IsFoldableParams): boolean;
  getFoldableRangeContainingPoint (params: GetPointFoldableParams): Range[];
  getFoldableRangesAtIndentLevel (params: GetIndentFoldableParams): Range[];
}

interface LanguageModeFoldMethods {
  isFoldableAtRow (row: number): boolean;
  getFoldableRangeContainingPoint (point: Point, tabLength: number): Range[];
  getFoldableRangesAtIndentLevel (level: number, tabLength: number): Range[];
}

class EditorData {
  editor: TextEditor;
  usingCustomFolds: boolean;
  subscriptions: CompositeDisposable;
  originalFoldMethods: LanguageModeFoldMethods | undefined;

  constructor (editor: TextEditor) {
    this.editor = editor;
    this.usingCustomFolds = false;
    this.subscriptions = new CompositeDisposable();
    this.updateOriginalFoldMethods();
  }

  updateOriginalFoldMethods () {
    const languageMode = (this.editor as any).languageMode;

    if (this.originalFoldMethods !== undefined && this.usingCustomFolds && languageMode.isFoldableAtRow === this.originalFoldMethods.isFoldableAtRow) {
      console.error("[atom-folding] Unexpected: Custom rules should not be in place; aborting");
      return;
    }

    this.originalFoldMethods = {
      isFoldableAtRow: languageMode.isFoldableAtRow,
      getFoldableRangeContainingPoint: languageMode.isFoldableAtRow,
      getFoldableRangesAtIndentLevel: languageMode.isFoldableAtRow
    };

    this.usingCustomFolds = false;
  }

  restoreOriginalFolds () {
    if (!this.usingCustomFolds || this.originalFoldMethods === undefined) return;

    const languageMode = (this.editor as any).languageMode;
    languageMode.isFoldableAtRow = this.originalFoldMethods.isFoldableAtRow;
    languageMode.getFoldableRangeContainingPoint = this.originalFoldMethods.getFoldableRangeContainingPoint;
    languageMode.getFoldableRangesAtIndentLevel = this.originalFoldMethods.getFoldableRangesAtIndentLevel;

    this.usingCustomFolds = false;
  }

  applyCustomFoldsProvider (provider: FoldProvider) {
    if (!this.usingCustomFolds) this.updateOriginalFoldMethods();

    const languageMode = (this.editor as any).languageMode;
    languageMode.isFoldableAtRow = provider.isFoldableAtRow;
    languageMode.getFoldableRangeContainingPoint = provider.getFoldableRangeContainingPoint;
    languageMode.getFoldableRangesAtIndentLevel = provider.getFoldableRangesAtIndentLevel;

    this.usingCustomFolds = true;
  }

  destroy () {
    this.subscriptions.dispose();
  }

  deactivate () {
    this.restoreOriginalFolds();
    this.destroy();
  }
}

class FoldConsumer {
  providers: Map<string, FoldProvider>; // TODO: Make this https://github.com/atom/scoped-property-store
  subscriptions: CompositeDisposable;
  observedEditors: Map<TextEditor, EditorData>;

  constructor () {
    this.providers = new Map();
    this.subscriptions = new CompositeDisposable();
    this.observedEditors = new Map();
  }

  activate () {
    this.subscriptions.add(atom.textEditors.observe(editor => {
      const editorData = this.createEditorData(editor);
      editorData.subscriptions.add(

        editor.observeGrammar(grammar => {
          const scopeName = grammar.scopeName;
          const provider = this.providers.get(scopeName);
          if (provider === undefined) {
            console.log("updating folds");
            editorData.updateOriginalFoldMethods();
            return;
          }
          editorData.applyCustomFoldsProvider(provider);
        }),

        editor.onDidDestroy(() => {
          editorData.destroy();
          this.observedEditors.delete(editor);
        })

      );
    }));
  }

  createEditorData (editor: TextEditor): EditorData {
    const data = this.observedEditors.get(editor);
    if (data !== undefined) {
      console.error("[atom-folding] Unexpected: Editor already in map");
      return data;
    }

    console.log("making new editor data");
    const editorData = new EditorData(editor);
    this.observedEditors.set(editor, editorData);
    return editorData;
  }

  deactivate () {
    this.subscriptions.dispose();
    this.observedEditors.forEach(data => { data.deactivate(); });
    this.observedEditors.clear();
  }

  consumeFoldProvider (payload: any) {
    if (
      typeof payload.isFoldableAtRow !== "function" ||
      typeof payload.getFoldableRangeContainingPoint !== "function" ||
      typeof payload.getFoldableRangesAtIndentLevel !== "function" ||
      !payload.scope
    ) {
      return;
    }

    const foldProvider: FoldProvider = {
      isFoldableAtRow: payload.isFoldableAtRow,
      getFoldableRangeContainingPoint: payload.getFoldableRangeContainingPoint,
      getFoldableRangesAtIndentLevel: payload.getFoldableRangesAtIndentLevel
    };

    const scope = payload.scope;
    if (scope instanceof Array) {
      scope.forEach(s => {
        if (typeof s === "string") this.providers.set(s, foldProvider);
      });
    } else if (typeof scope === "string") {
      this.providers.set(scope, foldProvider);
    }
  }
}

module.exports = new FoldConsumer();
