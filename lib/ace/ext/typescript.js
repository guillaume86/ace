define(function(require, exports, module) {
"use strict";
var Editor = require("ace/editor").Editor;
var AceRange = require('ace/range').Range;
var deferredCall = require("ace/lib/lang").deferredCall;
var HashHandler = require("ace/keyboard/hash_handler").HashHandler;

var EventHashHandler = require("./typescript/event_hash_handler").EventHashHandler;
var TooltipInfo = require("./typescript/tooltip_info").TooltipInfo;
var CompletionService = require("./typescript/completion_service").CompletionService;
var AutoComplete = require("./typescript/auto_complete").AutoComplete;
var baseStyles = require("ace/requirejs/text!./typescript.css");

var EditorPosition = require('ace/mode/typescript/editor_position').EditorPosition;
var Services = require('ace/mode/typescript/typescriptServices').Services;
var TypeScriptLS = require('ace/mode/typescript/lightHarness').TypeScriptLS;

function registerStyles () {
    var style = document.createElement("style");
    style.innerHTML = baseStyles;
    document.head.appendChild(style);
}

registerStyles();

function TypescriptEditor(editor) {
    this.enabled = false;
    this.tempFileName = 'temp.ts';
    this.refMarkers = [];
    this.errorMarkers = [];
    this.editor = editor;
    this.handler = new HashHandler();
    this.eventHandler = new EventHashHandler();

    this.editorPosition = new EditorPosition(editor);
    this.typeScriptLS =  new TypeScriptLS();
    this.ServicesFactory = new Services.TypeScriptServicesFactory();
    this.serviceShim = this.ServicesFactory.createLanguageServiceShim(this.typeScriptLS);
    this.languageService = this.serviceShim.languageService;

    this.editor.session.$typescript.registerLS(this.typeScriptLS);

    this.tooltipInfo = new TooltipInfo(editor, this.languageService, this.tempFileName);
    this.completionService = new CompletionService(editor, this.languageService, this.tempFileName);
    this.autoComplete = new AutoComplete(editor, this.completionService);

    this.deferredShowOccurrences = deferredCall(this.showOccurrences.bind(this));

    this.registerCommands(this.handler);
    this.registerEvents(this.eventHandler);
}

(function() {

    this.registerCommands = function(handler) {
        var self = this;
        var editor = this.editor;

        var commands = [{
            name: "refactor",
            bindKey: "F2"
        }, {
            name: "requestAutoComplete",
            bindKey: "Ctrl-Space"
        }, {
            name: "goToDefinition",
            bindKey: "Ctrl-F12"
        }, {
            name: "indent",
            bindKey: "Tab",
            multiSelectAction: "forEach"
        }, {
            name: "autoCompleteMember",
            bindKey: ".",
            exec: function() {
                self.editor.commands.exec("insertstring", self.editor, '.');
                self.requestAutoComplete();
            }
        }];

        commands.forEach(function(command){
            if(!command.exec) {
                command.exec = this[command.name].bind(this);
            }
        }, this);

        handler.addCommands(commands);
    };

    this.registerEvents = function(eventHandler) {
        var editor = this.editor;
        var autoComplete = this.autoComplete;
        var errorMarkers = this.errorMarkers;
        var editorPosition = this.editorPosition;

        eventHandler.addEvents([{
            target: editor,
            name: "change",
            handler: this.onUpdateDocument.bind(this)
        },{
            target: editor,
            name: "changeSelection",
            handler: this.onChangeCursor.bind(this) 
        },{
            target: editor,
            name: "mousedown",
            handler: function() {
                if (autoComplete.isActive()) {
                    autoComplete.deactivate();
                }
            }
        },{
            target: editor.getSession(),
            name: "compileErrors",
            handler: function(e) { 
                var session = editor.getSession();
                errorMarkers.forEach(function (id) {
                    session.removeMarker(id);
                });
                e.data.forEach(function (error) {
                    var start = editorPosition.getAcePositionFromChars(error.minChar);
                    var end = editorPosition.getAcePositionFromChars(error.limChar);
                    var range = new AceRange(start.row, start.column, end.row, end.column);
                    errorMarkers.push(session.addMarker(range, "typescript-error", "text", true));
                });
            }
        }]);

        // editor.getSession().on("compiled", function (e) {
        //     outputEditor.getSession().doc.setValue(e.data);
        // });
    };

    this.refactor = function() {
        var editor = this.editor;
        var references = this.languageService.getOccurrencesAtPosition(this.tempFileName, this.editorPosition.getCurrentCharPosition());

        var editorPosition = this.editorPosition;
        references.forEach(function (ref) {
            var start = editorPosition.getAcePositionFromChars(ref.ast.minChar);
            var end = editorPosition.getAcePositionFromChars(ref.ast.limChar);
            var range = new AceRange(start.row, start.column, end.row, end.column);
            editor.session.multiSelect.addRange(range);
        });
    };

    this.goToDefinition = function() {
        var editor = this.editor;
        var editorPosition = this.editorPosition;
        var references = this.languageService.getOccurrencesAtPosition(this.tempFileName, editorPosition.getCurrentCharPosition());
        var session = editor.getSession();
        var getpos = editorPosition.getAcePositionFromChars.bind(editorPosition);
        var refMarkers = this.refMarkers;
        refMarkers.forEach(function (id) {
            session.removeMarker(id);
        });

        if (references && references.length) {
            var ref = references[0];
            if (!(ref = ref.ast.sym.declAST))
                return;
            if (!(ref = ref.id))
                return;

            var start = getpos(ref.minChar);
            var end = getpos(ref.limChar);
            var range = new AceRange(start.row, start.column, end.row, end.column);

            editor.getSelection().moveCursorToPosition(start);
            editor.selection.clearSelection();

            refMarkers.push(session.addMarker(range, "typescript-ref", "text", true));
        }
    };

    this.indent = function() {
        var editor = this.editor;
        var cursor = editor.getCursorPosition();
        var lineNumber = cursor.row;

        var text = editor.session.getLine(lineNumber);
        var matches = text.match(/^[\t ]*/);
        var preIndent = 0;
        var wordLen = 0;

        if (matches) {
            wordLen = matches[0].length;
            for (var i = 0; i < matches[0].length; i++) {
                var elm = matches[0].charAt(i);
                var spaceLen = (elm == " ") ? 1 : editor.session.getTabSize();
                preIndent += spaceLen;
            };
        }

        var option = new Services.EditorOptions();
        option.NewLineCharacter = "\n";

        var smartIndent = this.languageService.getSmartIndentAtLineNumber(this.tempFileName, lineNumber, option);

        if (preIndent > smartIndent) {
            editor.indent();
        } else {
            var indent = smartIndent - preIndent;

            if (indent > 0) {
                editor.getSelection().moveCursorLineStart();
                editor.commands.exec("inserttext", editor, { text: " ", times: indent });
            }

            if (cursor.column > wordLen) {
                cursor.column += indent;
            } else {
                cursor.column = indent + wordLen;
            }

            editor.getSelection().moveCursorToPosition(cursor);
        }
    };

    this.requestAutoComplete = function() {
        var autoComplete = this.autoComplete;
        if (autoComplete.isActive() == false) {
            autoComplete.active();
        }
    };

    this.updateMarker = function(aceChangeEvent) {
        var data = aceChangeEvent.data;
        var action = data.action;
        var range = data.range;
        var markers = this.editor.getSession().getMarkers(true);
        var line_count = 0;
        var isNewLine = this.editor.getSession().getDocument().isNewLine;

        if (action == "insertText") {
            if (isNewLine(data.text)) {
                line_count = 1;
            }
        } else if (action == "insertLines") {
            line_count = data.lines.length;

        } else if (action == "removeText") {
            if (isNewLine(data.text)) {
                line_count = -1;
            }

        } else if (action == "removeLines") {
            line_count = -data.lines.length;
        }

        if (line_count != 0) {

            var markerUpdate = function (id) {
                var marker = markers[id];
                var row = range.start.row;

                if (line_count > 0) {
                    row = +1;
                }

                if (marker && marker.range.start.row > row) {
                    marker.range.start.row += line_count;
                    marker.range.end.row += line_count;
                }
            };

            this.errorMarkers.forEach(markerUpdate);
            this.refMarkers.forEach(markerUpdate);
            this.editor.onChangeFrontMarker();
        }
    };

    this.syncTypeScriptServiceContent = function(aceChangeEvent) {
        var data = aceChangeEvent.data;
        var action = data.action;
        var range = data.range;
        var start = this.editorPosition.getPositionChars(range.start);

        if (action == "insertText") {
            this.editLanguageService(new Services.TextEdit(start, start, data.text));
        } else if (action == "insertLines") {

            var text = data.lines.map(function (line) {
                return line + '\n'; //TODO newline hard code
            }).join('');
            this.editLanguageService(new Services.TextEdit(start, start, text));

        } else if (action == "removeText") {
            var end = start + data.text.length;
            this.editLanguageService(new Services.TextEdit(start, end, ""));
        } else if (action == "removeLines") {
            var len = this.editorPosition.getLinesChars(data.lines);
            var end = start + len;
            this.editLanguageService(new Services.TextEdit(start, end, ""));
        }
    };

    this.editLanguageService = function (textEdit) {
        this.typeScriptLS.editScript(this.tempFileName, textEdit.minChar, textEdit.limChar, textEdit.text);
    };

    this.onUpdateDocument = function (e) {
        if (!this.syncStop) {
            this.syncTypeScriptServiceContent(e);
            this.updateMarker(e);
        }
    };

    this.enable = function() {
        this.typeScriptLS.updateScript(this.tempFileName, this.editor.getSession().getDocument().getValue().replace(/\r\n/g, '\n'), false);
        this.editor.keyBinding.addKeyboardHandler(this.handler);
        this.eventHandler.register();
        this.enabled = true;
    };

    this.disable = function() {
        this.enabled = true;
        this.editor.keyBinding.removeKeyboardHandler(this.handler);
        this.eventHandler.unregister();
    };

    this.showOccurrences = function() {
        var editorPosition = this.editorPosition;
        var references = []
        //try {
            references = this.languageService.getOccurrencesAtPosition(this.tempFileName, editorPosition.getCurrentCharPosition());
        // } catch(ex) { 

        // }
        var session = this.editor.getSession();

        var refMarkers = this.refMarkers;
        refMarkers.forEach(function (id) {
            session.removeMarker(id);
        });

        references.forEach(function (ref) {
            var start = editorPosition.getAcePositionFromChars(ref.ast.minChar);
            var end = editorPosition.getAcePositionFromChars(ref.ast.limChar);
            var range = new AceRange(start.row, start.column, end.row, end.column);
            refMarkers.push(session.addMarker(range, "typescript-ref", "text", true));
        });
    };

    this.onChangeCursor = function (e) {
        if (!this.syncStop) {
            try {
                this.deferredShowOccurrences.schedule(200);
            } catch (ex) {
                //TODO
            }
        }
    };

}).call(TypescriptEditor.prototype);




function enableEditor(editor) {
    if(!editor.session.$typescript) return;

    if(!editor.$typescriptEditor) {
        editor.$typescriptEditor = new TypescriptEditor(editor);
    }

    editor.$typescriptEditor.enable();
}

function disableEditor(editor) {
    if(editor.$typescriptEditor) {
        editor.$typescriptEditor.disable();
    }   
}

var onChangeMode = function(e, target) {
    var editor = target;
    if (!editor)
        return;
    var modeId = editor.session.$modeId;
    var enabled = modeId && /typescript/.test(modeId);
    if (e.enableTypescript === false)
        enabled = false;
    if (enabled) {
        enableEditor(editor);
    }
    else {
        disableEditor(editor);
    }
};

exports.TypescriptEditor = TypescriptEditor
require("ace/config").defineOptions(Editor.prototype, "editor", {
    enableTypescript: {
        set: function(val) {
            this[val ? "on" : "removeListener"]("changeMode", onChangeMode);
            onChangeMode({enableTypescript: !!val}, this);
        },
        value: true
    }
});

});

