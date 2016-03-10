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
  it("can be constructed", function () {
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

  describe("Promises A+", function () {
    require('promises-aplus-tests').mocha(APLUS_ADAPTER)
  })
})
