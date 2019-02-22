"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const atom_1 = require("atom");
class EditorData {
    constructor(editor) {
        this.editor = editor;
        this.usingCustomFolds = false;
        this.subscriptions = new atom_1.CompositeDisposable();
        this.updateOriginalFoldMethods();
    }
    updateOriginalFoldMethods() {
        const languageMode = this.editor.languageMode;
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
    restoreOriginalFolds() {
        if (!this.usingCustomFolds || this.originalFoldMethods === undefined)
            return;
        const languageMode = this.editor.languageMode;
        languageMode.isFoldableAtRow = this.originalFoldMethods.isFoldableAtRow;
        languageMode.getFoldableRangeContainingPoint = this.originalFoldMethods.getFoldableRangeContainingPoint;
        languageMode.getFoldableRangesAtIndentLevel = this.originalFoldMethods.getFoldableRangesAtIndentLevel;
        this.usingCustomFolds = false;
    }
    applyCustomFoldsProvider(provider) {
        if (!this.usingCustomFolds)
            this.updateOriginalFoldMethods();
        const languageMode = this.editor.languageMode;
        if (provider.allowDefaultFolds) {
            const isFoldableAtRowOrig = languageMode.isFoldableAtRow;
            const getFoldableRangeContainingPointOrig = languageMode.getFoldableRangeContainingPoint;
            const getFoldableRangesAtIndentLevelOrig = languageMode.getFoldableRangesAtIndentLevel;
            languageMode.isFoldableAtRow = (row) => {
                return provider.isFoldableAtRow({ row, editor: this.editor }) || isFoldableAtRowOrig.apply(languageMode, [row]);
            };
            languageMode.getFoldableRangeContainingPoint = (point, tabLength) => {
                const providerFold = provider.getFoldableRangeContainingPoint({ point, tabLength, editor: this.editor });
                if (providerFold !== undefined)
                    return providerFold;
                return getFoldableRangeContainingPointOrig.apply(languageMode, [point, tabLength]);
            };
            languageMode.getFoldableRangesAtIndentLevel = (level, tabLength) => {
                const providerFolds = provider.getFoldableRangesAtIndentLevel({ level, tabLength, editor: this.editor });
                if (providerFolds !== undefined)
                    return providerFolds;
                return getFoldableRangesAtIndentLevelOrig.apply(languageMode, [level, tabLength]);
            };
        }
        else {
            languageMode.isFoldableAtRow = (row) => provider.isFoldableAtRow({ row, editor: this.editor });
            languageMode.getFoldableRangeContainingPoint = (point, tabLength) => provider.getFoldableRangeContainingPoint({ point, tabLength, editor: this.editor });
            languageMode.getFoldableRangesAtIndentLevel = (level, tabLength) => provider.getFoldableRangesAtIndentLevel({ level, tabLength, editor: this.editor });
        }
        this.usingCustomFolds = true;
    }
    destroy() {
        this.subscriptions.dispose();
    }
    deactivate() {
        this.restoreOriginalFolds();
        this.destroy();
    }
}
class FoldConsumer {
    constructor() {
        this.providers = new Map();
        this.subscriptions = new atom_1.CompositeDisposable();
        this.observedEditors = new Map();
    }
    activate() {
        this.subscriptions.add(atom.textEditors.observe(editor => {
            const editorData = this.createEditorData(editor);
            editorData.subscriptions.add(editor.observeGrammar(grammar => {
                const scopeName = grammar.scopeName;
                const provider = this.providers.get(scopeName);
                if (provider === undefined) {
                    editorData.updateOriginalFoldMethods();
                    return;
                }
                editorData.applyCustomFoldsProvider(provider);
            }), editor.onDidDestroy(() => {
                editorData.destroy();
                this.observedEditors.delete(editor);
            }));
        }));
    }
    createEditorData(editor) {
        const data = this.observedEditors.get(editor);
        if (data !== undefined) {
            console.error("[atom-folding] Unexpected: Editor already in map");
            return data;
        }
        const editorData = new EditorData(editor);
        this.observedEditors.set(editor, editorData);
        return editorData;
    }
    deactivate() {
        this.subscriptions.dispose();
        this.observedEditors.forEach(data => { data.deactivate(); });
        this.observedEditors.clear();
        this.providers.forEach(provider => {
            if (provider.destroy !== undefined)
                provider.destroy(); // TODO: Prevent duplicate calls
        });
    }
    consumeFoldProvider(payload) {
        if (typeof payload.isFoldableAtRow !== "function" ||
            typeof payload.getFoldableRangeContainingPoint !== "function" ||
            typeof payload.getFoldableRangesAtIndentLevel !== "function" ||
            !payload.scope) {
            return;
        }
        const foldProvider = payload;
        let scopes = payload.scope;
        if (typeof scopes === "string") {
            scopes = [scopes];
        }
        if (!(scopes instanceof Array))
            return;
        const openEditors = atom.workspace.getTextEditors();
        scopes.forEach(scope => {
            if (typeof scope !== "string")
                return;
            if (this.providers.get(scope) !== undefined)
                return;
            this.providers.set(scope, foldProvider);
            openEditors.forEach(editor => {
                if (editor.getGrammar().scopeName === scope) {
                    const data = this.observedEditors.get(editor);
                    if (data !== undefined)
                        data.applyCustomFoldsProvider(foldProvider);
                }
            });
        });
    }
}
module.exports = new FoldConsumer();
//# sourceMappingURL=main.js.map