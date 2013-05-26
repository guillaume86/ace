define(function (require, exports, module) {

    function EditorPosition(editor) {
        this.editor = editor;
    }

    (function() {

        this.getLinesChars = function (lines) {
            var count = 0;
            lines.forEach(function (line) {
                return count += line.length + 1;
            });
            return count;
        };


        this.getChars = function (doc, pos) {
            return EditorPosition.getLinesChars(doc.getLines(0, pos.row - 1)) + pos.column;
        };

        this.getPosition = function (doc, chars) {
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

    }).call(EditorPosition);

    (function() {

        this.getLinesChars = function (lines) {
            var count = 0;
            lines.forEach(function (line) {
                return count += line.length + 1;
            });
            return count;
        };

        this.getChars = function (doc, pos) {
            return this.getLinesChars(doc.getLines(0, pos.row - 1)) + pos.column;
        };

        this.getPositionChars = function (pos) {
            var doc = this.editor.getSession().getDocument();
            return EditorPosition.getChars(doc, pos);
        };

        this.getAcePositionFromChars = function (chars) {
            var doc = this.editor.getSession().getDocument();
            return EditorPosition.getPosition(doc, chars);
        };

        this.getCurrentCharPosition = function () {
            return this.getPositionChars(this.editor.getCursorPosition());
        };

        this.getCurrentLeftChar = function () {
            return this.getPositionLeftChar(this.editor.getCursorPosition());
        };

        this.getCursorRange = function (cursor) {
            return {
                start: {
                    row: cursor.row,
                    column: cursor.column
                },
                end: {
                    row: cursor.row,
                    column: cursor.column 
                }
            };
        };

        this.getPositionChar = function (cursor) {
            var range = this.getCursorRange(cursor);
            range.end.column += 1;
            return this.editor.getSession().getDocument().getTextRange(range);
        };

        this.getPositionLeftChar = function (cursor) {
            var range = this.getCursorRange(cursor);
            range.end.column -= 1;
            return this.editor.getSession().getDocument().getTextRange(range);
        };

    }).call(EditorPosition.prototype);

    exports.EditorPosition = EditorPosition;
})
