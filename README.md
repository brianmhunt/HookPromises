
<div style='float: right'>
  <a href='https://travis-ci.org/brianmhunt/MutexPromise.svg?branch=master'>
    <img src='https://travis-ci.org/brianmhunt/MutexPromise.svg?branch=master' alt='Travis Status' title='Travis Status' align="right">
  </a>

  <a href="https://promisesaplus.com/">
      <img src="https://promisesaplus.com/assets/logo-small.png" alt="Promises/A+ logo"
           title="Promises/A+ 1.0 compliant" align="right" />
  </a>
</div>

Mutex Promise
=============


A+ Compliant (and mostly follows ECMA-262) ES6 Promises with a few extra
features that can help with debugging :

- events
- temporal mutual exclusion
- uncaught checking
- creation and chaining call stack

This implementation is primarily designed for testing, and a reasonably
readable spec-compliant implementation.  Its main intended purpose is as a
drop-in replacement for the built-in ES6 implementation when one is developing
and debugging

This implementation is not intended to be used in production.  As it is itself
written in ES6 Javascript meaning,

-  there's already a native `Promise` class;
-  this would need to be transpiled for backwards compatibility; and, in any case
-  this implementation is not fast compared to others.


# Install

```bash
$ npm install brianmhunt-mutex-promise
```


## Events

The following events are available:

- new       - a new promise was created
- reject    - a promise was rejected
- resolve   - a promise was resolved
- uncaught  - a rejection not caught
- trespass  - a promise was resolved/rejected outside its mutex

The `this` of each shall be the promise from which it was thrown.

Register events with e.g.

```javascript
Promise.on('new', function () { /* this = promise instance */ })
```

Unregister events with

```javascript
Promise.off('new', fn)
```


## Temporal mutual exclusion

You can set an identifier that when not strictly equal when promises are chained
will result in a`trespass` event being emitted.  For example:

```javascript
Promise.setMutex("abc")
p = new Promise(function () {}).then(function () {})
Promise.setMutex("def")
p.then(function () {})

// This will emit `trespass` twice - once for both `then`'s because they
// are both asynchronously resolved.
```

The trespass event receives a `data` argument with two events, like this:

```javascript
{
  promiseMutexTo: this.mutexTo,
  mutexId: MutexPromise.mutexId
}
```

For a more solid example, consider a testing scenario with Mocha:

```javascript
beforeEach(function () {
  // Any promises created after this, but before the next `beforeEach` will
  // be in the same mutex period.
  Promise.setMutex(this.currentTest)  
})

after(function () {
  // Catch any promises resolved after testing completes.
  Promise.setMutex('Tests complete')
})

Promise.on('trespass', function (data) {
  console.error("A promise started in test ", data.promiseMutexTo,
    "was concluded after that test completed, specifically:", data.mutexId)
})
```

## Uncaught Checking

An `uncaught` event is raised, following roughly the logic of:

- A rejection is raised;
- After a short period of time, no rejection handler has been added (via `.then`, `race` or `all`) that would catch it


Note:

- [The TC39 Spec on Promises](https://tc39.github.io/ecma262/#sec-promise-executor)
- [promises-aplus issue #167](https://github.com/promises-aplus/promises-spec/issues/167).
- [ECMA262 issue #76](https://github.com/tc39/ecma262/pull/76)


# Creation and Chaining Call Stack

Each promise instance has a `creationStack` property, and once resolved or
rejected a `resolutionStack` property.


## License & Thanks

© 2016 Brian M Hunt (MIT License)

Thanks to [NetPleadings/Conductor](https://conductor.law) for time to work on this!
