//
// Test the MutexPromise implementation.
//
const MP = require('../src/MutexPromise')
const assert = require('chai').assert


function noop() {}


const APLUS_ADAPTER = {
  deferred: function deferred() {
    var res, rej
    var p = new MP(function (res_, rej_) { res = res_; rej = rej_ })
    return {
      promise: p,
      resolve: res,
      reject: rej
    }
  }
}


describe("MutexPromise", function () {
  describe("Promises A+", function () {
    require('promises-aplus-tests').mocha(APLUS_ADAPTER)
  })

  it("can be constructed as an instance of the class", function () {
    var mp = new MP(function () {})
    assert.instanceOf(mp, MP)
  })

  it("has MutexPromise.resolve", function () {
    var val = {x: '123'}
    var p = MP.resolve(val)
    assert.instanceOf(p, MP)
    return p.then((v2) => assert.strictEqual(val, v2))
  })

  it("has MutexPromise.reject", function () {
    var val = {x: '123'}
    var p = MP.reject(val)
    assert.instanceOf(p, MP)
    return p.catch(r => r).then((v2) => assert.strictEqual(val, v2))
  })

  it("instances have .finally", function () {
    var val = {x: '123'}
    var called = false
    return MP.reject(val)
      .finally(() => called = true)
      .then(function () { throw Error("Do not call") }, () => assert.ok(called))
  })

  function handlerSpy(eventName) {
    var spy = sinon.spy()
    Promise.on(eventName, spy)
    after(() => Promise.off(eventName, spy))
    return spy
  }

  it("throws if no function is given", function() {
    assert.throws(() => new Promise(), /requires a function/)
  })

  it("triggers 'new'", function() {
    var spy = handlerSpy('new')
    assert.equal(spy.callCount, 0)
    var p = new Promise(function () {})
    assert.equal(spy.callCount, 1)
    assert.strictEqual(spy.thisValues[0], p)
  })

  it("triggers 'resolve'", function () {
    var spy = handlerSpy('resolve')
    assert.equal(spy.callCount, 0)
    return new Promise(function (res) { res('rqs') })
      .then(function (r) {
        assert.equal(spy.callCount, 1)
        assert.equal(r, 'rqs')
      })
  })

  it("triggers 'reject'", function () {
    var spy = handlerSpy('reject')
    assert.equal(spy.callCount, 0, 'sc0')
    return new Promise(function (res,rej) { rej(new Error('rqt')) })
      .catch(function (reason) {
        assert.equal(spy.callCount, 1, 'sc1')
        assert.equal(reason.message, 'rqt')
      })
  })

  it("triggers 'uncaught'", function (done) {
    // The original throws an error on an uncaught promise.
    var original = Promise.eventHandlers.uncaught.slice(0)
    Promise.eventHandlers.uncaught.length = 0
    after(() => Promise.eventHandlers.uncaught = original)

    var spy = handlerSpy('uncaught')
    assert.equal(spy.callCount, 0)
    var p0 = new Promise(function (res,rej) { rej(new Error('rqu')) })

    setTimeout(function () {
      assert.equal(spy.callCount, 1)
      done()
    }, 150)
  })

  it("does not trigger 'uncaught' on rejected return", function () {
    return new Promise(function (res, rej) { res('123') })
      .then(() => Promise.reject("-- inside --!"))
      .catch(function () { })
  })

  it("does not trigger 'uncaught' on Promise.all", function () {
    return Promise.all([
      Promise.reject('x'),
      Promise.resolve('y'),
    ]).catch(() => 123)
  })

  it("marks promises as caught", function () {
    var p = Promise.resolve()
    assert.notOk(p.isCaught)

    p.catch(noop)
    assert.ok(p.isCaught)
  })

  it("marks nested promises as caught", function () {
    var p0 = Promise.resolve("p0")
    var p1 = p0.then(function p1f(){})
    assert.notOk(p0.isCaught, 'p0')
    assert.notOk(p1.isCaught, 'p1')

    var p0c = p0.catch(function p0cf(){})
    var p1c = p1.catch(function p1cf(){})

    assert.ok(p0.isCaught, 'p0+')
    assert.ok(p1.isCaught, 'p1+')
    assert.ok(p0c.isCaught, 'p0c')
    assert.ok(p1c.isCaught, 'p1c')
  })

  it("marks then-promises as caught", function () {
    var p1
    var p0 = Promise.resolve()
      .then(() => p1 = Promise.resolve())
      .then(function () {
        assert.notOk(p1.isCaught, 'p1x')
        p0.catch(noop)
        assert.ok(p1.isCaught, 'p1o')
      })
  })

  it("does not mark outer promises as caught", function () {
    var p1
    var p0 = Promise.resolve()
      .then(() => p1 = Promise.resolve())
      .then(function () {
        p1.catch(noop)
        assert.ok(p1.isCaught, 'p1o')
        assert.notOk(p0.isCaught, 'p0x')
      })
  })

})
