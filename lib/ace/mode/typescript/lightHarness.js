/// This is an extract of harness.js .
///   Just the ScriptInfo and the
///  TypeScriptLS classes.
/// Notice the manual require calls for ./typescriptServices.
define(function(require, exports, module) {

    var __extends = this.__extends || function (d, b) {
        function __() {
            this.constructor = d;
        }
        __.prototype = b.prototype;
        d.prototype = new __();
    };

    var TypeScript = require('./typescriptServices').TypeScript;

    var Harness;
    (function (Harness) {
        function readFile(filename) {
            throw new Error('Not Implemented: Harness.readFile');
        }

        // Assert functions
        (function (Assert) {
            var assert = Harness.Assert;
            Assert.bugIds = [];
            Assert.throwAssertError = function (error) {
                throw error;
            };

            // Marks that the current scenario is impacted by a bug
            function bug(id) {
                if (Assert.bugIds.indexOf(id) < 0) {
                    Assert.bugIds.push(id);
                }
            }
            Assert.bug = bug;

            // If there are any bugs in the test code, mark the scenario as impacted appropriately
            function bugs(content) {
                var bugs = content.match(/\bbug (\d+)/i);
                if (bugs) {
                    bugs.forEach(function (bug) {
                        return assert.bug(bug);
                    });
                }
            }
            Assert.bugs = bugs;

            function is(result, msg) {
                if (!result) {
                    Assert.throwAssertError(new Error(msg || "Expected true, got false."));
                }
            }
            Assert.is = is;

            function arrayLengthIs(arr, length) {
                if (arr.length != length) {
                    var actual = '';
                    arr.forEach(function (n) {
                        return actual = actual + '\n      ' + JSON.stringify(n);
                    });
                    Assert.throwAssertError(new Error('Expected array to have ' + length + ' elements. Found ' + arr.length + '. Actual elements were:' + actual));
                }
            }
            Assert.arrayLengthIs = arrayLengthIs;

            function equal(actual, expected, description) {
                if (typeof description === "undefined") { description = ''; }
                if (actual !== expected) {
                    Assert.throwAssertError(new Error("Expected " + description + (description.length > 0 ? ' ' : '') + actual + " to equal " + expected));
                }
            }
            Assert.equal = equal;

            function notEqual(actual, expected) {
                if (actual === expected) {
                    Assert.throwAssertError(new Error("Expected " + actual + " to *not* equal " + expected));
                }
            }
            Assert.notEqual = notEqual;

            function notNull(result) {
                if (result === null) {
                    Assert.throwAssertError(new Error("Expected " + result + " to *not* be null"));
                }
            }
            Assert.notNull = notNull;

            function compilerWarning(result, line, column, desc) {
                if (!result.isErrorAt(line, column, desc)) {
                    var actual = '';
                    result.errors.forEach(function (err) {
                        actual = actual + '\n     ' + err.toString();
                    });

                    Assert.throwAssertError(new Error("Expected compiler warning at (" + line + ", " + column + "): " + desc + "\nActual errors follow: " + actual));
                }
            }
            Assert.compilerWarning = compilerWarning;

            function noDiff(text1, text2, ondifference) {
                text1 = text1.replace(/^\s+|\s+$/g, "").replace(/\r\n?/g, "\n");
                text2 = text2.replace(/^\s+|\s+$/g, "").replace(/\r\n?/g, "\n");

                if (text1 !== text2) {
                    var errorString = ondifference ? ondifference() + "\n" : "";
                    var text1Lines = text1.split(/\n/);
                    var text2Lines = text2.split(/\n/);
                    for (var i = 0; i < text1Lines.length; i++) {
                        if (text1Lines[i] !== text2Lines[i]) {
                            errorString += "Difference at line " + (i + 1) + ":\n";
                            errorString += "                  Left File: " + text1Lines[i] + "\n";
                            errorString += "                 Right File: " + text2Lines[i] + "\n\n";
                        }
                    }
                    Assert.throwAssertError(new Error(errorString));
                }
            }
            Assert.noDiff = noDiff;

            function arrayContains(arr, contains) {
                var found;

                for (var i = 0; i < contains.length; i++) {
                    found = false;

                    for (var j = 0; j < arr.length; j++) {
                        if (arr[j] === contains[i]) {
                            found = true;
                            break;
                        }
                    }

                    if (!found) {
                        Assert.throwAssertError(new Error("Expected array to contain \"" + contains[i] + "\""));
                    }
                }
            }
            Assert.arrayContains = arrayContains;

            function arrayContainsOnce(arr, filter) {
                var foundCount = 0;

                for (var i = 0; i < arr.length; i++) {
                    if (filter(arr[i])) {
                        foundCount++;
                    }
                }

                if (foundCount !== 1) {
                    Assert.throwAssertError(new Error("Expected array to match element only once (instead of " + foundCount + " times)"));
                }
            }
            Assert.arrayContainsOnce = arrayContainsOnce;
        })(Harness.Assert || (Harness.Assert = {}));
        var Assert = Harness.Assert;

        var assert = Harness.Assert;

        var ScriptInfo = (function () {
            function ScriptInfo(fileName, content, isOpen, byteOrderMark) {
                if (typeof isOpen === "undefined") { isOpen = true; }
                if (typeof byteOrderMark === "undefined") { byteOrderMark = TypeScript.ByteOrderMark.None; }
                this.fileName = fileName;
                this.content = content;
                this.isOpen = isOpen;
                this.byteOrderMark = byteOrderMark;
                this.version = 1;
                this.editRanges = [];
                this.lineMap = null;
                this.setContent(content);
            }
            ScriptInfo.prototype.setContent = function (content) {
                this.content = content;
                this.lineMap = TypeScript.LineMap1.fromString(content);
            };

            ScriptInfo.prototype.updateContent = function (content) {
                this.editRanges = [];
                this.setContent(content);
                this.version++;
            };

            ScriptInfo.prototype.editContent = function (minChar, limChar, newText) {
                // Apply edits
                var prefix = this.content.substring(0, minChar);
                var middle = newText;
                var suffix = this.content.substring(limChar);
                this.setContent(prefix + middle + suffix);

                // Store edit range + new length of script
                this.editRanges.push({
                    length: this.content.length,
                    textChangeRange: new TypeScript.TextChangeRange(TypeScript.TextSpan.fromBounds(minChar, limChar), newText.length)
                });

                // Update version #
                this.version++;
            };

            ScriptInfo.prototype.getTextChangeRangeBetweenVersions = function (startVersion, endVersion) {
                if (startVersion === endVersion) {
                    // No edits!
                    return TypeScript.TextChangeRange.unchanged;
                }

                var initialEditRangeIndex = this.editRanges.length - (this.version - startVersion);
                var lastEditRangeIndex = this.editRanges.length - (this.version - endVersion);

                var entries = this.editRanges.slice(initialEditRangeIndex, lastEditRangeIndex);
                return TypeScript.TextChangeRange.collapseChangesAcrossMultipleVersions(entries.map(function (e) {
                    return e.textChangeRange;
                }));
            };
            return ScriptInfo;
        })();
        Harness.ScriptInfo = ScriptInfo;

        var ScriptSnapshotShim = (function () {
            function ScriptSnapshotShim(scriptInfo) {
                this.scriptInfo = scriptInfo;
                this.lineMap = null;
                this.textSnapshot = scriptInfo.content;
                this.version = scriptInfo.version;
            }
            ScriptSnapshotShim.prototype.getText = function (start, end) {
                return this.textSnapshot.substring(start, end);
            };

            ScriptSnapshotShim.prototype.getLength = function () {
                return this.textSnapshot.length;
            };

            ScriptSnapshotShim.prototype.getLineStartPositions = function () {
                if (this.lineMap === null) {
                    this.lineMap = TypeScript.LineMap1.fromString(this.textSnapshot);
                }

                return JSON.stringify(this.lineMap.lineStarts());
            };

            ScriptSnapshotShim.prototype.getTextChangeRangeSinceVersion = function (scriptVersion) {
                var range = this.scriptInfo.getTextChangeRangeBetweenVersions(scriptVersion, this.version);
                if (range === null) {
                    return null;
                }

                return JSON.stringify({ span: { start: range.span().start(), length: range.span().length() }, newLength: range.newLength() });
            };
            return ScriptSnapshotShim;
        })();

        var TypeScriptLS = (function () {
            function TypeScriptLS() {
                this.ls = null;
                this.fileNameToScript = new TypeScript.StringHashTable();
            }
            TypeScriptLS.prototype.addDefaultLibrary = function () {
                this.addScript("lib.d.ts", Harness.Compiler.libText);
            };

            TypeScriptLS.prototype.addFile = function (fileName) {
                var code = readFile(fileName).contents;
                this.addScript(fileName, code);
            };

            TypeScriptLS.prototype.getScriptInfo = function (fileName) {
                return this.fileNameToScript.lookup(fileName);
            };

            TypeScriptLS.prototype.addScript = function (fileName, content) {
                var script = new ScriptInfo(fileName, content);
                this.fileNameToScript.add(fileName, script);
            };

            TypeScriptLS.prototype.updateScript = function (fileName, content) {
                var script = this.getScriptInfo(fileName);
                if (script !== null) {
                    script.updateContent(content);
                    return;
                }

                this.addScript(fileName, content);
            };

            TypeScriptLS.prototype.editScript = function (fileName, minChar, limChar, newText) {
                var script = this.getScriptInfo(fileName);
                if (script !== null) {
                    script.editContent(minChar, limChar, newText);
                    return;
                }

                throw new Error("No script with name '" + fileName + "'");
            };

            //////////////////////////////////////////////////////////////////////
            // ILogger implementation
            //
            TypeScriptLS.prototype.information = function () {
                return false;
            };
            TypeScriptLS.prototype.debug = function () {
                return true;
            };
            TypeScriptLS.prototype.warning = function () {
                return true;
            };
            TypeScriptLS.prototype.error = function () {
                return true;
            };
            TypeScriptLS.prototype.fatal = function () {
                return true;
            };

            TypeScriptLS.prototype.log = function (s) {
                // For debugging...
                //TypeScript.IO.printLine("TypeScriptLS:" + s);
            };

            //////////////////////////////////////////////////////////////////////
            // ILanguageServiceShimHost implementation
            //
            TypeScriptLS.prototype.getCompilationSettings = function () {
                return "";
            };

            TypeScriptLS.prototype.getScriptFileNames = function () {
                return JSON.stringify(this.fileNameToScript.getAllKeys());
            };

            TypeScriptLS.prototype.getScriptSnapshot = function (fileName) {
                return new ScriptSnapshotShim(this.getScriptInfo(fileName));
            };

            TypeScriptLS.prototype.getScriptVersion = function (fileName) {
                return this.getScriptInfo(fileName).version;
            };

            TypeScriptLS.prototype.getScriptIsOpen = function (fileName) {
                return this.getScriptInfo(fileName).isOpen;
            };

            TypeScriptLS.prototype.getScriptByteOrderMark = function (fileName) {
                return this.getScriptInfo(fileName).byteOrderMark;
            };

            TypeScriptLS.prototype.getDiagnosticsObject = function () {
                return new LanguageServicesDiagnostics("");
            };

            TypeScriptLS.prototype.getLocalizedDiagnosticMessages = function () {
                return "";
            };

            TypeScriptLS.prototype.fileExists = function (s) {
                return TypeScript.IO.fileExists(s);
            };

            TypeScriptLS.prototype.directoryExists = function (s) {
                return TypeScript.IO.directoryExists(s);
            };

            TypeScriptLS.prototype.resolveRelativePath = function (path, directory) {
                if (TypeScript.isRooted(path) || !directory) {
                    return TypeScript.IO.resolvePath(path);
                } else {
                    return TypeScript.IO.resolvePath(TypeScript.IOUtils.combine(directory, path));
                }
            };

            TypeScriptLS.prototype.getParentDirectory = function (path) {
                return TypeScript.IO.dirName(path);
            };

            /** Return a new instance of the language service shim, up-to-date wrt to typecheck.
            *  To access the non-shim (i.e. actual) language service, use the "ls.languageService" property.
            */
            TypeScriptLS.prototype.getLanguageService = function () {
                var ls = new TypeScript.Services.TypeScriptServicesFactory().createLanguageServiceShim(this);
                this.ls = ls;
                return ls;
            };

            /** Parse file given its source text */
            TypeScriptLS.prototype.parseSourceText = function (fileName, sourceText) {
                var compilationSettings = new TypeScript.CompilationSettings();
                compilationSettings.codeGenTarget = TypeScript.LanguageVersion.EcmaScript5;

                var settings = TypeScript.ImmutableCompilationSettings.fromCompilationSettings(compilationSettings);
                var parseOptions = TypeScript.getParseOptions(settings);
                return TypeScript.SyntaxTreeToAstVisitor.visit(TypeScript.Parser.parse(fileName, TypeScript.SimpleText.fromScriptSnapshot(sourceText), TypeScript.isDTSFile(fileName), parseOptions), fileName, settings, true);
            };

            /** Parse a file on disk given its fileName */
            TypeScriptLS.prototype.parseFile = function (fileName) {
                var sourceText = TypeScript.ScriptSnapshot.fromString(TypeScript.IO.readFile(fileName, null).contents);
                return this.parseSourceText(fileName, sourceText);
            };

            /**
            * @param line 1 based index
            * @param col 1 based index
            */
            TypeScriptLS.prototype.lineColToPosition = function (fileName, line, col) {
                var script = this.fileNameToScript.lookup(fileName);
                assert.notNull(script);
                assert.is(line >= 1);
                assert.is(col >= 1);

                return script.lineMap.getPosition(line - 1, col - 1);
            };

            /**
            * @param line 0 based index
            * @param col 0 based index
            */
            TypeScriptLS.prototype.positionToZeroBasedLineCol = function (fileName, position) {
                var script = this.fileNameToScript.lookup(fileName);
                assert.notNull(script);

                var result = script.lineMap.getLineAndCharacterFromPosition(position);

                assert.is(result.line() >= 0);
                assert.is(result.character() >= 0);
                return { line: result.line(), character: result.character() };
            };

            /** Verify that applying edits to sourceFileName result in the content of the file baselineFileName */
            TypeScriptLS.prototype.checkEdits = function (sourceFileName, baselineFileName, edits) {
                var script = readFile(sourceFileName);
                var formattedScript = this.applyEdits(script.contents, edits);
                var baseline = readFile(baselineFileName).contents;

                assert.noDiff(formattedScript, baseline);
                assert.equal(formattedScript, baseline);
            };

            /** Apply an array of text edits to a string, and return the resulting string. */
            TypeScriptLS.prototype.applyEdits = function (content, edits) {
                var result = content;
                edits = this.normalizeEdits(edits);

                for (var i = edits.length - 1; i >= 0; i--) {
                    var edit = edits[i];
                    var prefix = result.substring(0, edit.minChar);
                    var middle = edit.text;
                    var suffix = result.substring(edit.limChar);
                    result = prefix + middle + suffix;
                }
                return result;
            };

            /** Normalize an array of edits by removing overlapping entries and sorting entries on the minChar position. */
            TypeScriptLS.prototype.normalizeEdits = function (edits) {
                var result = [];

                function mapEdits(edits) {
                    var result = [];
                    for (var i = 0; i < edits.length; i++) {
                        result.push({ edit: edits[i], index: i });
                    }
                    return result;
                }

                var temp = mapEdits(edits).sort(function (a, b) {
                    var result = a.edit.minChar - b.edit.minChar;
                    if (result === 0)
                        result = a.index - b.index;
                    return result;
                });

                var current = 0;
                var next = 1;
                while (current < temp.length) {
                    var currentEdit = temp[current].edit;

                    // Last edit
                    if (next >= temp.length) {
                        result.push(currentEdit);
                        current++;
                        continue;
                    }
                    var nextEdit = temp[next].edit;

                    var gap = nextEdit.minChar - currentEdit.limChar;

                    // non-overlapping edits
                    if (gap >= 0) {
                        result.push(currentEdit);
                        current = next;
                        next++;
                        continue;
                    }

                    // overlapping edits: for now, we only support ignoring an next edit
                    // entirely contained in the current edit.
                    if (currentEdit.limChar >= nextEdit.limChar) {
                        next++;
                        continue;
                    } else {
                        throw new Error("Trying to apply overlapping edits");
                    }
                }

                return result;
            };
            return TypeScriptLS;
        })();
        Harness.TypeScriptLS = TypeScriptLS;

        var LanguageServicesDiagnostics = (function () {
            function LanguageServicesDiagnostics(destination) {
                this.destination = destination;
            }
            LanguageServicesDiagnostics.prototype.log = function (content) {
                //Imitates the LanguageServicesDiagnostics object when not in Visual Studio
            };
            return LanguageServicesDiagnostics;
        })();
        Harness.LanguageServicesDiagnostics = LanguageServicesDiagnostics;
    })(Harness || (Harness = {}));

    exports.ScriptInfo = Harness.ScriptInfo;
    exports.TypeScriptLS = Harness.TypeScriptLS;
});