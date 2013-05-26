define(function (require, exports, module) {
    "use strict";

    var dom = require("ace/lib/dom");
    var event = require("ace/lib/event");
    var Range = require("ace/range").Range;
    var EditorPosition = require('ace/mode/typescript/editor_position').EditorPosition;

    var tooltipNode;

    var TooltipInfo = function (editor, languageService, tempFileName) {
        if (editor.tooltipInfo)
            return;
        editor.tooltipInfo = this;
        this.editor = editor;
        this.languageService = languageService;
        this.tempFileName = tempFileName;
        this.editorPos = new EditorPosition(editor);

        editor.tooltip = tooltipNode || this.$init();

        this.update = this.update.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseOut = this.onMouseOut.bind(this);
        event.addListener(editor.renderer.scroller, "mousemove", this.onMouseMove);
        event.addListener(editor.renderer.content, "mouseout", this.onMouseOut);
    };

    (function () {
        this.typeInfo = {};
        this.range = new Range();

        function getTooltipText(typeInfo, sigInfo) {
            if (!typeInfo) {
                return;
            }

            if (typeInfo.memberName) {
                if (typeInfo.memberName.text) {
                    return typeInfo.memberName.text;
                }
                if (typeInfo.memberName.entries && typeInfo.memberName.entries.length) {
                    if (typeInfo.memberName.entries.length == 1) {
                        return typeInfo.memberName.entries[0].text;
                    } else {
                        var active = sigInfo ? sigInfo.activeFormal : 0;
                        return typeInfo.memberName.entries[active].text + ' (+ ' + (typeInfo.memberName.entries.length - 1) + ' overload(s))';
                    }
                }
            }
        }

        this.update = function () {
            this.$timer = null;
            var languageService = this.languageService;

            var r = this.editor.renderer;
            if (this.lastT - (r.timeStamp || 0) > 1000) {
                r.rect = null;
                r.timeStamp = this.lastT;
                this.maxHeight = innerHeight;
                this.maxWidth = innerWidth;
            }

            var canvasPos = r.rect || (r.rect = r.scroller.getBoundingClientRect());
            var offset = (this.x + r.scrollLeft - canvasPos.left - r.$padding) / r.characterWidth;
            var row = Math.floor((this.y + r.scrollTop - canvasPos.top) / r.lineHeight);
            var col = Math.round(offset);

            var screenPos = { row: row, column: col, side: offset - col > 0 ? 1 : -1 };
            var session = this.editor.session;
            var docPos = session.screenToDocumentPosition(screenPos.row, screenPos.column);

            var charPos = this.editorPos.getPositionChars(docPos);

            var self = this;
            var typeInfo = languageService.getTypeAtPosition(this.tempFileName, charPos);

            if(!typeInfo) {
                self.closeTooltip();
                return;
            }

            var sigInfo = languageService.getSignatureAtPosition(this.tempFileName, typeInfo.limChar + 1);

            var tooltipText = getTooltipText(typeInfo, sigInfo);

            if (!tooltipText) {
                self.closeTooltip();
                return;
            }
            if (!self.isOpen) {
                tooltipNode.style.display = "";
                self.isOpen = true;
            }

            if (self.tooltipText != tooltipText) {
                tooltipNode.textContent = tooltipText;
                self.tooltipWidth = tooltipNode.offsetWidth;
                self.tooltipHeight = tooltipNode.offsetHeight;
                self.tooltipText = tooltipText;
            }

            self.updateTooltipPosition(self.x, self.y);

            self.typeInfo = typeInfo;
            if (self.marker) {
                session.removeMarker(self.marker);
            }

            var startPos = self.editorPos.getAcePositionFromChars(typeInfo.minChar);
            var endPos = self.editorPos.getAcePositionFromChars(typeInfo.limChar);
            if (startPos.row == endPos.row) {
                self.range = new Range(startPos.row, startPos.column, endPos.row, endPos.column);
                self.marker = session.addMarker(self.range, "ace_bracket", "text");
            }
        };

        this.onMouseMove = function (e) {
            this.x = e.clientX;
            this.y = e.clientY;

            if (this.isOpen) {
                this.lastT = e.timeStamp;
                this.updateTooltipPosition(this.x, this.y);
            }

            if (!this.$timer)
                this.$timer = setTimeout(this.update, 100);
        };

        this.closeTooltip = function() {
            tooltipNode.style.display = "none";
            this.editor.session.removeMarker(this.marker);
            this.$timer = clearTimeout(this.$timer);
            this.isOpen = false;
        };

        this.onMouseOut = function (e) {
            var t = e && e.relatedTarget;
            var ct = e && e.currentTarget;
            while (t && (t = t.parentNode)) {
                if (t == ct)
                    return;
            }
            this.closeTooltip();
        };

        this.updateTooltipPosition = function (x, y) {
            var st = tooltipNode.style;
            if (x + 10 + this.tooltipWidth > this.maxWidth)
                x = innerWidth - this.tooltipWidth - 10;
            if (y > innerHeight * 0.75 || y + 20 + this.tooltipHeight > this.maxHeight)
                y = y - this.tooltipHeight - 30;

            st.left = x + 10 + "px";
            st.top = y + 20 + "px";
        };

        this.$init = function () {
            tooltipNode = document.documentElement.appendChild(dom.createElement("div"));
            var st = tooltipNode.style;
            st.position = "fixed";
            st.display = "none";
            st.background = "lightyellow";
            st.borderRadius = "";
            st.border = "1px solid gray";
            st.padding = "1px";
            st.zIndex = 1000;
            st.fontFamily = "monospace";
            st.whiteSpace = "pre-line";
            return tooltipNode;
        };

        this.destroy = function () {
            this.onMouseOut();
            event.removeListener(this.editor.renderer.scroller, "mousemove", this.onMouseMove);
            event.removeListener(this.editor.renderer.content, "mouseout", this.onMouseOut);
            delete this.editor.tooltipInfo;
        };

    }).call(TooltipInfo.prototype);

    exports.TooltipInfo = TooltipInfo;

});