define(function (require, exports, module) {

    var ace = require('ace/ace');
    var AceRange = require('ace/range').Range;
    var AutoComplete = require('AutoComplete').AutoComplete;
    var TooltipInfo = require("./TooltipInfo").TooltipInfo;
    var lang = require("ace/lib/lang");
    var EditorPosition = require('EditorPosition').EditorPosition;
    var CompilationService = require('CompilationService').CompilationService;
    var getFile = require('../lib/net').get;
    var deferredCall = require("ace/lib/lang").deferredCall;

    var Services = require('./typescriptServices').Services;
    var TypeScript = require('./typescriptServices').TypeScript;
    var TypeScriptLS = require('./lightHarness').TypeScriptLS;

    var aceEditorPosition = null;
    var editor = null;
    var outputEditor = null;
    var typeCompilationService = null;
    var docUpdateCount = 0;
    var typeScriptLS = new TypeScriptLS();
    var ServicesFactory = new Services.TypeScriptServicesFactory();
    var serviceShim = ServicesFactory.createLanguageServiceShim(typeScriptLS);

    var selectFileName = "";

    var syncStop = false; //for stop sync on loadfile
    var autoComplete = null;
    var refMarkers = [];
    var errorMarkers = [];

    var libnames = [
        "/typescripts/lib.d.ts"
    ];

    function loadTypeScriptLibrary() {

        // Add a non network script to get the balls rolling more quickly
        // See https://typescript.codeplex.com/workitem/129
        var iArgs = "interface IArguments {           [index: number]: any;        length: number;        callee: Function;    }";
        typeScriptLS.addScript('start.d.ts', iArgs, true);

        libnames.forEach(function (libname) {
            getFile(libname, function (content) {
                typeScriptLS.addScript(libname, content.replace(/\r\n?/g, "\n"), true);
            });
        });
    }

    function loadFileContent(filename, content) {
        selectFileName = filename;
        syncStop = true;
        var data = content.replace(/\r\n?/g, "\n");
        editor.setValue(data);
        editor.moveCursorTo(0, 0);
        typeScriptLS.updateScript(filename, editor.getSession().getDocument().getValue(), false);
        syncStop = false;
    }

    function loadFile(filename) {
        getFile(filename, function (content) {
            loadFileContent(filename, content);
        });
    }

    function startAutoComplete(editor) {
        if (autoComplete.isActive() == false) {
            autoComplete.setScriptName(selectFileName);
            autoComplete.active();
        }
    }

    function onUpdateDocument(e) {
        if (selectFileName) {
            if (!syncStop) {
                try {
                    syncTypeScriptServiceContent(selectFileName, e);
                    updateMarker(e);
                } catch (ex) {

                }
            }
        }
    }

    // TODO check column
    function updateMarker(aceChangeEvent) {
        var data = aceChangeEvent.data;
        var action = data.action;
        var range = data.range;
        var markers = editor.getSession().getMarkers(true);
        var line_count = 0;
        var isNewLine = editor.getSession().getDocument().isNewLine;

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

            errorMarkers.forEach(markerUpdate);
            refMarkers.forEach(markerUpdate);
            editor.onChangeFrontMarker();
        }

    }

    //sync LanguageService content and ace editor content
    function syncTypeScriptServiceContent(script, aceChangeEvent) {

        var data = aceChangeEvent.data;
        var action = data.action;
        var range = data.range;
        var start = aceEditorPosition.getPositionChars(range.start);

        if (action == "insertText") {
            editLanguageService(script, new Services.TextEdit(start, start, data.text));
        } else if (action == "insertLines") {

            var text = data.lines.map(function (line) {
                return line + '\n'; //TODO newline hard code
            }).join('');
            editLanguageService(script, new Services.TextEdit(start, start, text));

        } else if (action == "removeText") {
            var end = start + data.text.length;
            editLanguageService(script, new Services.TextEdit(start, end, ""));
        } else if (action == "removeLines") {
            var len = aceEditorPosition.getLinesChars(data.lines);
            var end = start + len;
            editLanguageService(script, new Services.TextEdit(start, end, ""));
        }
    };


    function editLanguageService(name, textEdit) {
        typeScriptLS.editScript(name, textEdit.minChar, textEdit.limChar, textEdit.text);
    }

    function onChangeCursor(e) {
        if (!syncStop) {
            try {
                deferredShowOccurrences.schedule(200);
            } catch (ex) {
                //TODO
            }
        }
    };

    function languageServiceIndent() {
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

        var smartIndent = serviceShim.languageService.getSmartIndentAtLineNumber(selectFileName, lineNumber, option);

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
    }

    function refactor() {
        var references = serviceShim.languageService.getOccurrencesAtPosition(selectFileName, aceEditorPosition.getCurrentCharPosition());

        references.forEach(function (ref) {
            var getpos = aceEditorPosition.getAcePositionFromChars;
            var start = getpos(ref.ast.minChar);
            var end = getpos(ref.ast.limChar);
            var range = new AceRange(start.row, start.column, end.row, end.column);
            editor.session.multiSelect.addRange(range);
        });
    }

    function goToDefinition() {
        var references = serviceShim.languageService.getOccurrencesAtPosition(selectFileName, aceEditorPosition.getCurrentCharPosition());
        var session = editor.getSession();
        var getpos = aceEditorPosition.getAcePositionFromChars;
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
    }

    function showOccurrences() {
        var references = serviceShim.languageService.getOccurrencesAtPosition(selectFileName, aceEditorPosition.getCurrentCharPosition());
        var session = editor.getSession();
        refMarkers.forEach(function (id) {
            session.removeMarker(id);
        });
        references.forEach(function (ref) {
            //TODO check script name
            // console.log(ref.unitIndex);
            var getpos = aceEditorPosition.getAcePositionFromChars;
            var start = getpos(ref.ast.minChar);
            var end = getpos(ref.ast.limChar);
            var range = new AceRange(start.row, start.column, end.row, end.column);
            refMarkers.push(session.addMarker(range, "typescript-ref", "text", true));
        });
    }

    var deferredShowOccurrences = deferredCall(showOccurrences);

    function Compile(typeScriptContent) {
        var output = "";

        var outfile = {
            Write: function (s) {
                output += s;
            },
            WriteLine: function (s) {
                output += s + "\n";
            },
            Close: function () {
            }
        };

        var outerr = {
            Write: function (s) {
            },
            WriteLine: function (s) {
            },
            Close: function () {
            }
        };
        var compiler = new TypeScript.TypeScriptCompiler(outfile, outerr, new TypeScript.NullLogger(), new TypeScript.CompilationSettings());
        compiler.addUnit(typeScriptContent, "output.js", false);
        compiler.typeCheck();
        compiler.emit(false, function (name) {

        });
        return output;
    }

    function workerOnCreate(func, timeout) {
        if (editor.getSession().$worker) {
            func(editor.getSession().$worker);
        } else {
            setTimeout(function () {
                workerOnCreate(func, timeout);
            });
        }
    }

    var load = function (editorElm, outputElm, theme) {
        editor = ace.edit(editorElm);
        editor.setTheme(theme);
        editor.getSession().setMode('ace/mode/typescript');

        outputEditor = ace.edit(outputElm);
        outputEditor.setTheme(theme);
        outputEditor.getSession().setMode('ace/mode/javascript');

        loadTypeScriptLibrary();
        loadFileContent("file_ace_editor.ts", "");

        editor.addEventListener("change", onUpdateDocument);
        editor.addEventListener("changeSelection", onChangeCursor);

        editor.commands.addCommands([{
            name: "autoComplete",
            bindKey: "Ctrl-Space",
            exec: function (editor) {
                startAutoComplete(editor);
            }
        }]);

        editor.commands.addCommands([{
            name: "refactor",
            bindKey: "F2",
            exec: function (editor) {
                refactor();
            }
        }]);

        editor.commands.addCommands([{
            name: "goToDefinition",
            bindKey: "Ctrl-F12",
            exec: function (editor) {
                goToDefinition();
            }
        }]);

        editor.commands.addCommands([{
            name: "indent",
            bindKey: "Tab",
            exec: function (editor) {
                languageServiceIndent();
            },
            multiSelectAction: "forEach"
        }]);

        aceEditorPosition = new EditorPosition(editor);
        typeCompilationService = new CompilationService(editor, serviceShim);
        autoComplete = new AutoComplete(editor, selectFileName, typeCompilationService);
        tooltipInfo = new TooltipInfo(editor, selectFileName, typeCompilationService);

        // override editor onTextInput
        var originalTextInput = editor.onTextInput;
        editor.onTextInput = function (text) {
            originalTextInput.call(editor, text);
            if (text == ".") {
                editor.commands.exec("autoComplete");

            } else if (editor.getSession().getDocument().isNewLine(text)) {
                var lineNumber = editor.getCursorPosition().row;
                var option = new Services.EditorOptions();
                option.NewLineCharacter = "\n";
                var indent = serviceShim.languageService.getSmartIndentAtLineNumber(selectFileName, lineNumber, option);
                if (indent > 0) {
                    // TODO: regarder ce qui va pas
                    // editor.commands.exec("inserttext", editor, {text:" ", times:indent});
                }
            }
        };

        editor.addEventListener("mousedown", function (e) {
            if (autoComplete.isActive()) {
                autoComplete.deactivate();
            }
        });

        editor.getSession().on("compiled", function (e) {
            outputEditor.getSession().doc.setValue(e.data);
        });

        editor.getSession().on("compileErrors", function (e) {
            var session = editor.getSession();
            errorMarkers.forEach(function (id) {
                session.removeMarker(id);
            });
            e.data.forEach(function (error) {
                var getpos = aceEditorPosition.getAcePositionFromChars;
                var start = getpos(error.minChar);
                var end = getpos(error.limChar);
                var range = new AceRange(start.row, start.column, end.row, end.column);
                errorMarkers.push(session.addMarker(range, "typescript-error", "text", true));
            });
        });

        workerOnCreate(function () { //TODO use worker init event

            libnames.forEach(function (libname) {
                getFile(libname, function (content) {
                    var params = {
                        data: {
                            name: libname,
                            content: content.replace(/\r\n?/g, "\n")
                        }
                    };
                    editor.getSession().$worker.emit("addLibrary", params);
                });
            });
        }, 100);

        return {
            editor: editor,
            outputEditor: outputEditor
        };

    }

    exports.load = load;

});





