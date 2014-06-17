var Kefir = {};



// Special values

var NOTHING = Kefir.NOTHING = ['<nothing>'];
var END = Kefir.END = ['<end>'];

function KefirError(error) {
  this.error = error;
}
Kefir.error = function(error) {
  return new KefirError(error);
}




// Callable

function Callable(fnMeta) {
  if (isFn(fnMeta) || (fnMeta instanceof Callable)) {
    return fnMeta;
  }
  if (fnMeta && fnMeta.length) {
    if (fnMeta.length === 1) {
      if (isFn(fnMeta[0])) {
        return fnMeta[0];
      } else {
        throw new Error('can\'t convert to Callable ' + fnMeta);
      }
    }
    this.fn = getFn(fnMeta[0], fnMeta[1]);
    this.context = fnMeta[1];
    this.args = rest(fnMeta, 2, null);
  } else {
    throw new Error('can\'t convert to Callable ' + fnMeta);
  }
}

Callable.call = function(callable, args) {
  if (isFn(callable)) {
    return callFast(callable, null, args);
  } else if (callable instanceof Callable) {
    if (callable.args) {
      if (args) {
        args = callable.args.concat(toArray(args));
      } else {
        args = callable.args;
      }
    }
    return callFast(callable.fn, callable.context, args);
  } else {
    return Callable.call(new Callable(callable), args);
  }
}

Callable.callAll = function(fns, args) {
  if (fns !== null && fns.length !== 0) {
    if (fns.length === 1) {
      Callable.call(fns[0], args);
    } else {
      fns = fns.slice(0);
      for (var i = 0, l = fns.length; i < l; i++) {
        Callable.call(fns[i], args);
      }
    }
  }
}

Callable.isEqual = function(a, b) {
  if (a === b) {
    return true;
  }
  a = new Callable(a);
  b = new Callable(b);
  if (isFn(a) || isFn(b)) {
    return a === b;
  }
  return a.fn === b.fn &&
    a.context === b.context &&
    isEqualArrays(a.args, b.args);
}







// Observable

var Observable = Kefir.Observable = function Observable() {

  this.__subscribers = {
    value: null,
    error: null,
    both: null,
    end: null
  };

  this.alive = true;
  this.active = false;

}

inherit(Observable, Object, {

  __ClassName: 'Observable',

  toString: function() {
    return '[' + this.__ClassName + (this.__objName ? (' | ' + this.__objName) : '') + ']';
  },

  __onFirstIn: noop,
  __onLastOut: noop,

  __addSubscriber: function(type, fnMeta) {
    if (this.__subscribers[type] === null) {
      this.__subscribers[type] = [];
    }
    this.__subscribers[type].push(new Callable(fnMeta));
  },

  __removeSubscriber: function(type, fnMeta) {
    var subs = this.__subscribers[type];
    if (subs !== null) {
      var callable = new Callable(fnMeta);
      for (var i = 0; i < subs.length; i++) {
        if (Callable.isEqual(subs[i], callable)) {
          subs.splice(i, 1);
          return;
        }
      }
    }
  },

  __on: function(type, fnMeta) {
    if (this.alive) {
      this.__addSubscriber(type, fnMeta);
      if (!this.active && type !== 'end') {
        this.active = true;
        this.__onFirstIn();
      }
    } else if (type === 'end') {
      Callable.call(fnMeta);
    }
  },
  __off: function(type, fnMeta) {
    if (this.alive) {
      this.__removeSubscriber(type, fnMeta);
      if (this.active && type !== 'end' && !this.__hasSubscribers()) {
        this.active = false;
        this.__onLastOut();
      }
    }
  },
  __send: function(type, x) {
    if (this.alive) {
      if (type === 'end') {
        Callable.callAll(this.__subscribers.end, []);
        this.__clear();
      } else if (this.active) {
        Callable.callAll(type === 'value' ? this.__subscribers.value : this.__subscribers.error, [x]);
        Callable.callAll(this.__subscribers.both, [type, x]);
      }
    }
  },
  __hasSubscribers: function() {
    var s = this.__subscribers;
    return (s.value !== null && s.value.length > 0) ||
      (s.error !== null && s.error.length > 0) ||
      (s.both !== null && s.both.length > 0);
  },
  __clear: function() {
    if (this.active) {
      this.active = false;
      this.__onLastOut();
    }
    this.__subscribers = null;
    this.alive = false;
  },


  __sendValue: function(x) {  this.__send('value', x); return this  },
  __sendError: function(x) {  this.__send('error', x); return this  },
  __sendEnd: function() {  this.__send('end'); return this  },
  __sendAny: function(x) {
    if (x === NOTHING) {  return this  }
    if (x === END) {  this.__sendEnd(); return this  }
    if (x instanceof KefirError) {  this.__sendError(x.error); return this  }
    this.__sendValue(x);
    return this;
  },


  onValue:  function() {  this.__on('value',  arguments); return this  },
  onError:  function() {  this.__on('error',  arguments); return this  },
  onBoth:   function() {  this.__on('both',   arguments); return this  },
  onEnd:    function() {  this.__on('end',    arguments); return this  },
  offValue: function() {  this.__off('value', arguments); return this  },
  offError: function() {  this.__off('error', arguments); return this  },
  offBoth:  function() {  this.__off('both',  arguments); return this  },
  offEnd:   function() {  this.__off('end',   arguments); return this  },

  isEnded: function() {
    return !this.alive;
  }


})




// Stream

var Stream = Kefir.Stream = function Stream() {
  Observable.call(this);
}

inherit(Stream, Observable, {
  __ClassName: 'Stream'
})




// Property

var Property = Kefir.Property = function Property(initial) {
  Observable.call(this);
  this.__cached = isUndefined(initial) ? NOTHING : initial;
}

inherit(Property, Observable, {

  __ClassName: 'Property',

  hasValue: function() {
    return this.__cached !== NOTHING;
  },
  getValue: function() {
    return this.__cached;
  },

  __sendValue: function(x) {
    if (this.alive) {
      this.__cached = x;
    }
    Observable.prototype.__sendValue.call(this, x);
  },
  onNewValue: function() {
    this.__on('value', arguments);
    return this;
  },
  onValue: function() {
    if (this.hasValue()) {
      Callable.call(arguments, [this.getValue()]);
    }
    return this.onNewValue.apply(this, arguments);
  },
  onNewBoth: function() {
    this.__on('both', arguments);
    return this;
  },
  onBoth: function() {
    if (this.hasValue()) {
      Callable.call(arguments, ['value', this.getValue()]);
    }
    return this.onNewBoth.apply(this, arguments);
  }

})

extend(Stream.prototype, {
  onNewValue: function() {
    return this.onValue.apply(this, arguments);
  },
  onNewBoth: function() {
    return this.onBoth.apply(this, arguments);
  }
});



// Log

function logHelper(name, type, x) {
  console.log(name, type, x);
}

Observable.prototype.log = function(name) {
  if (name == null) {
    name = this.toString();
  }
  this.onValue(logHelper, null, name, '<value>');
  this.onError(logHelper, null, name, '<error>');
  this.onEnd(logHelper, null, name, '<end>');
  return this;
}
