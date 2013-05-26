define(function(require, exports, module) {

    function AutoCompleteView(editor, autoComplete) {
        this.editor = editor;
        this.autoComplete = autoComplete;
        this.selectedClassName = 'ace_autocomplete_selected';
        this.wrap = document.createElement('div');
        this.listElement = document.createElement('ul');
        this.wrap.className = 'ace_autocomplete';
        this.wrap.style.display = 'none';
        this.listElement.style.listStyleType = 'none';
        this.wrap.style.position = 'fixed';
        this.wrap.style.zIndex = '1000';
        this.wrap.appendChild(this.listElement);
    }

    AutoCompleteView.prototype.show = function () {
        return this.wrap.style.display = 'block';
    };

    AutoCompleteView.prototype.hide = function () {
        return this.wrap.style.display = 'none';
    };

    AutoCompleteView.prototype.setPosition = function (coords) {
        var bottom, editorBottom, top;
        top = coords.pageY + 20;
        var clientRect = this.editor.container.getBoundingClientRect();
        editorBottom = clientRect.top + clientRect.height;
        bottom = top + this.wrap.offsetHeight;
        if(bottom < editorBottom) {
            this.wrap.style.top = top + 'px';
            return this.wrap.style.left = coords.pageX + 'px';
        } else {
            this.wrap.style.top = (top - this.wrap.offsetHeight - 20) + 'px';
            return this.wrap.style.left = coords.pageX + 'px';
        }
    };

    AutoCompleteView.prototype.current = function () {
        var children = this.listElement.childNodes;
        for(var i in children) {
            var child = children[i];
            if(child.className === this.selectedClassName) {
                return child;
            }
        }
        return null;
    };

    AutoCompleteView.prototype.focusNext = function () {
        var curr = this.current();
        var focus = curr.nextSibling;
        if(focus) {
            curr.className = '';
            focus.className = this.selectedClassName;
            return this.adjustPosition();
        }
    };

    AutoCompleteView.prototype.focusPrev = function () {
        var curr = this.current();
        var focus = curr.previousSibling;
        if(focus) {
            curr.className = '';
            focus.className = this.selectedClassName;
            return this.adjustPosition();
        }
    };

    AutoCompleteView.prototype.ensureFocus = function () {
        if(!this.current()) {
            if(this.listElement.firstChild) {
                this.listElement.firstChild.className = this.selectedClassName;
                return this.adjustPosition();
            }
        }
    };

    AutoCompleteView.prototype.adjustPosition = function () {
        var elm = this.current(); 
        if(elm) {
            var newMargin = '';
            var wrapHeight = this.wrap.offsetHeight;
            var elmOuterHeight = elm.offsetHeight; // BORDER/MARGIN/PADDING?
            var preMargin = parseInt(this.listElement.style.marginTop.replace('px', ''), 10) || 0;
            var top = elm.offsetTop;
            if(top >= (wrapHeight - elmOuterHeight)) {
                newMargin = (preMargin - elmOuterHeight) + 'px';
                this.listElement.style.marginTop = newMargin;
            }
            if(top < 0) {
                newMargin = (-top + preMargin) + 'px';
                return this.listElement.style.marginTop = newMargin;
            }
        }
    };

    exports.AutoCompleteView = AutoCompleteView;    
})
