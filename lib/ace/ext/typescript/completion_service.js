// TODO: unts

define(function(require, exports, module) {

    var EditorPosition = require('../../mode/typescript/editor_position').EditorPosition;

    function CompletionService(editor, languageService, tempFileName) {
        this.editor = editor;
        this.languageService = languageService;
        this.tempFileName = tempFileName;
        this.editorPos = new EditorPosition(editor);
    }

    CompletionService.prototype.getCompletion = function (charpos, isMemberCompletion) {
        return this.languageService.getCompletionsAtPosition(this.tempFileName, charpos, isMemberCompletion);
    };

    CompletionService.prototype.getCursorCompletion = function (cursor) {
        var isMemberCompletion, matches, pos, text;
        pos = this.editorPos.getPositionChars(cursor);
        text = this.editor.session.getLine(cursor.row).slice(0, cursor.column);
        isMemberCompletion = false;
        matches = text.match(/\.([a-zA-Z_0-9\$]*$)/);
        if(matches && matches.length > 0) {
            this.matchText = matches[1];
            isMemberCompletion = true;
            pos -= this.matchText.length;
        } else {
            matches = text.match(/[a-zA-Z_0-9\$]*$/);
            this.matchText = matches[0];
        }
        return this.getCompletion(pos, isMemberCompletion);
    };

    CompletionService.prototype.getCurrentPositionCompilation = function () {
        return this.getCursorCompletion(this.editor.getCursorPosition());
    };

    exports.CompletionService = CompletionService;    

});