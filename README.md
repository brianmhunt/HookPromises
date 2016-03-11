
Mutex Promise
=============

A+ Compliant ES6 Promises with a few extra features:

- events
- temporal mutual exclusion
- uncaught checking
- creation and chaining call stack

These are primarily designed for testing.

This implementation is not intended to be used in production.


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

// This will emit `trespass` twice.
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

This follows roughly the logic of [Promises Spec #167](https://github.com/promises-aplus/promises-spec/issues/167).


# Creation and Chaining Call Stack

Each promise instance has a `creationStack`, and once resolved or rejected
a `resolutionStack`.


## License

© 2016 Brian M Hunt (MIT License)
