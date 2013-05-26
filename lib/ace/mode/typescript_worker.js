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

define(function(require, exports, module) {
    "no use strict";

    var oop = require("../lib/oop");
    var Mirror = require("../worker/mirror").Mirror;
    var lang = require("../lib/lang");
    var Document = require("../document").Document;
    var EditorPosition = require('./typescript/editor_position').EditorPosition;
    var Services = require('./typescript/typescriptServices').Services;
    var TypeScript = require('./typescript/typescriptServices').TypeScript;
    var TypeScriptLS = require('./typescript/lightHarness').TypeScriptLS;

    var tempFileName = 'temp.ts';

    var TypeScriptWorker = exports.TypeScriptWorker = function(sender) {
        this.sender = sender;
        var doc = this.doc = new Document("");

        var deferredUpdate = this.deferredUpdate = lang.deferredCall(this.onUpdate.bind(this));

        this.typeScriptLS =  new TypeScriptLS();
        this.ServicesFactory = new Services.TypeScriptServicesFactory();
        this.serviceShim = this.ServicesFactory.createLanguageServiceShim(this.typeScriptLS);
        this.languageService = this.serviceShim.languageService;


        var self = this;
        sender.on("change", function(e) {
            doc.applyDeltas(e.data);
            deferredUpdate.schedule(self.$timeout);
        });

        sender.on("addLibrary", function(e) {
            self.addlibrary(e.data.name , e.data.content);
        });

        this.setOptions();
        sender.emit("initAfter");
    };

    oop.inherits(TypeScriptWorker, Mirror);

    (function() {
        var proto = this;
        this.setOptions = function(options) {
            this.options = options || {
                compile: false
            };
        };
        this.changeOptions = function(newOptions) {
            oop.mixin(this.options, newOptions);
            this.deferredUpdate.schedule(100);
        };

        this.addlibrary = function(name, content) { 
            this.typeScriptLS.addScript(name, content.replace(/\r\n?/g,"\n"), true);
        };

        // [   "getCompletionsAtPosition",
        //     "getTypeAtPosition",
        //     "getSignatureAtPosition",
        //     "getDefinitionAtPosition",
        //     "getNavigateToItems",
        //     "getScriptLexicalStructure",
        //     "getOutliningRegions" ].forEach(function(elm){
        //         proto[elm] = function() {
        //             var args = Array.prototype.slice.call(arguments);
        //             var remoteArgs = args.slice(0, -1);
        //             var id = args.slice(-1)[0];

        //             // Handle fileName argument (null equals edited script)
        //             if(!remoteArgs[0]) { remoteArgs[0] = tempFileName; }
        //             if(remoteArgs[0] == tempFileName && !this.hasContent) {
        //                 this.sender.callback(null, id);
        //                 return;
        //             }

        //             var ret = this.languageService[elm].apply(this.languageService, remoteArgs);
        //             this.sender.callback(ret, id);
        //         };
        //     });

        // ["getReferencesAtPosition",
        //     "getOccurrencesAtPosition",
        //     "getImplementorsAtPosition"].forEach(function(elm){

        //         proto[elm] = function(fileName, pos,  id) {
        //             var referenceEntries = this.languageService[elm](fileName, pos);
        //             var ret = referenceEntries.map(function (ref) {
        //                 return {
        //                     unitIndex: ref.unitIndex,
        //                     minChar: ref.ast.minChar,
        //                     limChar: ref.ast.limChar
        //                 };
        //             });
        //             this.sender.callback(ret, id);
        //         };
        //     });


        this.compile = function (typeScriptContent){
            var output = "";

            var outfile = {
                Write: function (s) {
                    output  += s;
                },
                WriteLine: function (s) {
                    output  += s + "\n";
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
        };

        this.onUpdate = function() {
            this.hasContent = true;
            var scriptContent = this.doc.getValue().replace(/\r\n?/g,"\n");
            this.typeScriptLS.updateScript(tempFileName,scriptContent , false);
            var errors = this.serviceShim.languageService.getScriptErrors(tempFileName, 100);
            var annotations = [];
            var self = this;

            if(this.options.compile) {
                this.sender.emit("compiled", this.compile(scriptContent));
            }

            errors.forEach(function(error){
                var pos = EditorPosition.getPosition(self.doc, error.minChar);
                annotations.push({
                    row: pos.row,
                    column: pos.column,
                    text: error.message,
                    minChar:error.minChar,
                    limChar:error.limChar,
                    type: "error",
                    raw: error.message
                });
            });

            this.sender.emit("compileErrors", annotations);
        };

    }).call(TypeScriptWorker.prototype);

});
