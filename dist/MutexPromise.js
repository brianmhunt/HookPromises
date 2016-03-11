"use strict";
//
// MutexPromise
// (C) Brian M Hunt 2016 (MIT)
//
// ES6 Promises, with events and uncaught rejection handling, and mutual-
// exclusion groups.
//
// The following is written in ES6, but my be transpiled back with e.g. Babel.
//
//
// Events, as follows, are thrown for all promises:
//  - new       - a new promise was created
//  - reject    - a promise was rejected
//  - resolve   - a promise was resolved
//  - uncaught  - a rejection not caught
//  - trespass  - a promise was resolved/rejected outside its mutex
//
// References are to the spec, at https://promisesaplus.com/
//

/* eslint no-console: 0 */

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

function _typeof(obj) { return obj && typeof Symbol !== "undefined" && obj.constructor === Symbol ? "symbol" : typeof obj; }

var PENDING = 0,
    RESOLVED = 1,
    REJECTED = -1;
var UNCAUGHT_TIMEOUT = 25;

// 'tick' will be a function that takes a callback, and runs it asynchronously.
var tick = (typeof process === 'undefined' ? 'undefined' : _typeof(process)) === 'object' && process.nextTick ? process.nextTick : global.setImmediate ? global.setImmediate.bind(global) : function tickFn(callback) {
  setTimeout(callback, 0);
};

//
// A Promisee is the recipient of a promise, via the 'then' method.
//

var Promisee = (function () {
  function Promisee(thenPromise, onResolvePromise1, onRejectPromise1) {
    _classCallCheck(this, Promisee);

    this.thenPromise = thenPromise;
    this.onResolvePromise1 = onResolvePromise1;
    this.onRejectPromise1 = onRejectPromise1;
    this.concluded = false;
  }

  _createClass(Promisee, [{
    key: 'conclude',
    value: function conclude(method, valueOrReason) {
      var onFn, noFn;
      if (this.concluded) {
        return;
      }
      if (method === RESOLVED) {
        onFn = this.onResolvePromise1;
        noFn = '_resolverFn';
      } else {
        onFn = this.onRejectPromise1;
        noFn = '_rejectFn';
      }

      if (typeof onFn === 'function') {
        try {
          this.thenPromise._resolverFn(onFn.call(undefined, valueOrReason));
        } catch (e) {
          // 2.2.7.2 If either onFulfilled or onRejected throws an exception e,
          //  thenPromise must be rejected with e as the reason
          this.thenPromise._rejectFn(e);
        }
      } else {
        // .then was passed a non-function
        this.thenPromise[noFn](valueOrReason);
      }
      this.concluded = true;
    }
  }]);

  return Promisee;
})();

var MutexPromise = (function () {
  function MutexPromise(fn) {
    _classCallCheck(this, MutexPromise);

    this.state = PENDING;

    // The value this ultimately lands on.
    this.resolution = undefined;

    // Promises "above" us; if we catch, so do they.
    this.weCatchFor = [];

    // Things relying on this promise
    this.promisees = [];

    // Add a stack to make debugging the promise easier (undefined on old
    // browsers)
    this.creationStack = new Error().stack;

    this.mutexTo = MutexPromise.mutexId;

    this.emit('new');
    fn(this._resolverFn.bind(this), this._rejectFn.bind(this));
  }

  // 2.2 The `then` Method

  _createClass(MutexPromise, [{
    key: 'then',
    value: function then(onFul, onRej) {
      var promise2;
      // 2.2.2.1/.3.1 it must be called after promise is fulfilled/rejected,
      // with promise’s value/reason as its first argument

      // We should not create a `.then` "promise2" for an existing "promise1"
      // if the mutex has changed.
      if (this.mutexTo !== MutexPromise.mutexId) {
        this.emit("trespass", {
          promiseMutexTo: this.mutexTo,
          mutexId: MutexPromise.mutexId,
          during: "then"
        });
      }

      if (this.state === PENDING) {
        promise2 = this._thenPending(onFul, onRej);
      } else {
        promise2 = this._thenImmediate(onFul, onRej);
      }

      // Note who we'd catch for (i.e. "parents")
      promise2.weCatchFor.push(this);

      // We're catching, meaning we catch anything above us.
      if (typeof onRej === 'function') {
        promise2._setCaught();
      }

      // 2.2.7 then must return a promise
      // promise2 = promise1.then(onFulfilled, onRejected);
      return promise2;
    }
  }, {
    key: 'catch',
    value: function _catch(onRej) {
      return this.then(null, onRej);
    }
  }, {
    key: 'finally',
    value: function _finally(cb) {
      return this.then(function (value) {
        return MutexPromise.resolve(cb()).then(function () {
          return value;
        });
      }, function (reason) {
        return MutexPromise.resolve(cb()).then(function () {
          throw reason;
        });
      });
    }

    // Event methods

  }, {
    key: 'emit',
    value: function emit(eventName, data) {
      var _this = this;

      var handlers = MutexPromise.eventHandlers[eventName] || [];
      // FIXME: `tick` each function call
      handlers.forEach(function (fn) {
        return fn.call(_this, data);
      });
    }

    // The "private" methods are below.
    // ---

    // then- functions
    // ---
    //
    // When this promise resolves, we resolve the pending 'then'
    // promises that have been created through this function.
    //
    // e.g. new Promise(asyncFn).then(af, ar).then(bf, br)
    //

  }, {
    key: '_thenPending',
    value: function _thenPending(onResolvePromise1, onRejectPromise1) {
      var promise2 = new MutexPromise(function () {});
      // When promise1 is resolved/rejected, its value is passed to
      // promee, which in turn runs resolve/reject-Promise1,
      // then passes the result to reject/resolve-Promise2,
      // which will be passed to any promisees of this `then`.
      var promee = new Promisee(promise2, onResolvePromise1, onRejectPromise1);
      this.promisees.push(promee);
      return promise2;
    }

    //

  }, {
    key: '_thenImmediate',
    value: function _thenImmediate(onResolvePromise1, onRejectPromise1) {
      var promise1 = this;
      var promise2 = new MutexPromise(function () {});

      function setResultForPromise2() {
        var thenFn = promise1.state === RESOLVED ? onResolvePromise1 : onRejectPromise1;

        if (typeof thenFn === 'function') {
          // 2.2.7.1 If either onFulfilled or onRejected returns a value x, run
          //  the Promise Resolution Procedure [[Resolve]](promise2, x).
          try {
            var thenFnResult = thenFn(promise1.resolution);
            promise2._resolutionProcedureFn(thenFnResult, promise1.state);
          } catch (e) {
            promise2._rejectFn(e);
          }
        } else {
          // 2.2.7.3/.4 If onFulfilled is not a function and promise1
          //  is fulfilled, promise2 must be fulfilled with the same
          //  value as promise1.
          promise2.state = promise1.state;
          promise2.resolution = promise1.resolution;
          promise2._notifyPromisees();
          this.emit(promise1.state === RESOLVED ? 'resolve' : 'reject', promise1.resolution);
        }
      }

      tick(setResultForPromise2);
      return promise2;
    }

    // Notify the .then's (promisees)

  }, {
    key: '_notifyPromisees',
    value: function _notifyPromisees() {
      var _this2 = this;

      this.promisees.forEach(function (promee) {
        return promee.conclude(_this2.state, _this2.resolution);
      });
    }

    // Catching

  }, {
    key: '_setCaught',
    value: function _setCaught() {
      if (this.state !== PENDING) {
        return;
      }
      this._isCaught = true;
      this.weCatchFor.forEach(function (p) {
        return p._setCaught();
      });
    }

    // resolve/reject functions
    //

  }, {
    key: '_resolveThenable',
    value: function _resolveThenable(thenable, then) {
      var promise1 = this;
      var called = false;

      // 2.3.3.3.1 If/when resolvePromise is called with a value y,
      //  run [[Resolve]](promise, y).
      function onResolve(value) {
        if (called) {
          return;
        }
        called = true;
        return promise1._resolverFn(value);
      }

      // 2.3.3.3.2 If/when rejectPromise is called with a reason r,
      //  reject promise with r.
      function onReject(reason) {
        if (called) {
          return;
        }
        called = true;
        promise1._rejectFn(reason);
      }

      try {
        then.call(thenable, onResolve, onReject);
      } catch (e) {
        // 2.3.3.2 If retrieving the property x.then results in a thrown
        //  exception e, reject promise with e as the reason
        // - and -
        // 2.3.3.3.4 If calling then throws an exception e ...
        // 2.3.3.4.1 If resolvePromise or rejectPromise have been called,
        //   ignore it.
        if (!called) {
          //    "   .4.2 Otherwise, reject promise with e as the reason.
          this._rejectFn(e);
        }
      }
    }

    // 2.3 The Promise Resolution Procedure

  }, {
    key: '_resolutionProcedureFn',
    value: function _resolutionProcedureFn(valueOrReasonOrThenable, immediateState) {
      // Resolution should occur only in the same mutex.
      if (this.mutexTo !== MutexPromise.mutexId) {
        this.emit("trespass", {
          promiseMutexTo: this.mutexTo,
          mutexId: MutexPromise.mutexId,
          during: "Resolution"
        });
      }

      // 1.2 “thenable” is an object or function that defines a then method.
      try {
        var then = ((typeof valueOrReasonOrThenable === 'undefined' ? 'undefined' : _typeof(valueOrReasonOrThenable)) === 'object' || typeof valueOrReasonOrThenable === 'function') && valueOrReasonOrThenable !== null && valueOrReasonOrThenable.then;
      } catch (e) {
        this.resolutionStack = new Error().stack;
        this.state = REJECTED;
        this.resolution = e;
        this._notifyPromisees();
        this.emit('reject', valueOrReasonOrThenable);
        return;
      }

      if (typeof then === 'function' && immediateState !== REJECTED) {
        // resolveThenable may recurse down a chain of promises, and
        // at the end call our _resolverFn or _rejectFn.

        // 2.2.7.2: If either onFulfilled or onRejected throws an exception e,
        //    promise2 must be rejected with e as the reason.
        //    (hence immediateState !== REJECTED)
        this._resolveThenable(valueOrReasonOrThenable, then);
      } else {
        this.resolutionStack = new Error().stack;
        this.state = immediateState;
        this.resolution = valueOrReasonOrThenable;
        this._notifyPromisees();
        this.emit(immediateState === RESOLVED ? 'resolve' : 'reject', valueOrReasonOrThenable);
      }
    }
  }, {
    key: '_concludeFn',
    value: function _concludeFn(valueOrReasonOrThenable, immediateState) {
      var _this3 = this;

      if (this.state !== PENDING) {
        return;
      }
      if (valueOrReasonOrThenable === this) {
        throw new TypeError("Cannot resolve promise with itself.");
      }
      tick(function () {
        return _this3._resolutionProcedureFn(valueOrReasonOrThenable, immediateState);
      });
    }
  }, {
    key: '_resolverFn',
    value: function _resolverFn(valueOrThenable) {
      this._concludeFn(valueOrThenable, RESOLVED);
    }
  }, {
    key: '_rejectFn',
    value: function _rejectFn(reasonOrThenable) {
      this._concludeFn(reasonOrThenable, REJECTED);

      // Capture Uncaught rejections and emit them.
      setTimeout((function () {
        if (!this._isCaught) {
          this.emit('uncaught', this, reasonOrThenable);
        }
      }).bind(this), UNCAUGHT_TIMEOUT);
    }
  }]);

  return MutexPromise;
})();

//
// Global methods on MutexPromise
//

MutexPromise.race = function race(iter) {
  return new MutexPromise(function (res, rej) {
    var weCatchFor = this.weCatchFor;
    iter.forEach(function (p) {
      p.then(res, rej);
      weCatchFor.push(p);
    });
  });
};

//
//
MutexPromise.all = function all(iter) {
  var arr = [];
  var promises = [];
  var seen = 0;

  var all = new MutexPromise(function (res, rej) {
    iter.forEach(function (valueOrPromise) {
      var p = MutexPromise.resolve(valueOrPromise);
      var idx = arr.length;
      arr.push(undefined);
      if (valueOrPromise instanceof MutexPromise) {
        promises.push(p);
      }
      MutexPromise.resolve(p).then(function (value) {
        arr[idx] = value;
        if (++seen === arr.length) {
          res(arr);
        }
      }, rej);
    });
    if (arr.length === 0) {
      res([]);
    }
  });

  promises.forEach(function (p) {
    all.weCatchFor.push(p);
  });

  return all;
};

MutexPromise.resolve = function (valueOrThenableOrPromise) {
  var rp = new MutexPromise(function (res) {
    return res(valueOrThenableOrPromise);
  });
  if (valueOrThenableOrPromise instanceof MutexPromise) {
    rp.weCatchFor.push(valueOrThenableOrPromise);
  }
  return rp;
};

MutexPromise.reject = function (reason) {
  return new MutexPromise(function (_, rej) {
    return rej(reason);
  });
};

// -- Event Handling --
MutexPromise.eventHandlers = {};
MutexPromise.on = function on(eventName, handler) {
  var eh = MutexPromise.eventHandlers;
  eh[eventName] = eh[eventName] || [];
  eh[eventName].push(handler);
};

MutexPromise.off = function off(eventName, handler) {
  var array = MutexPromise.eventHandlers[eventName] || [];
  for (var i = array.length - 1; i >= 0; --i) {
    if (array[i] === handler) {
      array.splice(i, 1);
    }
  }
};

// -- Exclusion groups --
MutexPromise.setMutex = function (identifier) {
  // Promises will now reject when
  MutexPromise.mutexId = identifier;
};

module.exports = MutexPromise;

