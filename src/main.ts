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
  allowDefaultFolds?: boolean;
  isFoldableAtRow (params: IsFoldableParams): boolean;
  getFoldableRangeContainingPoint (params: GetPointFoldableParams): Range | undefined;
  getFoldableRangesAtIndentLevel (params: GetIndentFoldableParams): Range[] | undefined;
  destroy? (): void;
}

interface LanguageModeFoldMethods {
  isFoldableAtRow (row: number): boolean;
  getFoldableRangeContainingPoint (point: Point, tabLength: number): Range;
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

    if (this.originalFoldMethods !== undefined && this.usingCustomFolds) {
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

    if (provider.allowDefaultFolds) {
      const isFoldableAtRowOrig = languageMode.isFoldableAtRow;
      const getFoldableRangeContainingPointOrig = languageMode.getFoldableRangeContainingPoint;
      const getFoldableRangesAtIndentLevelOrig = languageMode.getFoldableRangesAtIndentLevel;

      languageMode.isFoldableAtRow = (row: number) => {
        return provider.isFoldableAtRow({row, editor: this.editor}) || isFoldableAtRowOrig.apply(languageMode, [row]);
      };

      languageMode.getFoldableRangeContainingPoint = (point: Point, tabLength: number) => {
        const providerFold = provider.getFoldableRangeContainingPoint({point, tabLength, editor: this.editor});
        if (providerFold !== undefined) return providerFold;
        return getFoldableRangeContainingPointOrig.apply(languageMode, [point, tabLength]);
      };

      languageMode.getFoldableRangesAtIndentLevel = (level: number, tabLength: number) => {
        const providerFolds = provider.getFoldableRangesAtIndentLevel({level, tabLength, editor: this.editor});
        if (providerFolds !== undefined) return providerFolds;
        return getFoldableRangesAtIndentLevelOrig.apply(languageMode, [level, tabLength]);
      };
    } else {
      languageMode.isFoldableAtRow = (row: number) => provider.isFoldableAtRow({row, editor: this.editor});
      languageMode.getFoldableRangeContainingPoint = (point: Point, tabLength: number) => provider.getFoldableRangeContainingPoint({point, tabLength, editor: this.editor});
      languageMode.getFoldableRangesAtIndentLevel = (level: number, tabLength: number) => provider.getFoldableRangesAtIndentLevel({level, tabLength, editor: this.editor});
    }

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

    const editorData = new EditorData(editor);
    this.observedEditors.set(editor, editorData);
    return editorData;
  }

  deactivate () {
    this.subscriptions.dispose();
    this.observedEditors.forEach(data => { data.deactivate(); });
    this.observedEditors.clear();
    this.providers.forEach(provider => {
      if (provider.destroy !== undefined) provider.destroy(); // TODO: Prevent duplicate calls
    });
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

    const foldProvider: FoldProvider = payload;

    let scopes = payload.scope;
    if (typeof scopes === "string") {
      scopes = [scopes];
    }
    if (!(scopes instanceof Array)) return;

    const openEditors = atom.workspace.getTextEditors();

    scopes.forEach(scope => {
      if (typeof scope !== "string") return;
      if (this.providers.get(scope) !== undefined) return;
      this.providers.set(scope, foldProvider);

      openEditors.forEach(editor => {
        if (editor.getGrammar().scopeName === scope) {
          const data = this.observedEditors.get(editor);
          if (data !== undefined) data.applyCustomFoldsProvider(foldProvider);
        }
      });
    });
  }
}

module.exports = new FoldConsumer();
