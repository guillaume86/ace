define(function (require, exports, module) {

    function EditorPosition(editor) {
        this.editor = editor;
    }

    EditorPosition.prototype.getPositionChars = function (pos) {
        var doc = editor.getSession().getDocument();
        return EditorPosition.getChars(doc, pos);
    };

    EditorPosition.prototype.getAcePositionFromChars = function (chars) {
        var doc = editor.getSession().getDocument();
        return EditorPosition.getPosition(doc, chars);
    };

    EditorPosition.prototype.getCurrentCharPosition = function () {
        return this.getPositionChars(editor.getCursorPosition());
    };

    EditorPosition.prototype.getCurrentLeftChar = function () {
        return EditorPosition.getPositionLeftChar(editor.getCursorPosition());
    };

    EditorPosition.getPositionChar = function (cursor) {
        var range = {
            start: {
                row: cursor.row,
                column: cursor.column
            },
            end: {
                row: cursor.row,
                column: cursor.column + 1
            }
        };
        return editor.getSession().getDocument().getTextRange(range);
    };

    EditorPosition.getPositionLeftChar = function (cursor) {
        var range = {
            start: {
                row: cursor.row,
                column: cursor.column
            },
            end: {
                row: cursor.row,
                column: cursor.column - 1
            }
        };
        return editor.getSession().getDocument().getTextRange(range);
    };

    EditorPosition.getLinesChars = function (lines) {
        var count = 0;
        lines.forEach(function (line) {
            return count += line.length + 1;
        });
        return count;
    };

    EditorPosition.getChars = function (doc, pos) {
        return EditorPosition.getLinesChars(doc.getLines(0, pos.row - 1)) + pos.column;
    };

    EditorPosition.getPosition = function (doc, chars) {
        var lines = doc.getAllLines();
        var count = 0;
        var row = 0;
        for (var i in lines) {
            var line = lines[i];
            if (chars < (count + (line.length + 1))) {
                return {
                    row: row,
                    column: chars - count
                };
            }
            count += line.length + 1;
            row += 1;
        }
        return {
            row: row,
            column: chars - count
        };
    };

    exports.EditorPosition = EditorPosition;
})
