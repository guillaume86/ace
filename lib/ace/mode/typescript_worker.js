/* ***** BEGIN LICENSE BLOCK *****
 * Distributed under the BSD license:
 *
 * Copyright (c) 2010, Ajax.org B.V.
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *     * Redistributions of source code must retain the above copyright
 *       notice, this list of conditions and the following disclaimer.
 *     * Redistributions in binary form must reproduce the above copyright
 *       notice, this list of conditions and the following disclaimer in the
 *       documentation and/or other materials provided with the distribution.
 *     * Neither the name of Ajax.org B.V. nor the
 *       names of its contributors may be used to endorse or promote products
 *       derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
 * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
 * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
 * DISCLAIMED. IN NO EVENT SHALL AJAX.ORG B.V. BE LIABLE FOR ANY
 * DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
 * (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
 * LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND
 * ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
 * SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * ***** END LICENSE BLOCK ***** */

define(function (require, exports, module) {
    "no use strict";

    var oop = require("../lib/oop");
    var Mirror = require("../worker/mirror").Mirror;
    var lang = require("../lib/lang");
    var Document = require("../document").Document;
    var EditorPosition = require('./typescript/editor_position').EditorPosition;
    var Services = require('./typescript/typescriptServices').TypeScript.Services;
    var TypeScript = require('./typescript/typescriptServices').TypeScript;
    var TypeScriptLS = require('./typescript/lightHarness').TypeScriptLS;

    var TypeScriptWorker = exports.TypeScriptWorker = function (sender) {
        this.sender = sender;
        var doc = this.doc = new Document("");

        var deferredUpdate = this.deferredUpdate = lang.deferredCall(this.onUpdate.bind(this));

        this.typeScriptLS = new TypeScriptLS();
        this.ServicesFactory = new Services.TypeScriptServicesFactory();
        this.serviceShim = this.ServicesFactory.createLanguageServiceShim(this.typeScriptLS);
        this.languageService = this.serviceShim.languageService;

        var self = this;
        sender.on("change", function (e) {
            doc.applyDeltas(e.data);
            deferredUpdate.schedule(self.$timeout);
        });

        sender.on("addLibrary", function (e) {
            self.addlibrary(e.data.name, e.data.content);
        });

        this.setOptions();
        sender.emit("initAfter");
    };

    oop.inherits(TypeScriptWorker, Mirror);

    (function () {
        var proto = this;
        this.setOptions = function (options) {
            this.options = options || {
            };
        };
        this.changeOptions = function (newOptions) {
            oop.mixin(this.options, newOptions);
            this.deferredUpdate.schedule(100);
        };

        var libs = {};
        this.addlibrary = function (name, content) {
            this.typeScriptLS.addScript(name, content.replace(/\r\n?/g, "\n"), true);
            libs[name] = content;
        };

        this.getCompletionsAtPosition = function (fileName, pos, isMemberCompletion, id) {
            var ret = this.languageService.getCompletionsAtPosition(fileName, pos, isMemberCompletion);
            this.sender.callback(ret, id);
        };

        ["getTypeAtPosition",
            "getSignatureAtPosition",
            "getDefinitionAtPosition"].forEach(function (elm) {
                proto[elm] = function (fileName, pos, id) {
                    var ret = this.languageService[elm](fileName, pos);
                    this.sender.callback(ret, id);
                };
            });

        ["getReferencesAtPosition",
            "getOccurrencesAtPosition",
            "getImplementorsAtPosition"].forEach(function (elm) {

                proto[elm] = function (fileName, pos, id) {
                    var referenceEntries = this.languageService[elm](fileName, pos);
                    var ret = referenceEntries.map(function (ref) {
                        return {
                            unitIndex: ref.unitIndex,
                            minChar: ref.ast.minChar,
                            limChar: ref.ast.limChar
                        };
                    });
                    this.sender.callback(ret, id);
                };
            });

        ["getNavigateToItems",
            "getScriptLexicalStructure",
            "getOutliningRegions "].forEach(function (elm) {
                proto[elm] = function (value, id) {
                    var navs = this.languageService[elm](value);
                    this.sender.callback(navs, id);
                };
            });

        this.compile = function (source) {
            var parseErrors = [];

            var logger = new TypeScript.NullLogger();
            var compilationSettings = TypeScript.ImmutableCompilationSettings.defaultSettings();
            var compiler = new TypeScript.TypeScriptCompiler(logger, compilationSettings);
            var snapshot = TypeScript.ScriptSnapshot.fromString(source);

            compiler.addFile('temp.ts', snapshot, TypeScript.ByteOrderMark.None, 0, false);
            var iterator = compiler.compile(function (path) { return path; });
            for (; iterator.moveNext() ;) {
                var results = iterator.current();
                // Depends what you want to do with errors
                //results.diagnostics.forEach(function (error) {
                //    parseErrors.push({ start: error.start(), len: error.length(), message: error.message()});
                //})
                return results.outputFiles[0];
            }
        };

        // TODO: use only one instance of compiler and just update the temp.ts file
        this.onUpdate = function () {
            var source = this.doc.getValue().replace(/\r\n?/g, "\n");

            var logger = new TypeScript.NullLogger();
            var compilationSettings = TypeScript.ImmutableCompilationSettings.defaultSettings();
            var compiler = new TypeScript.TypeScriptCompiler(logger, compilationSettings);
            var snapshot = TypeScript.ScriptSnapshot.fromString(source);
            var annotations = [];
            var self = this;

            if (compiler.getDocument('temp.ts') === null) {
                compiler.addFile('temp.ts', snapshot, TypeScript.ByteOrderMark.None, 0, false);
            } else {
                compiler.updateFile('temp.ts', snapshot, TypeScript.ByteOrderMark.None, 0, false);
            }

            for (var libname in libs) {
                var snapshot = TypeScript.ScriptSnapshot.fromString(libs[libname]);
                compiler.addFile(libname, snapshot, TypeScript.ByteOrderMark.None, 0, false);
            }

            var iterator = compiler.compile(function (path) { return path; });
            for (; iterator.moveNext() ;) {
                var results = iterator.current();
                // Depends what you want to do with errors
                results.diagnostics.forEach(function (error) {
                    //parseErrors.push({ start: error.start(), len: error.length(), message: error.message()});

                    var pos = EditorPosition.getPosition(self.doc, error.start());
                    annotations.push({
                        row: pos.row,
                        column: pos.column,
                        text: error.message(),
                        minChar: error.start(),
                        limChar: error.start() + error.length(),
                        type: "error",
                        raw: error.message()
                    });

                });
                this.sender.emit("compiled", results.outputFiles[0]);
            }
            this.sender.emit("compileErrors", annotations);
        };

    }).call(TypeScriptWorker.prototype);

});