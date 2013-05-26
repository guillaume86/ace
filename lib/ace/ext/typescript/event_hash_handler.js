define(function(require, exports, module) {

  var event = require("ace/lib/event");

  function EventHashHandler() {
    this.$events = [];
    this.$registered = false;
  };

  (function() {

    this.addEvent = function(ev) {
      this.removeEvent(ev);
      this.$events.push(ev);

      if(this.registered) {
        event.addListener(ev.target, ev.name, ev.handler);
      }
    };

    this.addEvents = function(events) {
        events && Object.keys(events).forEach(function(name) {
            var ev = events[name];

            if (!ev.name)
                ev.name = name;

            this.addEvent(ev);
        }, this);
    };

    this.removeEvent = function(e) {
      this.$events = this.$events.filter(function(ev) {
        return ev.target === target
          && ev.name === name
          && ev.handler === handler;
      });

      if(this.registered) {
        event.removeListener(e.target, e.name, e.handler);
      }
    };

    this.register = function() {
      if(this.$registered) return;

      this.$events.forEach(function(e) {
        event.addListener(e.target, e.name, e.handler);
      });

      this.$registered = true;
    };

    this.unregister = function() {
      if(!this.$registered) return;

      this.$events.forEach(function(e) {
        event.removeListener(e.target, e.name, e.handler);
      });

      this.$registered = false;
    };

  }).call(EventHashHandler.prototype);

  exports.EventHashHandler = EventHashHandler;  
});