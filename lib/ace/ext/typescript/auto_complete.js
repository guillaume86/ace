define(function(require, exports, module) {

    var HashHandler = require('../../keyboard/hash_handler').HashHandler;
    var EventEmitter = require("../../lib/event_emitter").EventEmitter;
    var AutoCompleteView = require('./auto_complete_view').AutoCompleteView;

    var oop = require("../../lib/oop");

    exports.AutoComplete = function(editor, completionService){

        var self = this;

        oop.implement(self, EventEmitter);
        this.handler = new HashHandler();
        this.view = new AutoCompleteView(editor, self);
        this.listElement = this.view.listElement;
        this._active = false;
        this.inputText =''; //TODO imporve name

        this.isActive = function () {
            return self._active;
        };

        this.show = function () {
            editor.container.appendChild(self.view.wrap);
            self.listElement.innerHTML = '';
        };

        this.hide = function(){
            self.view.hide();
        }

        this.completion = function(cursor) {
            var completionInfo = completionService.getCursorCompletion(cursor);
            var text  = completionService.matchText;
            var coords = editor.renderer.textToScreenCoordinates(cursor.row, cursor.column - text.length);

            self.view.setPosition(coords);
            self.inputText = text;

            var completions = completionInfo.entries;

            if (self.inputText.length > 0){
                completions = completionInfo.entries.filter(function(elm){
                    return elm.name.toLowerCase().indexOf(self.inputText.toLowerCase()) == 0;
                });
            }

            var matchFunc = function(elm) {
                return elm.name.indexOf(self.inputText) == 0 ? 1 : 0;
            };

            var matchCompare = function(a, b){
                return matchFunc(b) - matchFunc(a);
            };

            var textCompare = function(a, b){
                 if (a.name == b.name){
                    return 0;
                 }else{
                     return (a.name > b.name) ? 1 : -1;
                 }
            };
            var compare = function(a, b){
                var ret = matchCompare(a, b);
                return (ret != 0) ? ret : textCompare(a, b);
            };

            completions = completions.sort(compare);

            self.showCompletion(completions);

            return completions.length;
        };

        this.refreshCompletion = function(e){
            var cursor = editor.getCursorPosition();
            if(e.data.action  == "insertText"){
                cursor.column += 1;
            } else if (e.data.action  == "removeText"){
                if(e.data.text == '\n'){
                    self.deactivate();
                    return;
                }
            }
            
            self.completion(cursor);
        };

        this.showCompletion = function(infos){
            if (infos.length > 0){
                self.view.show();
                var html = '';
                // TODO use template
                for(var n in infos) {
                    var info = infos[n];
                    var name =  '<span class="label-name">' + info.name + '</span>';
                    var type =  '<span class="label-type">' + info.type + '</span>';
                    var kind =  '<span class="label-kind label-kind-'+ info.kind + '">' + info.kind.charAt(0) + '</span>';

                    html += '<li data-name="' + info.name + '">' + kind + name + type + '</li>';
                }
                self.listElement.innerHTML = html;
                self.view.ensureFocus();
            }else{
                self.view.hide();
            }
        };

        this.active = function () {
            self.show();

            var count = self.completion(editor.getCursorPosition());
            if(!(count > 0)){
                self.hide();
                return;
            }
            editor.keyBinding.addKeyboardHandler(self.handler);
        };

        this.deactivate = function() {
            editor.keyBinding.removeKeyboardHandler(self.handler);
        };

        this.handler.attach = function(){
            editor.addEventListener("change", self.refreshCompletion);
            self._emit("attach", {sender: self});
            self._active = true;
        };

        this.handler.detach = function(){
            editor.removeEventListener("change", self.refreshCompletion);
            self.view.hide();
            self._emit("detach", {sender: self});
            self._active = false;
        };

        this.handler.handleKeyboard = function(data, hashId, key, keyCode) {
            if (hashId == -1) {

                if(" -=,[]_/()!';:<>".indexOf(key) != -1){ //TODO
                    self.deactivate();
                }
                return null;
            }

            var command = self.handler.findKeyCommand(hashId, key);

            if (!command){

                var defaultCommand = editor.commands.findKeyCommand(hashId, key);
                if(defaultCommand){
                    if(defaultCommand.name == "backspace"){
                        return null;
                    }
                    self.deactivate();
                }
                return null;
            }

            if (typeof command != "string") {
                var args = command.args;
                command = command.command;
            }

            if (typeof command == "string") {
                command = this.commands[command];
            }

            return {command: command, args: args};
        };


        exports.Keybinding = {
            "Up|Ctrl-p"   : "focusprev",
            "Down|Ctrl-n" : "focusnext",
            "esc|Ctrl-g"  : "cancel",
            "Return|Tab"  : "insertComplete"
        };

        this.handler.bindKeys(exports.Keybinding);

        this.handler.addCommands({
            focusnext:function(editor){
                self.view.focusNext();
            },
            focusprev:function(editor){
                self.view.focusPrev();
            },
            cancel:function(editor){
                self.deactivate();
            },
            insertComplete:function(editor){
                editor.removeEventListener("change", self.refreshCompletion);
                var curr = self.view.current();

                for(var i = 0; i<  self.inputText.length; i++){
                    editor.remove("left");
                }

                if(curr){
                    editor.insert(curr.getAttribute("data-name"));
                }
                self.deactivate();

            }
        });
    };
});