(function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
// shim for using process in browser

var process = module.exports = {};
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = setTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    clearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        setTimeout(drainQueue, 0);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],2:[function(require,module,exports){
(function (process){
/**
 * @module vow
 * @author Filatov Dmitry <dfilatov@yandex-team.ru>
 * @version 0.4.10
 * @license
 * Dual licensed under the MIT and GPL licenses:
 *   * http://www.opensource.org/licenses/mit-license.php
 *   * http://www.gnu.org/licenses/gpl.html
 */

(function(global) {

var undef,
    nextTick = (function() {
        var fns = [],
            enqueueFn = function(fn) {
                return fns.push(fn) === 1;
            },
            callFns = function() {
                var fnsToCall = fns, i = 0, len = fns.length;
                fns = [];
                while(i < len) {
                    fnsToCall[i++]();
                }
            };

        if(typeof setImmediate === 'function') { // ie10, nodejs >= 0.10
            return function(fn) {
                enqueueFn(fn) && setImmediate(callFns);
            };
        }

        if(typeof process === 'object' && process.nextTick) { // nodejs < 0.10
            return function(fn) {
                enqueueFn(fn) && process.nextTick(callFns);
            };
        }

        var MutationObserver = global.MutationObserver || global.WebKitMutationObserver; // modern browsers
        if(MutationObserver) {
            var num = 1,
                node = document.createTextNode('');

            new MutationObserver(callFns).observe(node, { characterData : true });

            return function(fn) {
                enqueueFn(fn) && (node.data = (num *= -1));
            };
        }

        if(global.postMessage) {
            var isPostMessageAsync = true;
            if(global.attachEvent) {
                var checkAsync = function() {
                        isPostMessageAsync = false;
                    };
                global.attachEvent('onmessage', checkAsync);
                global.postMessage('__checkAsync', '*');
                global.detachEvent('onmessage', checkAsync);
            }

            if(isPostMessageAsync) {
                var msg = '__promise' + +new Date,
                    onMessage = function(e) {
                        if(e.data === msg) {
                            e.stopPropagation && e.stopPropagation();
                            callFns();
                        }
                    };

                global.addEventListener?
                    global.addEventListener('message', onMessage, true) :
                    global.attachEvent('onmessage', onMessage);

                return function(fn) {
                    enqueueFn(fn) && global.postMessage(msg, '*');
                };
            }
        }

        var doc = global.document;
        if('onreadystatechange' in doc.createElement('script')) { // ie6-ie8
            var createScript = function() {
                    var script = doc.createElement('script');
                    script.onreadystatechange = function() {
                        script.parentNode.removeChild(script);
                        script = script.onreadystatechange = null;
                        callFns();
                };
                (doc.documentElement || doc.body).appendChild(script);
            };

            return function(fn) {
                enqueueFn(fn) && createScript();
            };
        }

        return function(fn) { // old browsers
            enqueueFn(fn) && setTimeout(callFns, 0);
        };
    })(),
    throwException = function(e) {
        nextTick(function() {
            throw e;
        });
    },
    isFunction = function(obj) {
        return typeof obj === 'function';
    },
    isObject = function(obj) {
        return obj !== null && typeof obj === 'object';
    },
    toStr = Object.prototype.toString,
    isArray = Array.isArray || function(obj) {
        return toStr.call(obj) === '[object Array]';
    },
    getArrayKeys = function(arr) {
        var res = [],
            i = 0, len = arr.length;
        while(i < len) {
            res.push(i++);
        }
        return res;
    },
    getObjectKeys = Object.keys || function(obj) {
        var res = [];
        for(var i in obj) {
            obj.hasOwnProperty(i) && res.push(i);
        }
        return res;
    },
    defineCustomErrorType = function(name) {
        var res = function(message) {
            this.name = name;
            this.message = message;
        };

        res.prototype = new Error();

        return res;
    },
    wrapOnFulfilled = function(onFulfilled, idx) {
        return function(val) {
            onFulfilled.call(this, val, idx);
        };
    };

/**
 * @class Deferred
 * @exports vow:Deferred
 * @description
 * The `Deferred` class is used to encapsulate newly-created promise object along with functions that resolve, reject or notify it.
 */

/**
 * @constructor
 * @description
 * You can use `vow.defer()` instead of using this constructor.
 *
 * `new vow.Deferred()` gives the same result as `vow.defer()`.
 */
var Deferred = function() {
    this._promise = new Promise();
};

Deferred.prototype = /** @lends Deferred.prototype */{
    /**
     * Returns the corresponding promise.
     *
     * @returns {vow:Promise}
     */
    promise : function() {
        return this._promise;
    },

    /**
     * Resolves the corresponding promise with the given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.then(function(value) {
     *     // value is "'success'" here
     * });
     *
     * defer.resolve('success');
     * ```
     */
    resolve : function(value) {
        this._promise.isResolved() || this._promise._resolve(value);
    },

    /**
     * Rejects the corresponding promise with the given `reason`.
     *
     * @param {*} reason
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.fail(function(reason) {
     *     // reason is "'something is wrong'" here
     * });
     *
     * defer.reject('something is wrong');
     * ```
     */
    reject : function(reason) {
        if(this._promise.isResolved()) {
            return;
        }

        if(vow.isPromise(reason)) {
            reason = reason.then(function(val) {
                var defer = vow.defer();
                defer.reject(val);
                return defer.promise();
            });
            this._promise._resolve(reason);
        }
        else {
            this._promise._reject(reason);
        }
    },

    /**
     * Notifies the corresponding promise with the given `value`.
     *
     * @param {*} value
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promise = defer.promise();
     *
     * promise.progress(function(value) {
     *     // value is "'20%'", "'40%'" here
     * });
     *
     * defer.notify('20%');
     * defer.notify('40%');
     * ```
     */
    notify : function(value) {
        this._promise.isResolved() || this._promise._notify(value);
    }
};

var PROMISE_STATUS = {
    PENDING   : 0,
    RESOLVED  : 1,
    FULFILLED : 2,
    REJECTED  : 3
};

/**
 * @class Promise
 * @exports vow:Promise
 * @description
 * The `Promise` class is used when you want to give to the caller something to subscribe to,
 * but not the ability to resolve or reject the deferred.
 */

/**
 * @constructor
 * @param {Function} resolver See https://github.com/domenic/promises-unwrapping/blob/master/README.md#the-promise-constructor for details.
 * @description
 * You should use this constructor directly only if you are going to use `vow` as DOM Promises implementation.
 * In other case you should use `vow.defer()` and `defer.promise()` methods.
 * @example
 * ```js
 * function fetchJSON(url) {
 *     return new vow.Promise(function(resolve, reject, notify) {
 *         var xhr = new XMLHttpRequest();
 *         xhr.open('GET', url);
 *         xhr.responseType = 'json';
 *         xhr.send();
 *         xhr.onload = function() {
 *             if(xhr.response) {
 *                 resolve(xhr.response);
 *             }
 *             else {
 *                 reject(new TypeError());
 *             }
 *         };
 *     });
 * }
 * ```
 */
var Promise = function(resolver) {
    this._value = undef;
    this._status = PROMISE_STATUS.PENDING;

    this._fulfilledCallbacks = [];
    this._rejectedCallbacks = [];
    this._progressCallbacks = [];

    if(resolver) { // NOTE: see https://github.com/domenic/promises-unwrapping/blob/master/README.md
        var _this = this,
            resolverFnLen = resolver.length;

        resolver(
            function(val) {
                _this.isResolved() || _this._resolve(val);
            },
            resolverFnLen > 1?
                function(reason) {
                    _this.isResolved() || _this._reject(reason);
                } :
                undef,
            resolverFnLen > 2?
                function(val) {
                    _this.isResolved() || _this._notify(val);
                } :
                undef);
    }
};

Promise.prototype = /** @lends Promise.prototype */ {
    /**
     * Returns the value of the fulfilled promise or the reason in case of rejection.
     *
     * @returns {*}
     */
    valueOf : function() {
        return this._value;
    },

    /**
     * Returns `true` if the promise is resolved.
     *
     * @returns {Boolean}
     */
    isResolved : function() {
        return this._status !== PROMISE_STATUS.PENDING;
    },

    /**
     * Returns `true` if the promise is fulfilled.
     *
     * @returns {Boolean}
     */
    isFulfilled : function() {
        return this._status === PROMISE_STATUS.FULFILLED;
    },

    /**
     * Returns `true` if the promise is rejected.
     *
     * @returns {Boolean}
     */
    isRejected : function() {
        return this._status === PROMISE_STATUS.REJECTED;
    },

    /**
     * Adds reactions to the promise.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise} A new promise, see https://github.com/promises-aplus/promises-spec for details
     */
    then : function(onFulfilled, onRejected, onProgress, ctx) {
        var defer = new Deferred();
        this._addCallbacks(defer, onFulfilled, onRejected, onProgress, ctx);
        return defer.promise();
    },

    /**
     * Adds only a rejection reaction. This method is a shorthand for `promise.then(undefined, onRejected)`.
     *
     * @param {Function} onRejected Callback that will be called with a provided 'reason' as argument after the promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    'catch' : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds only a rejection reaction. This method is a shorthand for `promise.then(null, onRejected)`. It's also an alias for `catch`.
     *
     * @param {Function} onRejected Callback to be called with the value after promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    fail : function(onRejected, ctx) {
        return this.then(undef, onRejected, ctx);
    },

    /**
     * Adds a resolving reaction (for both fulfillment and rejection).
     *
     * @param {Function} onResolved Callback that will be invoked with the promise as an argument, after the promise has been resolved.
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    always : function(onResolved, ctx) {
        var _this = this,
            cb = function() {
                return onResolved.call(this, _this);
            };

        return this.then(cb, cb, ctx);
    },

    /**
     * Adds a progress reaction.
     *
     * @param {Function} onProgress Callback that will be called with a provided value when the promise has been notified
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    progress : function(onProgress, ctx) {
        return this.then(undef, undef, onProgress, ctx);
    },

    /**
     * Like `promise.then`, but "spreads" the array into a variadic value handler.
     * It is useful with the `vow.all` and the `vow.allResolved` methods.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise()]).spread(function(arg1, arg2) {
     *     // arg1 is "1", arg2 is "'two'" here
     * });
     *
     * defer1.resolve(1);
     * defer2.resolve('two');
     * ```
     */
    spread : function(onFulfilled, onRejected, ctx) {
        return this.then(
            function(val) {
                return onFulfilled.apply(this, val);
            },
            onRejected,
            ctx);
    },

    /**
     * Like `then`, but terminates a chain of promises.
     * If the promise has been rejected, this method throws it's "reason" as an exception in a future turn of the event loop.
     *
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     *
     * @example
     * ```js
     * var defer = vow.defer();
     * defer.reject(Error('Internal error'));
     * defer.promise().done(); // exception to be thrown
     * ```
     */
    done : function(onFulfilled, onRejected, onProgress, ctx) {
        this
            .then(onFulfilled, onRejected, onProgress, ctx)
            .fail(throwException);
    },

    /**
     * Returns a new promise that will be fulfilled in `delay` milliseconds if the promise is fulfilled,
     * or immediately rejected if the promise is rejected.
     *
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(delay) {
        var timer,
            promise = this.then(function(val) {
                var defer = new Deferred();
                timer = setTimeout(
                    function() {
                        defer.resolve(val);
                    },
                    delay);

                return defer.promise();
            });

        promise.always(function() {
            clearTimeout(timer);
        });

        return promise;
    },

    /**
     * Returns a new promise that will be rejected in `timeout` milliseconds
     * if the promise is not resolved beforehand.
     *
     * @param {Number} timeout
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer = vow.defer(),
     *     promiseWithTimeout1 = defer.promise().timeout(50),
     *     promiseWithTimeout2 = defer.promise().timeout(200);
     *
     * setTimeout(
     *     function() {
     *         defer.resolve('ok');
     *     },
     *     100);
     *
     * promiseWithTimeout1.fail(function(reason) {
     *     // promiseWithTimeout to be rejected in 50ms
     * });
     *
     * promiseWithTimeout2.then(function(value) {
     *     // promiseWithTimeout to be fulfilled with "'ok'" value
     * });
     * ```
     */
    timeout : function(timeout) {
        var defer = new Deferred(),
            timer = setTimeout(
                function() {
                    defer.reject(new vow.TimedOutError('timed out'));
                },
                timeout);

        this.then(
            function(val) {
                defer.resolve(val);
            },
            function(reason) {
                defer.reject(reason);
            });

        defer.promise().always(function() {
            clearTimeout(timer);
        });

        return defer.promise();
    },

    _vow : true,

    _resolve : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        if(val === this) {
            this._reject(TypeError('Can\'t resolve promise with itself'));
            return;
        }

        this._status = PROMISE_STATUS.RESOLVED;

        if(val && !!val._vow) { // shortpath for vow.Promise
            val.isFulfilled()?
                this._fulfill(val.valueOf()) :
                val.isRejected()?
                    this._reject(val.valueOf()) :
                    val.then(
                        this._fulfill,
                        this._reject,
                        this._notify,
                        this);
            return;
        }

        if(isObject(val) || isFunction(val)) {
            var then;
            try {
                then = val.then;
            }
            catch(e) {
                this._reject(e);
                return;
            }

            if(isFunction(then)) {
                var _this = this,
                    isResolved = false;

                try {
                    then.call(
                        val,
                        function(val) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._resolve(val);
                        },
                        function(err) {
                            if(isResolved) {
                                return;
                            }

                            isResolved = true;
                            _this._reject(err);
                        },
                        function(val) {
                            _this._notify(val);
                        });
                }
                catch(e) {
                    isResolved || this._reject(e);
                }

                return;
            }
        }

        this._fulfill(val);
    },

    _fulfill : function(val) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.FULFILLED;
        this._value = val;

        this._callCallbacks(this._fulfilledCallbacks, val);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _reject : function(reason) {
        if(this._status > PROMISE_STATUS.RESOLVED) {
            return;
        }

        this._status = PROMISE_STATUS.REJECTED;
        this._value = reason;

        this._callCallbacks(this._rejectedCallbacks, reason);
        this._fulfilledCallbacks = this._rejectedCallbacks = this._progressCallbacks = undef;
    },

    _notify : function(val) {
        this._callCallbacks(this._progressCallbacks, val);
    },

    _addCallbacks : function(defer, onFulfilled, onRejected, onProgress, ctx) {
        if(onRejected && !isFunction(onRejected)) {
            ctx = onRejected;
            onRejected = undef;
        }
        else if(onProgress && !isFunction(onProgress)) {
            ctx = onProgress;
            onProgress = undef;
        }

        var cb;

        if(!this.isRejected()) {
            cb = { defer : defer, fn : isFunction(onFulfilled)? onFulfilled : undef, ctx : ctx };
            this.isFulfilled()?
                this._callCallbacks([cb], this._value) :
                this._fulfilledCallbacks.push(cb);
        }

        if(!this.isFulfilled()) {
            cb = { defer : defer, fn : onRejected, ctx : ctx };
            this.isRejected()?
                this._callCallbacks([cb], this._value) :
                this._rejectedCallbacks.push(cb);
        }

        if(this._status <= PROMISE_STATUS.RESOLVED) {
            this._progressCallbacks.push({ defer : defer, fn : onProgress, ctx : ctx });
        }
    },

    _callCallbacks : function(callbacks, arg) {
        var len = callbacks.length;
        if(!len) {
            return;
        }

        var isResolved = this.isResolved(),
            isFulfilled = this.isFulfilled();

        nextTick(function() {
            var i = 0, cb, defer, fn;
            while(i < len) {
                cb = callbacks[i++];
                defer = cb.defer;
                fn = cb.fn;

                if(fn) {
                    var ctx = cb.ctx,
                        res;
                    try {
                        res = ctx? fn.call(ctx, arg) : fn(arg);
                    }
                    catch(e) {
                        defer.reject(e);
                        continue;
                    }

                    isResolved?
                        defer.resolve(res) :
                        defer.notify(res);
                }
                else {
                    isResolved?
                        isFulfilled?
                            defer.resolve(arg) :
                            defer.reject(arg) :
                        defer.notify(arg);
                }
            }
        });
    }
};

/** @lends Promise */
var staticMethods = {
    /**
     * Coerces the given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return vow.cast(value);
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, then the returned promise will be rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     */
    all : function(iterable) {
        return vow.all(iterable);
    },

    /**
     * Returns a promise, that will be fulfilled only when any of the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, then the returned promise will be rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    race : function(iterable) {
        return vow.anyResolved(iterable);
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, the returned promise will have `value`'s state.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        return vow.resolve(value);
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        return vow.reject(reason);
    }
};

for(var prop in staticMethods) {
    staticMethods.hasOwnProperty(prop) &&
        (Promise[prop] = staticMethods[prop]);
}

var vow = /** @exports vow */ {
    Deferred : Deferred,

    Promise : Promise,

    /**
     * Creates a new deferred. This method is a factory method for `vow:Deferred` class.
     * It's equivalent to `new vow.Deferred()`.
     *
     * @returns {vow:Deferred}
     */
    defer : function() {
        return new Deferred();
    },

    /**
     * Static equivalent to `promise.then`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     */
    when : function(value, onFulfilled, onRejected, onProgress, ctx) {
        return vow.cast(value).then(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.fail`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onRejected Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    fail : function(value, onRejected, ctx) {
        return vow.when(value, undef, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.always`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onResolved Callback that will be invoked with the promise as an argument, after the promise has been resolved.
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    always : function(value, onResolved, ctx) {
        return vow.when(value).always(onResolved, ctx);
    },

    /**
     * Static equivalent to `promise.progress`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} onProgress Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callback execution
     * @returns {vow:Promise}
     */
    progress : function(value, onProgress, ctx) {
        return vow.when(value).progress(onProgress, ctx);
    },

    /**
     * Static equivalent to `promise.spread`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Object} [ctx] Context of the callbacks execution
     * @returns {vow:Promise}
     */
    spread : function(value, onFulfilled, onRejected, ctx) {
        return vow.when(value).spread(onFulfilled, onRejected, ctx);
    },

    /**
     * Static equivalent to `promise.done`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Function} [onFulfilled] Callback that will be invoked with a provided value after the promise has been fulfilled
     * @param {Function} [onRejected] Callback that will be invoked with a provided reason after the promise has been rejected
     * @param {Function} [onProgress] Callback that will be invoked with a provided value after the promise has been notified
     * @param {Object} [ctx] Context of the callbacks execution
     */
    done : function(value, onFulfilled, onRejected, onProgress, ctx) {
        vow.when(value).done(onFulfilled, onRejected, onProgress, ctx);
    },

    /**
     * Checks whether the given `value` is a promise-like object
     *
     * @param {*} value
     * @returns {Boolean}
     *
     * @example
     * ```js
     * vow.isPromise('something'); // returns false
     * vow.isPromise(vow.defer().promise()); // returns true
     * vow.isPromise({ then : function() { }); // returns true
     * ```
     */
    isPromise : function(value) {
        return isObject(value) && isFunction(value.then);
    },

    /**
     * Coerces the given `value` to a promise, or returns the `value` if it's already a promise.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    cast : function(value) {
        return value && !!value._vow?
            value :
            vow.resolve(value);
    },

    /**
     * Static equivalent to `promise.valueOf`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {*}
     */
    valueOf : function(value) {
        return value && isFunction(value.valueOf)? value.valueOf() : value;
    },

    /**
     * Static equivalent to `promise.isFulfilled`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isFulfilled : function(value) {
        return value && isFunction(value.isFulfilled)? value.isFulfilled() : true;
    },

    /**
     * Static equivalent to `promise.isRejected`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isRejected : function(value) {
        return value && isFunction(value.isRejected)? value.isRejected() : false;
    },

    /**
     * Static equivalent to `promise.isResolved`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @returns {Boolean}
     */
    isResolved : function(value) {
        return value && isFunction(value.isResolved)? value.isResolved() : true;
    },

    /**
     * Returns a promise that has already been resolved with the given `value`.
     * If `value` is a promise, the returned promise will have `value`'s state.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    resolve : function(value) {
        var res = vow.defer();
        res.resolve(value);
        return res.promise();
    },

    /**
     * Returns a promise that has already been fulfilled with the given `value`.
     * If `value` is a promise, the returned promise will be fulfilled with the fulfill/rejection value of `value`.
     *
     * @param {*} value
     * @returns {vow:Promise}
     */
    fulfill : function(value) {
        var defer = vow.defer(),
            promise = defer.promise();

        defer.resolve(value);

        return promise.isFulfilled()?
            promise :
            promise.then(null, function(reason) {
                return reason;
            });
    },

    /**
     * Returns a promise that has already been rejected with the given `reason`.
     * If `reason` is a promise, the returned promise will be rejected with the fulfill/rejection value of `reason`.
     *
     * @param {*} reason
     * @returns {vow:Promise}
     */
    reject : function(reason) {
        var defer = vow.defer();
        defer.reject(reason);
        return defer.promise();
    },

    /**
     * Invokes the given function `fn` with arguments `args`
     *
     * @param {Function} fn
     * @param {...*} [args]
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var promise1 = vow.invoke(function(value) {
     *         return value;
     *     }, 'ok'),
     *     promise2 = vow.invoke(function() {
     *         throw Error();
     *     });
     *
     * promise1.isFulfilled(); // true
     * promise1.valueOf(); // 'ok'
     * promise2.isRejected(); // true
     * promise2.valueOf(); // instance of Error
     * ```
     */
    invoke : function(fn, args) {
        var len = Math.max(arguments.length - 1, 0),
            callArgs;
        if(len) { // optimization for V8
            callArgs = Array(len);
            var i = 0;
            while(i < len) {
                callArgs[i++] = arguments[i];
            }
        }

        try {
            return vow.resolve(callArgs?
                fn.apply(global, callArgs) :
                fn.call(global));
        }
        catch(e) {
            return vow.reject(e);
        }
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are fulfilled.
     * If any of the `iterable` items gets rejected, the promise will be rejected.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * with array:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all([defer1.promise(), defer2.promise(), 3])
     *     .then(function(value) {
     *          // value is "[1, 2, 3]" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     *
     * @example
     * with object:
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.all({ p1 : defer1.promise(), p2 : defer2.promise(), p3 : 3 })
     *     .then(function(value) {
     *          // value is "{ p1 : 1, p2 : 2, p3 : 3 }" here
     *     });
     *
     * defer1.resolve(1);
     * defer2.resolve(2);
     * ```
     */
    all : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            len = keys.length,
            res = isPromisesArray? [] : {};

        if(!len) {
            defer.resolve(res);
            return defer.promise();
        }

        var i = len;
        vow._forEach(
            iterable,
            function(value, idx) {
                res[keys[idx]] = value;
                if(!--i) {
                    defer.resolve(res);
                }
            },
            defer.reject,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    /**
     * Returns a promise, that will be fulfilled only after all the items in `iterable` are resolved.
     *
     * @param {Array|Object} iterable
     * @returns {vow:Promise}
     *
     * @example
     * ```js
     * var defer1 = vow.defer(),
     *     defer2 = vow.defer();
     *
     * vow.allResolved([defer1.promise(), defer2.promise()]).spread(function(promise1, promise2) {
     *     promise1.isRejected(); // returns true
     *     promise1.valueOf(); // returns "'error'"
     *     promise2.isFulfilled(); // returns true
     *     promise2.valueOf(); // returns "'ok'"
     * });
     *
     * defer1.reject('error');
     * defer2.resolve('ok');
     * ```
     */
    allResolved : function(iterable) {
        var defer = new Deferred(),
            isPromisesArray = isArray(iterable),
            keys = isPromisesArray?
                getArrayKeys(iterable) :
                getObjectKeys(iterable),
            i = keys.length,
            res = isPromisesArray? [] : {};

        if(!i) {
            defer.resolve(res);
            return defer.promise();
        }

        var onResolved = function() {
                --i || defer.resolve(iterable);
            };

        vow._forEach(
            iterable,
            onResolved,
            onResolved,
            defer.notify,
            defer,
            keys);

        return defer.promise();
    },

    allPatiently : function(iterable) {
        return vow.allResolved(iterable).then(function() {
            var isPromisesArray = isArray(iterable),
                keys = isPromisesArray?
                    getArrayKeys(iterable) :
                    getObjectKeys(iterable),
                rejectedPromises, fulfilledPromises,
                len = keys.length, i = 0, key, promise;

            if(!len) {
                return isPromisesArray? [] : {};
            }

            while(i < len) {
                key = keys[i++];
                promise = iterable[key];
                if(vow.isRejected(promise)) {
                    rejectedPromises || (rejectedPromises = isPromisesArray? [] : {});
                    isPromisesArray?
                        rejectedPromises.push(promise.valueOf()) :
                        rejectedPromises[key] = promise.valueOf();
                }
                else if(!rejectedPromises) {
                    (fulfilledPromises || (fulfilledPromises = isPromisesArray? [] : {}))[key] = vow.valueOf(promise);
                }
            }

            if(rejectedPromises) {
                throw rejectedPromises;
            }

            return fulfilledPromises;
        });
    },

    /**
     * Returns a promise, that will be fulfilled if any of the items in `iterable` is fulfilled.
     * If all of the `iterable` items get rejected, the promise will be rejected (with the reason of the first rejected item).
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    any : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        var i = 0, reason;
        vow._forEach(
            iterable,
            defer.resolve,
            function(e) {
                i || (reason = e);
                ++i === len && defer.reject(reason);
            },
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Returns a promise, that will be fulfilled only when any of the items in `iterable` is fulfilled.
     * If any of the `iterable` items gets rejected, the promise will be rejected.
     *
     * @param {Array} iterable
     * @returns {vow:Promise}
     */
    anyResolved : function(iterable) {
        var defer = new Deferred(),
            len = iterable.length;

        if(!len) {
            defer.reject(Error());
            return defer.promise();
        }

        vow._forEach(
            iterable,
            defer.resolve,
            defer.reject,
            defer.notify,
            defer);

        return defer.promise();
    },

    /**
     * Static equivalent to `promise.delay`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Number} delay
     * @returns {vow:Promise}
     */
    delay : function(value, delay) {
        return vow.resolve(value).delay(delay);
    },

    /**
     * Static equivalent to `promise.timeout`.
     * If `value` is not a promise, then `value` is treated as a fulfilled promise.
     *
     * @param {*} value
     * @param {Number} timeout
     * @returns {vow:Promise}
     */
    timeout : function(value, timeout) {
        return vow.resolve(value).timeout(timeout);
    },

    _forEach : function(promises, onFulfilled, onRejected, onProgress, ctx, keys) {
        var len = keys? keys.length : promises.length,
            i = 0;

        while(i < len) {
            vow.when(
                promises[keys? keys[i] : i],
                wrapOnFulfilled(onFulfilled, i),
                onRejected,
                onProgress,
                ctx);
            ++i;
        }
    },

    TimedOutError : defineCustomErrorType('TimedOut')
};

var defineAsGlobal = true;
if(typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = vow;
    defineAsGlobal = false;
}

if(typeof modules === 'object' && isFunction(modules.define)) {
    modules.define('vow', function(provide) {
        provide(vow);
    });
    defineAsGlobal = false;
}

if(typeof define === 'function') {
    define(function(require, exports, module) {
        module.exports = vow;
    });
    defineAsGlobal = false;
}

defineAsGlobal && (global.vow = vow);

})(this);

}).call(this,require('_process'))

},{"_process":1}],3:[function(require,module,exports){
var Logger = require('./logger/logger');
var logger = new Logger('AudioPlayer');

var Events = require('./lib/async/events');
var Promise = require('./lib/async/promise');
var Deferred = require('./lib/async/deferred');
var detect = require('./lib/browser/detect');
var config = require('./config');
var merge = require('./lib/data/merge');
var reject = require('./lib/async/reject');

var AudioError = require('./error/audio-error');
var AudioStatic = require('./audio-static');

var playerId = 1;

// =================================================================

//  Настройка доступных типов реализаций и их приоритета

// =================================================================

//TODO: сделать интерфейс для возможности подключения новых типов
var audioTypes = {
    html5: require('./html5/audio-html5'),
    flash: require('./flash/audio-flash')
};

var detectString = "@" + detect.platform.version +
    " " + detect.platform.os +
    ":" + detect.browser.name +
    "/" + detect.browser.version;

audioTypes.flash.priority = 0;
audioTypes.html5.priority = config.html5.blacklist.some(function(item) { return detectString.match(item); }) ? -1 : 1;

//INFO: прям в момент инициализации всего модуля нельзя писать в лог - он проглатывает сообщения, т.к. еще нет возможности настроить логгер.
setTimeout(function() {
    logger.info({
        flash: {
            available: audioTypes.flash.available,
            priority: audioTypes.flash.priority
        },
        html5: {
            available: audioTypes.html5.available,
            priority: audioTypes.html5.priority,
            audioContext: !!audioTypes.html5.audioContext
        }
    }, "audioTypes");
}, 0);

// =================================================================

//  JSDOC: вспомогательные классы

// =================================================================

/**
 * Описание временных данных плеера.
 * @typedef {Object} Audio.AudioPlayerTimes
 * @property {Number} duration Длительность аудиофайла.
 * @property {Number} loaded Длительность загруженной части.
 * @property {Number} position Позиция воспроизведения.
 * @property {Number} played Длительность воспроизведения.
 */

// =================================================================

//  JSDOC: Общие события плеера

// =================================================================

/**
 * Событие начала воспроизведения.
 * @event ya.music.Audio#EVENT_PLAY
 */
/**
 * Событие завершения воспроизведения.
 * @event ya.music.Audio#EVENT_ENDED
 */
/**
 * Событие изменения громкости.
 * @event ya.music.Audio#EVENT_VOLUME
 * @param {Number} volume Новое значение громкости.
 */
/**
 * Событие возникновения ошибки при инициализации плеера.
 * @event ya.music.Audio#EVENT_CRASHED
 */
/**
 * Событие смены статуса плеера.
 * @event ya.music.Audio#EVENT_STATE
 * @param {String} state Новый статус плеера.
 */
/**
 * Событие переключения активного плеера и прелоадера.
 * @event ya.music.Audio#EVENT_SWAP
 */

// =================================================================

//  JSDOC: события активного плеера

// =================================================================

/**
 * Событие остановки воспроизведения.
 * @event ya.music.Audio#EVENT_STOP
 */

/**
 * Событие паузы воспроизведения.
 * @event ya.music.Audio#EVENT_PAUSE
 */

/**
 * Событие обновления позиции воспроизведения или загруженной части.
 * @event ya.music.Audio#EVENT_PROGRESS
 * @param {ya.music.Audio~AudioPlayerTimes} times Информация о временных данных аудиофайла.
 */

/**
 * Событие начала загрузки аудиофайла.
 * @event ya.music.Audio#EVENT_LOADING
 */

/**
 * Событие завершения загрузки аудиофайла.
 * @event ya.music.Audio#EVENT_LOADED
 */

/**
 * Событие ошибки воспроизведения.
 * @event ya.music.Audio#EVENT_ERROR
 */

// =================================================================

//  JSDOC: события предзагрузчика

// =================================================================

/**
 * Событие остановки воспроизведения.
 * @event ya.music.Audio#PRELOADER_EVENT+EVENT_STOP
 */

/**
 * Событие обновления позиции загруженной части.
 * @event ya.music.Audio#PRELOADER_EVENT+EVENT_PROGRESS
 * @param {ya.music.Audio~AudioPlayerTimes} times Информация о временных данных аудиофайла.
 */

/**
 * Событие начала загрузки аудиофайла.
 * @event ya.music.Audio#PRELOADER_EVENT+EVENT_LOADING
 */

/**
 * Событие завершения загрузки аудиофайла.
 * @event ya.music.Audio#PRELOADER_EVENT+EVENT_LOADED
 */

/**
 * Событие ошибки воспроизведения.
 * @event ya.music.Audio#PRELOADER_EVENT+EVENT_ERROR
 */

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdecs Аудиоплеер для браузера.
 * @class AudioPlayer
 * @alias ya.music.Audio
 *
 * @param {String} [preferredType="html5"] Предпочитаемый тип плеера. Может принимать значения: "html5", "flash" или
 * любое ложное значение (false, null, undefined, 0, ""). Если выбранный тип плеера окажется недоступен, будет запущен
 * оставшийся тип. Если указано ложное значение либо параметр не передан, то API автоматически выберет поддерживаемый тип плеера.
 * Если браузер поддерживает обе технологии, то по умолчанию YandexAudio создает аудиоплеер на основе HTML5.
 * @param {HTMLElement} [overlay] HTML-контейнер для отображения Flash-апплета.
 *
 * @mixes AudioStatic
 * @extends Events
 *
 * @fires ya.music.Audio#EVENT_PLAY
 * @fires ya.music.Audio#EVENT_ENDED
 * @fires ya.music.Audio#EVENT_VOLUME
 * @fires ya.music.Audio#EVENT_CRASHED
 * @fires ya.music.Audio#EVENT_STATE
 * @fires ya.music.Audio#EVENT_SWAP
 *
 * @fires ya.music.Audio#EVENT_STOP
 * @fires ya.music.Audio#EVENT_PAUSE
 * @fires ya.music.Audio#EVENT_PROGRESS
 * @fires ya.music.Audio#EVENT_LOADING
 * @fires ya.music.Audio#EVENT_LOADED
 * @fires ya.music.Audio#EVENT_ERROR
 *
 * @fires ya.music.Audio#PRELOADER_EVENT+EVENT_STOP
 * @fires ya.music.Audio#PRELOADER_EVENT+EVENT_PROGRESS
 * @fires ya.music.Audio#PRELOADER_EVENT+EVENT_LOADING
 * @fires ya.music.Audio#PRELOADER_EVENT+EVENT_LOADED
 * @fires ya.music.Audio#PRELOADER_EVENT+EVENT_ERROR
 *
 * @constructor
 */
var AudioPlayer = function(preferredType, overlay) {
    this.name = playerId++;
    DEV && logger.debug(this, "constructor");

    Events.call(this);

    this.preferredType = preferredType;
    this.overlay = overlay;
    this.state = AudioPlayer.STATE_INIT;
    this._played = 0;
    this._lastSkip = 0;
    this._playId = null;

    this._whenReady = new Deferred();
    this.whenReady = this._whenReady.promise().then(function() {
        logger.info(this, "implementation found", this.implementation.type);

        this.implementation.on("*", function(event, offset, data) {
            this._populateEvents(event, offset, data);

            if (!offset) {
                switch (event) {
                    case AudioPlayer.EVENT_PLAY:
                        this._setState(AudioPlayer.STATE_PLAYING);
                        break;

                    case AudioPlayer.EVENT_ENDED:
                    case AudioPlayer.EVENT_SWAP:
                    case AudioPlayer.EVENT_STOP:
                    case AudioPlayer.EVENT_ERROR:
                        logger.info(this, "onEnded", event, data);
                        this._setState(AudioPlayer.STATE_IDLE);
                        break;

                    case AudioPlayer.EVENT_PAUSE:
                        this._setState(AudioPlayer.STATE_PAUSED);
                        break;

                    case AudioPlayer.EVENT_CRASHED:
                        this._setState(AudioPlayer.STATE_CRASHED);
                        break;
                }
            }
        }.bind(this));

        this._setState(AudioPlayer.STATE_IDLE);
    }.bind(this), function(e) {
        logger.error(this, AudioError.NO_IMPLEMENTATION, e);

        this._setState(AudioPlayer.STATE_CRASHED);
        throw e;
    }.bind(this));

    this._init(0);
};
Events.mixin(AudioPlayer);
merge(AudioPlayer, AudioStatic, true);

// =================================================================

//  Статика

// =================================================================

/**
 * Список доступных плееров
 * @type {Object}
 * @static
 */
AudioPlayer.info = {
    html5: audioTypes.html5.available,
    flash: audioTypes.flash.available
};

/**
 * Контекст для Web Audio API.
 * @type {AudioContext}
 * @static
 */
AudioPlayer.audioContext = audioTypes.html5.audioContext;

// =================================================================

//  Инициализация

// =================================================================

/**
 * Установить статус плеера.
 * @param {String} state Новый статус.
 * @private
 */
AudioPlayer.prototype._setState = function(state) {
    DEV && logger.debug(this, "_setState", state);

    if (state === AudioPlayer.STATE_PAUSED && this.state !== AudioPlayer.STATE_PLAYING) {
        return;
    }

    var changed = this.state !== state;
    this.state = state;

    if (changed) {
        logger.info(this, "newState", state);
        this.trigger(AudioPlayer.EVENT_STATE, state);
    }
};

/**
 * Инициализация плеера.
 * @param {int} [retry=0] Количество попыток.
 * @private
 */
AudioPlayer.prototype._init = function(retry) {
    retry = retry || 0;
    logger.info(this, "_init", retry);

    if (!this._whenReady.pending) {
        return;
    }

    if (retry > config.audio.retry) {
        logger.error(this, AudioError.NO_IMPLEMENTATION);
        this._whenReady.reject(new AudioError(AudioError.NO_IMPLEMENTATION));
    }

    var initSeq = [
        audioTypes.html5,
        audioTypes.flash
    ].sort(function(a, b) {
        if (a.available !== b.available) {
            return a.available ? -1 : 1;
        }

        if (a.AudioImplementation.type === this.preferredType) {
            return -1;
        }

        if (b.AudioImplementation.type === this.preferredType) {
            return 1;
        }

        return b.priority - a.priority;
    }.bind(this));

    var self = this;

    function init() {
        var type = initSeq.shift();

        if (!type) {
            self._init(retry + 1);
            return;
        }

        self._initType(type).then(self._whenReady.resolve, init);
    }

    init();
};

/**
 * Запуск реализации плеера с указанным типом
 * @param {{type: string, AudioImplementation: function}} type - объект описания типа инициализации.
 * @returns {Promise}
 * @private
 */
AudioPlayer.prototype._initType = function(type) {
    logger.info(this, "_initType", type);

    var deferred = new Deferred();
    try {
        /**
         * Текущая реализация аудио-плеера
         * @type {IAudioImplementation|null}
         * @private
         */
        this.implementation = new type.AudioImplementation(this.overlay);
        if (this.implementation.whenReady) {
            this.implementation.whenReady.then(deferred.resolve, deferred.reject);
        } else {
            deferred.resolve();
        }
    } catch(e) {
        deferred.reject(e);
        logger.warn(this, "_initTypeError", type, e);
    }

    return deferred.promise();
};

// =================================================================

//  Обработка событий

// =================================================================

/**
 * Создание обещания, которое разрешается при одном из списка событий
 * @param {String} action - название действия
 * @param {Array.<String>} resolve - список ожидаемых событий для разрешения обещания
 * @param {Array.<String>} reject - список ожидаемый событий для отклонения обещания
 * @returns {Promise} -- также создает Deferred свойство с названием _when<Action>, которое живет до момента разрешения
 * @private
 */
AudioPlayer.prototype._waitEvents = function(action, resolve, reject) {
    var deferred = new Deferred();
    var self = this;

    this[action] = deferred;

    var cleanupEvents = function() {
        resolve.forEach(function(event) {
            self.off(event, deferred.resolve);
        });
        reject.forEach(function(event) {
            self.off(event, deferred.reject);
        });
        delete self[action];
    };

    resolve.forEach(function(event) {
        self.on(event, deferred.resolve);
    });

    reject.forEach(function(event) {
        self.on(event, function(data) {
            var error = data instanceof Error ? data : new AudioError(data || event);
            deferred.reject(error);
        });
    });

    deferred.promise().then(cleanupEvents, cleanupEvents);

    return deferred.promise();
};

/**
 * Расширение событий аудио-плеера дополнительными свойствами. Подписывается на все события аудио-плеера,
 * триггерит итоговые события, разделяя их по типу активный плеер или прелоадер, дополняет события данными.
 * @param {String} event - событие
 * @param {int} offset - источник события. 0 - активный плеер. 1 - прелоадер.
 * @param {*} data - дополнительные данные события.
 * @private
 */
AudioPlayer.prototype._populateEvents = function(event, offset, data) {
    if (event !== AudioPlayer.EVENT_PROGRESS) {
        DEV && logger.debug(this, "_populateEvents", event, offset, data);
    }

    var outerEvent = (offset ? AudioPlayer.PRELOADER_EVENT : "") + event;

    switch (event) {
        case AudioPlayer.EVENT_CRASHED:
        case AudioPlayer.EVENT_SWAP:
            this.trigger(event, data);
            break;
        case AudioPlayer.EVENT_ERROR:
            logger.error(this, "error", outerEvent, data);
            this.trigger(outerEvent, data);
            break;
        case AudioPlayer.EVENT_VOLUME:
            this.trigger(event, this.getVolume());
            break;
        case AudioPlayer.EVENT_PROGRESS:
            this.trigger(outerEvent, {
                duration: this.getDuration(offset),
                loaded: this.getLoaded(offset),
                position: offset ? 0 : this.getPosition(),
                played: offset ? 0 : this.getPlayed()
            });
            break;
        default:
            this.trigger(outerEvent);
            break;
    }
};

// =================================================================

//  Общие функции управления плеером

// =================================================================

/*
 INFO: данный метод было решено оставить, т.к. это удобнее чем использовать обещание - есть возможность в начале
 инициализации получить сразу ссылку на экземпляр плеера и обвешать его обработчиками событий. Плюс к тому при
 таком подходе реинициализацию делать проще - при ней не придется переназначать обработчики и обновлять везде ссылку
 на текущий экземпляр плеера.
 */

/**
 * @returns {Promise} обещание, разрешающееся после завершения инициализации.
 */
AudioPlayer.prototype.initPromise = function() {
    return this.whenReady;
};

/**
 * @returns {String} статус плеера.
 */
AudioPlayer.prototype.getState = function() {
    return this.state;
};

/**
 * @returns {String|null} тип реализации плеера.
 */
AudioPlayer.prototype.getType = function() {
    return this.implementation && this.implementation.type;
};

/**
 * @param {int} [offset=0] Брать аудиофайлиз активного плеера или из прелоадера. 0 - активный плеер, 1 - прелоадер.
 * @returns {String|null} ссылку на текущий трек.
 */
AudioPlayer.prototype.getSrc = function(offset) {
    return this.implementation && this.implementation.getSrc(offset);
};

// =================================================================

//  Управление воспроизведением

// =================================================================
/**
 * Запуск воспроизведения.
 * @param {String} src Ссылка на трек.
 * @param {Number} [duration] Длительность аудиофайла. Актуально для Flash-реализации, в ней пока аудиофайлгрузится
 * длительность определяется с погрешностью.
 * @returns {AbortablePromise}
 */
AudioPlayer.prototype.play = function(src, duration) {
    logger.info(this, "play", logger._showUrl(src), duration);

    this._played = 0;
    this._lastSkip = 0;
    this._generatePlayId();

    if (this._whenPlay) {
        this._whenPlay.reject("play");
    }
    if (this._whenPause) {
        this._whenPause.reject("play");
    }
    if (this._whenStop) {
        this._whenStop.reject("play");
    }

    var promise = this._waitEvents("_whenPlay", [AudioPlayer.EVENT_PLAY], [
        AudioPlayer.EVENT_STOP,
        AudioPlayer.EVENT_ERROR,
        AudioPlayer.EVENT_CRASHED
    ]);

    promise.abort = function() {
        if (this._whenPlay) {
            this._whenPlay.reject.apply(this._whenPlay, arguments);
            this.stop();
        }
    }.bind(this);

    this._setState(AudioPlayer.STATE_PAUSED);
    this.implementation.play(src, duration);

    return promise;
};

/**
 * Перезапуск воспроизведения.
 * @returns {AbortablePromise} Promise-объект, который разрешится, когда трек будет перезапущен.
 */
AudioPlayer.prototype.restart = function() {
    if (!this.getDuration()) {
        return reject(new AudioError(AudioError.BAD_STATE));
    }

    this._generatePlayId();
    this.setPosition(0);
    this._played = 0;
    this._lastSkip = 0;
    return this.resume();
};

/**
 * Остановка воспроизведения.
 * @param {int} [offset=0] Активный плеер или прелоадер. 0 - активный плеер. 1 - прелоадер.
 * @returns {AbortablePromise} Promise-объект, который разрешится, когда воспроизведение будет остановлено.
 */
AudioPlayer.prototype.stop = function(offset) {
    logger.info(this, "stop", offset);

    if (offset !== 0) {
        return this.implementation.stop(offset);
    }

    this._played = 0;
    this._lastSkip = 0;

    if (this._whenPlay) {
        this._whenPlay.reject("stop");
    }
    if (this._whenPause) {
        this._whenPause.reject("stop");
    }

    var promise;
    if (this._whenStop) {
        promise = this._whenStop.promise();
    } else {
        promise = this._waitEvents("_whenStop", [AudioPlayer.EVENT_STOP], [
            AudioPlayer.EVENT_PLAY,
            AudioPlayer.EVENT_ERROR,
            AudioPlayer.EVENT_CRASHED
        ]);
    }

    this.implementation.stop();

    return promise;
};

/**
 * Поставить плеер на паузу.
 * @returns {AbortablePromise} Promise-объект, который разрешится, когда плеер будет поставлен на паузу.
 */
AudioPlayer.prototype.pause = function() {
    logger.info(this, "pause");

    if (this.state !== AudioPlayer.STATE_PLAYING) {
        return reject(new AudioError(AudioError.BAD_STATE));
    }

    var promise;

    if (this._whenPlay) {
        this._whenPlay.reject("pause");
    }

    if (this._whenPause) {
        promise = this._whenPause.promise();
    } else {
        promise = this._waitEvents("_whenPause", [AudioPlayer.EVENT_PAUSE], [
            AudioPlayer.EVENT_STOP,
            AudioPlayer.EVENT_PLAY,
            AudioPlayer.EVENT_ERROR,
            AudioPlayer.EVENT_CRASHED
        ]);
    }

    this.implementation.pause();

    return promise;
};

/**
 * Снятие плеера с паузы.
 * @returns {AbortablePromise} Promise-объект, который разрешится, когда начнется воспроизведение.
 */
AudioPlayer.prototype.resume = function() {
    logger.info(this, "resume");

    if (this.state === AudioPlayer.STATE_PLAYING && !this._whenPause) {
        return Promise.resolve();
    }

    if (!(this.state === AudioPlayer.STATE_IDLE || this.state === AudioPlayer.STATE_PAUSED
        || this.state === AudioPlayer.STATE_PLAYING)) {
        return reject(new AudioError(AudioError.BAD_STATE));
    }

    var promise;

    if (this._whenPause) {
        this._whenPause.reject("resume");
    }

    if (this._whenPlay) {
        promise = this._whenPlay.promise();
    } else {
        promise = this._waitEvents("_whenPlay", [AudioPlayer.EVENT_PLAY], [
            AudioPlayer.EVENT_STOP,
            AudioPlayer.EVENT_ERROR,
            AudioPlayer.EVENT_CRASHED
        ]);

        promise.abort = function() {
            if (this._whenPlay) {
                this._whenPlay.reject.apply(this._whenPlay, arguments);
                this.stop();
            }
        }.bind(this);
    }

    this.implementation.resume();

    return promise;
};

/**
 * Запуск воспроизведения предзагруженного аудиофайла.
 * @param {String} [src] Ссылка на аудиофайл (для проверки, что в прелоадере нужный трек).
 * @returns {AbortablePromise} Promise-объект, который разрешится, когда начнется воспроизведение предзагруженного аудиофайла.
 */
AudioPlayer.prototype.playPreloaded = function(src) {
    logger.info(this, "playPreloaded", logger._showUrl(src));

    if (!src) {
        src = this.getSrc(1);
    }

    if (!this.isPreloaded(src)) {
        logger.warn(this, "playPreloadedBadTrack", AudioError.NOT_PRELOADED);
        return reject(new AudioError(AudioError.NOT_PRELOADED));
    }

    this._played = 0;
    this._lastSkip = 0;
    this._generatePlayId();

    if (this._whenPlay) {
        this._whenPlay.reject("playPreloaded");
    }
    if (this._whenPause) {
        this._whenPause.reject("playPreloaded");
    }
    if (this._whenStop) {
        this._whenStop.reject("playPreloaded");
    }

    var promise = this._waitEvents("_whenPlay", [AudioPlayer.EVENT_PLAY], [
        AudioPlayer.EVENT_STOP,
        AudioPlayer.EVENT_ERROR,
        AudioPlayer.EVENT_CRASHED
    ]);
    promise.abort = function() {
        if (this._whenPlay) {
            this._whenPlay.reject.apply(this._whenPlay, arguments);
            this.stop();
        }
    }.bind(this);

    this._setState(AudioPlayer.STATE_PAUSED);
    var result = this.implementation.playPreloaded();

    if (!result) {
        logger.warn(this, "playPreloadedError", AudioError.NOT_PRELOADED);
        this._whenPlay.reject(new AudioError(AudioError.NOT_PRELOADED));
    }

    return promise;
};

// =================================================================

//  Предзагрузка

// =================================================================

/**
 * Предзагрузка аудиофайла.
 * @param {String} src Ссылка на трек.
 * @param {Number} [duration] Длительность аудиофайла. Актуально для Flash-реализации, в ней пока аудиофайл грузится
 * длительность определяется с погрешностью.
 * @returns {AbortablePromise} Promise-объект, который разрешится, когда начнется предзагрузка аудиофайла.
 */
AudioPlayer.prototype.preload = function(src, duration) {
    if (detect.browser.name === "msie" && detect.browser.version[0] == "9") {
        return reject(new AudioError(AudioError.NOT_PRELOADED));
    }

    logger.info(this, "preload", logger._showUrl(src), duration);

    if (this._whenPreload) {
        this._whenPreload.reject("preload");
    }

    var promise = this._waitEvents("_whenPreload", [
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_LOADING,
        AudioPlayer.EVENT_SWAP
    ], [
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_CRASHED,
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_ERROR,
        AudioPlayer.PRELOADER_EVENT + AudioPlayer.EVENT_STOP
    ]);

    promise.abort = function() {
        if (this._whenPreload) {
            this._whenPreload.reject.apply(this._whenPreload, arguments);
            this.stop(1);
        }
    }.bind(this);

    this.implementation.preload(src, duration);

    return promise;
};

/**
 * Проверка, что аудиофайл предзагружен.
 * @param {String} src Ссылка на трек.
 * @returns {Boolean} true, если аудиофайл предварительно загружен, false - иначе.
 */
AudioPlayer.prototype.isPreloaded = function(src) {
    return this.implementation.isPreloaded(src);
};

/**
 * Проверка, что аудиофайл предзагружается.
 * @param {String} src Ссылка на трек.
 * @returns {Boolean} true, если аудиофайл начал предварительно загружаться, false - иначе.
 */
AudioPlayer.prototype.isPreloading = function(src) {
    return this.implementation.isPreloading(src, 1);
};

// =================================================================

//  Тайминги

// =================================================================

/**
 * Получение позиции воспроизведения.
 * @returns {Number} позиция воспроизведения (в секундах).
 */
AudioPlayer.prototype.getPosition = function() {
    return this.implementation.getPosition() || 0;
};

/**
 * Установка позиции воспроизведения.
 * @param {Number} position Новая позиция воспроизведения (в секундах).
 * @returns {Number} конечная позиция воспроизведения.
 */
AudioPlayer.prototype.setPosition = function(position) {
    logger.info(this, "setPosition", position);

    if (this.implementation.type == "flash") {
        position = Math.max(0, Math.min(this.getLoaded() - 1, position));
    } else {
        position = Math.max(0, Math.min(this.getDuration() - 1, position));
    }

    this._played += this.getPosition() - this._lastSkip;
    this._lastSkip = position;

    this.implementation.setPosition(position);

    return position;
};

/**
 * @param {Boolean|int} preloader Активный плеер или предзагрузчик. 0 - активный плеер, 1 - предзагрузчик.
 * @returns {Number} длительность аудиофайла (в секундах).
 */
AudioPlayer.prototype.getDuration = function(preloader) {
    return this.implementation.getDuration(preloader ? 1 : 0) || 0;
};

/**
 * @param {Boolean|int} preloader Активный плеер или предзагрузчик. 0 - активный плеер, 1 - предзагрузчик.
 * @returns {Number} длительность загруженной части (в секундах).
 */
AudioPlayer.prototype.getLoaded = function(preloader) {
    return this.implementation.getLoaded(preloader ? 1 : 0) || 0;
};

/**
 * @returns {Number} длительность воспроизведения (в секундах).
 */
AudioPlayer.prototype.getPlayed = function() {
    var position = this.getPosition();
    this._played += position - this._lastSkip;
    this._lastSkip = position;

    return this._played;
};

// =================================================================

//  Громкость

// =================================================================

/**
 * @returns {Number} текущее значение громкости плеера.
 */
AudioPlayer.prototype.getVolume = function() {
    if (!this.implementation) {
        return 0;
    }

    return this.implementation.getVolume();
};

/**
 * Установка громкости плеера.
 * @param {Number} volume Новое значение громкости.
 * @returns {Number} итоговое значение громкости.
 */
AudioPlayer.prototype.setVolume = function(volume) {
    DEV && logger.debug(this, "setVolume", volume);

    if (!this.implementation) {
        return 0;
    }

    return this.implementation.setVolume(volume);
};

/**
 * Проверка, что громкость управляется устройством, а не программно.
 * @returns {Boolean} true, если громкость управляется устройством, false - иначе.
 */
AudioPlayer.prototype.isDeviceVolume = function() {
    if (!this.implementation) {
        return true;
    }

    return this.implementation.isDeviceVolume();
};

// =================================================================

//  Web Audio API

// =================================================================
AudioPlayer.prototype.toggleCrossDomain = function(state) {
    if (this.implementation.type !== "html5") {
        logger.warn(this, "toggleCrossDomainFailed", this.implementation.type);
        return false;
    }

    this.implementation.toggleCrossDomain(state);
};

/**
 * Переключение режима использования Web Audio API. Доступен только при html5-реализации плеера.
 * <note type="attention"> после включения режима Web Audio API он не отключается полностью, т.к. для этого требуется
 * реинициализация плеера, которой требуется клик пользователя. При отключении из графа обработки исключаются
 * все ноды кроме нод-источников и ноды вывода, управление громкостью переключается на элементы audio, без
 * использования GainNode. </note>
 * @param {Boolean} state Запрашиваемый статус.
 * @returns {Boolean} Итоговый статус плеера.
 */
AudioPlayer.prototype.toggleWebAudioAPI = function(state) {
    logger.info(this, "toggleWebAudioAPI", state);
    if (this.implementation.type !== "html5") {
        logger.warn(this, "toggleWebAudioAPIFailed", this.implementation.type);
        return false;
    }

    return this.implementation.toggleWebAudioAPI(state);
};

/**
 * Аудио-препроцессор.
 * @typedef {Object} Audio.AudioPreprocessor
 *
 * @property {AudioNode} input Нода, в которую перенаправляется вывод аудио.
 * @property {AudioNode} output Нода, из которой вывод подается на усилитель.
 */

/**
 * Подключение аудио препроцессора. Вход препроцессора подключается к аудиоэлементу, у которого выставлена
 * 100% громкость. Выход препроцессора подключается к GainNode, которая регулирует итоговую громкость.
 * @param {ya.music.Audio~AudioPreprocessor} preprocessor Препроцессор.
 * @returns {boolean} статус успеха.
 */
AudioPlayer.prototype.setAudioPreprocessor = function(preprocessor) {
    logger.info(this, "setAudioPreprocessor");
    if (this.implementation.type !== "html5") {
        logger.warn(this, "setAudioPreprocessorFailed", this.implementation.type);
        return false;
    }

    return this.implementation.setAudioPreprocessor(preprocessor);
};

// =================================================================

//  Логгирование

// =================================================================

/**
 * Генерация playId
 * @private
 */
AudioPlayer.prototype._generatePlayId = function() {
    this._playId = Math.random().toString().slice(2);
};

/**
 * @returns {String} playId.
 */
AudioPlayer.prototype.getPlayId = function() {
    return this._playId;
};

/**
 * Вспомогательная функция для отображения состояния плеера в логе.
 * @private
 */
AudioPlayer.prototype._logger = function() {
    return {
        index: this.implementation && this.implementation.name,
        src: this.implementation && this.implementation._logger(),
        type: this.implementation && this.implementation.type
    };
};

module.exports = AudioPlayer;

},{"./audio-static":4,"./config":5,"./error/audio-error":6,"./flash/audio-flash":10,"./html5/audio-html5":26,"./lib/async/deferred":28,"./lib/async/events":29,"./lib/async/promise":30,"./lib/async/reject":31,"./lib/browser/detect":32,"./lib/data/merge":37,"./logger/logger":42}],4:[function(require,module,exports){
/**
 * @namespace AudioStatic
 * @private
 */
var AudioStatic = {};

/**
 * Начало воспроизведения трека.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_PLAY = "play";
/**
 * Остановка воспроизведения.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_STOP = "stop";
/**
 * Пауза воспроизведения.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_PAUSE = "pause";
/**
 * Обновление позиции воспроизведения.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_PROGRESS = "progress";
/**
 * Началась загрузка трека.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_LOADING = "loading";
/**
 * Загрузка трека завершена.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_LOADED = "loaded";
/**
 * Изменение громкости.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_VOLUME = "volumechange";

/**
 * Воспроизведение трека завершено.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_ENDED = "ended";
/**
 * Возникла ошибка при инициализации плеера.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_CRASHED = "crashed";
/**
 * Возникла ошибка при воспроизведении.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_ERROR = "error";
/**
 * Изменение статуса плеера.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_STATE = "state";
/**
 * Переключение между текущим и предзагруженным треком.
 * @type {String}
 * @const
 */
AudioStatic.EVENT_SWAP = "swap";
/**
 * Событие предзагрузчика. Используется в качестве префикса.
 * @type {String}
 * @const
 */
AudioStatic.PRELOADER_EVENT = "preloader:";
/**
 * Плеер находится в состоянии инициализации.
 * @type {String}
 * @const
 */
AudioStatic.STATE_INIT = "init";
/**
 * Не удалось инициализировать плеер.
 * @type {String}
 * @const
 */
AudioStatic.STATE_CRASHED = "crashed";
/**
 * Плеер готов и ожидает.
 * @type {String}
 * @const
 */
AudioStatic.STATE_IDLE = "idle";
/**
 * Плеер проигрывает трек.
 * @type {String}
 * @const
 */
AudioStatic.STATE_PLAYING = "playing";
/**
 * Плеер поставлен на паузу.
 * @type {String}
 * @const
 */
AudioStatic.STATE_PAUSED = "paused";

module.exports = AudioStatic;

},{}],5:[function(require,module,exports){
/**
 * Настройки библиотеки.
 * @alias ya.music.Audio.config
 * @namespace
 */
var config = {

    // =================================================================

    //  Общие настройки

    // =================================================================

    /**
     * Общие настройки.
     * @namespace
     */
    audio: {
        /**
         * Количество попыток реинициализации
         * @type {Number}
         */
        retry: 3
    },

    // =================================================================

    //  Flash-плеер

    // =================================================================

    /**
     * Настройки подключения Flash-плеера.
     * @namespace
     */
    flash: {
        /**
         * Путь к .swf файлу флеш-плеера
         * @type {String}
         */
        path: "dist",
        /**
         * Имя .swf файла флеш-плеера
         * @type {String}
         */
        name: "player-2_1.swf",
        /**
         * Минимальная версия флеш-плеера
         * @type {String}
         */
        version: "9.0.28",
        /**
         * ID, который будет выставлен для элемента с Flash-плеером
         * @type {String}
         */
        playerID: "YandexAudioFlashPlayer",
        /**
         * Имя функции-обработчика событий Flash-плеера
         * @type {String}
         * @const
         */
        callback: "ya.music.Audio._flashCallback",
        /**
         * Таймаут инициализации
         * @type {Number}
         */
        initTimeout: 3000, // 3 sec
        /**
         * Таймаут загрузки
         * @type {Number}
         */
        loadTimeout: 5000,
        /**
         * Таймаут инициализации после клика
         * @type {Number}
         */
        clickTimeout: 1000,
        /**
         * Интервал проверки доступности Flash-плеера
         * @type {Number}
         */
        heartBeatInterval: 1000
    },

    // =================================================================

    //  HTML5-плеер

    // =================================================================

    /**
     * Описание настроек HTML5 плеера.
     * @namespace
     */
    html5: {
        /**
         * Список идентификаторов для которых лучше не использовать html5 плеер. Используется при
         * авто-определении типа плеера. Идентификаторы сравниваются со строкой построенной по шаблону
         * `@&lt;platform.version&gt; &lt;platform.os&gt;:&lt;browser.name&gt;/&lt;browser.version&gt;`
         * @type {Array.<String>}
         */
        blacklist: ["linux:mozilla", "unix:mozilla", "macos:mozilla", ":opera", "@NT 5", "@NT 4", ":msie/9"]
    }
};

module.exports = config;

},{}],6:[function(require,module,exports){
var ErrorClass = require('../lib/class/error-class');

/**
 * @class AudioError
 * @alias ya.music.Audio~AudioError
 * @classdecs Класс ошибки аудиопллеера.
 * @extends Error
 * @param {String} message Текст ошибки.
 *
 * @constructor
 */
var AudioError = function(message) {
    ErrorClass.call(this, message);
};
AudioError.prototype = ErrorClass.create("AudioError");

/**
 * Не найдена реализация плеера или возникла ошибка при инициализации всех доступных реализаций.
 * @type {String}
 * @const
 */
AudioError.NO_IMPLEMENTATION = "cannot find suitable implementation";
/**
 * Аудиофайл не был предзагружен или во время загрузки произошла ошибка.
 * @type {String}
 * @const
 */
AudioError.NOT_PRELOADED = "track is not preloaded";
/**
 * Действие недоступно из текущего состояния.
 * @type {String}
 * @const
 */
AudioError.BAD_STATE = "action is not permited from current state";

/**
 * Flash-плеер был заблокирован.
 * @type {String}
 * @const
 */
AudioError.FLASH_BLOCKER = "flash is rejected by flash blocker plugin";
/**
 * Возникла ошибка при инициализации Flash-плеера по неизвестным причинам.
 * @type {String}
 * @const
 */
AudioError.FLASH_UNKNOWN_CRASH = "flash is crashed without reason";
/**
 * Возникла ошибка при инициализации Flash-плеера из-за таймаута.
 * @type {String}
 * @const
 */
AudioError.FLASH_INIT_TIMEOUT = "flash init timed out";
/**
 * Внутренняя ошибка Flash-плеера.
 * @type {String}
 * @const
 */
AudioError.FLASH_INTERNAL_ERROR = "flash internal error";
/**
 * Попытка вызвать недоступный экземляр Flash-плеера.
 * @type {String}
 * @const
 */
AudioError.FLASH_EMMITER_NOT_FOUND = "flash event emmiter not found";
/**
 * Flash-плеер перестал отвечать на запросы.
 * @type {String}
 * @const
 */
AudioError.FLASH_NOT_RESPONDING = "flash player doesn't response";

module.exports = AudioError;

},{"../lib/class/error-class":35}],7:[function(require,module,exports){
require('../export');

var AudioError = require('./audio-error');
var PlaybackError = require('./playback-error');

ya.music.Audio.AudioError = AudioError;
ya.music.Audio.PlaybackError = PlaybackError;

},{"../export":9,"./audio-error":6,"./playback-error":8}],8:[function(require,module,exports){
var ErrorClass = require('../lib/class/error-class');

/**
 * @class PlaybackError
 * @alias ya.music.Audio~PlaybackError
 * @classdecs Класс ошибки воспроизведения.
 * @extends Error
 * @param String message Текст ошибки.
 * @param String src Ссылка на трек.
 *
 * @constructor
 */
var PlaybackError = function(message, src) {
    ErrorClass.call(this, message);

    this.src = src;
};

PlaybackError.prototype = ErrorClass.create("PlaybackError");

/**
 * Отмена соединенния.
 * @type {String}
 * @const
 */
PlaybackError.CONNECTION_ABORTED = "Connection aborted";
/**
 * Сетевая ошибка.
 * @type {String}
 * @const
 */
PlaybackError.NETWORK_ERROR = "Network error";
/**
 * Ошибка декодирования аудио.
 * @type {String}
 * @const
 */
PlaybackError.DECODE_ERROR = "Decode error";
/**
 * Недоступный источник.
 * @type {String}
 * @const
 */
PlaybackError.BAD_DATA = "Bad data";

/**
 * Не запускается воспроизведение.
 * @type {String}
 * @const
 */
PlaybackError.DONT_START = "Playback start error";

/**
 * Таблица соответствия кодов ошибок HTML5 плеера. 
 * 
 * @const
 * @type {Object}
 */
PlaybackError.html5 = {
    1: PlaybackError.CONNECTION_ABORTED,
    2: PlaybackError.NETWORK_ERROR,
    3: PlaybackError.DECODE_ERROR,
    4: PlaybackError.BAD_DATA
};

//TODO: сделать классификатор ошибок flash-плеера

module.exports = PlaybackError;

},{"../lib/class/error-class":35}],9:[function(require,module,exports){
if (typeof DEV === "undefined") {
    window.DEV = true;
}

if (typeof window.ya === "undefined") {
    window.ya = {};
}

var ya = window.ya;

if (typeof ya.music === "undefined") {
    ya.music = {};
}

if (typeof ya.music.Audio === "undefined") {
    ya.music.Audio = {};
}

var config = require('./config');
var AudioPlayer = require('./audio-player');
var Proxy = require('./lib/class/proxy');

ya.music.Audio = Proxy.createClass(AudioPlayer);
ya.music.Audio.config = config;

module.exports = ya.music.Audio;

},{"./audio-player":3,"./config":5,"./lib/class/proxy":36}],10:[function(require,module,exports){
var config = require('../config');
var swfobject = require('../lib/browser/swfobject');
var detect = require('../lib/browser/detect');
var Logger = require('../logger/logger');
var logger = new Logger('AudioFlash');
var FlashManager = require('./flash-manager');
var FlashInterface = require('./flash-interface');
var Events = require('../lib/async/events');

var playerId = 1;

var flashManager;

// =================================================================

//  Проверка доступности flash-плеера

// =================================================================

var flashVersion = swfobject.getFlashPlayerVersion();
detect.flashVersion = flashVersion.major + "." + flashVersion.minor + "." + flashVersion.release;

exports.available = swfobject.hasFlashPlayerVersion(config.flash.version);
logger.info(this, "detection", exports.available);

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdesc Класс flash аудио-плеера
 * @extends IAudioImplementation
 *
 * @fires IAudioImplementation#EVENT_PLAY
 * @fires IAudioImplementation#EVENT_ENDED
 * @fires IAudioImplementation#EVENT_VOLUME
 * @fires IAudioImplementation#EVENT_CRASHED
 * @fires IAudioImplementation#EVENT_SWAP
 *
 * @fires IAudioImplementation#EVENT_STOP
 * @fires IAudioImplementation#EVENT_PAUSE
 * @fires IAudioImplementation#EVENT_PROGRESS
 * @fires IAudioImplementation#EVENT_LOADING
 * @fires IAudioImplementation#EVENT_LOADED
 * @fires IAudioImplementation#EVENT_ERROR
 *
 * @param {HTMLElement} [overlay] - место для встраивания плеера (актуально только для flash-плеера)
 * @param {Boolean} [force=false] - создать новый экзепляр FlashManager
 * @constructor
 * @private
 */
var AudioFlash = function(overlay, force) {
    this.name = playerId++;
    DEV && logger.debug(this, "constructor");

    if (!flashManager || force) {
        flashManager = new FlashManager(overlay);
    }

    Events.call(this);

    this.whenReady = flashManager.createPlayer(this);
    this.whenReady.then(function(data) {
        logger.info(this, "ready", data);
    }.bind(this), function(e) {
        logger.error(this, "failed", e);
    }.bind(this));
};
Events.mixin(AudioFlash);

exports.type = AudioFlash.type = AudioFlash.prototype.type = "flash";

// =================================================================

//  Создание методов работы с плеером

// =================================================================

Object.keys(FlashInterface.prototype).filter(function(key) {
    return FlashInterface.prototype.hasOwnProperty(key) && key[0] !== "_";
}).map(function(method) {
    AudioFlash.prototype[method] = function() {
        if (!/^get/.test(method)) {
            DEV && logger.debug(this, method);
        }

        if (!this.hasOwnProperty("id")) {
            logger.warn(this, "player is not ready");
            return null;
        }

        var args = [].slice.call(arguments);
        args.unshift(this.id);
        return flashManager.flash[method].apply(flashManager.flash, args);
    }
});

// =================================================================

//  JSDOC

// =================================================================

/**
 * Проиграть трек
 * @method AudioFlash#play
 * @param {String} src - ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 */

/**
 * Поставить трек на паузу
 * @method AudioFlash#pause
 */

/**
 * Снять трек с паузы
 * @method AudioFlash#resume
 */

/**
 * Остановить воспроизведение и загрузку трека
 * @method AudioFlash#stop
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 */

/**
 * Предзагрузить трек
 * @method AudioFlash#preload
 * @param {String} src - Ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 */

/**
 * Проверить что трек предзагружается
 * @method AudioFlash#isPreloaded
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */

/**
 * Проверить что трек предзагружается
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */

/**
 * Проверить что трек начал предзагружаться
 * @method AudioFlash#isPreloading
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */

/**
 * Запустить воспроизведение предзагруженного трека
 * @method AudioFlash#playPreloaded
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean} -- доступность данного действия
 */

/**
 * Получить позицию воспроизведения
 * @method AudioFlash#getPosition
 * @returns {number}
 */

/**
 * Установить текущую позицию воспроизведения
 * @method AudioFlash#setPosition
 * @param {number} position
 */

/**
 * Получить длительность трека
 * @method AudioFlash#getDuration
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */

/**
 * Получить длительность загруженной части трека
 * @method AudioFlash#getLoaded
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */

/**
 * Получить текущее значение громкости
 * @method AudioFlash#getVolume
 * @returns {number}
 */

/**
 * Установить значение громкости
 * @method AudioFlash#setVolume
 * @param {number} volume
 */

/**
 * Получить ссылку на трек
 * @method AudioFlash#getSrc
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {String|Boolean} -- Ссылка на трек или false, если нет загружаемого трека
 */

// =================================================================

//  Получение данных о плеере

// =================================================================

/**
 * Проверить доступен ли программный контроль громкости
 * @returns {boolean}
 */
AudioFlash.prototype.isDeviceVolume = function() {
    return false;
};

// =================================================================

//  Логгирование

// =================================================================

/**
 * Вспомогательная функция для отображения состояния плеера в логе.
 * @private
 */
AudioFlash.prototype._logger = function() {
    try {
        if (!this.hasOwnProperty("id")) {
            return {
                main: "not ready",
                preloader: "not ready"
            };
        }
        return {
            main: logger._showUrl(this.getSrc(0)),
            preloader: logger._showUrl(this.getSrc(1))
        };
    } catch(e) {
        return "";
    }
};

exports.AudioImplementation = AudioFlash;

},{"../config":5,"../lib/async/events":29,"../lib/browser/detect":32,"../lib/browser/swfobject":33,"../logger/logger":42,"./flash-interface":11,"./flash-manager":12}],11:[function(require,module,exports){
var Logger = require('../logger/logger');
var logger = new Logger('FlashInterface');

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdesc Описание внешнего интерфейса flash-плеера
 * @param {Object} flash - swf-объект
 * @constructor
 * @private
 */
var FlashInterface = function(flash) {
    //FIXME: нужно придумать нормальный метод экспорта
    this.flash = ya.music.Audio._flash = flash;
};

// =================================================================

//  Общение с flash-плеером

// =================================================================

/**
 * Вызвать метод flash-плеера
 * @param {String} fn - название метода
 * @returns {*}
 * @private
 */
FlashInterface.prototype._callFlash = function(fn) {
    //DEV && logger.debug(this, fn, arguments);

    try {
        return this.flash.call.apply(this.flash, arguments);
    } catch(e) {
        logger.error(this, "_callFlashError", e, arguments[0], arguments[1], arguments[2]);
        return null;
    }
};

/**
 * Проверка обратной связи с flash-плеером
 * @throws Ошибка доступа к flash-плееру
 * @private
 */
FlashInterface.prototype._heartBeat = function() {
    this._callFlash("heartBeat", -1);
};

/**
 * Добавить новый плеер
 * @returns {int} -- id нового плеера
 * @private
 */
FlashInterface.prototype._addPlayer = function() {
    return this._callFlash("addPlayer", -1);
};

// =================================================================

//  Методы управления плеером

// =================================================================

/**
 * Установить громкость
 * @param {int} id - id плеера
 * @param {Number} volume - желаемая громкость
 */
FlashInterface.prototype.setVolume = function(id, volume) {
    this._callFlash("setVolume", -1, volume);
};

/**
 * Получить значение громкости
 * @returns {Number}
 */
FlashInterface.prototype.getVolume = function() {
    return this._callFlash("getVolume", -1);
};

/**
 * Запустить воспроизведение трека
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {Number} duration - длительность трека
 */
FlashInterface.prototype.play = function(id, src, duration) {
    this._callFlash("play", id, src, duration);
};

/**
 * Остановить воспроизведение и загрузку трека
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 */
FlashInterface.prototype.stop = function(id, offset) {
    this._callFlash("stop", id, offset || 0);
};

/**
 * Поставить трек на паузу
 * @param {int} id - id плеера
 */
FlashInterface.prototype.pause = function(id) {
    this._callFlash("pause", id);
};

/**
 * Снять трек с паузы
 * @param {int} id - id плеера
 */
FlashInterface.prototype.resume = function(id) {
    this._callFlash("resume", id);
};

/**
 * Получить позицию воспроизведения
 * @param {int} id - id плеера
 * @returns {Number}
 */
FlashInterface.prototype.getPosition = function(id) {
    return this._callFlash("getPosition", id);
};

/**
 * Установить текущую позицию воспроизведения
 * @param {int} id - id плеера
 * @param {number} position
 */
FlashInterface.prototype.setPosition = function(id, position) {
    this._callFlash("setPosition", id, position);
};

/**
 * Получить длительность трека
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {Number}
 */
FlashInterface.prototype.getDuration = function(id, offset) {
    return this._callFlash("getDuration", id, offset || 0);
};

/**
 * Получить длительность загруженной части трека
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {Number}
 */
FlashInterface.prototype.getLoaded = function(id, offset) {
    return this._callFlash("getLoaded", id, offset || 0);
};

// =================================================================

//  Предзагрузка

// =================================================================

/**
 * Предзагрузить трек
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {Number} duration - длительность трека
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @returns {Boolean} -- возможность данного действия
 */
FlashInterface.prototype.preload = function(id, src, duration, offset) {
    return this._callFlash("preload", id, src, duration, offset == null ? 1 : offset);
};

/**
 * Проверить что трек предзагружается
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @returns {Boolean}
 */
FlashInterface.prototype.isPreloaded = function(id, src, offset) {
    return this._callFlash("isPreloaded", id, src, offset == null ? 1 : offset);
};

/**
 * Проверить что трек начал предзагружаться
 * @param {int} id - id плеера
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @returns {Boolean}
 */
FlashInterface.prototype.isPreloading = function(id, src, offset) {
    return this._callFlash("isPreloading", id, src, offset == null ? 1 : offset);
};

/**
 * Запустить воспроизведение предзагруженного трека
 * @param {int} id - id плеера
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean} -- доступность данного действия
 */
FlashInterface.prototype.playPreloaded = function(id, offset) {
    return this._callFlash("playPreloaded", id, offset == null ? 1 : offset);
};

// =================================================================

//  Получение данных о плеере

// =================================================================

/**
 * Получить ссылку на трек
 * @param {int} id - id плеера
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {String}
 */
FlashInterface.prototype.getSrc = function(id, offset) {
    return this._callFlash("getSrc", id, offset || 0);
};

module.exports = FlashInterface;

},{"../logger/logger":42}],12:[function(require,module,exports){
var Logger = require('../logger/logger');
var logger = new Logger('FlashManager');

var config = require('../config');

var AudioStatic = require('../audio-static');
var flashLoader = require('./loader');
var FlashInterface = require('./flash-interface');

var Promise = require('../lib/async/promise');
var Deferred = require('../lib/async/deferred');

var AudioError = require('../error/audio-error');
var LoaderError = require('../lib/net/error/loader-error');

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdesc Загрузка flash-плеера и обработка событий
 * @param {HTMLElement} overlay - объект для загрузки и показа flash-плеера
 * @constructor
 * @private
 */
var FlashManager = function(overlay) { // singleton!
    DEV && logger.debug(this, "constructor", overlay);

    this.state = "init";
    this.overlay = overlay;
    this.emmiters = [];

    var deferred = this.deferred = new Deferred();
    /**
     * Обещание, которое разрешается при завершении инициализации
     * @type {Promise}
     */
    this.whenReady = this.deferred.promise();

    var callbackPath = config.flash.callback.split(".");
    var callbackName = callbackPath.pop();
    var callbackCont = window;
    callbackPath.forEach(function(part) {
        if (!callbackCont[part]) {
            callbackCont[part] = {};
        }
        callbackCont = callbackCont[part];
    });
    callbackCont[callbackName] = this._onEvent.bind(this);

    this.__loadTimeout = setTimeout(this._onLoadTimeout.bind(this), config.flash.loadTimeout);
    flashLoader(config.flash.path + "/"
        + config.flash.name, config.flash.version, config.flash.playerID, this._onLoad.bind(this), {}, overlay);

    if (overlay) {
        var timeout;
        overlay.addEventListener("mousedown", function() { //KNOWLEDGE: only mousedown event and only wmode: transparent
            timeout = timeout || setTimeout(function() {
                    deferred.reject(new AudioError(AudioError.FLASH_NOT_RESPONDING));
                }, config.flash.clickTimeout);
        }, true);
    }

    this.whenReady.then(function(result) {
        timeout = timeout && clearTimeout(timeout);
        logger.info(this, "ready", result);
    }.bind(this), function(e) {
        logger.error(this, "failed", e);
    }.bind(this));
};

FlashManager.EVENT_INIT = "init";
FlashManager.EVENT_FAIL = "failed";
FlashManager.EVENT_ERROR = "error";
FlashManager.EVENT_DEBUG = "debug";

// =================================================================

//  Обработчики событий инициализации flash

// =================================================================

/**
 * Обработчик события загрузки плеера
 * @param data
 * @private
 */
FlashManager.prototype._onLoad = function(data) {
    DEV && logger.debug(this, "_onLoad", data);

    clearTimeout(this.__loadTimeout);
    delete this.__loadTimeout;

    if (data.success) {
        this.flash = new FlashInterface(data.ref);

        if (this.state === "ready") {
            this.deferred.resolve(data.ref);
        } else if (!this.overlay) {
            this.__initTimeout = setTimeout(this._onInitTimeout.bind(this), config.flash.initTimeout);
        }
    } else {
        this.state = "failed";
        this.deferred.reject(new AudioError(data.__fbn ? AudioError.FLASH_BLOCKER : AudioError.FLASH_UNKNOWN_CRASH));
    }
};

/**
 * Обработчик таймаута загрузки
 * @private
 */
FlashManager.prototype._onLoadTimeout = function() {
    this.state = "failed";
    this.deferred.reject(new LoaderError(LoaderError.TIMEOUT));
};

/**
 * Обработчик таймаута инициализации
 * @private
 */
FlashManager.prototype._onInitTimeout = function() {
    this.state = "failed";
    this.deferred.reject(new AudioError(AudioError.FLASH_INIT_TIMEOUT));
};

/**
 * Обработчик успешности инициализации
 * @private
 */
FlashManager.prototype._onInit = function() {
    DEV && logger.debug(this, "_onInit");

    this.state = "ready";

    if (this.__initTimeout) {
        clearTimeout(this.__initTimeout);
        delete this.__initTimeout;
    }

    if (this.flash) {
        this.deferred.resolve(this.flash);
        this.__heartbeat = setInterval(this._onHeartBeat.bind(this), 1000);
    }
};

// =================================================================

//  Обработчики событий flash-плеера

// =================================================================

/**
 * Обработчик событий, создаваемых flash-плеером
 * @param {String} event
 * @param {int} id - id плеера
 * @param {int} offset - 0: для текущего загрузчика, 1: для следующего загрузчика
 * @param {*} data - данные переданные вместе с событием
 * @private
 */
FlashManager.prototype._onEvent = function(event, id, offset, data) {
    if (this.state === "failed") {
        logger.warn(this, "onEventFailed", event, id, offset, data);
        return;
    }

    if (event === FlashManager.EVENT_DEBUG) {
        logger.info(this, "flashDEBUG", id, offset, data);
    } else if (event === FlashManager.EVENT_ERROR) {
        logger.warn(this, "flashError", id, offset, data);
    } else {
        DEV && logger.debug(this, "onEvent", event, id, offset);
    }

    if (event === FlashManager.EVENT_INIT) {
        return this._onInit();
    }

    if (event === FlashManager.EVENT_FAIL) {
        logger.error(this, "failed", AudioError.FLASH_INTERNAL_ERROR);
        this.deferred.reject(new AudioError(AudioError.FLASH_INTERNAL_ERROR));
        return;
    }

    //INFO: в обработчике события переданного из флеша нельзя обращаться к флеш-объекту, поэтому делаем рассинхронизацию
    if (id == -1) {
        Promise.resolve().then(function() {
            this.emmiters.forEach(function(emmiter) {
                emmiter.trigger(event, offset, data);
            });
        }.bind(this));
    } else if (this.emmiters[id]) {
        Promise.resolve().then(function() {
            this.emmiters[id].trigger(event, offset, data);
        }.bind(this));
    } else {
        logger.error(this, AudioError.FLASH_EMMITER_NOT_FOUND, id);
    }
};

/**
 * Проверка доступности flash-плеера
 * @private
 */
FlashManager.prototype._onHeartBeat = function() {
    try {
        this.flash._heartBeat();
    } catch(e) {
        logger.error(this, "crashed", e);
        this._onEvent(AudioStatic.EVENT_CRASHED, -1, e);
    }
};

// =================================================================

//  Управление плеером

// =================================================================

/**
 * Создание нового плеера
 * @param {AudioFlash} audioFlash - flash аудио-плеер, который будет обслуживать созданный плеер
 * @returns {Promise} -- обещание, которое разрешается после завершения создания плеера
 */
FlashManager.prototype.createPlayer = function(audioFlash) {
    DEV && logger.debug(this, "createPlayer");

    var promise = this.whenReady.then(function() {
        audioFlash.id = this.flash._addPlayer();
        this.emmiters[audioFlash.id] = audioFlash;
        return audioFlash.id;
    }.bind(this));

    promise.then(function(playerId) {
        DEV && logger.debug(this, "createPlayerSuccess", playerId);
    }.bind(this), function(err) {
        logger.error(this, "createPlayerError", err);
    }.bind(this));

    return promise;
};

module.exports = FlashManager;

},{"../audio-static":4,"../config":5,"../error/audio-error":6,"../lib/async/deferred":28,"../lib/async/promise":30,"../lib/net/error/loader-error":39,"../logger/logger":42,"./flash-interface":11,"./loader":15}],13:[function(require,module,exports){
/**
 * @ignore
 * @file
 * This is a wrapper for swfobject that detects FlashBlock in browser.
 *
 * Wrapper detects:
 *   - Chrome
 *     - FlashBlock (https://chrome.google.com/webstore/detail/cdngiadmnkhgemkimkhiilgffbjijcie)
 *     - FlashBlock (https://chrome.google.com/webstore/detail/gofhjkjmkpinhpoiabjplobcaignabnl)
 *     - FlashFree (https://chrome.google.com/webstore/detail/ebmieckllmmifjjbipnppinpiohpfahm)
 *   - Firefox Flashblock (https://addons.mozilla.org/ru/firefox/addon/flashblock/)
 *   - Opera >= 11.5 "Enable plugins on demand" setting
 *   - Safari ClickToFlash Extension (http://hoyois.github.com/safariextensions/clicktoplugin/)
 *   - Safari ClickToFlash Plugin (for Safari < 5.0.6) (http://rentzsch.github.com/clicktoflash/)
 *
 * Tested on:
 *   - Chrome 12
 *     - FlashBlock by Lex1 1.2.11.12
 *     - FlashBlock by josorek 0.9.31
 *     - FlashFree 1.1.3
 *   - Firefox 5.0.1 + Flashblock 1.5.15.1
 *   - Opera 11.5
 *   - Safari 5.1 + ClickToFlash (2.3.2)
 *
 * Also this wrapper can remove blocked swf and let you downgrade to other options.
 *
 * Feel free to contact me via email.
 *
 * Copyright 2011, Alexey Androsov
 * Dual licensed under the MIT (http://www.opensource.org/licenses/mit-license.php) or GPL Version 3 (http://www.gnu.org/licenses/gpl.html) licenses.
 *
 * Thanks to flashblockdetector project (http://code.google.com/p/flashblockdetector)
 *
 * @requires swfobject
 * @author Alexey Androsov <doochik@ya.ru>
 * @version 1.0
 */

var swfobject = require('../lib/browser/swfobject');

function remove(node) {
    node.parentNode.removeChild(node);
}

/**
 * Модуль загрузки флеш-плеера с возможностью отслеживания блокировщиков
 * @namespace
 * @private
 */
var FlashBlockNotifier = {

    /**
     * CSS-class for swf wrapper.
     * @protected
     * @default fbn-swf-wrapper
     * @type String
     */
    __SWF_WRAPPER_CLASS: 'fbn-swf-wrapper',

    /**
     * Timeout for flash block detect
     * @default 500
     * @protected
     * @type Number
     */
    __TIMEOUT: 500,

    __TESTS: [
        // Chome FlashBlock extension (https://chrome.google.com/webstore/detail/cdngiadmnkhgemkimkhiilgffbjijcie)
        // Chome FlashBlock extension (https://chrome.google.com/webstore/detail/gofhjkjmkpinhpoiabjplobcaignabnl)
        function(swfNode, wrapperNode) {
            // we expect that swf is the only child of wrapper
            return wrapperNode.childNodes.length > 1
        }, // older Safari ClickToFlash (http://rentzsch.github.com/clicktoflash/)
        function(swfNode) {
            // IE has no swfNode.type
            return swfNode.type && swfNode.type != 'application/x-shockwave-flash'
        }, // FlashBlock for Firefox (https://addons.mozilla.org/ru/firefox/addon/flashblock/)
        // Chrome FlashFree (https://chrome.google.com/webstore/detail/ebmieckllmmifjjbipnppinpiohpfahm)
        function(swfNode) {
            // swf have been detached from DOM
            return !swfNode.parentNode;
        }, // Safari ClickToFlash Extension (http://hoyois.github.com/safariextensions/clicktoplugin/)
        function(swfNode) {
            return swfNode.parentNode.className.indexOf('CTFnodisplay') > -1;
        }
    ],

    /**
     * Embed SWF info page. This function has same options as swfobject.embedSWF except last param removeBlockedSWF.
     * @see http://code.google.com/p/swfobject/wiki/api
     * @param swfUrlStr
     * @param replaceElemIdStr
     * @param widthStr
     * @param heightStr
     * @param swfVersionStr
     * @param xiSwfUrlStr
     * @param flashvarsObj
     * @param parObj
     * @param attObj
     * @param callbackFn
     * @param {Boolean} [removeBlockedSWF=true] Remove swf if blocked
     */
    embedSWF: function(
        swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj,
        parObj, attObj, callbackFn, removeBlockedSWF
    ) {
        // var swfobject = window['swfobject'];

        if (!swfobject) {
            return;
        }

        swfobject.addDomLoadEvent(function() {
            var replaceElement = document.getElementById(replaceElemIdStr);
            if (!replaceElement) {
                return;
            }

            // We need to create div-wrapper because some flash block plugins replace swf with another content.
            // Also some flash requires wrapper to work properly.
            var wrapper = document.createElement('div');
            wrapper.className = FlashBlockNotifier.__SWF_WRAPPER_CLASS;

            replaceElement.parentNode.replaceChild(wrapper, replaceElement);
            wrapper.appendChild(replaceElement);

            swfobject.embedSWF(swfUrlStr,
                replaceElemIdStr,
                widthStr,
                heightStr,
                swfVersionStr,
                xiSwfUrlStr,
                flashvarsObj,
                parObj,
                attObj,
                function(e) {
                    // e.success === false means that browser don't have flash or flash is too old
                    // @see http://code.google.com/p/swfobject/wiki/api
                    if (!e || e.success === false) {
                        callbackFn(e);

                    } else {
                        var swfElement = e['ref'];
                        // Opera 11.5 and above replaces flash with SVG button
                        // msie (and canary chrome 32.0) crashes on swfElement['getSVGDocument']()
                        var replacedBySVG = false;
                        try {
                            replacedBySVG = swfElement && swfElement['getSVGDocument']
                                && swfElement['getSVGDocument']();
                        } catch(err) {
                        }
                        if (replacedBySVG) {
                            onFailure(e);

                        } else {
                            //set timeout to let FlashBlock plugin detect swf and replace it some contents
                            window.setTimeout(function() {
                                var TESTS = FlashBlockNotifier.__TESTS;
                                for (var i = 0, j = TESTS.length; i < j; i++) {
                                    if (TESTS[i](swfElement, wrapper)) {
                                        onFailure(e);
                                        return;
                                    }
                                }
                                callbackFn(e);
                            }, FlashBlockNotifier.__TIMEOUT);
                        }
                    }

                    function onFailure(e) {
                        if (removeBlockedSWF !== false) {
                            //remove swf
                            swfobject.removeSWF(replaceElemIdStr);
                            //remove wrapper
                            remove(wrapper);

                            //remove extension artefacts

                            //ClickToFlash artefacts
                            var ctf = document.getElementById('CTFstack');
                            if (ctf) {
                                remove(ctf);
                            }

                            //Chrome FlashBlock artefact
                            var lastBodyChild = document.body.lastChild;
                            if (lastBodyChild && lastBodyChild.className == 'ujs_flashblock_placeholder') {
                                remove(lastBodyChild);
                            }
                        }
                        e.success = false;
                        e.__fbn = true;
                        callbackFn(e);
                    }
                });
        });
    }
};

module.exports = FlashBlockNotifier;

},{"../lib/browser/swfobject":33}],14:[function(require,module,exports){
var swfobject = require('../lib/browser/swfobject');

/**
 * Модуль загрузки флеш-плеера
 * @namespace
 * @private
 */
var FlashEmbedder = {

    /**
     * CSS-class for swf wrapper.
     * @protected
     * @default femb-swf-wrapper
     * @type String
     */
    __SWF_WRAPPER_CLASS: 'femb-swf-wrapper',

    /**
     * Timeout for flash block detect
     * @default 500
     * @protected
     * @type Number
     */
    __TIMEOUT: 500,

    /**
     * Embed SWF info page. This function has same options as swfobject.embedSWF
     * @see http://code.google.com/p/swfobject/wiki/api
     * @param swfUrlStr
     * @param replaceElemIdStr
     * @param widthStr
     * @param heightStr
     * @param swfVersionStr
     * @param xiSwfUrlStr
     * @param flashvarsObj
     * @param parObj
     * @param attObj
     * @param callbackFn
     */
    embedSWF: function(
        swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj,
        parObj, attObj, callbackFn
    ) {
        swfobject.addDomLoadEvent(function() {
            var replaceElement = document.getElementById(replaceElemIdStr);
            if (!replaceElement) {
                return;
            }

            // We need to create div-wrapper because some flash block plugins replace swf with another content.
            // Also some flash requires wrapper to work properly.
            var wrapper = document.createElement('div');
            wrapper.className = FlashEmbedder.__SWF_WRAPPER_CLASS;

            replaceElement.parentNode.replaceChild(wrapper, replaceElement);
            wrapper.appendChild(replaceElement);

            swfobject.embedSWF(swfUrlStr,
                replaceElemIdStr,
                widthStr,
                heightStr,
                swfVersionStr,
                xiSwfUrlStr,
                flashvarsObj,
                parObj,
                attObj,
                function(e) {
                    // e.success === false means that browser don't have flash or flash is too old
                    // @see http://code.google.com/p/swfobject/wiki/api
                    if (!e || e.success === false) {
                        callbackFn(e);
                    } else {
                        var swfElement = e['ref'];
                        // Opera 11.5 and above replaces flash with SVG button
                        // msie (and canary chrome 32.0) crashes on swfElement['getSVGDocument']()
                        var replacedBySVG = false;
                        try {
                            replacedBySVG = swfElement && swfElement['getSVGDocument']
                                && swfElement['getSVGDocument']();
                        } catch(err) {
                        }
                        if (replacedBySVG) {
                            onFailure(e);

                        } else {
                            //set timeout to let FlashBlock plugin detect swf and replace it some contents
                            window.setTimeout(function() {
                                callbackFn(e);
                            }, FlashEmbedder.__TIMEOUT);
                        }
                    }

                    function onFailure(e) {
                        e.success = false;
                        callbackFn(e);
                    }
                });
        });
    }
};

module.exports = FlashEmbedder;

},{"../lib/browser/swfobject":33}],15:[function(require,module,exports){
var FlashBlockNotifier = require('./flashblocknotifier');
var FlashEmbedder = require('./flashembedder');
var detect = require('../lib/browser/detect');

var winSafari = detect.platform.os === 'windows' && detect.browser.name === 'safari';

var CONTAINER_CLASS = "ya-flash-player-wrapper";

/**
 * Загрузчик флеш-плеера
 *
 * @alias FlashManager~flashLoader
 *
 * @param {string} url - Ссылка на плеера
 * @param {string} minVersion - минимальная версия плеера
 * @param {string|number} id - идентификатор нового плеера
 * @param {function} loadCallback - колбек для события загрузки
 * @param {object} flashVars - данные передаваемые во флеш
 * @param {HTMLElement} container - контейнер для видимого флеш-плеера
 * @param {string} sizeX - размер по горизонтали
 * @param {string} sizeY - размер по вертикали
 *
 * @returns {HTMLElement} -- Контейнер флеш-плеера
 */
module.exports = function(url, minVersion, id, loadCallback, flashVars, container, sizeX, sizeY) {
    var $flashPlayer = document.createElement("div");
    $flashPlayer.id = "wrapper_" + id;
    $flashPlayer.innerHTML = '<div id="' + id + '"></div>';

    sizeX = sizeX || "1000";
    sizeY = sizeY || "1000";

    var embedder,
        flashSizeX,
        flashSizeY,
        options;

    if (container && !winSafari) {
        embedder = FlashEmbedder;
        flashSizeX = sizeX;
        flashSizeY = sizeY;
        options = {allowscriptaccess: "always", wmode: "transparent"};

        $flashPlayer.className = CONTAINER_CLASS;
        $flashPlayer.style.cssText = 'position: relative; width: 100%; height: 100%; overflow: hidden;';
        container.appendChild($flashPlayer);
    } else {
        embedder = FlashBlockNotifier;
        flashSizeX = flashSizeY = "1";
        options = {allowscriptaccess: "always"};

        $flashPlayer.style.cssText = 'position: absolute; left: -1px; top: -1px; width: 0px; height: 0px; overflow: hidden;';
        document.body.appendChild($flashPlayer);
    }

    embedder.embedSWF(
        url,
        id,
        flashSizeX,
        flashSizeY,
        minVersion,
        "",
        flashVars,
        options,
        {},
        loadCallback
    );

    return $flashPlayer;
};

},{"../lib/browser/detect":32,"./flashblocknotifier":13,"./flashembedder":14}],16:[function(require,module,exports){
module.exports = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

},{}],17:[function(require,module,exports){
module.exports = [
    {
        "id": "default",
        "preamp": 0,
        "bands": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
    },
    {
        "id": "Classical",
        "preamp": -0.5,
        "bands": [-0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -3.5, -3.5, -3.5, -4.5]
    },
    {
        "id": "Club",
        "preamp": -3.359999895095825,
        "bands": [-0.5, -0.5, 4, 2.5, 2.5, 2.5, 1.5, -0.5, -0.5, -0.5]
    },
    {
        "id": "Dance",
        "preamp": -2.1599998474121094,
        "bands": [4.5, 3.5, 1, -0.5, -0.5, -2.5, -3.5, -3.5, -0.5, -0.5]
    },
    {
        "id": "Full Bass",
        "preamp": -3.5999999046325684,
        "bands": [4, 4.5, 4.5, 2.5, 0.5, -2, -4, -5, -5.5, -5.5]
    },
    {
        "id": "Full Bass & Treble",
        "preamp": -5.039999961853027,
        "bands": [3.5, 2.5, -0.5, -3.5, -2, 0.5, 4, 5.5, 6, 6]
    },
    {
        "id": "Full Treble",
        "preamp": -6,
        "bands": [-4.5, -4.5, -4.5, -2, 1, 5.5, 8, 8, 8, 8]
    },
    {
        "id": "Laptop Speakers / Headphone",
        "preamp": -4.079999923706055,
        "bands": [2, 5.5, 2.5, -1.5, -1, 0.5, 2, 4.5, 6, 7]
    },
    {
        "id": "Large Hall",
        "preamp": -3.5999999046325684,
        "bands": [5, 5, 2.5, 2.5, -0.5, -2, -2, -2, -0.5, -0.5]
    },
    {
        "id": "Live",
        "preamp": -2.6399998664855957,
        "bands": [-2, -0.5, 2, 2.5, 2.5, 2.5, 2, 1, 1, 1]
    },
    {
        "id": "Party",
        "preamp": -2.6399998664855957,
        "bands": [3.5, 3.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, 3.5, 3.5]
    },
    {
        "id": "Pop",
        "preamp": -3.119999885559082,
        "bands": [-0.5, 2, 3.5, 4, 2.5, -0.5, -1, -1, -0.5, -0.5]
    },
    {
        "id": "Reggae",
        "preamp": -4.079999923706055,
        "bands": [-0.5, -0.5, -0.5, -2.5, -0.5, 3, 3, -0.5, -0.5, -0.5]
    },
    {
        "id": "Rock",
        "preamp": -5.039999961853027,
        "bands": [4, 2, -2.5, -4, -1.5, 2, 4, 5.5, 5.5, 5.5]
    },
    {
        "id": "Ska",
        "preamp": -5.519999980926514,
        "bands": [-1, -2, -2, -0.5, 2, 2.5, 4, 4.5, 5.5, 4.5]
    },
    {
        "id": "Soft",
        "preamp": -4.799999713897705,
        "bands": [2, 0.5, -0.5, -1, -0.5, 2, 4, 4.5, 5.5, 6]
    },
    {
        "id": "Soft Rock",
        "preamp": -2.6399998664855957,
        "bands": [2, 2, 1, -0.5, -2, -2.5, -1.5, -0.5, 1, 4]
    },
    {
        "id": "Techno",
        "preamp": -3.8399999141693115,
        "bands": [4, 2.5, -0.5, -2.5, -2, -0.5, 4, 4.5, 4.5, 4]
    }
];

},{}],18:[function(require,module,exports){
var Events = require('../../lib/async/events');
var EqualizerStatic = require('./equalizer-static');

// =================================================================

//  Конструктор

// =================================================================

/**
 * Событие изменения значения усиления.
 * @event Audio.fx.Equalizer.EqualizerBand#EVENT_CHANGE
 * @param {Number} value Новое значение.
 */

/**
 * @class EqualizerBand
 * @alias ya.music.Audio.fx.Equalizer~EqualizerBand
 * @classdecs Полоса пропускания эквалайзера.
 * @extends Events
 *
 * @param {AudioContext} audioContext Контекст Web Audio API.
 * @param {String} type Тип фильтра.
 * @param {Number} frequency Частота фильтра.
 *
 * @fires ya.music.Audio.fx.Equalizer~EqualizerBand#EVENT_CHANGE
 *
 * @constructor
 */
var EqualizerBand = function(audioContext, type, frequency) {
    Events.call(this);

    this.type = type;

    this.filter = audioContext.createBiquadFilter();
    this.filter.type = type;
    this.filter.frequency.value = frequency;
    this.filter.Q.value = 1;
    this.filter.gain.value = 0;
};
Events.mixin(EqualizerBand);

// =================================================================

//  Управление настройками

// =================================================================

/**
 * @returns {Number} частоту полосы пропускания.
 */
EqualizerBand.prototype.getFreq = function() {
    return this.filter.frequency.value;
};

/**
 * @returns {Number} Значение усиления.
 */
EqualizerBand.prototype.getValue = function() {
    return this.filter.gain.value;
};

/**
 * Установить значение усиления.
 * @param {Number} value Значение.
 */
EqualizerBand.prototype.setValue = function(value) {
    this.filter.gain.value = value;
    this.trigger(EqualizerStatic.EVENT_CHANGE, value);
};

module.exports = EqualizerBand;

},{"../../lib/async/events":29,"./equalizer-static":19}],19:[function(require,module,exports){
/**
 * @namespace EqualizerStatic
 * @private
 */
var EqualizerStatic = {};

/** @type {String}
 * @const*/
EqualizerStatic.EVENT_CHANGE = "change";

module.exports = EqualizerStatic;

},{}],20:[function(require,module,exports){
var Events = require('../../lib/async/events');
var merge = require('../../lib/data/merge');

var EqualizerStatic = require('./equalizer-static');
var EqualizerBand = require('./equalizer-band');

/**
 * Описание настроек эквалайзера.
 * @typedef {Object} Audio.fx.Equalizer.EqualizerPreset
 * @property {String} [id] Идентификатор настроек.
 * @property {Number} preamp Предусилитель.
 * @property {Array.<Number>} bands Значения для полос эквалайзера.
 */

/**
 * Событие изменения полосы пропускания
 * @event Audio.fx.Equalizer#EVENT_CHANGE
 *
 * @param {Number} freq Частота полосы пропускания.
 * @param {Number} value Значение усиления.
 */

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdecs Эквалайзер.
 * @class Equalizer
 * @alias ya.music.Audio.fx.Equalizer
 *
 * @param {AudioContext} audioContext Контекст Web Audio API.
 * @param {Array.<Number>} bands Список частот для полос эквалайзера.
 *
 * @extends Events
 * @mixes EqualizerStatic
 *
 * @fires ya.music.Audio.fx.Equalizer#EVENT_CHANGE
 *
 * @constructor
 */
var Equalizer = function(audioContext, bands) {
    Events.call(this);

    this.preamp = new EqualizerBand(audioContext, "highshelf", 0);
    this.preamp.on("*", this._onBandEvent.bind(this, this.preamp));

    bands = bands || Equalizer.DEFAULT_BANDS;

    var prev;
    this.bands = bands.map(function(frequency, idx) {
        var band = new EqualizerBand(
            audioContext,

            idx == 0 ? 'lowshelf'
                : idx + 1 < bands.length ? "peaking"
                : "highshelf",

            frequency
        );
        band.on("*", this._onBandEvent.bind(this, band));

        if (!prev) {
            this.preamp.filter.connect(band.filter);
        } else {
            prev.filter.connect(band.filter);
        }

        prev = band;
        return band;
    }.bind(this));

    this.input = this.preamp.filter;
    this.output = this.bands[this.bands.length - 1].filter;
};
Events.mixin(Equalizer);
merge(Equalizer, EqualizerStatic, true);

// =================================================================

//  Настройки по-умолчанию

// =================================================================

/**
 * Набор частот эквалайзера, применяющийся по умолчанию.
 * @type {Array.<Number>}
 * @const
 */
Equalizer.DEFAULT_BANDS = require('./default.bands.js');

/**
 * Набор распространенных пресетов эквалайзера для набора частот по умолчанию.
 * @type {Object.<String, ya.music.Audio.fx.Equalizer~EqualizerPreset>}
 * @const
 */
Equalizer.DEFAULT_PRESETS = require('./default.presets.js');

// =================================================================

//  Обработка событий

// =================================================================

/**
 * Обработка события полосы эквалайзера
 * @param {EqualizerBand} band - полоса эквалайзера
 * @param {String} event - событие
 * @param {*} data - данные события
 * @private
 */
Equalizer.prototype._onBandEvent = function(band, event, data) {
    this.trigger(event, band.getFreq(), data);
};

// =================================================================

//  Загрузка и сохранение настроек

// =================================================================

/**
 * Загрузить настройки.
 * @param {ya.music.Audio.fx.Equalizer~EqualizerPreset} preset Настройки.
 */
Equalizer.prototype.loadPreset = function(preset) {
    preset.bands.forEach(function(value, idx) {
        this.bands[idx].setValue(value);
    }.bind(this));
    this.preamp.setValue(preset.preamp);
};

/**
 * Сохранить текущие настройки.
 * @returns {ya.music.Audio.fx.Equalizer~EqualizerPreset}
 */
Equalizer.prototype.savePreset = function() {
    return {
        preamp: this.preamp.getValue(),
        bands: this.bands.map(function(band) { return band.getValue(); })
    };
};

// =================================================================

//  Математика

// =================================================================

//TODO: проверить предположение (скорее всего нужна карта весов для различных частот или даже некая функция)
/**
 * Вычисляет оптимальное значение предусиления. Функция является экспериментальной.
 * @experimental
 * @returns {number} значение предусиления.
 */
Equalizer.prototype.guessPreamp = function() {
    var v = 0;
    for (var k = 0, l = this.bands.length; k < l; k++) {
        v += this.bands[k].getValue();
    }

    return -v / 2;
};

module.exports = Equalizer;

},{"../../lib/async/events":29,"../../lib/data/merge":37,"./default.bands.js":16,"./default.presets.js":17,"./equalizer-band":18,"./equalizer-static":19}],21:[function(require,module,exports){
require('../export');

ya.music.Audio.fx.Equalizer = require('./equalizer');

},{"../export":22,"./equalizer":20}],22:[function(require,module,exports){
require('../export');

ya.music.Audio.fx = {};

},{"../export":9}],23:[function(require,module,exports){
require('../export');

ya.music.Audio.fx.volumeLib = require('./volume-lib');

},{"../export":22,"./volume-lib":24}],24:[function(require,module,exports){
/**
 * Методы конвертации значений громкости.
 * @alias ya.music.Audio.fx.volumeLib
 * @namespace
 */
var volumeLib = {};

/**
 * Минимальное значение громкости, при котором происходит отключение звука.
 * Ограничение в 0.01 подобрано эмпирически.
 * @type {number}
 */
volumeLib.EPSILON = 0.01;

/**
 * Коэффициент для преобразований громкости из относительной шкалы в децибелы.
 * @type Number
 * @private
 */
volumeLib._DBFS_COEF = 20 / Math.log(10);

/**
 * Вычисление значение громкости по значению на логарифмической шкале.
 * @param {Number} value Значение на шкале.
 * @returns {Number} значение громкости.
 */
volumeLib.toExponent = function(value) {
    var volume = Math.pow(volumeLib.EPSILON, 1 - value);
    return volume > volumeLib.EPSILON ? volume : 0;
};

/**
 * @param {Number} volume Громкость.
 * @returns {Number} значения положения на логарифмической шкале по значению громкости.
 */
volumeLib.fromExponent = function(volume) {
    return 1 - Math.log(Math.max(volume, volumeLib.EPSILON)) / Math.log(volumeLib.EPSILON);
};

/**
 * @param {Number} volume Относительная громкость.
 * @returns {Number} значения dBFS из относительного значения громкости.
 */
volumeLib.toDBFS = function(volume) {
    return Math.log(volume) * volumeLib._DBFS_COEF;
};

/**
 * @param {Number} dbfs Громкость в dBFS.
 * @returns {Number} значения относительной громкости из значения dBFS.
 */
volumeLib.fromDBFS = function(dbfs) {
    return Math.exp(dbfs / volumeLib._DBFS_COEF);
};

module.exports = volumeLib;

},{}],25:[function(require,module,exports){
var Logger = require('../logger/logger');
var logger = new Logger('AudioHTML5Loader');

var Events = require('../lib/async/events');
var Deferred = require('../lib/async/deferred');
var AudioStatic = require('../audio-static');
var PlaybackError = require('../error/playback-error');
var noop = require('../lib/noop');

var loaderId = 1;

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdesc Обёртка для нативного класса Audio
 * @extends Events
 **
 * @fires IAudioImplementation#EVENT_PLAY
 * @fires IAudioImplementation#EVENT_ENDED
 * @fires IAudioImplementation#EVENT_STOP
 * @fires IAudioImplementation#EVENT_PAUSE
 * @fires IAudioImplementation#EVENT_PROGRESS
 * @fires IAudioImplementation#EVENT_LOADING
 * @fires IAudioImplementation#EVENT_LOADED
 * @fires IAudioImplementation#EVENT_ERROR
 *
 * @constructor
 * @private
 */
var AudioHTML5Loader = function() {
    this.name = loaderId++;
    DEV && logger.debug(this, "constructor");

    Events.call(this);
    this.on("*", function(event) {
        if (event !== AudioStatic.EVENT_PROGRESS) {
            DEV && logger.debug(this, "onEvent", event);
        }
    }.bind(this));

    /**
     * Контейнер для различных ожиданий событий
     * @type {Object.<String, Deferred>}
     * @private
     */
    this.promises = {};

    /**
     * Ссылка на трек
     * @type {string}
     * @private
     */
    this.src = "";
    /**
     * Назначенная позиция воспроизведения
     * @type {number}
     * @private
     */
    this.position = 0;

    /**
     * Время последнего обновления данных
     * @type {number}
     * @private
     */
    this.lastUpdate = 0;

    /**
     * Флаг начала загрузки
     * @type {boolean}
     * @private
     */
    this.notLoading = true;

    /**
     * Выход для Web Audio API
     * @type {AudioNode}
     * @private
     */
    this.output = null;

    //--- Сахар для защиты от утечек памяти
    this.__startPlay = this._startPlay.bind(this);
    this.__restart = this._restart.bind(this);
    this.__startupAudio = this._startupAudio.bind(this);

    this.__updateProgress = this._updateProgress.bind(this);
    this.__onNativeLoading = this._onNativeLoading.bind(this);
    this.__onNativeEnded = this._onNativeEnded.bind(this);
    this.__onNativeError = this._onNativeError.bind(this);
    this.__onNativePause = this._onNativePause.bind(this);

    this.__onNativePlay = this.trigger.bind(this, AudioStatic.EVENT_PLAY);

    this._initAudio();
};
Events.mixin(AudioHTML5Loader);

/**
 * Интервал обновления таймингов трека
 * @type {number}
 * @private
 * @const
 */
AudioHTML5Loader._updateInterval = 30;

// =================================================================

//  Нативные события Audio

// =================================================================

/**
 * Нативное событие начала воспроизведения
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_PLAY = "play";

/**
 * Нативное событие паузы
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_PAUSE = "pause";

/**
 * Нативное событие обновление позиции воспроизведения
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_TIMEUPDATE = "timeupdate";

/**
 * Нативное событие завершения трека
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_ENDED = "ended";

/**
 * Нативное событие изменения длительности
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_DURATION = "durationchange";

/**
 * Нативное событие изменения длительности загруженной части
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_LOADING = "progress";

/**
 * Нативное событие доступности мета-данных трека
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_META = "loadedmetadata";

/**
 * Нативное событие возможности начать воспроизведение
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_CANPLAY = "canplay";

/**
 * Нативное событие ошибки
 * @type {string}
 * @const
 */
AudioHTML5Loader.EVENT_NATIVE_ERROR = "error";

/**
 * Заглушка для __initListener'а на время ожидания пользовательского действия
 * @private
 */
AudioHTML5Loader._defaultInitListener = function() {};
AudioHTML5Loader._defaultInitListener.step = "user";

// =================================================================

//  Обработчики событий

// =================================================================

/**
 * Обработчик обновления таймингов трека
 * @private
 */
AudioHTML5Loader.prototype._updateProgress = function() {
    var currentTime = +new Date();
    if (currentTime - this.lastUpdate < AudioHTML5Loader._updateInterval) {
        return;
    }

    this.lastUpdate = currentTime;
    this.trigger(AudioStatic.EVENT_PROGRESS);
};

/**
 * Обработчик событий загрузки трека
 * @private
 */
AudioHTML5Loader.prototype._onNativeLoading = function() {
    this._updateProgress();

    if (this.audio.buffered.length) {
        var loaded = this.audio.buffered.end(0) - this.audio.buffered.start(0);

        if (this.notLoading && loaded) {
            this.notLoading = false;
            this.trigger(AudioStatic.EVENT_LOADING);
        }

        if (loaded >= this.audio.duration - 0.1) {
            this.trigger(AudioStatic.EVENT_LOADED);
        }
    }
};

/**
 * Обработчик события окончания трека
 * @private
 */
AudioHTML5Loader.prototype._onNativeEnded = function() {
    this.trigger(AudioStatic.EVENT_PROGRESS);
    this.trigger(AudioStatic.EVENT_ENDED);
    this.ended = true;
    this.playing = false;
    this.audio.pause();
};

/**
 * Обработчик ошибок воспроизведения
 * @param {Event} e - Событие ошибки
 * @private
 */
AudioHTML5Loader.prototype._onNativeError = function(e) {
    if (!this.src) {
        return;
    }

    if (this.audio.error.code == 2) {
        logger.warn(this, "Network error. Restarting...", logger._showUrl(this.src));
        this.position = this.audio.currentTime;
        this._restart();
        return;
    }

    var error = new PlaybackError(this.audio.error
            ? PlaybackError.html5[this.audio.error.code]
            : e instanceof Error ? e.message : e,
        this.src);

    this.playing = false;

    this.trigger(AudioStatic.EVENT_ERROR, error);
};

/**
 * Обработчик события паузы
 * @private
 */
AudioHTML5Loader.prototype._onNativePause = function() {
    if (!this.ended) {
        this.trigger(AudioStatic.EVENT_PAUSE);
    }
};

// =================================================================

//  Инициализация и деинициализация Audio

// =================================================================

/**
 * Инициализация слушателей пользовательских событий для инициализации плеера
 * @private
 */
AudioHTML5Loader.prototype._initUserEvents = function() {
    document.body.addEventListener("mousedown", this.__startupAudio, true);
    document.body.addEventListener("keydown", this.__startupAudio, true);
    document.body.addEventListener("touchstart", this.__startupAudio, true);
};

/**
 * Деинициализация слушателей пользовательских событий для инициализации плеера
 * @private
 */
AudioHTML5Loader.prototype._deinitUserEvents = function() {
    document.body.removeEventListener("mousedown", this.__startupAudio, true);
    document.body.removeEventListener("keydown", this.__startupAudio, true);
    document.body.removeEventListener("touchstart", this.__startupAudio, true);
};

/**
 * Инициализация слушателей нативных событий audio-элемента
 * @private
 */
AudioHTML5Loader.prototype._initNativeEvents = function() {
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_PAUSE, this.__onNativePause);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_PLAY, this.__onNativePlay);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_ENDED, this.__onNativeEnded);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_TIMEUPDATE, this.__updateProgress);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_DURATION, this.__updateProgress);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_LOADING, this.__onNativeLoading);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_ERROR, this.__onNativeError);
};

/**
 * Деинициализация слушателей нативных событий audio-элемента
 * @private
 */
AudioHTML5Loader.prototype._deinitNativeEvents = function() {
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_PAUSE, this.__onNativePause);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_PLAY, this.__onNativePlay);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_ENDED, this.__onNativeEnded);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_TIMEUPDATE, this.__updateProgress);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_DURATION, this.__updateProgress);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_LOADING, this.__onNativeLoading);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_ERROR, this.__onNativeError);
};

/**
 * Создание объекта Audio и назначение обработчиков событий
 * @private
 */
AudioHTML5Loader.prototype._initAudio = function() {
    DEV && logger.debug(this, "_initAudio");

    this.muteEvents();

    this.audio = document.createElement("audio");
    this.audio.loop = false; // for IE
    this.audio.preload = this.audio.autobuffer = "auto"; // 100%
    this.audio.autoplay = false;
    this.audio.src = "";

    this._initUserEvents();
    this.__initListener = AudioHTML5Loader._defaultInitListener;

    this._initNativeEvents();
};

/**
 * Отключение обработчиков событий и удаление объекта Audio
 * @private
 */
AudioHTML5Loader.prototype._deinitAudio = function() {
    DEV && logger.debug(this, "_deinitAudio");

    this.muteEvents();

    this._deinitUserEvents();
    this._deinitNativeEvents();

    this.audio = null;
};

/**
 * Инициализация объекта Audio. Для начала воспроизведение требуется любое пользовательское действие.
 *
 * Совершенно эзотеричный и магический метод. Для инициализации плеера требуется вызывать метод play в обработчике
 * пользовательского события. После этого требуется поставить плеер обратно на паузу, т.к. некоторые браузеры
 * в противном случае начинают проигрывать трек автоматически как только он загружается. При этом в некоторых браузерах
 * после вызова метода load событие play никогда не наступает, так что приходится слушать события получения метаданных
 * или ошибки загрузки (если src не указан). В некоторых браузерах также может не наступить событие pause. При этом
 * стоит ещё учитывать, что трек может грузиться из кеша, тогда события получения мета-данных и возможности
 * воспроизведения могут возникнуть быстрее события play или pause, так что нужно предусматривать прерывание процесса
 * инициализации.
 * @private
 */
AudioHTML5Loader.prototype._startupAudio = function() {
    DEV && logger.debug(this, "_startupAudio");

    this._deinitUserEvents();

    //INFO: после инициализационного вызова play нужно дождаться события и вызвать pause.
    this.__initListener = function(e) {
        if (!this.__initListener) {
            return;
        }

        this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_PLAY, this.__initListener);
        this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_CANPLAY, this.__initListener);
        this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_META, this.__initListener);
        this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_ERROR, this.__initListener);

        //INFO: после вызова pause нужно дождаться события, завершить инициализацию и разрешить передачу событий
        this.__initListener = function() {
            if (!this.__initListener) {
                return;
            }

            this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_PAUSE, this.__initListener);
            delete this.__initListener;
            this.unmuteEvents();
            logger.info(this, "_startupAudio:ready");
        }.bind(this);
        this.__initListener.step = "pause";

        this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_PAUSE, this.__initListener);
        this.audio.pause();

        DEV && logger.debug(this, "_startupAudio:play", e.type);
    }.bind(this);
    this.__initListener.step = "play";

    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_PLAY, this.__initListener);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_CANPLAY, this.__initListener);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_META, this.__initListener);
    this.audio.addEventListener(AudioHTML5Loader.EVENT_NATIVE_ERROR, this.__initListener);

    //INFO: перед использованием объект Audio требуется инициализировать, в обработчике пользовательского события
    this.audio.load();
    this.audio.play();
};

/**
 * Если метод _startPlay вызван раньше, чем закончилась инициализация, нужно отменить текущий шаг инициализации.
 * @private
 */
AudioHTML5Loader.prototype._breakStartup = function(reason) {
    this._deinitUserEvents();
    this.unmuteEvents();

    if (!this.__initListener) {
        return;
    }

    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_PLAY, this.__initListener);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_CANPLAY, this.__initListener);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_META, this.__initListener);
    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_ERROR, this.__initListener);

    this.audio.removeEventListener(AudioHTML5Loader.EVENT_NATIVE_PAUSE, this.__initListener);

    logger.warn(this, "_startupAudio:interrupted", this.__initListener.step, reason);
    delete this.__initListener;
};

// =================================================================

//  Методы ожидания различных событий и генерации обещаний

// =================================================================

/**
 * Дождаться определённого состояния плеера
 * @param {String} name - имя состояния
 * @param {Function} check - метод проверки, что мы находимся в нужном состоянии
 * @param {Array.<String>} listen - список событий, при которых может смениться состояние
 * @returns {Promise}
 * @private
 */
AudioHTML5Loader.prototype._waitFor = function(name, check, listen) {
    if (!this.promises[name]) {
        var deferred = new Deferred();
        this.promises[name] = deferred;

        if (check.call(this)) {
            deferred.resolve();
        } else {
            var listener = function() {
                if (check.call(this)) {
                    deferred.resolve();
                }
            }.bind(this);

            var clearListeners = function() {
                for (var i = 0, l = listen.length; i < l; i++) {
                    this.audio.removeEventListener(listen[i], listener);
                }
            }.bind(this);

            for (var i = 0, l = listen.length; i < l; i++) {
                this.audio.addEventListener(listen[i], listener);
            }

            deferred.promise().then(clearListeners, clearListeners);
        }
    }

    return this.promises[name].promise();
};

/**
 * Отмена ожидания состояния
 * @param {String} name - имя состояния
 * @param {String} reason - причина отмены ожидания
 * @todo reason сделать наследником класса Error
 * @private
 */
AudioHTML5Loader.prototype._cancelWait = function(name, reason) {
    var promise;
    if (promise = this.promises[name]) {
        delete this.promises[name];
        promise.reject(reason);
    }
};

/**
 * Отмена всех ожиданий
 * @param {String} reason - причина отмены ожидания
 * @todo reason сделать наследником класса Error
 * @private
 */
AudioHTML5Loader.prototype._abortPromises = function(reason) {
    for (var key in this.promises) {
        if (this.promises.hasOwnProperty(key)) {
            this._cancelWait(key, reason);
        }
    }
};

// =================================================================

//  Ожидание получения метаданных трека

// =================================================================

/**
 * Список событий плеера при которых можно ожидать готовности метаданных
 * @type {Array.<String>}
 * @private
 */
AudioHTML5Loader._promiseMetadataEvents = [AudioHTML5Loader.EVENT_NATIVE_META, AudioHTML5Loader.EVENT_NATIVE_CANPLAY];

/**
 * Проверка получения метаданных
 * @returns {boolean}
 * @private
 */
AudioHTML5Loader.prototype._promiseMetadataCheck = function() {
    return this.audio.readyState > this.audio.HAVE_METADATA;
};

/**
 * Ожидание получения метаданных
 * @returns {Promise}
 * @private
 */
AudioHTML5Loader.prototype._promiseMetadata = function() {
    return this._waitFor("metadata", this._promiseMetadataCheck, AudioHTML5Loader._promiseMetadataEvents);
};

// =================================================================

//  Ожидание загрузки нужной части трека

// =================================================================

/**
 * Список событий плеера при которых можно ожидать загрузки
 * @type {Array.<String>}
 * @private
 */
AudioHTML5Loader._promiseLoadedEvents = [AudioHTML5Loader.EVENT_NATIVE_LOADING];

/**
 * Проверка, что загружена нужная часть трека
 * @returns {boolean}
 * @private
 */
AudioHTML5Loader.prototype._promiseLoadedCheck = function() {
    this.__loaderTimer = this.__loaderTimer && clearTimeout(this.__loaderTimer) || setTimeout(function() {
            this._cancelWait("loaded", "timeout");
        }.bind(this), 5000);

    //INFO: позицию нужно брать с большим запасом, т.к. данные записаны блоками и нам нужно дождаться загрузки блока
    var loaded = Math.min(this.position + 45, this.audio.duration);
    return this.audio.buffered.length
        && this.audio.buffered.end(0) - this.audio.buffered.start(0) >= loaded;
};

/**
 * Ожидание загрузки нужной части трека
 * @returns {Promise}
 * @private
 */
AudioHTML5Loader.prototype._promiseLoaded = function() {
    var promise = this._waitFor("loaded", this._promiseLoadedCheck, AudioHTML5Loader._promiseLoadedEvents);

    if (!promise.cleanTimer) {
        promise.cleanTimer = function() {
            this.__loaderTimer = clearTimeout(this.__loaderTimer);
        }.bind(this);
        promise.then(promise.cleanTimer, promise.cleanTimer);
    }

    return promise;
};

// =================================================================

//  Ожидание проигрывания нужной части трека

// =================================================================

/**
 * Список событий плеера при которых можно ожидать проигрывания нужно части
 * @type {Array.<String>}
 * @private
 */
AudioHTML5Loader._promisePlayingEvents = [AudioHTML5Loader.EVENT_NATIVE_TIMEUPDATE];

/**
 * Проверка, что проигрывается нужная часть трека
 * @returns {boolean}
 * @private
 */
AudioHTML5Loader.prototype._promisePlayingCheck = function() {
    var time = Math.min(this.position + 0.2, this.audio.duration);
    return this.audio.currentTime >= time;
};

/**
 * Ожидание проигрывания нужной части трека
 * @returns {Promise}
 * @private
 */
AudioHTML5Loader.prototype._promisePlaying = function() {
    return this._waitFor("playing", this._promisePlayingCheck, AudioHTML5Loader._promisePlayingEvents);
};

// =================================================================

//  Ожидание начала воспроизведения

// =================================================================

/**
 * Ожидание начала воспроиведения, перезапуск трека, если воспроизведение не началось
 * @returns {Promise}
 * @private
 */
AudioHTML5Loader.prototype._promiseStartPlaying = function() {
    if (!this.promises["startPlaying"]) {
        var deferred = new Deferred();
        this.promises["startPlaying"] = deferred;

        //INFO: если отменено ожидание загрузки или воспроизведения, то нужно отменить и это обещание
        var reject = function(reason) {
            ready = true;
            this._cancelWait("startPlaying", reason);
        }.bind(this);

        var timer;
        var ready = false;
        var cleanTimer = function() {
            clearTimeout(timer);
        };

        this._promisePlaying().then(function() {
            ready = true;
            deferred.resolve();
            logger.info(this, "startPlaying:success");
        }.bind(this), reject);

        this._promiseLoaded().then(function() {
            if (ready) {
                return;
            }
            timer = setTimeout(function() {
                deferred.reject("timeout");
                this._cancelWait("playing", "timeout");
                logger.warn(this, "startPlaying:failed");
            }.bind(this), 5000);
        }.bind(this), reject);

        this._promisePlaying().then(cleanTimer, cleanTimer);
        deferred.promise().then(cleanTimer, cleanTimer);
    }

    return this.promises["startPlaying"].promise();
};

// =================================================================

//  Управление элементом Audio

// =================================================================

/**
 * Начать загрузку трека
 * @param {String} src
 */
AudioHTML5Loader.prototype.load = function(src) {
    DEV && logger.debug(this, "load", src);

    this._abortPromises("load");
    this._breakStartup("load");

    this.ended = false;
    this.playing = false;
    this.notLoading = true;
    this.position = 0;

    this.src = src;
    this.audio.src = src;
    this.audio.load();
};

/** Остановить воспроизведение и загрузку трека */
AudioHTML5Loader.prototype.stop = function() {
    DEV && logger.debug(this, "stop");

    this._abortPromises("stop");
    this._breakStartup("stop");

    this.load("");
};

/**
 * Начать воспроизведение трека
 * @private
 */
AudioHTML5Loader.prototype._startPlay = function() {
    DEV && logger.debug(this, "_startPlay");

    this.audio.currentTime = this.position;

    if (!this.playing) {
        return;
    }

    this._breakStartup("startPlay");
    this.audio.play();

    //THINK: нужно ли триггерить событие в случае успеха
    this._promiseStartPlaying().then(function() {
        this.retry = 0;
    }.bind(this), this.__restart);
};

/**
 * Перезапустить воспроизведение трека
 * @param {String} [reason] - если причина вызова указана и не равна "timeout" ничего не происходит
 * @private
 */
AudioHTML5Loader.prototype._restart = function(reason) {
    logger.info(this, "_restart", reason, this.position, this.playing);

    if (!this.src || reason && reason !== "timeout") {
        return;
    }

    this.retry++;

    if (this.retry > 5) {
        this.playing = false;
        this.trigger(AudioStatic.EVENT_ERROR, new PlaybackError(PlaybackError.DONT_START, this.src));
        return;
    }

    //INFO: Запоминаем текущее состояние, т.к. оно сбросится после перезагрузки
    var position = this.position;
    var playing = this.playing;

    this.load(this.src);

    if (playing) {
        this._play(position);
    } else {
        this.setPosition(position);
    }
};

/**
 * Воспроизведение трека/отмена паузы
 * @param {Number} [position] - позиция воспроизведения
 */
AudioHTML5Loader.prototype.play = function(position) {
    DEV && logger.debug(this, "play", position);
    this.retry = 0;
    return this._play(position);
};

/**
 * Воспроизведение трека/отмена паузы - внутренний метод
 * @param {Number} [position] - позиция воспроизведения
 * @private
 */
AudioHTML5Loader.prototype._play = function(position) {
    DEV && logger.debug(this, "_play", position);

    if (this.playing) {
        return;
    }

    this._breakStartup("play");

    this.ended = false;
    this.playing = true;
    this.position = position == null ? this.position || 0 : position;
    this._promiseMetadata().then(this.__startPlay, noop);
};

/** Пауза */
AudioHTML5Loader.prototype.pause = function() {
    DEV && logger.debug(this, "pause");

    this.playing = false;

    this._cancelWait("startPlaying", "pause");
    this._breakStartup("pause");

    this.audio.pause();
    this.position = this.audio.currentTime;
};

/**
 * Установить позицию воспроизведения
 * @param {Number} position - позиция воспроизведения
 */
AudioHTML5Loader.prototype.setPosition = function(position) {
    DEV && logger.debug(this, "setPosition", position);

    if (!isFinite(position)) {
        logger.warn(this, "setPositionFailed", position);
        return;
    }

    this.position = position;

    this._promiseMetadata().then(function() {
        this.audio.currentTime = this.position;
    }.bind(this), noop);
};

// =================================================================

//  Подключение/отключение источника для Web Audio API

// =================================================================
/**
 * Включить режим crossDomain для HTML5 плеера
 * @param {Boolean} state - включить/выключить
 */
AudioHTML5Loader.prototype.toggleCrossDomain = function(state) {
    if (state) {
        this.audio.crossOrigin = "anonymous";
    } else {
        this.audio.removeAttribute("crossOrigin");
    }

    this._restart();
};

/**
 * Создать источник для Web Audio API
 * !!!Внимание!!! - при использовании Web Audio API в браузере стоит учитывать, что все треки должны либо загружаться
 * с того же домена, либо для них должны быть правильно выставлены заголовки CORS.
 * При вызове данного метода трек будет перезапущен
 * @param {AudioContext} audioContext - контекст Web Audio API
 */
AudioHTML5Loader.prototype.createSource = function(audioContext) {
    if (this.output) {
        return;
    }

    DEV && logger.debug(this, "createSource");

    var needRestart = !this.audio.crossOrigin;

    this.audio.crossOrigin = "anonymous";
    this.output = audioContext.createMediaElementSource(this.audio);
    this.output.connect(audioContext.destination);

    if (needRestart) {
        this._restart();
    }
};

/**
 * Удалить источник для Web Audio API. Удаляет источник, пересоздаёт объект Audio.
 * !!!Внимание!!! - Данный метод можно вызывать только в обработчике пользовательского события, т.к. свежесозданный
 * элемент Audio нужно инициализировать - иначе будет недоступно воспроизведение. Инициализация элемента
 * Audio возможна только в обработчике пользовательского события (клик, тач-событие или клавиатурное событие)
 */
AudioHTML5Loader.prototype.destroySource = function() {
    //INFO: единственный способ оторвать MediaElementSource от Audio - создать новый объект Audio

    if (!this.output) {
        return;
    }

    logger.warn(this, "destroySource");

    this.output.disconnect();
    this.output = null;

    this._abortPromises("destroy");

    this._deinitAudio();
    this._initAudio();
    this._startupAudio();

    this._restart();
};

// =================================================================

//  Удаление всех обработчиков и объекта Audio

// =================================================================

/** Удаление всех обработчиков и объекта Audio. После вызова данного метода этот объект будет нельзя использовать */
AudioHTML5Loader.prototype.destroy = function() {
    DEV && logger.debug(this, "destroy");

    if (this.output) {
        this.output.disconnect();
        this.output = null;
    }

    this._abortPromises();
    this._deinitAudio();

    this.__restart = null;
    this.__startPlay = null;
    this.promises = null;
};

AudioHTML5Loader.prototype._logger = function() {
    return {
        init: !!this.__initListener && this.__initListener.step,
        src: logger._showUrl(this.src),
        playing: this.playing,
        ended: this.ended,
        notLoading: this.notLoading,
        position: this.position
    };
};

module.exports = AudioHTML5Loader;

},{"../audio-static":4,"../error/playback-error":8,"../lib/async/deferred":28,"../lib/async/events":29,"../lib/noop":40,"../logger/logger":42}],26:[function(require,module,exports){
var Logger = require('../logger/logger');
var logger = new Logger('AudioHTML5');

var detect = require('../lib/browser/detect');
var Events = require('../lib/async/events');
var AudioStatic = require('../audio-static');

var AudioHTML5Loader = require('./audio-html5-loader');

var playerId = 1;

// =================================================================

//  Проверки доступности HTML5 Audio и Web Audio API

// =================================================================

exports.available = (function() {
    // ------------------------------------------------------------------------------ Базовая проверка поддержки браузером
    var html5_available = true;
    try {
        //some browsers doesn't understand new Audio()
        var audio = document.createElement('audio');
        var canPlay = audio.canPlayType("audio/mpeg");
        if (!canPlay || canPlay === 'no') {

            logger.warn(this, "HTML5 detection failed with reason", canPlay);
            html5_available = false;
        }
    } catch(e) {
        logger.warn(this, "HTML5 detection failed with error", e);
        html5_available = false;
    }

    logger.info(this, "detection", html5_available);
    return html5_available;
})();

if (detect.platform.mobile || detect.platform.tablet) {
    audioContext = null;
    logger.info(this, "WebAudioAPI not allowed for mobile");
} else {
    try {
        var audioContext = new AudioContext();
        logger.info(this, "WebAudioAPI context created");
    } catch(e) {
        audioContext = null;
        logger.info(this, "WebAudioAPI not detected");
    }
}

// =================================================================

//  Конструктор

// =================================================================

/**
 * @classdesc Класс html5 аудио-плеера
 * @extends IAudioImplementation
 *
 * @fires IAudioImplementation#EVENT_PLAY
 * @fires IAudioImplementation#EVENT_ENDED
 * @fires IAudioImplementation#EVENT_VOLUME
 * @fires IAudioImplementation#EVENT_CRASHED
 * @fires IAudioImplementation#EVENT_SWAP
 *
 * @fires IAudioImplementation#EVENT_STOP
 * @fires IAudioImplementation#EVENT_PAUSE
 * @fires IAudioImplementation#EVENT_PROGRESS
 * @fires IAudioImplementation#EVENT_LOADING
 * @fires IAudioImplementation#EVENT_LOADED
 * @fires IAudioImplementation#EVENT_ERROR
 *
 * @constructor
 * @private
 */
var AudioHTML5 = function() {
    this.name = playerId++;
    DEV && logger.debug(this, "constructor");

    Events.call(this);
    this.on("*", function(event) {
        if (event !== AudioStatic.EVENT_PROGRESS) {
            DEV && logger.debug(this, "onEvent", event);
        }
    }.bind(this));

    this.webAudioApi = false;
    this.activeLoader = 0;
    this.volume = 1;
    this.loaders = [];

    this._addLoader();
    this._addLoader();

    this._setActive(0);
};
Events.mixin(AudioHTML5);
exports.type = AudioHTML5.type = AudioHTML5.prototype.type = "html5";

// =================================================================

//  Работа с загрузчиками

// =================================================================

/**
 * Добавить загрузчик аудио-файлов
 * @private
 */
AudioHTML5.prototype._addLoader = function() {
    DEV && logger.debug(this, "_addLoader");

    var self = this;
    var loader = new AudioHTML5Loader();
    loader.index = this.loaders.push(loader) - 1;

    loader.on("*", function(event, data) {
        var offset = (self.loaders.length + loader.index - self.activeLoader) % self.loaders.length;
        self.trigger(event, offset, data);
    });

    if (this.webAudioApi) {
        loader.createSource(audioContext);
    }
};

/**
 * Установить активный загрузчик
 * @param {int} offset - 0: текущий загрузчик, 1: следующий загрузчик
 * @private
 */
AudioHTML5.prototype._setActive = function(offset) {
    DEV && logger.debug(this, "_setActive", offset);

    this.activeLoader = (this.activeLoader + offset) % this.loaders.length;
    this.trigger(AudioStatic.EVENT_SWAP, offset);

    if (offset !== 0) {
        //INFO: если релизовывать концепцию множества загрузчиков, то это нужно доработать.
        this.stop(offset);
    }
};

/**
 * Получить загрузчик и отписать его от событий старта воспроизведения
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {Audio}
 * @private
 */
AudioHTML5.prototype._getLoader = function(offset) {
    offset = offset || 0;
    return this.loaders[(this.activeLoader + offset) % this.loaders.length];
};

// =================================================================

//  Подключение Web Audio API

// =================================================================
/**
 * Включение режима CORS. ***ВАЖНО!*** - если включить режим CORS, аудио элемент не сможет загружать данные со
 * сторонних доменов, если в ответе не будет правильного заголовка Access-Control-Allow-Origin. Если не планируется
 * использование Web Audio API, не стоит включать этот режим.
 * @param state
 */
AudioHTML5.prototype.toggleCrossDomain = function(state) {
    this.loaders.forEach(function(loader) {
        loader.toggleCrossDomain(state);
    });
};

/**
 * Переключение режима использования Web Audio API. Доступен только при html5-реализации плеера.
 *
 * **Внимание!** - после включения режима Web Audio API он не отключается полностью, т.к. для этого требуется
 * реинициализация плеера, которой требуется клик пользователя. При отключении из графа обработки исключаются
 * все ноды кроме нод-источников и ноды вывода, управление громкостью переключается на элементы audio, без
 * использования GainNode
 * @param {Boolean} state - запрашиваемый статус
 * @returns {Boolean} -- итоговый статус плеера
 */
AudioHTML5.prototype.toggleWebAudioAPI = function(state) {
    if (!audioContext) {
        logger.warn(this, "toggleWebAudioAPIError", state);
        return false;
    }

    logger.info(this, "toggleWebAudioAPI", state);

    if (this.webAudioApi == state) {
        return state;
    }

    if (state) {
        this.audioOutput = audioContext.createGain();
        this.audioOutput.gain.value = this.volume;
        this.audioOutput.connect(audioContext.destination);

        if (this.preprocessor) {
            this.preprocessor.output.connect(this.audioOutput);
        }

        this.loaders.forEach(function(loader) {
            loader.audio.volume = 1;
            loader.createSource(audioContext);

            loader.output.disconnect();
            loader.output.connect(this.preprocessor ? this.preprocessor.input : this.audioOutput);
        }.bind(this));

    } else if (this.audioOutput) {
        if (this.preprocessor) {
            this.preprocessor.output.disconnect();
        }

        this.audioOutput.disconnect();
        delete this.audioOutput;

        this.loaders.forEach(function(loader) {
            loader.audio.volume = this.volume;

            //INFO: после того как мы включили webAudioAPI его уже нельзя просто так выключить.
            loader.output.disconnect();
            loader.output.connect(audioContext.destination);
        }.bind(this));
    }

    this.webAudioApi = state;

    return state;
};

/**
 * Подключение аудио препроцессора. Вход препроцессора подключается к аудио-элементу у которого выставлена
 * 100% громкость. Выход препроцессора подключается к GainNode, которая регулирует итоговую громкость
 * @param {ya.music.Audio~AudioPreprocessor} preprocessor - препроцессор
 * @returns {boolean} -- статус успеха
 */
AudioHTML5.prototype.setAudioPreprocessor = function(preprocessor) {
    if (!this.webAudioApi) {
        logger.warn(this, "setAudioPreprocessorError", preprocessor);
        return false;
    }

    logger.info(this, "setAudioPreprocessor");

    if (this.preprocessor === preprocessor) {
        return true;
    }

    if (this.preprocessor) {
        this.preprocessor.output.disconnect();
    }

    this.preprocessor = preprocessor;

    if (!preprocessor) {
        this.loaders.forEach(function(loader) {
            loader.output.disconnect();
            loader.output.connect(this.audioOutput);
        }.bind(this));

        return true;
    }

    this.loaders.forEach(function(loader) {
        loader.output.disconnect();
        loader.output.connect(preprocessor.input);
    });

    preprocessor.output.connect(this.audioOutput);

    return true;
};

// =================================================================

//  Управление плеером

// =================================================================

/**
 * Проиграть трек
 * @param {String} src - ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 */
AudioHTML5.prototype.play = function(src, duration) {
    DEV && logger.debug(this, "play", src);

    var loader = this._getLoader();

    loader.load(src);
    loader.play(0);
};

/** Поставить трек на паузу */
AudioHTML5.prototype.pause = function() {
    DEV && logger.debug(this, "pause");
    var loader = this._getLoader();
    loader.pause();
};

/** Снять трек с паузы */
AudioHTML5.prototype.resume = function() {
    DEV && logger.debug(this, "resume");
    var loader = this._getLoader();
    loader.play();
};

/**
 * Остановить воспроизведение и загрузку трека
 * @param {int} [offset=0] - 0: для текущего загрузчика, 1: для следующего загрузчика
 */
AudioHTML5.prototype.stop = function(offset) {
    DEV && logger.debug(this, "stop", offset);
    var loader = this._getLoader(offset || 0);
    loader.stop();

    this.trigger(AudioStatic.EVENT_STOP, offset);
};

/**
 * Получить позицию воспроизведения
 * @returns {number}
 */
AudioHTML5.prototype.getPosition = function() {
    return this._getLoader().audio.currentTime;
};

/**
 * Установить текущую позицию воспроизведения
 * @param {number} position
 */
AudioHTML5.prototype.setPosition = function(position) {
    DEV && logger.debug(this, "setPosition", position);
    this._getLoader().setPosition(position - 0.001); //THINK: legacy-код. Понять нафиг тут нужен 0.001
};

/**
 * Получить длительность трека
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */
AudioHTML5.prototype.getDuration = function(offset) {
    return this._getLoader(offset).audio.duration;
};

/**
 * Получить длительность загруженной части трека
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {number}
 */
AudioHTML5.prototype.getLoaded = function(offset) {
    var loader = this._getLoader(offset);

    if (loader.audio.buffered.length) {
        return loader.audio.buffered.end(0) - loader.audio.buffered.start(0);
    }
    return 0;
};

/**
 * Получить текущее значение громкости
 * @returns {number}
 */
AudioHTML5.prototype.getVolume = function() {
    return this.volume;
};

/**
 * Установить значение громкости
 * @param {number} volume
 */
AudioHTML5.prototype.setVolume = function(volume) {
    DEV && logger.debug(this, "setVolume", volume);
    this.volume = volume;

    if (this.webAudioApi) {
        this.audioOutput.gain.value = volume;
    } else {
        this.loaders.forEach(function(loader) {
            loader.audio.volume = volume;
        });
    }

    this.trigger(AudioStatic.EVENT_VOLUME);
};

// =================================================================

//  Предзагрузка

// =================================================================

/**
 * Предзагрузить трек
 * @param {String} src - Ссылка на трек
 * @param {Number} [duration] - Длительность трека (не используется)
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 */
AudioHTML5.prototype.preload = function(src, duration, offset) {
    DEV && logger.debug(this, "preload", src, offset);

    offset = offset == null ? 1 : offset;
    var loader = this._getLoader(offset);
    loader.load(src);
};

/**
 * Проверить что трек предзагружается
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */
AudioHTML5.prototype.isPreloaded = function(src, offset) {
    offset = offset == null ? 1 : offset;
    var loader = this._getLoader(offset);
    return loader.src === src && !loader.notLoading;
};

/**
 * Проверить что трек начал предзагружаться
 * @param {String} src - ссылка на трек
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean}
 */
AudioHTML5.prototype.isPreloading = function(src, offset) {
    offset = offset == null ? 1 : offset;
    var loader = this._getLoader(offset);
    return loader.src === src;
};

/**
 * Запустить воспроизведение предзагруженного трека
 * @param {int} [offset=1] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {boolean} -- доступность данного действия
 */
AudioHTML5.prototype.playPreloaded = function(offset) {
    DEV && logger.debug(this, "playPreloaded", offset);
    offset = offset == null ? 1 : offset;
    var loader = this._getLoader(offset);

    if (!loader.src) {
        return false;
    }

    this._setActive(offset);
    loader.play();

    return true;
};

// =================================================================

//  Получение данных о плеере

// =================================================================

/**
 * Получить ссылку на трек
 * @param {int} [offset=0] - 0: текущий загрузчик, 1: следующий загрузчик
 * @returns {String|Boolean} -- Ссылка на трек или false, если нет загружаемого трека
 */
AudioHTML5.prototype.getSrc = function(offset) {
    return this._getLoader(offset).src;
};

/**
 * Проверить доступен ли программный контроль громкости
 * @returns {boolean}
 */
AudioHTML5.prototype.isDeviceVolume = function() {
    return detect.onlyDeviceVolume;
};

// =================================================================

//  Логирование

// =================================================================

/**
 * Вспомогательная функция для отображения состояния плеера в логе.
 * @private
 */
AudioHTML5.prototype._logger = function() {
    try {
        return {
            main: logger._showUrl(this.getSrc(0)),
            preloader: logger._showUrl(this.getSrc(1))
        };
    } catch(e) {
        return "";
    }
};

exports.audioContext = audioContext;
exports.AudioImplementation = AudioHTML5;

},{"../audio-static":4,"../lib/async/events":29,"../lib/browser/detect":32,"../logger/logger":42,"./audio-html5-loader":25}],27:[function(require,module,exports){
var YandexAudio = require('./export');
require('./error/export');
require('./lib/net/error/export');
require('./logger/export');
require('./fx/equalizer/export');
require('./fx/volume/export');

module.exports = YandexAudio;

},{"./error/export":7,"./export":9,"./fx/equalizer/export":21,"./fx/volume/export":23,"./lib/net/error/export":38,"./logger/export":41}],28:[function(require,module,exports){
var Promise = require('./promise');
var noop = require('../noop');

/**
 * @classdesc Отложенное действие
 * @constructor
 * @private
 */
var Deferred = function() {
    var self = this;

    var _promise = new Promise(function(resolve, reject) {
        /**
         * Разрешить обещание
         * @method Deferred#resolve
         * @param {*} data - передать данные в обещание
         */
        self.resolve = resolve;

        /**
         * Отклонить обещание
         * @method Deferred#reject
         * @param {Error} error - передать ошибку
         */
        self.reject = reject;
    });

    var promise = _promise.then(function(data) {
        self.resolved = true;
        self.pending = false;
        return data;
    }, function(err) {
        self.rejected = true;
        self.pending = false;
        throw err;
    });
    promise["catch"](noop); // Don't throw errors to console

    /**
     * Выполнилось ли обещание
     * @type {boolean}
     */
    this.pending = true;

    /**
     * Отклонилось ли обещание
     * @type {boolean}
     */
    this.rejected = false;

    /**
     * Получить обещание
     * @method Deferred#promise
     * @returns {Promise}
     */
    this.promise = function() { return promise; };
};

/**
 * Ожидание выполнения списка обещаний
 * @param {...*} args - обещания, которые требуется ожидать
 * @returns AbortablePromise
 */
Deferred.when = function() {
    var deferred = new Deferred();

    var list = [].slice.call(arguments);
    var pending = list.length;

    var resolve = function() {
        pending--;

        if (pending <= 0) {
            deferred.resolve();
        }
    };

    list.forEach(function(promise) {
        promise.then(resolve, deferred.reject);
    });
    list = null;

    deferred.promise.abort = deferred.reject;

    return deferred.promise();
};

module.exports = Deferred;

},{"../noop":40,"./promise":30}],29:[function(require,module,exports){
var merge = require('../data/merge');

var LISTENERS_NAME = "_listeners";
var MUTE_OPTION = "_muted";

// =================================================================

//  Конструктор

// =================================================================

/**
 * @class Events
 * @classdecs Диспетчер событий.
 * @noconstructor
 */
var Events = function() {
    /**
     * Контейнер для списков слушателей событий.
     * @alias Audio.Events#_listeners
     * @type {Object.<String, Array.<Function>>}
     * @private
     */
    this[LISTENERS_NAME] = {};

    /** Флаг включения/выключения событий
     * @alias Events#_mutes
     * @type {Boolean}
     * @private
     */
    this[MUTE_OPTION] = false;
};

// =================================================================

//  Всяческий сахар

// =================================================================

/**
 * Расширить произвольный класс свойствами диспетчера событий.
 * @param {Function} classConstructor Конструктор класса.
 * @returns {Function} тот же конструктор класса, расширенный свойствами диспетчера событий.
 * @static
 */
Events.mixin = function(classConstructor) {
    merge(classConstructor.prototype, Events.prototype, true);
    return classConstructor;
};

/**
 * Расширить произвольный объект свойствами диспетчера событий.
 * @param {Object} object Объект.
 * @returns {Object} тот же объект, расширенный свойствами диспетчера событий.
 */
Events.eventize = function(object) {
    merge(object, Events.prototype, true);
    Events.call(object);
    return object;
};

// =================================================================

//  Подписка и отписка от событий

// =================================================================

/**
 * Подписаться на событие (цепочный метод).
 * @param {String} event Имя события.
 * @param {function} callback Обработчик события.
 * @returns {Events} ссылку на контекст.
 */
Events.prototype.on = function(event, callback) {
    if (!this[LISTENERS_NAME][event]) {
        this[LISTENERS_NAME][event] = [];
    }

    this[LISTENERS_NAME][event].push(callback);
    return this;
};

/**
 * Отписаться от события (цепочный метод).
 * @param {String} event Имя события.
 * @param {function} callback Обработчик события.
 * @returns {Events} ссылку на контекст.
 */
Events.prototype.off = function(event, callback) {
    if (!this[LISTENERS_NAME][event]) {
        return this;
    }

    if (!callback) {
        delete this[LISTENERS_NAME][event];
        return this;
    }

    var callbacks = this[LISTENERS_NAME][event];
    for (var k = 0, l = callbacks.length; k < l; k++) {
        if (callbacks[k] === callback || callbacks[k].callback === callback) {
            callbacks.splice(k, 1);
            if (!callbacks.length) {
                delete this[LISTENERS_NAME][event];
            }
            break;
        }
    }

    return this;
};

/**
 * Подписаться на событие и отписаться сразу после его первого возникновения (цепочный метод).
 * @param {String} event Имя события.
 * @param {function} callback Обработчик события.
 * @returns {Events} ссылку на контекст.
 */
Events.prototype.once = function(event, callback) {
    var self = this;

    var wrapper = function() {
        self.off(event, wrapper);
        callback.apply(this, arguments);
    };

    wrapper.callback = callback;
    self.on(event, wrapper);

    return this;
};

/**
 * Отписаться от всех слушателей событий (цепочный метод).
 * @returns {Events} ссылку на контекст.
 */
Events.prototype.clearListeners = function() {
    for (var key in this[LISTENERS_NAME]) {
        if (this[LISTENERS_NAME].hasOwnProperty(key)) {
            delete this[LISTENERS_NAME][key];
        }
    }

    return this;
};

// =================================================================

//  Триггер событий

// =================================================================

/**
 * Запустить событие (цепочный метод).
 * @param {String} event Имя события.
 * @param {...args} args Параметры для передачи вместе с событием.
 * @returns {Events} ссылку на контекст.
 * @private
 */
Events.prototype.trigger = function(event, args) {
    if (this[MUTE_OPTION]) {
        return this;
    }

    args = [].slice.call(arguments, 1);

    if (event !== "*") {
        Events.prototype.trigger.apply(this, ["*", event].concat(args));
    }

    if (!this[LISTENERS_NAME][event]) {
        return this;
    }

    var callbacks = [].concat(this[LISTENERS_NAME][event]);
    for (var k = 0, l = callbacks.length; k < l; k++) {
        callbacks[k].apply(null, args);
    }

    return this;
};

/**
 * Делегировать все события другому диспетчеру событий (цепочный метод).
 * @param {Events} acceptor Получатель событий.
 * @returns {Events} ссылку на контекст.
 * @private
 */
Events.prototype.pipeEvents = function(acceptor) {
    this.on("*", Events.prototype.trigger.bind(acceptor));
    return this;
};

// =================================================================

//  Включение/выключение триггера событий

// =================================================================

/**
 * Остановить запуск событий (цепочный метод).
 * @returns {Events} ссылку на контекст.
 */
Events.prototype.muteEvents = function() {
    this[MUTE_OPTION] = true;
    return this;
};

/**
 * Возобновить запуск событий (цепочный метод).
 * @returns {Events} ссылку на контекст.
 */
Events.prototype.unmuteEvents = function() {
    delete this[MUTE_OPTION];
    return this;
};

module.exports = Events;

},{"../data/merge":37}],30:[function(require,module,exports){
var vow = require('vow');
var detect = require('../browser/detect');

// =================================================================

// Promise

// =================================================================

/**
 * @see {@link https://developer.mozilla.org/ru/docs/Web/JavaScript/Reference/Global_Objects/Promise|ES 2015 Promise}
 * @class
 * @constructor
 */
var Promise;
if (typeof window.Promise !== "function"
    || detect.browser.name === "msie" || detect.browser.name === "edge" // мелкие мягкие как всегда ничего не умеют делать правильно
) {
    Promise = vow.Promise;
} else {
    Promise = window.Promise;
}

module.exports = Promise;

/**
 * Назначить обработчики разрешения и отклонения обещания.
 * @method Promise#then
 * @param {function} callback Обработчик успеха.
 * @param {null|function} [errback] Обработчик ошибки.
 * @returns {Promise} новое обещание из результатов обработчика.
 */

/**
 * Назначить обработчик отклонения обещания.
 * @method Promise#catch
 * @param {function} errback Обработчик ошибки.
 * @returns {Promise} новое обещание из результатов обработчика.
 */

// =================================================================

// AbortablePromise

// =================================================================

/**
 * @class AbortablePromise
 * @classdecs Обещание с возможностью отмены связанного с ним действия.
 * @extends Promise
 */

/**
 * Отмена действия, связанного с обещанием. Абстрактный метод.
 * @method AbortablePromise#abort
 * @param {String|Error} reason Причина отмены действия.
 * @abstract
 */





},{"../browser/detect":32,"vow":2}],31:[function(require,module,exports){
var noop = require('../noop');
var Promise = require('./promise');

/**
 * Содание отклонённого обещания, которое не плюётся в консоль ошибкой
 * @param {Error} data - причина отклонения обещания
 * @returns {Promise}
 * @private
 */
var reject = function(data) {
    var promise = Promise.reject(data);
    promise["catch"](noop);
    return promise;
};

module.exports = reject;

},{"../noop":40,"./promise":30}],32:[function(require,module,exports){
var ua = navigator.userAgent.toLowerCase();

// =================================================================

//  Получение данных о браузере

// =================================================================

// Useragent RegExp
var ruc = /(ucbrowser)\/([\w.]+)/;
var rwebkit = /(webkit)[ \/]([\w.]+)/;
var ryabro = /(yabrowser)[ \/]([\w.]+)/;
var ropera = /(opr|opera)(?:.*version)?[ \/]([\w.]+)/;
var rmsie = /(msie) ([\w.]+)/;
var redge = /(edge)\/([\w.]+)/;
var rmmsie = /(iemobile)\/([\d\.]+)/;
var rmozilla = /(mozilla)(?:.*? rv:([\w.]+))?/;
var rsafari = /^((?!chrome).)*version\/([\d\w\.]+).*(safari)/;

var match = ruc.exec(ua)
    || rsafari.exec(ua)
    || ryabro.exec(ua)
    || redge.exec(ua)
    || rmmsie.exec(ua)
    || ropera.exec(ua)
    || rwebkit.exec(ua)
    || rmsie.exec(ua)
    || ua.indexOf("compatible") < 0 && rmozilla.exec(ua)
    || [];

var browser = {name: match[1] || "", version: match[2] || "0"};

if (match[3] === "safari") {
    browser.name = match[3];
}

if (browser.name === 'msie') {
    if (document.documentMode) { // IE8 or later
        browser.documentMode = document.documentMode;
    } else { // IE 5-7
        browser.documentMode = 5; // Assume quirks mode unless proven otherwise
        if (document.compatMode) {
            if (document.compatMode === "CSS1Compat") {
                browser.documentMode = 7; // standards mode
            }
        }
    }
}

if (browser.name === "opr") {
    browser.name = "opera";
}

//INFO: IE (как всегда) не корректно выставляет user-agent
if (browser.name === "mozilla" && browser.version.split(".")[0] === "11") {
    browser.name = "msie";
}

// =================================================================

//  Получение данных о платформе

// =================================================================

// Useragent RegExp
var rplatform = /(windows phone|ipad|iphone|ipod|android|blackberry|playbook|windows ce|webos)/;
var rtablet = /(ipad|playbook)/;
var randroid = /(android)/;
var rmobile = /(mobile)/;

platform = rplatform.exec(ua) || [];
var tablet = rtablet.exec(ua) || !rmobile.exec(ua) && randroid.exec(ua) || [];

if (platform[1]) {
    platform[1] = platform[1].replace(/\s/g, "_"); // Change whitespace to underscore. Enables dot notation.
}

var platform = {
    type: platform[1] || "",
    tablet: !!tablet[1],
    mobile: platform[1] && !tablet[1] || false
};
if (!platform.type) {
    platform.type = 'pc';
}

platform.os = platform.type;
if (platform.type === 'ipad' || platform.type === 'iphone' || platform.type === 'ipod') {
    platform.os = 'ios';
} else if (platform.type === 'android') {
    platform.os = 'android';
} else if (platform.type === "windows phone" || navigator.appVersion.indexOf("Win") !== -1) {
    platform.os = "windows";
    platform.version = navigator.userAgent.match(/win[^ ]* ([^;]*)/i);
    platform.version = platform.version && platform.version[1];
} else if (navigator.appVersion.indexOf("Mac") !== -1) {
    platform.os = "macos";
} else if (navigator.appVersion.indexOf("X11") !== -1) {
    platform.os = "unix";
} else if (navigator.appVersion.indexOf("Linux") !== -1) {
    platform.os = "linux";
}

// =================================================================

//  Получение данных о возможности менять громкость

// =================================================================
var noVolume = true;
try {
    var audio = document.createElement('audio');
    audio.volume = 0.63;
    noVolume = Math.abs(audio.volume - 0.63) > 0.01;
} catch(e) {
    noVolume = true;
}

/**
 * Информация об окружении
 * @namespace
 * @private
 */
var detect = {
    /**
     * Информация о браузере
     * @type {object}
     * @property {string} name - название браузера
     * @property {string} version - версия
     * @property {number} [documentMode] - версия документа
     */
    browser: browser,

    /**
     * Информация о платформе
     * @type {object}
     * @property {string} os - тип операционной системы
     * @property {string} type - тип платформы
     * @property {boolean} tablet - планшет
     * @property {boolean} mobile - мобильный
     */
    platform: platform,

    /**
     * Настройка громкости
     * @type {boolean}
     */
    onlyDeviceVolume: noVolume
};

module.exports = detect;

},{}],33:[function(require,module,exports){
/**
 * @license SWFObject v2.2 <http://code.google.com/p/swfobject/>
 * is released under the MIT License <http://www.opensource.org/licenses/mit-license.php>
 * @private
*/
var swfobject = function() {
	var UNDEF = "undefined",
		OBJECT = "object",
		SHOCKWAVE_FLASH = "Shockwave Flash",
		SHOCKWAVE_FLASH_AX = "ShockwaveFlash.ShockwaveFlash",
		FLASH_MIME_TYPE = "application/x-shockwave-flash",
		EXPRESS_INSTALL_ID = "SWFObjectExprInst",
		ON_READY_STATE_CHANGE = "onreadystatechange",
		win = window,
		doc = document,
		nav = navigator,
		plugin = false,
		domLoadFnArr = [main],
		regObjArr = [],
		objIdArr = [],
		listenersArr = [],
		storedAltContent,
		storedAltContentId,
		storedCallbackFn,
		storedCallbackObj,
		isDomLoaded = false,
		isExpressInstallActive = false,
		dynamicStylesheet,
		dynamicStylesheetMedia,
		autoHideShow = true,
	/* Centralized function for browser feature detection
		- User agent string detection is only used when no good alternative is possible
		- Is executed directly for optimal performance
	*/
	ua = function() {
		var w3cdom = typeof doc.getElementById != UNDEF && typeof doc.getElementsByTagName != UNDEF && typeof doc.createElement != UNDEF,
			u = nav.userAgent.toLowerCase(),
			p = nav.platform.toLowerCase(),
			windows = p ? /win/.test(p) : /win/.test(u),
			mac = p ? /mac/.test(p) : /mac/.test(u),
			webkit = /webkit/.test(u) ? parseFloat(u.replace(/^.*webkit\/(\d+(\.\d+)?).*$/, "$1")) : false, // returns either the webkit version or false if not webkit
			ie = !+"\v1", // feature detection based on Andrea Giammarchi's solution: http://webreflection.blogspot.com/2009/01/32-bytes-to-know-if-your-browser-is-ie.html
			playerVersion = [0,0,0],
			d = null;
		if (typeof nav.plugins != UNDEF && typeof nav.plugins[SHOCKWAVE_FLASH] == OBJECT) {
			d = nav.plugins[SHOCKWAVE_FLASH].description;
			if (d && !(typeof nav.mimeTypes != UNDEF && nav.mimeTypes[FLASH_MIME_TYPE] && !nav.mimeTypes[FLASH_MIME_TYPE].enabledPlugin)) { // navigator.mimeTypes["application/x-shockwave-flash"].enabledPlugin indicates whether plug-ins are enabled or disabled in Safari 3+
				plugin = true;
				ie = false; // cascaded feature detection for Internet Explorer
				d = d.replace(/^.*\s+(\S+\s+\S+$)/, "$1");
				playerVersion[0] = parseInt(d.replace(/^(.*)\..*$/, "$1"), 10);
				playerVersion[1] = parseInt(d.replace(/^.*\.(.*)\s.*$/, "$1"), 10);
				playerVersion[2] = /[a-zA-Z]/.test(d) ? parseInt(d.replace(/^.*[a-zA-Z]+(.*)$/, "$1"), 10) : 0;
			}
		}
		else if (typeof win.ActiveXObject != UNDEF) {
			try {
				var a = new ActiveXObject(SHOCKWAVE_FLASH_AX);
				if (a) { // a will return null when ActiveX is disabled
					d = a.GetVariable("$version");
					if (d) {
						ie = true; // cascaded feature detection for Internet Explorer
						d = d.split(" ")[1].split(",");
						playerVersion = [parseInt(d[0], 10), parseInt(d[1], 10), parseInt(d[2], 10)];
					}
				}
			}
			catch(e) {}
		}
		return { w3:w3cdom, pv:playerVersion, wk:webkit, ie:ie, win:windows, mac:mac };
	}();
	/* Cross-browser onDomLoad
		- Will fire an event as soon as the DOM of a web page is loaded
		- Internet Explorer workaround based on Diego Perini's solution: http://javascript.nwbox.com/IEContentLoaded/
		- Regular onload serves as fallback
	*/
	(function() {
		if (!ua.w3) { return; }
		if ((typeof doc.readyState != UNDEF && doc.readyState == "complete") || (typeof doc.readyState == UNDEF && (doc.getElementsByTagName("body")[0] || doc.body))) { // function is fired after onload, e.g. when script is inserted dynamically
			callDomLoadFunctions();
		}
		if (!isDomLoaded) {
			if (typeof doc.addEventListener != UNDEF) {
				doc.addEventListener("DOMContentLoaded", callDomLoadFunctions, false);
			}
			if (ua.ie && ua.win) {
				doc.attachEvent(ON_READY_STATE_CHANGE, function() {
					if (doc.readyState == "complete") {
						doc.detachEvent(ON_READY_STATE_CHANGE, arguments.callee);
						callDomLoadFunctions();
					}
				});
				if (win == top) { // if not inside an iframe
					(function(){
						if (isDomLoaded) { return; }
						try {
							doc.documentElement.doScroll("left");
						}
						catch(e) {
							setTimeout(arguments.callee, 0);
							return;
						}
						callDomLoadFunctions();
					})();
				}
			}
			if (ua.wk) {
				(function(){
					if (isDomLoaded) { return; }
					if (!/loaded|complete/.test(doc.readyState)) {
						setTimeout(arguments.callee, 0);
						return;
					}
					callDomLoadFunctions();
				})();
			}
			addLoadEvent(callDomLoadFunctions);
		}
	})();
	function callDomLoadFunctions() {
		if (isDomLoaded) { return; }
		try { // test if we can really add/remove elements to/from the DOM; we don't want to fire it too early
			var t = doc.getElementsByTagName("body")[0].appendChild(createElement("span"));
			t.parentNode.removeChild(t);
		}
		catch (e) { return; }
		isDomLoaded = true;
		var dl = domLoadFnArr.length;
		for (var i = 0; i < dl; i++) {
			domLoadFnArr[i]();
		}
	}
	function addDomLoadEvent(fn) {
		if (isDomLoaded) {
			fn();
		}
		else {
			domLoadFnArr[domLoadFnArr.length] = fn; // Array.push() is only available in IE5.5+
		}
	}
	/* Cross-browser onload
		- Based on James Edwards' solution: http://brothercake.com/site/resources/scripts/onload/
		- Will fire an event as soon as a web page including all of its assets are loaded
	 */
	function addLoadEvent(fn) {
		if (typeof win.addEventListener != UNDEF) {
			win.addEventListener("load", fn, false);
		}
		else if (typeof doc.addEventListener != UNDEF) {
			doc.addEventListener("load", fn, false);
		}
		else if (typeof win.attachEvent != UNDEF) {
			addListener(win, "onload", fn);
		}
		else if (typeof win.onload == "function") {
			var fnOld = win.onload;
			win.onload = function() {
				fnOld();
				fn();
			};
		}
		else {
			win.onload = fn;
		}
	}
	/* Main function
		- Will preferably execute onDomLoad, otherwise onload (as a fallback)
	*/
	function main() {
		if (plugin) {
			testPlayerVersion();
		}
		else {
			matchVersions();
		}
	}
	/* Detect the Flash Player version for non-Internet Explorer browsers
		- Detecting the plug-in version via the object element is more precise than using the plugins collection item's description:
		  a. Both release and build numbers can be detected
		  b. Avoid wrong descriptions by corrupt installers provided by Adobe
		  c. Avoid wrong descriptions by multiple Flash Player entries in the plugin Array, caused by incorrect browser imports
		- Disadvantage of this method is that it depends on the availability of the DOM, while the plugins collection is immediately available
	*/
	function testPlayerVersion() {
		var b = doc.getElementsByTagName("body")[0];
		var o = createElement(OBJECT);
		o.setAttribute("type", FLASH_MIME_TYPE);
		var t = b.appendChild(o);
		if (t) {
			var counter = 0;
			(function(){
				if (typeof t.GetVariable != UNDEF) {
					var d = t.GetVariable("$version");
					if (d) {
						d = d.split(" ")[1].split(",");
						ua.pv = [parseInt(d[0], 10), parseInt(d[1], 10), parseInt(d[2], 10)];
					}
				}
				else if (counter < 10) {
					counter++;
					setTimeout(arguments.callee, 10);
					return;
				}
				b.removeChild(o);
				t = null;
				matchVersions();
			})();
		}
		else {
			matchVersions();
		}
	}
	/* Perform Flash Player and SWF version matching; static publishing only
	*/
	function matchVersions() {
		var rl = regObjArr.length;
		if (rl > 0) {
			for (var i = 0; i < rl; i++) { // for each registered object element
				var id = regObjArr[i].id;
				var cb = regObjArr[i].callbackFn;
				var cbObj = {success:false, id:id};
				if (ua.pv[0] > 0) {
					var obj = getElementById(id);
					if (obj) {
						if (hasPlayerVersion(regObjArr[i].swfVersion) && !(ua.wk && ua.wk < 312)) { // Flash Player version >= published SWF version: Houston, we have a match!
							setVisibility(id, true);
							if (cb) {
								cbObj.success = true;
								cbObj.ref = getObjectById(id);
								cb(cbObj);
							}
						}
						else if (regObjArr[i].expressInstall && canExpressInstall()) { // show the Adobe Express Install dialog if set by the web page author and if supported
							var att = {};
							att.data = regObjArr[i].expressInstall;
							att.width = obj.getAttribute("width") || "0";
							att.height = obj.getAttribute("height") || "0";
							if (obj.getAttribute("class")) { att.styleclass = obj.getAttribute("class"); }
							if (obj.getAttribute("align")) { att.align = obj.getAttribute("align"); }
							// parse HTML object param element's name-value pairs
							var par = {};
							var p = obj.getElementsByTagName("param");
							var pl = p.length;
							for (var j = 0; j < pl; j++) {
								if (p[j].getAttribute("name").toLowerCase() != "movie") {
									par[p[j].getAttribute("name")] = p[j].getAttribute("value");
								}
							}
							showExpressInstall(att, par, id, cb);
						}
						else { // Flash Player and SWF version mismatch or an older Webkit engine that ignores the HTML object element's nested param elements: display alternative content instead of SWF
							displayAltContent(obj);
							if (cb) { cb(cbObj); }
						}
					}
				}
				else {	// if no Flash Player is installed or the fp version cannot be detected we let the HTML object element do its job (either show a SWF or alternative content)
					setVisibility(id, true);
					if (cb) {
						var o = getObjectById(id); // test whether there is an HTML object element or not
						if (o && typeof o.SetVariable != UNDEF) {
							cbObj.success = true;
							cbObj.ref = o;
						}
						cb(cbObj);
					}
				}
			}
		}
	}
	function getObjectById(objectIdStr) {
		var r = null;
		var o = getElementById(objectIdStr);
		if (o && o.nodeName == "OBJECT") {
			if (typeof o.SetVariable != UNDEF) {
				r = o;
			}
			else {
				var n = o.getElementsByTagName(OBJECT)[0];
				if (n) {
					r = n;
				}
			}
		}
		return r;
	}
	/* Requirements for Adobe Express Install
		- only one instance can be active at a time
		- fp 6.0.65 or higher
		- Win/Mac OS only
		- no Webkit engines older than version 312
	*/
	function canExpressInstall() {
		return !isExpressInstallActive && hasPlayerVersion("6.0.65") && (ua.win || ua.mac) && !(ua.wk && ua.wk < 312);
	}
	/* Show the Adobe Express Install dialog
		- Reference: http://www.adobe.com/cfusion/knowledgebase/index.cfm?id=6a253b75
	*/
	function showExpressInstall(att, par, replaceElemIdStr, callbackFn) {
		isExpressInstallActive = true;
		storedCallbackFn = callbackFn || null;
		storedCallbackObj = {success:false, id:replaceElemIdStr};
		var obj = getElementById(replaceElemIdStr);
		if (obj) {
			if (obj.nodeName == "OBJECT") { // static publishing
				storedAltContent = abstractAltContent(obj);
				storedAltContentId = null;
			}
			else { // dynamic publishing
				storedAltContent = obj;
				storedAltContentId = replaceElemIdStr;
			}
			att.id = EXPRESS_INSTALL_ID;
			if (typeof att.width == UNDEF || (!/%$/.test(att.width) && parseInt(att.width, 10) < 310)) { att.width = "310"; }
			if (typeof att.height == UNDEF || (!/%$/.test(att.height) && parseInt(att.height, 10) < 137)) { att.height = "137"; }
			doc.title = doc.title.slice(0, 47) + " - Flash Player Installation";
			var pt = ua.ie && ua.win ? "ActiveX" : "PlugIn",
				fv = "MMredirectURL=" + win.location.toString().replace(/&/g,"%26") + "&MMplayerType=" + pt + "&MMdoctitle=" + doc.title;
			if (typeof par.flashvars != UNDEF) {
				par.flashvars += "&" + fv;
			}
			else {
				par.flashvars = fv;
			}
			// IE only: when a SWF is loading (AND: not available in cache) wait for the readyState of the object element to become 4 before removing it,
			// because you cannot properly cancel a loading SWF file without breaking browser load references, also obj.onreadystatechange doesn't work
			if (ua.ie && ua.win && obj.readyState != 4) {
				var newObj = createElement("div");
				replaceElemIdStr += "SWFObjectNew";
				newObj.setAttribute("id", replaceElemIdStr);
				obj.parentNode.insertBefore(newObj, obj); // insert placeholder div that will be replaced by the object element that loads expressinstall.swf
				obj.style.display = "none";
				(function(){
					if (obj.readyState == 4) {
						obj.parentNode.removeChild(obj);
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			createSWF(att, par, replaceElemIdStr);
		}
	}
	/* Functions to abstract and display alternative content
	*/
	function displayAltContent(obj) {
		if (ua.ie && ua.win && obj.readyState != 4) {
			// IE only: when a SWF is loading (AND: not available in cache) wait for the readyState of the object element to become 4 before removing it,
			// because you cannot properly cancel a loading SWF file without breaking browser load references, also obj.onreadystatechange doesn't work
			var el = createElement("div");
			obj.parentNode.insertBefore(el, obj); // insert placeholder div that will be replaced by the alternative content
			el.parentNode.replaceChild(abstractAltContent(obj), el);
			obj.style.display = "none";
			(function(){
				if (obj.readyState == 4) {
					obj.parentNode.removeChild(obj);
				}
				else {
					setTimeout(arguments.callee, 10);
				}
			})();
		}
		else {
			obj.parentNode.replaceChild(abstractAltContent(obj), obj);
		}
	}
	function abstractAltContent(obj) {
		var ac = createElement("div");
		if (ua.win && ua.ie) {
			ac.innerHTML = obj.innerHTML;
		}
		else {
			var nestedObj = obj.getElementsByTagName(OBJECT)[0];
			if (nestedObj) {
				var c = nestedObj.childNodes;
				if (c) {
					var cl = c.length;
					for (var i = 0; i < cl; i++) {
						if (!(c[i].nodeType == 1 && c[i].nodeName == "PARAM") && !(c[i].nodeType == 8)) {
							ac.appendChild(c[i].cloneNode(true));
						}
					}
				}
			}
		}
		return ac;
	}
	/* Cross-browser dynamic SWF creation
	*/
	function createSWF(attObj, parObj, id) {
		var r, el = getElementById(id);
		if (ua.wk && ua.wk < 312) { return r; }
		if (el) {
			if (typeof attObj.id == UNDEF) { // if no 'id' is defined for the object element, it will inherit the 'id' from the alternative content
				attObj.id = id;
			}
			if (ua.ie && ua.win) { // Internet Explorer + the HTML object element + W3C DOM methods do not combine: fall back to outerHTML
				var att = "";
				for (var i in attObj) {
					if (attObj[i] != Object.prototype[i]) { // filter out prototype additions from other potential libraries
						if (i.toLowerCase() == "data") {
							parObj.movie = attObj[i];
						}
						else if (i.toLowerCase() == "styleclass") { // 'class' is an ECMA4 reserved keyword
							att += ' class="' + attObj[i] + '"';
						}
						else if (i.toLowerCase() != "classid") {
							att += ' ' + i + '="' + attObj[i] + '"';
						}
					}
				}
				var par = "";
				for (var j in parObj) {
					if (parObj[j] != Object.prototype[j]) { // filter out prototype additions from other potential libraries
						par += '<param name="' + j + '" value="' + parObj[j] + '" />';
					}
				}
				el.outerHTML = '<object classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000"' + att + '>' + par + '</object>';
				objIdArr[objIdArr.length] = attObj.id; // stored to fix object 'leaks' on unload (dynamic publishing only)
				r = getElementById(attObj.id);
			}
			else { // well-behaving browsers
				var o = createElement(OBJECT);
				o.setAttribute("type", FLASH_MIME_TYPE);
				for (var m in attObj) {
					if (attObj[m] != Object.prototype[m]) { // filter out prototype additions from other potential libraries
						if (m.toLowerCase() == "styleclass") { // 'class' is an ECMA4 reserved keyword
							o.setAttribute("class", attObj[m]);
						}
						else if (m.toLowerCase() != "classid") { // filter out IE specific attribute
							o.setAttribute(m, attObj[m]);
						}
					}
				}
				for (var n in parObj) {
					if (parObj[n] != Object.prototype[n] && n.toLowerCase() != "movie") { // filter out prototype additions from other potential libraries and IE specific param element
						createObjParam(o, n, parObj[n]);
					}
				}
				el.parentNode.replaceChild(o, el);
				r = o;
			}
		}
		return r;
	}
	function createObjParam(el, pName, pValue) {
		var p = createElement("param");
		p.setAttribute("name", pName);
		p.setAttribute("value", pValue);
		el.appendChild(p);
	}
	/* Cross-browser SWF removal
		- Especially needed to safely and completely remove a SWF in Internet Explorer
	*/
	function removeSWF(id) {
		var obj = getElementById(id);
		if (obj && obj.nodeName == "OBJECT") {
			if (ua.ie && ua.win) {
				obj.style.display = "none";
				(function(){
					if (obj.readyState == 4) {
						removeObjectInIE(id);
					}
					else {
						setTimeout(arguments.callee, 10);
					}
				})();
			}
			else {
				obj.parentNode.removeChild(obj);
			}
		}
	}
	function removeObjectInIE(id) {
		var obj = getElementById(id);
		if (obj) {
			for (var i in obj) {
				if (typeof obj[i] == "function") {
					obj[i] = null;
				}
			}
			obj.parentNode.removeChild(obj);
		}
	}
	/* Functions to optimize JavaScript compression
	*/
	function getElementById(id) {
		var el = null;
		try {
			el = doc.getElementById(id);
		}
		catch (e) {}
		return el;
	}
	function createElement(el) {
		return doc.createElement(el);
	}
	/* Updated attachEvent function for Internet Explorer
		- Stores attachEvent information in an Array, so on unload the detachEvent functions can be called to avoid memory leaks
	*/
	function addListener(target, eventType, fn) {
		target.attachEvent(eventType, fn);
		listenersArr[listenersArr.length] = [target, eventType, fn];
	}
	/* Flash Player and SWF content version matching
	*/
	function hasPlayerVersion(rv) {
		var pv = ua.pv, v = rv.split(".");
		v[0] = parseInt(v[0], 10);
		v[1] = parseInt(v[1], 10) || 0; // supports short notation, e.g. "9" instead of "9.0.0"
		v[2] = parseInt(v[2], 10) || 0;
		return (pv[0] > v[0] || (pv[0] == v[0] && pv[1] > v[1]) || (pv[0] == v[0] && pv[1] == v[1] && pv[2] >= v[2])) ? true : false;
	}
	/* Cross-browser dynamic CSS creation
		- Based on Bobby van der Sluis' solution: http://www.bobbyvandersluis.com/articles/dynamicCSS.php
	*/
	function createCSS(sel, decl, media, newStyle) {
		if (ua.ie && ua.mac) { return; }
		var h = doc.getElementsByTagName("head")[0];
		if (!h) { return; } // to also support badly authored HTML pages that lack a head element
		var m = (media && typeof media == "string") ? media : "screen";
		if (newStyle) {
			dynamicStylesheet = null;
			dynamicStylesheetMedia = null;
		}
		if (!dynamicStylesheet || dynamicStylesheetMedia != m) {
			// create dynamic stylesheet + get a global reference to it
			var s = createElement("style");
			s.setAttribute("type", "text/css");
			s.setAttribute("media", m);
			dynamicStylesheet = h.appendChild(s);
			if (ua.ie && ua.win && typeof doc.styleSheets != UNDEF && doc.styleSheets.length > 0) {
				dynamicStylesheet = doc.styleSheets[doc.styleSheets.length - 1];
			}
			dynamicStylesheetMedia = m;
		}
		// add style rule
		if (ua.ie && ua.win) {
			if (dynamicStylesheet && typeof dynamicStylesheet.addRule == OBJECT) {
				dynamicStylesheet.addRule(sel, decl);
			}
		}
		else {
			if (dynamicStylesheet && typeof doc.createTextNode != UNDEF) {
				dynamicStylesheet.appendChild(doc.createTextNode(sel + " {" + decl + "}"));
			}
		}
	}
	function setVisibility(id, isVisible) {
		if (!autoHideShow) { return; }
		var v = isVisible ? "visible" : "hidden";
		if (isDomLoaded && getElementById(id)) {
			getElementById(id).style.visibility = v;
		}
		else {
			createCSS("#" + id, "visibility:" + v);
		}
	}
	/* Filter to avoid XSS attacks
	*/
	function urlEncodeIfNecessary(s) {
		var regex = /[\\\"<>\.;]/;
		var hasBadChars = regex.exec(s) != null;
		return hasBadChars && typeof encodeURIComponent != UNDEF ? encodeURIComponent(s) : s;
	}
	/* Release memory to avoid memory leaks caused by closures, fix hanging audio/video threads and force open sockets/NetConnections to disconnect (Internet Explorer only)
	*/
	(function() {
		if (ua.ie && ua.win) {
			window.attachEvent("onunload", function() {
				// remove listeners to avoid memory leaks
				var ll = listenersArr.length;
				for (var i = 0; i < ll; i++) {
					listenersArr[i][0].detachEvent(listenersArr[i][1], listenersArr[i][2]);
				}
				// cleanup dynamically embedded objects to fix audio/video threads and force open sockets and NetConnections to disconnect
				var il = objIdArr.length;
				for (var j = 0; j < il; j++) {
					removeSWF(objIdArr[j]);
				}
				// cleanup library's main closures to avoid memory leaks
				for (var k in ua) {
					ua[k] = null;
				}
				ua = null;
				for (var l in swfobject) {
					swfobject[l] = null;
				}
				swfobject = null;
			});
		}
	})();
	return {
		/* Public API
			- Reference: http://code.google.com/p/swfobject/wiki/documentation
		*/
		registerObject: function(objectIdStr, swfVersionStr, xiSwfUrlStr, callbackFn) {
			if (ua.w3 && objectIdStr && swfVersionStr) {
				var regObj = {};
				regObj.id = objectIdStr;
				regObj.swfVersion = swfVersionStr;
				regObj.expressInstall = xiSwfUrlStr;
				regObj.callbackFn = callbackFn;
				regObjArr[regObjArr.length] = regObj;
				setVisibility(objectIdStr, false);
			}
			else if (callbackFn) {
				callbackFn({success:false, id:objectIdStr});
			}
		},
		getObjectById: function(objectIdStr) {
			if (ua.w3) {
				return getObjectById(objectIdStr);
			}
		},
		embedSWF: function(swfUrlStr, replaceElemIdStr, widthStr, heightStr, swfVersionStr, xiSwfUrlStr, flashvarsObj, parObj, attObj, callbackFn) {
			var callbackObj = {success:false, id:replaceElemIdStr};
			if (ua.w3 && !(ua.wk && ua.wk < 312) && swfUrlStr && replaceElemIdStr && widthStr && heightStr && swfVersionStr) {
				setVisibility(replaceElemIdStr, false);
				addDomLoadEvent(function() {
					widthStr += ""; // auto-convert to string
					heightStr += "";
					var att = {};
					if (attObj && typeof attObj === OBJECT) {
						for (var i in attObj) { // copy object to avoid the use of references, because web authors often reuse attObj for multiple SWFs
							att[i] = attObj[i];
						}
					}
					att.data = swfUrlStr;
					att.width = widthStr;
					att.height = heightStr;
					var par = {};
					if (parObj && typeof parObj === OBJECT) {
						for (var j in parObj) { // copy object to avoid the use of references, because web authors often reuse parObj for multiple SWFs
							par[j] = parObj[j];
						}
					}
					if (flashvarsObj && typeof flashvarsObj === OBJECT) {
						for (var k in flashvarsObj) { // copy object to avoid the use of references, because web authors often reuse flashvarsObj for multiple SWFs
							if (typeof par.flashvars != UNDEF) {
								par.flashvars += "&" + k + "=" + flashvarsObj[k];
							}
							else {
								par.flashvars = k + "=" + flashvarsObj[k];
							}
						}
					}
					if (hasPlayerVersion(swfVersionStr)) { // create SWF
						var obj = createSWF(att, par, replaceElemIdStr);
						if (att.id == replaceElemIdStr) {
							setVisibility(replaceElemIdStr, true);
						}
						callbackObj.success = true;
						callbackObj.ref = obj;
					}
					else if (xiSwfUrlStr && canExpressInstall()) { // show Adobe Express Install
						att.data = xiSwfUrlStr;
						showExpressInstall(att, par, replaceElemIdStr, callbackFn);
						return;
					}
					else { // show alternative content
						setVisibility(replaceElemIdStr, true);
					}
					if (callbackFn) { callbackFn(callbackObj); }
				});
			}
			else if (callbackFn) { callbackFn(callbackObj);	}
		},
		switchOffAutoHideShow: function() {
			autoHideShow = false;
		},
		ua: ua,
		getFlashPlayerVersion: function() {
			return { major:ua.pv[0], minor:ua.pv[1], release:ua.pv[2] };
		},
		hasFlashPlayerVersion: hasPlayerVersion,
		createSWF: function(attObj, parObj, replaceElemIdStr) {
			if (ua.w3) {
				return createSWF(attObj, parObj, replaceElemIdStr);
			}
			else {
				return undefined;
			}
		},
		showExpressInstall: function(att, par, replaceElemIdStr, callbackFn) {
			if (ua.w3 && canExpressInstall()) {
				showExpressInstall(att, par, replaceElemIdStr, callbackFn);
			}
		},
		removeSWF: function(objElemIdStr) {
			if (ua.w3) {
				removeSWF(objElemIdStr);
			}
		},
		createCSS: function(selStr, declStr, mediaStr, newStyleBoolean) {
			if (ua.w3) {
				createCSS(selStr, declStr, mediaStr, newStyleBoolean);
			}
		},
		addDomLoadEvent: addDomLoadEvent,
		addLoadEvent: addLoadEvent,
		getQueryParamValue: function(param) {
			var q = doc.location.search || doc.location.hash;
			if (q) {
				if (/\?/.test(q)) { q = q.split("?")[1]; } // strip question mark
				if (param == null) {
					return urlEncodeIfNecessary(q);
				}
				var pairs = q.split("&");
				for (var i = 0; i < pairs.length; i++) {
					if (pairs[i].substring(0, pairs[i].indexOf("=")) == param) {
						return urlEncodeIfNecessary(pairs[i].substring((pairs[i].indexOf("=") + 1)));
					}
				}
			}
			return "";
		},
		// For internal usage only
		expressInstallCallback: function() {
			if (isExpressInstallActive) {
				var obj = getElementById(EXPRESS_INSTALL_ID);
				if (obj && storedAltContent) {
					obj.parentNode.replaceChild(storedAltContent, obj);
					if (storedAltContentId) {
						setVisibility(storedAltContentId, true);
						if (ua.ie && ua.win) { storedAltContent.style.display = "block"; }
					}
					if (storedCallbackFn) { storedCallbackFn(storedCallbackObj); }
				}
				isExpressInstallActive = false;
			}
		}
	};
}();
module.exports = swfobject;

},{}],34:[function(require,module,exports){
/**
 * Создаёт экземпляр класса, но не запускает его конструктор
 * @param {function} OriginalClass - класс
 * @returns {OriginalClass}
 * @private
 */
var clearInstance = function(OriginalClass) {
    var ClearClass = function() {};
    ClearClass.prototype = OriginalClass.prototype;
    return new ClearClass();
};

module.exports = clearInstance;

},{}],35:[function(require,module,exports){
var clearInstance = require('./clear-instance');

/**
 * Classic Error acts like a fabric: Error.call(this, message) just create new object.
 * ErrorClass acts more like a class: ErrorClass.call(this, message) modify 'this' object.
 * @param {String} [message] - error message
 * @param {Number} [id] - error id
 * @extends Error
 * @constructor
 * @private
 */
var ErrorClass = function(message, id) {
    var err = new Error(message, id);
    err.name = this.name;

    this.message = err.message;
    this.stack = err.stack;
};

/**
 * Sugar. Just create inheritance from ErrorClass and define name property
 * @param {String} name - name of error type
 * @returns {ErrorClass}
 */
ErrorClass.create = function(name) {
    var errClass = clearInstance(ErrorClass);
    errClass.name = name;
    return errClass;
};

ErrorClass.prototype = clearInstance(Error);
ErrorClass.prototype.name = "ErrorClass";

module.exports = ErrorClass;

},{"./clear-instance":34}],36:[function(require,module,exports){
var Events = require('../async/events');

//THINK: изучить как работает ES 2015 Proxy и попробовать использовать

/**
 * @classdesc Прокси-класс. Выдаёт наружу лишь публичные методы объекта и статические свойства.
 * Не копирует методы из Object.prototype. Все методы имеют привязку контекста к проксируемому объекту.
 *
 * @param {Object} [object] - объект, который требуется проксировать
 * @constructor
 * @private
 */
var Proxy = function(object) {
    if (object) {
        for (var key in object) {
            if (key[0] === "_"
                || typeof object[key] !== "function"
                || object[key] === Object.prototype[key]
                || object.hasOwnProperty(key)
                || Events.prototype.hasOwnProperty(key)) {
                continue;
            }

            this[key] = object[key].bind(object);
        }

        if (object.pipeEvents) {
            Events.call(this);

            this.on = Events.prototype.on;
            this.once = Events.prototype.once;
            this.off = Events.prototype.off;
            this.clearListeners = Events.prototype.clearListeners;

            object.pipeEvents(this);
        }
    }
};

/**
 * Экспортирует статические свойства из одного объекта в другой, исключая указанные, приватные и прототип
 * @param {Object} from - откуда копировать
 * @param {Object} to - куда копировать
 * @param {Array.<String>} [exclude] - свойства которые требуется исключить
 */
Proxy.exportStatic = function(from, to, exclude) {
    exclude = exclude || [];

    Object.keys(from).forEach(function(key) {
        if (!from.hasOwnProperty(key)
            || key[0] === "_"
            || key === "prototype"
            || exclude.indexOf(key) !== -1) {
            return;
        }

        to[key] = from[key];
    });
};

/**
 * Создание прокси-пласса привязанного к указанному классу. Можно назначить родительский класс.
 * У родительского класса появляется приватный метод _proxy, который выдаёт прокси-объект для
 * данного экземляра. Также появляется свойство __proxy, содержащее ссылку на созданный прокси-объект
 *
 * @param {function} OriginalClass - оригинальный класс
 * @param {function} [ParentProxyClass=Proxy] - родительский класс
 * @returns {function} -- конструтор проксированного класса
 */
Proxy.createClass = function(OriginalClass, ParentProxyClass, excludeStatic) {

    var ProxyClass = function() {
        var OriginalClassConstructor = function() {};
        OriginalClassConstructor.prototype = OriginalClass.prototype;

        var original = new OriginalClassConstructor();
        OriginalClass.apply(original, arguments);

        return original._proxy();
    };

    var ParentProxyClassConstructor = function() {};
    ParentProxyClassConstructor.prototype = (ParentProxyClass || Proxy).prototype;
    ProxyClass.prototype = new ParentProxyClassConstructor();

    var val;
    for (var k in OriginalClass.prototype) {
        val = OriginalClass.prototype[k];
        if (Object.prototype[k] == val || typeof val === "function" || k[0] === "_") {
            continue;
        }
        ProxyClass.prototype[k] = val;
    }

    var createProxy = function(original) {
        var proto = Proxy.prototype;
        Proxy.prototype = ProxyClass.prototype;
        var proxy = new Proxy(original);
        Proxy.prototype = proto;
        return proxy;
    };

    OriginalClass.prototype._proxy = function() {
        if (!this.__proxy) {
            this.__proxy = createProxy(this);
        }

        return this.__proxy;
    };

    if (!excludeStatic) {
        Proxy.exportStatic(OriginalClass, ProxyClass);
    }

    return ProxyClass;
};

module.exports = Proxy;

},{"../async/events":29}],37:[function(require,module,exports){
/**
 * Скопировать свойства всех перечисленных объектов в один.
 * @param {Object} initial - если последний аргумент true, то новый объект не создаётся, а используется данный
 * @param {...Object|Boolean} args - список объектов из которых копировать свойства. Последний аргумент может быть либо
 * объектом, либо true.
 * @returns {Object}
 * @private
 */
var merge = function(initial) {
    var args = [].slice.call(arguments, 1);
    var object;
    var key;

    if (args[args.length - 1] === true) {
        object = initial;
        args.pop();
    } else {
        object = {};
        for (key in initial) {
            if (initial.hasOwnProperty(key)) {
                object[key] = initial[key];
            }
        }
    }

    for (var k = 0, l = args.length; k < l; k++) {
        for (key in args[k]) {
            if (args[k].hasOwnProperty(key)) {
                object[key] = args[k][key];
            }
        }
    }

    return object;
};

module.exports = merge;

},{}],38:[function(require,module,exports){
require('../../../export');

var LoaderError = require('./loader-error');

ya.music.Audio.LoaderError = LoaderError;

},{"../../../export":9,"./loader-error":39}],39:[function(require,module,exports){
var ErrorClass = require('../../class/error-class');

/**
 * @class LoaderError
 * @alias ya.music.Audio~LoaderError
 * @classdecs Класс ошибок загрузчика.
 * Расширяет Error.
 * @param {String} message Текст ошибки.
 *
 * @constructor
 */
var LoaderError = function(message) {
    ErrorClass.call(this, message);
};
LoaderError.prototype = ErrorClass.create("LoaderError");

/**
 * Таймаут загрузки.
 * @type {String}
 * @const
 */
LoaderError.TIMEOUT = "request timeout";
/**
 * Ошибка запроса на загрузку.
 * @type {String}
 * @const
 */
LoaderError.FAILED = "request failed";

module.exports = LoaderError;

},{"../../class/error-class":35}],40:[function(require,module,exports){
/**
 * Заглушка в виде пустой функции на все случаи жизни
 * @private
 */
var noop = function() {};

module.exports = noop;

},{}],41:[function(require,module,exports){
require("../export");

var Logger = require('./logger');

ya.music.Audio.Logger = Logger;

},{"../export":9,"./logger":42}],42:[function(require,module,exports){
var LEVELS = ["debug", "log", "info", "warn", "error", "trace"];
var noop = require('../lib/noop');

// =================================================================

//  Конструктор

// =================================================================

/**
 * @class Logger
 * @alias ya.music.Audio.Logger
 * @classdecs Настраиваемый логгер для аудиоплеера.
 * @param {String} channel Имя канала, за который будет отвечать экземляр логгера.
 * @constructor
 */
var Logger = function(channel) {
    this.channel = channel;
};

// =================================================================

//  Настройки

// =================================================================

/**
 * Список игнорируемых каналов.
 * @type {Array.<String>}
 */
Logger.ignores = [];

/**
 * Список отображаемых в консоли уровней лога.
 * @type {Array.<String>}
 */
Logger.logLevels = [];

// =================================================================

//  Синтаксический сахар

// =================================================================

/**
 * Запись в лог с уровнем **debug**.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.debug = noop;

/**
 * Запись в лог с уровнем **log**.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.log = noop;

/**
 * Запись в лог с уровнем **info**.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.info = noop;

/**
 * Запись в лог с уровнем **warn**.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.warn = noop;

/**
 * Запись в лог с уровнем **error**.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.error = noop;

/**
 * Запись в лог с уровнем **trace**.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.prototype.trace = noop;

/**
 * Метод для обработки ссылок, передаваемых в лог.
 * @param url
 * @private
 */
Logger.prototype._showUrl = function(url) {
    return Logger.showUrl(url);
};

/**
 * Метод для обработки ссылок, передаваемых в лог. Можно переопределять. По умолчанию не выполняет никаких действий.
 * @name ya.music.Audio.Logger#showUrl
 * @param {String} url Ссылка.
 * @returns {String} ссылку.
 */
Logger.showUrl = function(url) {
    return url;
};

LEVELS.forEach(function(level) {
    Logger.prototype[level] = function() {
        var args = [].slice.call(arguments);
        args.unshift(this.channel);
        args.unshift(level);
        Logger.log.apply(Logger, args);
    };
});

// =================================================================

//  Запись данных в лог

// =================================================================

/**
 * Сделать запись в лог.
 * @param {String} level Уровень лога.
 * @param {String} channel Канал.
 * @param {Object} context Контекст вызова.
 * @param {...*} [args] Дополнительные аргументы.
 */
Logger.log = function(level, channel, context) {
    var data = [].slice.call(arguments, 3).map(function(dumpItem) {
        return dumpItem && dumpItem._logger && dumpItem._logger() || dumpItem;
    });

    var logEntry = {
        timestamp: +new Date(),
        level: level,
        channel: channel,
        context: context,
        message: data
    };

    if (Logger.ignores[channel] || Logger.logLevels.indexOf(level) === -1) {
        return;
    }

    Logger._dumpEntry(logEntry);
};

/**
 * Запись в логе.
 * @typedef {Object} Audio.Logger.LogEntry
 * @property {Number} timestamp Время в timestamp формате.
 * @property {String} level Уровень лога.
 * @property {String} channel Канал.
 * @property {Object} context Контекст вызова.
 * @property {Array} message Дополнительные аргументы.
 *
 * @private
 */

/**
 * Записать сообщение лога в консоль.
 * @param {ya.music.Audio.Logger~LogEntry} logEntry Сообщение лога.
 * @private
 */
Logger._dumpEntry = function(logEntry) {
    try {
        var level = logEntry.level;

        var name = logEntry.context && (logEntry.context.taskName || logEntry.context.name);
        var context = logEntry.context && (logEntry.context._logger ? logEntry.context._logger() : "");

        if (typeof console[level] !== "function") {
            console.log.apply(console, [
                level.toUpperCase(),
                Logger._formatTimestamp(logEntry.timestamp),
                "[" + logEntry.channel + (name ? ":" + name : "") + "]",
                context
            ].concat(logEntry.message));
        } else {
            console[level].apply(console, [
                Logger._formatTimestamp(logEntry.timestamp),
                "[" + logEntry.channel + (name ? ":" + name : "") + "]",
                context
            ].concat(logEntry.message));
        }
    } catch(e) {
    }
};

/**
 * Вспомогательная функция форматирования даты для вывода в коносоль.
 * @param timestamp
 * @returns {string}
 * @private
 */
Logger._formatTimestamp = function(timestamp) {
    var date = new Date(timestamp);
    var ms = date.getMilliseconds();
    ms = ms > 100 ? ms : ms > 10 ? "0" + ms : "00" + ms;
    return date.toLocaleTimeString() + "." + ms;
};

module.exports = Logger;

},{"../lib/noop":40}]},{},[27])
//# sourceMappingURL=data:application/json;charset:utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvYnJvd3NlcmlmeS9ub2RlX21vZHVsZXMvcHJvY2Vzcy9icm93c2VyLmpzIiwibm9kZV9tb2R1bGVzL3Zvdy9saWIvdm93LmpzIiwic3JjL2F1ZGlvLXBsYXllci5qcyIsInNyYy9hdWRpby1zdGF0aWMuanMiLCJzcmMvY29uZmlnLmpzIiwic3JjL2Vycm9yL2F1ZGlvLWVycm9yLmpzIiwic3JjL2Vycm9yL2V4cG9ydC5qcyIsInNyYy9lcnJvci9wbGF5YmFjay1lcnJvci5qcyIsInNyYy9leHBvcnQuanMiLCJzcmMvZmxhc2gvYXVkaW8tZmxhc2guanMiLCJzcmMvZmxhc2gvZmxhc2gtaW50ZXJmYWNlLmpzIiwic3JjL2ZsYXNoL2ZsYXNoLW1hbmFnZXIuanMiLCJzcmMvZmxhc2gvZmxhc2hibG9ja25vdGlmaWVyLmpzIiwic3JjL2ZsYXNoL2ZsYXNoZW1iZWRkZXIuanMiLCJzcmMvZmxhc2gvbG9hZGVyLmpzIiwic3JjL2Z4L2VxdWFsaXplci9kZWZhdWx0LmJhbmRzLmpzIiwic3JjL2Z4L2VxdWFsaXplci9kZWZhdWx0LnByZXNldHMuanMiLCJzcmMvZngvZXF1YWxpemVyL2VxdWFsaXplci1iYW5kLmpzIiwic3JjL2Z4L2VxdWFsaXplci9lcXVhbGl6ZXItc3RhdGljLmpzIiwic3JjL2Z4L2VxdWFsaXplci9lcXVhbGl6ZXIuanMiLCJzcmMvZngvZXF1YWxpemVyL2V4cG9ydC5qcyIsInNyYy9meC9leHBvcnQuanMiLCJzcmMvZngvdm9sdW1lL2V4cG9ydC5qcyIsInNyYy9meC92b2x1bWUvdm9sdW1lLWxpYi5qcyIsInNyYy9odG1sNS9hdWRpby1odG1sNS1sb2FkZXIuanMiLCJzcmMvaHRtbDUvYXVkaW8taHRtbDUuanMiLCJzcmMvaW5kZXguanMiLCJzcmMvbGliL2FzeW5jL2RlZmVycmVkLmpzIiwic3JjL2xpYi9hc3luYy9ldmVudHMuanMiLCJzcmMvbGliL2FzeW5jL3Byb21pc2UuanMiLCJzcmMvbGliL2FzeW5jL3JlamVjdC5qcyIsInNyYy9saWIvYnJvd3Nlci9kZXRlY3QuanMiLCJzcmMvbGliL2Jyb3dzZXIvc3dmb2JqZWN0LmpzIiwic3JjL2xpYi9jbGFzcy9jbGVhci1pbnN0YW5jZS5qcyIsInNyYy9saWIvY2xhc3MvZXJyb3ItY2xhc3MuanMiLCJzcmMvbGliL2NsYXNzL3Byb3h5LmpzIiwic3JjL2xpYi9kYXRhL21lcmdlLmpzIiwic3JjL2xpYi9uZXQvZXJyb3IvZXhwb3J0LmpzIiwic3JjL2xpYi9uZXQvZXJyb3IvbG9hZGVyLWVycm9yLmpzIiwic3JjL2xpYi9ub29wLmpzIiwic3JjL2xvZ2dlci9leHBvcnQuanMiLCJzcmMvbG9nZ2VyL2xvZ2dlci5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7OztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7Ozs7QUNoekNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaGdDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNySEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxR0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDcEVBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUMxQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3UEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BQQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN6TUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdEVBO0FBQ0E7O0FDREE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzVGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ1hBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN2S0E7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7O0FDSEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hEQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy82QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3BmQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUN4RkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFOQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOURBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDaEJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2h1QkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNiQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3RIQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3JDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDOUJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDUEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ0xBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIvLyBzaGltIGZvciB1c2luZyBwcm9jZXNzIGluIGJyb3dzZXJcblxudmFyIHByb2Nlc3MgPSBtb2R1bGUuZXhwb3J0cyA9IHt9O1xudmFyIHF1ZXVlID0gW107XG52YXIgZHJhaW5pbmcgPSBmYWxzZTtcbnZhciBjdXJyZW50UXVldWU7XG52YXIgcXVldWVJbmRleCA9IC0xO1xuXG5mdW5jdGlvbiBjbGVhblVwTmV4dFRpY2soKSB7XG4gICAgZHJhaW5pbmcgPSBmYWxzZTtcbiAgICBpZiAoY3VycmVudFF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBxdWV1ZSA9IGN1cnJlbnRRdWV1ZS5jb25jYXQocXVldWUpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICB9XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCkge1xuICAgICAgICBkcmFpblF1ZXVlKCk7XG4gICAgfVxufVxuXG5mdW5jdGlvbiBkcmFpblF1ZXVlKCkge1xuICAgIGlmIChkcmFpbmluZykge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciB0aW1lb3V0ID0gc2V0VGltZW91dChjbGVhblVwTmV4dFRpY2spO1xuICAgIGRyYWluaW5nID0gdHJ1ZTtcblxuICAgIHZhciBsZW4gPSBxdWV1ZS5sZW5ndGg7XG4gICAgd2hpbGUobGVuKSB7XG4gICAgICAgIGN1cnJlbnRRdWV1ZSA9IHF1ZXVlO1xuICAgICAgICBxdWV1ZSA9IFtdO1xuICAgICAgICB3aGlsZSAoKytxdWV1ZUluZGV4IDwgbGVuKSB7XG4gICAgICAgICAgICBpZiAoY3VycmVudFF1ZXVlKSB7XG4gICAgICAgICAgICAgICAgY3VycmVudFF1ZXVlW3F1ZXVlSW5kZXhdLnJ1bigpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHF1ZXVlSW5kZXggPSAtMTtcbiAgICAgICAgbGVuID0gcXVldWUubGVuZ3RoO1xuICAgIH1cbiAgICBjdXJyZW50UXVldWUgPSBudWxsO1xuICAgIGRyYWluaW5nID0gZmFsc2U7XG4gICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xufVxuXG5wcm9jZXNzLm5leHRUaWNrID0gZnVuY3Rpb24gKGZ1bikge1xuICAgIHZhciBhcmdzID0gbmV3IEFycmF5KGFyZ3VtZW50cy5sZW5ndGggLSAxKTtcbiAgICBpZiAoYXJndW1lbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDE7IGkgPCBhcmd1bWVudHMubGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIGFyZ3NbaSAtIDFdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHF1ZXVlLnB1c2gobmV3IEl0ZW0oZnVuLCBhcmdzKSk7XG4gICAgaWYgKHF1ZXVlLmxlbmd0aCA9PT0gMSAmJiAhZHJhaW5pbmcpIHtcbiAgICAgICAgc2V0VGltZW91dChkcmFpblF1ZXVlLCAwKTtcbiAgICB9XG59O1xuXG4vLyB2OCBsaWtlcyBwcmVkaWN0aWJsZSBvYmplY3RzXG5mdW5jdGlvbiBJdGVtKGZ1biwgYXJyYXkpIHtcbiAgICB0aGlzLmZ1biA9IGZ1bjtcbiAgICB0aGlzLmFycmF5ID0gYXJyYXk7XG59XG5JdGVtLnByb3RvdHlwZS5ydW4gPSBmdW5jdGlvbiAoKSB7XG4gICAgdGhpcy5mdW4uYXBwbHkobnVsbCwgdGhpcy5hcnJheSk7XG59O1xucHJvY2Vzcy50aXRsZSA9ICdicm93c2VyJztcbnByb2Nlc3MuYnJvd3NlciA9IHRydWU7XG5wcm9jZXNzLmVudiA9IHt9O1xucHJvY2Vzcy5hcmd2ID0gW107XG5wcm9jZXNzLnZlcnNpb24gPSAnJzsgLy8gZW1wdHkgc3RyaW5nIHRvIGF2b2lkIHJlZ2V4cCBpc3N1ZXNcbnByb2Nlc3MudmVyc2lvbnMgPSB7fTtcblxuZnVuY3Rpb24gbm9vcCgpIHt9XG5cbnByb2Nlc3Mub24gPSBub29wO1xucHJvY2Vzcy5hZGRMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLm9uY2UgPSBub29wO1xucHJvY2Vzcy5vZmYgPSBub29wO1xucHJvY2Vzcy5yZW1vdmVMaXN0ZW5lciA9IG5vb3A7XG5wcm9jZXNzLnJlbW92ZUFsbExpc3RlbmVycyA9IG5vb3A7XG5wcm9jZXNzLmVtaXQgPSBub29wO1xuXG5wcm9jZXNzLmJpbmRpbmcgPSBmdW5jdGlvbiAobmFtZSkge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5iaW5kaW5nIGlzIG5vdCBzdXBwb3J0ZWQnKTtcbn07XG5cbnByb2Nlc3MuY3dkID0gZnVuY3Rpb24gKCkgeyByZXR1cm4gJy8nIH07XG5wcm9jZXNzLmNoZGlyID0gZnVuY3Rpb24gKGRpcikge1xuICAgIHRocm93IG5ldyBFcnJvcigncHJvY2Vzcy5jaGRpciBpcyBub3Qgc3VwcG9ydGVkJyk7XG59O1xucHJvY2Vzcy51bWFzayA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gMDsgfTtcbiIsIi8qKlxuICogQG1vZHVsZSB2b3dcbiAqIEBhdXRob3IgRmlsYXRvdiBEbWl0cnkgPGRmaWxhdG92QHlhbmRleC10ZWFtLnJ1PlxuICogQHZlcnNpb24gMC40LjEwXG4gKiBAbGljZW5zZVxuICogRHVhbCBsaWNlbnNlZCB1bmRlciB0aGUgTUlUIGFuZCBHUEwgbGljZW5zZXM6XG4gKiAgICogaHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHBcbiAqICAgKiBodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvZ3BsLmh0bWxcbiAqL1xuXG4oZnVuY3Rpb24oZ2xvYmFsKSB7XG5cbnZhciB1bmRlZixcbiAgICBuZXh0VGljayA9IChmdW5jdGlvbigpIHtcbiAgICAgICAgdmFyIGZucyA9IFtdLFxuICAgICAgICAgICAgZW5xdWV1ZUZuID0gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gZm5zLnB1c2goZm4pID09PSAxO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGNhbGxGbnMgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICB2YXIgZm5zVG9DYWxsID0gZm5zLCBpID0gMCwgbGVuID0gZm5zLmxlbmd0aDtcbiAgICAgICAgICAgICAgICBmbnMgPSBbXTtcbiAgICAgICAgICAgICAgICB3aGlsZShpIDwgbGVuKSB7XG4gICAgICAgICAgICAgICAgICAgIGZuc1RvQ2FsbFtpKytdKCk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfTtcblxuICAgICAgICBpZih0eXBlb2Ygc2V0SW1tZWRpYXRlID09PSAnZnVuY3Rpb24nKSB7IC8vIGllMTAsIG5vZGVqcyA+PSAwLjEwXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIHNldEltbWVkaWF0ZShjYWxsRm5zKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICBpZih0eXBlb2YgcHJvY2VzcyA9PT0gJ29iamVjdCcgJiYgcHJvY2Vzcy5uZXh0VGljaykgeyAvLyBub2RlanMgPCAwLjEwXG4gICAgICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHtcbiAgICAgICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIHByb2Nlc3MubmV4dFRpY2soY2FsbEZucyk7XG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIE11dGF0aW9uT2JzZXJ2ZXIgPSBnbG9iYWwuTXV0YXRpb25PYnNlcnZlciB8fCBnbG9iYWwuV2ViS2l0TXV0YXRpb25PYnNlcnZlcjsgLy8gbW9kZXJuIGJyb3dzZXJzXG4gICAgICAgIGlmKE11dGF0aW9uT2JzZXJ2ZXIpIHtcbiAgICAgICAgICAgIHZhciBudW0gPSAxLFxuICAgICAgICAgICAgICAgIG5vZGUgPSBkb2N1bWVudC5jcmVhdGVUZXh0Tm9kZSgnJyk7XG5cbiAgICAgICAgICAgIG5ldyBNdXRhdGlvbk9ic2VydmVyKGNhbGxGbnMpLm9ic2VydmUobm9kZSwgeyBjaGFyYWN0ZXJEYXRhIDogdHJ1ZSB9KTtcblxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgZW5xdWV1ZUZuKGZuKSAmJiAobm9kZS5kYXRhID0gKG51bSAqPSAtMSkpO1xuICAgICAgICAgICAgfTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGdsb2JhbC5wb3N0TWVzc2FnZSkge1xuICAgICAgICAgICAgdmFyIGlzUG9zdE1lc3NhZ2VBc3luYyA9IHRydWU7XG4gICAgICAgICAgICBpZihnbG9iYWwuYXR0YWNoRXZlbnQpIHtcbiAgICAgICAgICAgICAgICB2YXIgY2hlY2tBc3luYyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNQb3N0TWVzc2FnZUFzeW5jID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgICAgZ2xvYmFsLmF0dGFjaEV2ZW50KCdvbm1lc3NhZ2UnLCBjaGVja0FzeW5jKTtcbiAgICAgICAgICAgICAgICBnbG9iYWwucG9zdE1lc3NhZ2UoJ19fY2hlY2tBc3luYycsICcqJyk7XG4gICAgICAgICAgICAgICAgZ2xvYmFsLmRldGFjaEV2ZW50KCdvbm1lc3NhZ2UnLCBjaGVja0FzeW5jKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYoaXNQb3N0TWVzc2FnZUFzeW5jKSB7XG4gICAgICAgICAgICAgICAgdmFyIG1zZyA9ICdfX3Byb21pc2UnICsgK25ldyBEYXRlLFxuICAgICAgICAgICAgICAgICAgICBvbk1lc3NhZ2UgPSBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBpZihlLmRhdGEgPT09IG1zZykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGUuc3RvcFByb3BhZ2F0aW9uICYmIGUuc3RvcFByb3BhZ2F0aW9uKCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbEZucygpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICB9O1xuXG4gICAgICAgICAgICAgICAgZ2xvYmFsLmFkZEV2ZW50TGlzdGVuZXI/XG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbC5hZGRFdmVudExpc3RlbmVyKCdtZXNzYWdlJywgb25NZXNzYWdlLCB0cnVlKSA6XG4gICAgICAgICAgICAgICAgICAgIGdsb2JhbC5hdHRhY2hFdmVudCgnb25tZXNzYWdlJywgb25NZXNzYWdlKTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBmdW5jdGlvbihmbikge1xuICAgICAgICAgICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIGdsb2JhbC5wb3N0TWVzc2FnZShtc2csICcqJyk7XG4gICAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBkb2MgPSBnbG9iYWwuZG9jdW1lbnQ7XG4gICAgICAgIGlmKCdvbnJlYWR5c3RhdGVjaGFuZ2UnIGluIGRvYy5jcmVhdGVFbGVtZW50KCdzY3JpcHQnKSkgeyAvLyBpZTYtaWU4XG4gICAgICAgICAgICB2YXIgY3JlYXRlU2NyaXB0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBzY3JpcHQgPSBkb2MuY3JlYXRlRWxlbWVudCgnc2NyaXB0Jyk7XG4gICAgICAgICAgICAgICAgICAgIHNjcmlwdC5vbnJlYWR5c3RhdGVjaGFuZ2UgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHNjcmlwdC5wYXJlbnROb2RlLnJlbW92ZUNoaWxkKHNjcmlwdCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBzY3JpcHQgPSBzY3JpcHQub25yZWFkeXN0YXRlY2hhbmdlID0gbnVsbDtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxGbnMoKTtcbiAgICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICAgIChkb2MuZG9jdW1lbnRFbGVtZW50IHx8IGRvYy5ib2R5KS5hcHBlbmRDaGlsZChzY3JpcHQpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKGZuKSB7XG4gICAgICAgICAgICAgICAgZW5xdWV1ZUZuKGZuKSAmJiBjcmVhdGVTY3JpcHQoKTtcbiAgICAgICAgICAgIH07XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gZnVuY3Rpb24oZm4pIHsgLy8gb2xkIGJyb3dzZXJzXG4gICAgICAgICAgICBlbnF1ZXVlRm4oZm4pICYmIHNldFRpbWVvdXQoY2FsbEZucywgMCk7XG4gICAgICAgIH07XG4gICAgfSkoKSxcbiAgICB0aHJvd0V4Y2VwdGlvbiA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgbmV4dFRpY2soZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aHJvdyBlO1xuICAgICAgICB9KTtcbiAgICB9LFxuICAgIGlzRnVuY3Rpb24gPSBmdW5jdGlvbihvYmopIHtcbiAgICAgICAgcmV0dXJuIHR5cGVvZiBvYmogPT09ICdmdW5jdGlvbic7XG4gICAgfSxcbiAgICBpc09iamVjdCA9IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gb2JqICE9PSBudWxsICYmIHR5cGVvZiBvYmogPT09ICdvYmplY3QnO1xuICAgIH0sXG4gICAgdG9TdHIgPSBPYmplY3QucHJvdG90eXBlLnRvU3RyaW5nLFxuICAgIGlzQXJyYXkgPSBBcnJheS5pc0FycmF5IHx8IGZ1bmN0aW9uKG9iaikge1xuICAgICAgICByZXR1cm4gdG9TdHIuY2FsbChvYmopID09PSAnW29iamVjdCBBcnJheV0nO1xuICAgIH0sXG4gICAgZ2V0QXJyYXlLZXlzID0gZnVuY3Rpb24oYXJyKSB7XG4gICAgICAgIHZhciByZXMgPSBbXSxcbiAgICAgICAgICAgIGkgPSAwLCBsZW4gPSBhcnIubGVuZ3RoO1xuICAgICAgICB3aGlsZShpIDwgbGVuKSB7XG4gICAgICAgICAgICByZXMucHVzaChpKyspO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfSxcbiAgICBnZXRPYmplY3RLZXlzID0gT2JqZWN0LmtleXMgfHwgZnVuY3Rpb24ob2JqKSB7XG4gICAgICAgIHZhciByZXMgPSBbXTtcbiAgICAgICAgZm9yKHZhciBpIGluIG9iaikge1xuICAgICAgICAgICAgb2JqLmhhc093blByb3BlcnR5KGkpICYmIHJlcy5wdXNoKGkpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiByZXM7XG4gICAgfSxcbiAgICBkZWZpbmVDdXN0b21FcnJvclR5cGUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgICAgIHZhciByZXMgPSBmdW5jdGlvbihtZXNzYWdlKSB7XG4gICAgICAgICAgICB0aGlzLm5hbWUgPSBuYW1lO1xuICAgICAgICAgICAgdGhpcy5tZXNzYWdlID0gbWVzc2FnZTtcbiAgICAgICAgfTtcblxuICAgICAgICByZXMucHJvdG90eXBlID0gbmV3IEVycm9yKCk7XG5cbiAgICAgICAgcmV0dXJuIHJlcztcbiAgICB9LFxuICAgIHdyYXBPbkZ1bGZpbGxlZCA9IGZ1bmN0aW9uKG9uRnVsZmlsbGVkLCBpZHgpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgb25GdWxmaWxsZWQuY2FsbCh0aGlzLCB2YWwsIGlkeCk7XG4gICAgICAgIH07XG4gICAgfTtcblxuLyoqXG4gKiBAY2xhc3MgRGVmZXJyZWRcbiAqIEBleHBvcnRzIHZvdzpEZWZlcnJlZFxuICogQGRlc2NyaXB0aW9uXG4gKiBUaGUgYERlZmVycmVkYCBjbGFzcyBpcyB1c2VkIHRvIGVuY2Fwc3VsYXRlIG5ld2x5LWNyZWF0ZWQgcHJvbWlzZSBvYmplY3QgYWxvbmcgd2l0aCBmdW5jdGlvbnMgdGhhdCByZXNvbHZlLCByZWplY3Qgb3Igbm90aWZ5IGl0LlxuICovXG5cbi8qKlxuICogQGNvbnN0cnVjdG9yXG4gKiBAZGVzY3JpcHRpb25cbiAqIFlvdSBjYW4gdXNlIGB2b3cuZGVmZXIoKWAgaW5zdGVhZCBvZiB1c2luZyB0aGlzIGNvbnN0cnVjdG9yLlxuICpcbiAqIGBuZXcgdm93LkRlZmVycmVkKClgIGdpdmVzIHRoZSBzYW1lIHJlc3VsdCBhcyBgdm93LmRlZmVyKClgLlxuICovXG52YXIgRGVmZXJyZWQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLl9wcm9taXNlID0gbmV3IFByb21pc2UoKTtcbn07XG5cbkRlZmVycmVkLnByb3RvdHlwZSA9IC8qKiBAbGVuZHMgRGVmZXJyZWQucHJvdG90eXBlICove1xuICAgIC8qKlxuICAgICAqIFJldHVybnMgdGhlIGNvcnJlc3BvbmRpbmcgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBwcm9taXNlIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wcm9taXNlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXNvbHZlcyB0aGUgY29ycmVzcG9uZGluZyBwcm9taXNlIHdpdGggdGhlIGdpdmVuIGB2YWx1ZWAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyID0gdm93LmRlZmVyKCksXG4gICAgICogICAgIHByb21pc2UgPSBkZWZlci5wcm9taXNlKCk7XG4gICAgICpcbiAgICAgKiBwcm9taXNlLnRoZW4oZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgKiAgICAgLy8gdmFsdWUgaXMgXCInc3VjY2VzcydcIiBoZXJlXG4gICAgICogfSk7XG4gICAgICpcbiAgICAgKiBkZWZlci5yZXNvbHZlKCdzdWNjZXNzJyk7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgcmVzb2x2ZSA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3Byb21pc2UuaXNSZXNvbHZlZCgpIHx8IHRoaXMuX3Byb21pc2UuX3Jlc29sdmUodmFsdWUpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZWplY3RzIHRoZSBjb3JyZXNwb25kaW5nIHByb21pc2Ugd2l0aCB0aGUgZ2l2ZW4gYHJlYXNvbmAuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHJlYXNvblxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBgYGBqc1xuICAgICAqIHZhciBkZWZlciA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBwcm9taXNlID0gZGVmZXIucHJvbWlzZSgpO1xuICAgICAqXG4gICAgICogcHJvbWlzZS5mYWlsKGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAqICAgICAvLyByZWFzb24gaXMgXCInc29tZXRoaW5nIGlzIHdyb25nJ1wiIGhlcmVcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIGRlZmVyLnJlamVjdCgnc29tZXRoaW5nIGlzIHdyb25nJyk7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgcmVqZWN0IDogZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIGlmKHRoaXMuX3Byb21pc2UuaXNSZXNvbHZlZCgpKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBpZih2b3cuaXNQcm9taXNlKHJlYXNvbikpIHtcbiAgICAgICAgICAgIHJlYXNvbiA9IHJlYXNvbi50aGVuKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICAgIHZhciBkZWZlciA9IHZvdy5kZWZlcigpO1xuICAgICAgICAgICAgICAgIGRlZmVyLnJlamVjdCh2YWwpO1xuICAgICAgICAgICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIHRoaXMuX3Byb21pc2UuX3Jlc29sdmUocmVhc29uKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIHRoaXMuX3Byb21pc2UuX3JlamVjdChyZWFzb24pO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIE5vdGlmaWVzIHRoZSBjb3JyZXNwb25kaW5nIHByb21pc2Ugd2l0aCB0aGUgZ2l2ZW4gYHZhbHVlYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYGBganNcbiAgICAgKiB2YXIgZGVmZXIgPSB2b3cuZGVmZXIoKSxcbiAgICAgKiAgICAgcHJvbWlzZSA9IGRlZmVyLnByb21pc2UoKTtcbiAgICAgKlxuICAgICAqIHByb21pc2UucHJvZ3Jlc3MoZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgKiAgICAgLy8gdmFsdWUgaXMgXCInMjAlJ1wiLCBcIic0MCUnXCIgaGVyZVxuICAgICAqIH0pO1xuICAgICAqXG4gICAgICogZGVmZXIubm90aWZ5KCcyMCUnKTtcbiAgICAgKiBkZWZlci5ub3RpZnkoJzQwJScpO1xuICAgICAqIGBgYFxuICAgICAqL1xuICAgIG5vdGlmeSA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX3Byb21pc2UuaXNSZXNvbHZlZCgpIHx8IHRoaXMuX3Byb21pc2UuX25vdGlmeSh2YWx1ZSk7XG4gICAgfVxufTtcblxudmFyIFBST01JU0VfU1RBVFVTID0ge1xuICAgIFBFTkRJTkcgICA6IDAsXG4gICAgUkVTT0xWRUQgIDogMSxcbiAgICBGVUxGSUxMRUQgOiAyLFxuICAgIFJFSkVDVEVEICA6IDNcbn07XG5cbi8qKlxuICogQGNsYXNzIFByb21pc2VcbiAqIEBleHBvcnRzIHZvdzpQcm9taXNlXG4gKiBAZGVzY3JpcHRpb25cbiAqIFRoZSBgUHJvbWlzZWAgY2xhc3MgaXMgdXNlZCB3aGVuIHlvdSB3YW50IHRvIGdpdmUgdG8gdGhlIGNhbGxlciBzb21ldGhpbmcgdG8gc3Vic2NyaWJlIHRvLFxuICogYnV0IG5vdCB0aGUgYWJpbGl0eSB0byByZXNvbHZlIG9yIHJlamVjdCB0aGUgZGVmZXJyZWQuXG4gKi9cblxuLyoqXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwYXJhbSB7RnVuY3Rpb259IHJlc29sdmVyIFNlZSBodHRwczovL2dpdGh1Yi5jb20vZG9tZW5pYy9wcm9taXNlcy11bndyYXBwaW5nL2Jsb2IvbWFzdGVyL1JFQURNRS5tZCN0aGUtcHJvbWlzZS1jb25zdHJ1Y3RvciBmb3IgZGV0YWlscy5cbiAqIEBkZXNjcmlwdGlvblxuICogWW91IHNob3VsZCB1c2UgdGhpcyBjb25zdHJ1Y3RvciBkaXJlY3RseSBvbmx5IGlmIHlvdSBhcmUgZ29pbmcgdG8gdXNlIGB2b3dgIGFzIERPTSBQcm9taXNlcyBpbXBsZW1lbnRhdGlvbi5cbiAqIEluIG90aGVyIGNhc2UgeW91IHNob3VsZCB1c2UgYHZvdy5kZWZlcigpYCBhbmQgYGRlZmVyLnByb21pc2UoKWAgbWV0aG9kcy5cbiAqIEBleGFtcGxlXG4gKiBgYGBqc1xuICogZnVuY3Rpb24gZmV0Y2hKU09OKHVybCkge1xuICogICAgIHJldHVybiBuZXcgdm93LlByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0LCBub3RpZnkpIHtcbiAqICAgICAgICAgdmFyIHhociA9IG5ldyBYTUxIdHRwUmVxdWVzdCgpO1xuICogICAgICAgICB4aHIub3BlbignR0VUJywgdXJsKTtcbiAqICAgICAgICAgeGhyLnJlc3BvbnNlVHlwZSA9ICdqc29uJztcbiAqICAgICAgICAgeGhyLnNlbmQoKTtcbiAqICAgICAgICAgeGhyLm9ubG9hZCA9IGZ1bmN0aW9uKCkge1xuICogICAgICAgICAgICAgaWYoeGhyLnJlc3BvbnNlKSB7XG4gKiAgICAgICAgICAgICAgICAgcmVzb2x2ZSh4aHIucmVzcG9uc2UpO1xuICogICAgICAgICAgICAgfVxuICogICAgICAgICAgICAgZWxzZSB7XG4gKiAgICAgICAgICAgICAgICAgcmVqZWN0KG5ldyBUeXBlRXJyb3IoKSk7XG4gKiAgICAgICAgICAgICB9XG4gKiAgICAgICAgIH07XG4gKiAgICAgfSk7XG4gKiB9XG4gKiBgYGBcbiAqL1xudmFyIFByb21pc2UgPSBmdW5jdGlvbihyZXNvbHZlcikge1xuICAgIHRoaXMuX3ZhbHVlID0gdW5kZWY7XG4gICAgdGhpcy5fc3RhdHVzID0gUFJPTUlTRV9TVEFUVVMuUEVORElORztcblxuICAgIHRoaXMuX2Z1bGZpbGxlZENhbGxiYWNrcyA9IFtdO1xuICAgIHRoaXMuX3JlamVjdGVkQ2FsbGJhY2tzID0gW107XG4gICAgdGhpcy5fcHJvZ3Jlc3NDYWxsYmFja3MgPSBbXTtcblxuICAgIGlmKHJlc29sdmVyKSB7IC8vIE5PVEU6IHNlZSBodHRwczovL2dpdGh1Yi5jb20vZG9tZW5pYy9wcm9taXNlcy11bndyYXBwaW5nL2Jsb2IvbWFzdGVyL1JFQURNRS5tZFxuICAgICAgICB2YXIgX3RoaXMgPSB0aGlzLFxuICAgICAgICAgICAgcmVzb2x2ZXJGbkxlbiA9IHJlc29sdmVyLmxlbmd0aDtcblxuICAgICAgICByZXNvbHZlcihcbiAgICAgICAgICAgIGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICAgIF90aGlzLmlzUmVzb2x2ZWQoKSB8fCBfdGhpcy5fcmVzb2x2ZSh2YWwpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHJlc29sdmVyRm5MZW4gPiAxP1xuICAgICAgICAgICAgICAgIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgICAgICAgICAgICBfdGhpcy5pc1Jlc29sdmVkKCkgfHwgX3RoaXMuX3JlamVjdChyZWFzb24pO1xuICAgICAgICAgICAgICAgIH0gOlxuICAgICAgICAgICAgICAgIHVuZGVmLFxuICAgICAgICAgICAgcmVzb2x2ZXJGbkxlbiA+IDI/XG4gICAgICAgICAgICAgICAgZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgICAgIF90aGlzLmlzUmVzb2x2ZWQoKSB8fCBfdGhpcy5fbm90aWZ5KHZhbCk7XG4gICAgICAgICAgICAgICAgfSA6XG4gICAgICAgICAgICAgICAgdW5kZWYpO1xuICAgIH1cbn07XG5cblByb21pc2UucHJvdG90eXBlID0gLyoqIEBsZW5kcyBQcm9taXNlLnByb3RvdHlwZSAqLyB7XG4gICAgLyoqXG4gICAgICogUmV0dXJucyB0aGUgdmFsdWUgb2YgdGhlIGZ1bGZpbGxlZCBwcm9taXNlIG9yIHRoZSByZWFzb24gaW4gY2FzZSBvZiByZWplY3Rpb24uXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Kn1cbiAgICAgKi9cbiAgICB2YWx1ZU9mIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl92YWx1ZTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHByb21pc2UgaXMgcmVzb2x2ZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBpc1Jlc29sdmVkIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0dXMgIT09IFBST01JU0VfU1RBVFVTLlBFTkRJTkc7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYHRydWVgIGlmIHRoZSBwcm9taXNlIGlzIGZ1bGZpbGxlZC5cbiAgICAgKlxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzRnVsZmlsbGVkIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0dXMgPT09IFBST01JU0VfU1RBVFVTLkZVTEZJTExFRDtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBgdHJ1ZWAgaWYgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQuXG4gICAgICpcbiAgICAgKiBAcmV0dXJucyB7Qm9vbGVhbn1cbiAgICAgKi9cbiAgICBpc1JlamVjdGVkIDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9zdGF0dXMgPT09IFBST01JU0VfU1RBVFVTLlJFSkVDVEVEO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBBZGRzIHJlYWN0aW9ucyB0byB0aGUgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvbkZ1bGZpbGxlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIGZ1bGZpbGxlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblJlamVjdGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgcmVhc29uIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlamVjdGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uUHJvZ3Jlc3NdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiBub3RpZmllZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFja3MgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfSBBIG5ldyBwcm9taXNlLCBzZWUgaHR0cHM6Ly9naXRodWIuY29tL3Byb21pc2VzLWFwbHVzL3Byb21pc2VzLXNwZWMgZm9yIGRldGFpbHNcbiAgICAgKi9cbiAgICB0aGVuIDogZnVuY3Rpb24ob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCkge1xuICAgICAgICB2YXIgZGVmZXIgPSBuZXcgRGVmZXJyZWQoKTtcbiAgICAgICAgdGhpcy5fYWRkQ2FsbGJhY2tzKGRlZmVyLCBvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4KTtcbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBvbmx5IGEgcmVqZWN0aW9uIHJlYWN0aW9uLiBUaGlzIG1ldGhvZCBpcyBhIHNob3J0aGFuZCBmb3IgYHByb21pc2UudGhlbih1bmRlZmluZWQsIG9uUmVqZWN0ZWQpYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0ZWQgQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGNhbGxlZCB3aXRoIGEgcHJvdmlkZWQgJ3JlYXNvbicgYXMgYXJndW1lbnQgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2sgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgICdjYXRjaCcgOiBmdW5jdGlvbihvblJlamVjdGVkLCBjdHgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGhlbih1bmRlZiwgb25SZWplY3RlZCwgY3R4KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBvbmx5IGEgcmVqZWN0aW9uIHJlYWN0aW9uLiBUaGlzIG1ldGhvZCBpcyBhIHNob3J0aGFuZCBmb3IgYHByb21pc2UudGhlbihudWxsLCBvblJlamVjdGVkKWAuIEl0J3MgYWxzbyBhbiBhbGlhcyBmb3IgYGNhdGNoYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG9uUmVqZWN0ZWQgQ2FsbGJhY2sgdG8gYmUgY2FsbGVkIHdpdGggdGhlIHZhbHVlIGFmdGVyIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2sgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIGZhaWwgOiBmdW5jdGlvbihvblJlamVjdGVkLCBjdHgpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMudGhlbih1bmRlZiwgb25SZWplY3RlZCwgY3R4KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHJlc29sdmluZyByZWFjdGlvbiAoZm9yIGJvdGggZnVsZmlsbG1lbnQgYW5kIHJlamVjdGlvbikuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlc29sdmVkIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggdGhlIHByb21pc2UgYXMgYW4gYXJndW1lbnQsIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlc29sdmVkLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFjayBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgYWx3YXlzIDogZnVuY3Rpb24ob25SZXNvbHZlZCwgY3R4KSB7XG4gICAgICAgIHZhciBfdGhpcyA9IHRoaXMsXG4gICAgICAgICAgICBjYiA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIHJldHVybiBvblJlc29sdmVkLmNhbGwodGhpcywgX3RoaXMpO1xuICAgICAgICAgICAgfTtcblxuICAgICAgICByZXR1cm4gdGhpcy50aGVuKGNiLCBjYiwgY3R4KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogQWRkcyBhIHByb2dyZXNzIHJlYWN0aW9uLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gb25Qcm9ncmVzcyBDYWxsYmFjayB0aGF0IHdpbGwgYmUgY2FsbGVkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSB3aGVuIHRoZSBwcm9taXNlIGhhcyBiZWVuIG5vdGlmaWVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBwcm9ncmVzcyA6IGZ1bmN0aW9uKG9uUHJvZ3Jlc3MsIGN0eCkge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKHVuZGVmLCB1bmRlZiwgb25Qcm9ncmVzcywgY3R4KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogTGlrZSBgcHJvbWlzZS50aGVuYCwgYnV0IFwic3ByZWFkc1wiIHRoZSBhcnJheSBpbnRvIGEgdmFyaWFkaWMgdmFsdWUgaGFuZGxlci5cbiAgICAgKiBJdCBpcyB1c2VmdWwgd2l0aCB0aGUgYHZvdy5hbGxgIGFuZCB0aGUgYHZvdy5hbGxSZXNvbHZlZGAgbWV0aG9kcy5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvbkZ1bGZpbGxlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIGZ1bGZpbGxlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblJlamVjdGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgcmVhc29uIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlamVjdGVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrcyBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyMSA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBkZWZlcjIgPSB2b3cuZGVmZXIoKTtcbiAgICAgKlxuICAgICAqIHZvdy5hbGwoW2RlZmVyMS5wcm9taXNlKCksIGRlZmVyMi5wcm9taXNlKCldKS5zcHJlYWQoZnVuY3Rpb24oYXJnMSwgYXJnMikge1xuICAgICAqICAgICAvLyBhcmcxIGlzIFwiMVwiLCBhcmcyIGlzIFwiJ3R3bydcIiBoZXJlXG4gICAgICogfSk7XG4gICAgICpcbiAgICAgKiBkZWZlcjEucmVzb2x2ZSgxKTtcbiAgICAgKiBkZWZlcjIucmVzb2x2ZSgndHdvJyk7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgc3ByZWFkIDogZnVuY3Rpb24ob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIGN0eCkge1xuICAgICAgICByZXR1cm4gdGhpcy50aGVuKFxuICAgICAgICAgICAgZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIG9uRnVsZmlsbGVkLmFwcGx5KHRoaXMsIHZhbCk7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgb25SZWplY3RlZCxcbiAgICAgICAgICAgIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIExpa2UgYHRoZW5gLCBidXQgdGVybWluYXRlcyBhIGNoYWluIG9mIHByb21pc2VzLlxuICAgICAqIElmIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlamVjdGVkLCB0aGlzIG1ldGhvZCB0aHJvd3MgaXQncyBcInJlYXNvblwiIGFzIGFuIGV4Y2VwdGlvbiBpbiBhIGZ1dHVyZSB0dXJuIG9mIHRoZSBldmVudCBsb29wLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uRnVsZmlsbGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gZnVsZmlsbGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uUmVqZWN0ZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCByZWFzb24gYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25Qcm9ncmVzc10gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIG5vdGlmaWVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrcyBleGVjdXRpb25cbiAgICAgKlxuICAgICAqIEBleGFtcGxlXG4gICAgICogYGBganNcbiAgICAgKiB2YXIgZGVmZXIgPSB2b3cuZGVmZXIoKTtcbiAgICAgKiBkZWZlci5yZWplY3QoRXJyb3IoJ0ludGVybmFsIGVycm9yJykpO1xuICAgICAqIGRlZmVyLnByb21pc2UoKS5kb25lKCk7IC8vIGV4Y2VwdGlvbiB0byBiZSB0aHJvd25cbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICBkb25lIDogZnVuY3Rpb24ob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCkge1xuICAgICAgICB0aGlzXG4gICAgICAgICAgICAudGhlbihvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4KVxuICAgICAgICAgICAgLmZhaWwodGhyb3dFeGNlcHRpb24pO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IHByb21pc2UgdGhhdCB3aWxsIGJlIGZ1bGZpbGxlZCBpbiBgZGVsYXlgIG1pbGxpc2Vjb25kcyBpZiB0aGUgcHJvbWlzZSBpcyBmdWxmaWxsZWQsXG4gICAgICogb3IgaW1tZWRpYXRlbHkgcmVqZWN0ZWQgaWYgdGhlIHByb21pc2UgaXMgcmVqZWN0ZWQuXG4gICAgICpcbiAgICAgKiBAcGFyYW0ge051bWJlcn0gZGVsYXlcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgZGVsYXkgOiBmdW5jdGlvbihkZWxheSkge1xuICAgICAgICB2YXIgdGltZXIsXG4gICAgICAgICAgICBwcm9taXNlID0gdGhpcy50aGVuKGZ1bmN0aW9uKHZhbCkge1xuICAgICAgICAgICAgICAgIHZhciBkZWZlciA9IG5ldyBEZWZlcnJlZCgpO1xuICAgICAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dChcbiAgICAgICAgICAgICAgICAgICAgZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5yZXNvbHZlKHZhbCk7XG4gICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgIGRlbGF5KTtcblxuICAgICAgICAgICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgICAgICAgICB9KTtcblxuICAgICAgICBwcm9taXNlLmFsd2F5cyhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBwcm9taXNlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgbmV3IHByb21pc2UgdGhhdCB3aWxsIGJlIHJlamVjdGVkIGluIGB0aW1lb3V0YCBtaWxsaXNlY29uZHNcbiAgICAgKiBpZiB0aGUgcHJvbWlzZSBpcyBub3QgcmVzb2x2ZWQgYmVmb3JlaGFuZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSB0aW1lb3V0XG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBgYGBqc1xuICAgICAqIHZhciBkZWZlciA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBwcm9taXNlV2l0aFRpbWVvdXQxID0gZGVmZXIucHJvbWlzZSgpLnRpbWVvdXQoNTApLFxuICAgICAqICAgICBwcm9taXNlV2l0aFRpbWVvdXQyID0gZGVmZXIucHJvbWlzZSgpLnRpbWVvdXQoMjAwKTtcbiAgICAgKlxuICAgICAqIHNldFRpbWVvdXQoXG4gICAgICogICAgIGZ1bmN0aW9uKCkge1xuICAgICAqICAgICAgICAgZGVmZXIucmVzb2x2ZSgnb2snKTtcbiAgICAgKiAgICAgfSxcbiAgICAgKiAgICAgMTAwKTtcbiAgICAgKlxuICAgICAqIHByb21pc2VXaXRoVGltZW91dDEuZmFpbChmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgKiAgICAgLy8gcHJvbWlzZVdpdGhUaW1lb3V0IHRvIGJlIHJlamVjdGVkIGluIDUwbXNcbiAgICAgKiB9KTtcbiAgICAgKlxuICAgICAqIHByb21pc2VXaXRoVGltZW91dDIudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAqICAgICAvLyBwcm9taXNlV2l0aFRpbWVvdXQgdG8gYmUgZnVsZmlsbGVkIHdpdGggXCInb2snXCIgdmFsdWVcbiAgICAgKiB9KTtcbiAgICAgKiBgYGBcbiAgICAgKi9cbiAgICB0aW1lb3V0IDogZnVuY3Rpb24odGltZW91dCkge1xuICAgICAgICB2YXIgZGVmZXIgPSBuZXcgRGVmZXJyZWQoKSxcbiAgICAgICAgICAgIHRpbWVyID0gc2V0VGltZW91dChcbiAgICAgICAgICAgICAgICBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXIucmVqZWN0KG5ldyB2b3cuVGltZWRPdXRFcnJvcigndGltZWQgb3V0JykpO1xuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgdGltZW91dCk7XG5cbiAgICAgICAgdGhpcy50aGVuKFxuICAgICAgICAgICAgZnVuY3Rpb24odmFsKSB7XG4gICAgICAgICAgICAgICAgZGVmZXIucmVzb2x2ZSh2YWwpO1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgICAgICAgIGRlZmVyLnJlamVjdChyZWFzb24pO1xuICAgICAgICAgICAgfSk7XG5cbiAgICAgICAgZGVmZXIucHJvbWlzZSgpLmFsd2F5cyhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgIH0pO1xuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgfSxcblxuICAgIF92b3cgOiB0cnVlLFxuXG4gICAgX3Jlc29sdmUgOiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgaWYodGhpcy5fc3RhdHVzID4gUFJPTUlTRV9TVEFUVVMuUkVTT0xWRUQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHZhbCA9PT0gdGhpcykge1xuICAgICAgICAgICAgdGhpcy5fcmVqZWN0KFR5cGVFcnJvcignQ2FuXFwndCByZXNvbHZlIHByb21pc2Ugd2l0aCBpdHNlbGYnKSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zdGF0dXMgPSBQUk9NSVNFX1NUQVRVUy5SRVNPTFZFRDtcblxuICAgICAgICBpZih2YWwgJiYgISF2YWwuX3ZvdykgeyAvLyBzaG9ydHBhdGggZm9yIHZvdy5Qcm9taXNlXG4gICAgICAgICAgICB2YWwuaXNGdWxmaWxsZWQoKT9cbiAgICAgICAgICAgICAgICB0aGlzLl9mdWxmaWxsKHZhbC52YWx1ZU9mKCkpIDpcbiAgICAgICAgICAgICAgICB2YWwuaXNSZWplY3RlZCgpP1xuICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWplY3QodmFsLnZhbHVlT2YoKSkgOlxuICAgICAgICAgICAgICAgICAgICB2YWwudGhlbihcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX2Z1bGZpbGwsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9yZWplY3QsXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9ub3RpZnksXG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzKTtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKGlzT2JqZWN0KHZhbCkgfHwgaXNGdW5jdGlvbih2YWwpKSB7XG4gICAgICAgICAgICB2YXIgdGhlbjtcbiAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgdGhlbiA9IHZhbC50aGVuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3JlamVjdChlKTtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIGlmKGlzRnVuY3Rpb24odGhlbikpIHtcbiAgICAgICAgICAgICAgICB2YXIgX3RoaXMgPSB0aGlzLFxuICAgICAgICAgICAgICAgICAgICBpc1Jlc29sdmVkID0gZmFsc2U7XG5cbiAgICAgICAgICAgICAgICB0cnkge1xuICAgICAgICAgICAgICAgICAgICB0aGVuLmNhbGwoXG4gICAgICAgICAgICAgICAgICAgICAgICB2YWwsXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZihpc1Jlc29sdmVkKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBpc1Jlc29sdmVkID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBfdGhpcy5fcmVzb2x2ZSh2YWwpO1xuICAgICAgICAgICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICAgICAgICAgIGZ1bmN0aW9uKGVycikge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmKGlzUmVzb2x2ZWQpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlzUmVzb2x2ZWQgPSB0cnVlO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIF90aGlzLl9yZWplY3QoZXJyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBfdGhpcy5fbm90aWZ5KHZhbCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgY2F0Y2goZSkge1xuICAgICAgICAgICAgICAgICAgICBpc1Jlc29sdmVkIHx8IHRoaXMuX3JlamVjdChlKTtcbiAgICAgICAgICAgICAgICB9XG5cbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9mdWxmaWxsKHZhbCk7XG4gICAgfSxcblxuICAgIF9mdWxmaWxsIDogZnVuY3Rpb24odmFsKSB7XG4gICAgICAgIGlmKHRoaXMuX3N0YXR1cyA+IFBST01JU0VfU1RBVFVTLlJFU09MVkVEKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLl9zdGF0dXMgPSBQUk9NSVNFX1NUQVRVUy5GVUxGSUxMRUQ7XG4gICAgICAgIHRoaXMuX3ZhbHVlID0gdmFsO1xuXG4gICAgICAgIHRoaXMuX2NhbGxDYWxsYmFja3ModGhpcy5fZnVsZmlsbGVkQ2FsbGJhY2tzLCB2YWwpO1xuICAgICAgICB0aGlzLl9mdWxmaWxsZWRDYWxsYmFja3MgPSB0aGlzLl9yZWplY3RlZENhbGxiYWNrcyA9IHRoaXMuX3Byb2dyZXNzQ2FsbGJhY2tzID0gdW5kZWY7XG4gICAgfSxcblxuICAgIF9yZWplY3QgOiBmdW5jdGlvbihyZWFzb24pIHtcbiAgICAgICAgaWYodGhpcy5fc3RhdHVzID4gUFJPTUlTRV9TVEFUVVMuUkVTT0xWRUQpIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuX3N0YXR1cyA9IFBST01JU0VfU1RBVFVTLlJFSkVDVEVEO1xuICAgICAgICB0aGlzLl92YWx1ZSA9IHJlYXNvbjtcblxuICAgICAgICB0aGlzLl9jYWxsQ2FsbGJhY2tzKHRoaXMuX3JlamVjdGVkQ2FsbGJhY2tzLCByZWFzb24pO1xuICAgICAgICB0aGlzLl9mdWxmaWxsZWRDYWxsYmFja3MgPSB0aGlzLl9yZWplY3RlZENhbGxiYWNrcyA9IHRoaXMuX3Byb2dyZXNzQ2FsbGJhY2tzID0gdW5kZWY7XG4gICAgfSxcblxuICAgIF9ub3RpZnkgOiBmdW5jdGlvbih2YWwpIHtcbiAgICAgICAgdGhpcy5fY2FsbENhbGxiYWNrcyh0aGlzLl9wcm9ncmVzc0NhbGxiYWNrcywgdmFsKTtcbiAgICB9LFxuXG4gICAgX2FkZENhbGxiYWNrcyA6IGZ1bmN0aW9uKGRlZmVyLCBvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgb25Qcm9ncmVzcywgY3R4KSB7XG4gICAgICAgIGlmKG9uUmVqZWN0ZWQgJiYgIWlzRnVuY3Rpb24ob25SZWplY3RlZCkpIHtcbiAgICAgICAgICAgIGN0eCA9IG9uUmVqZWN0ZWQ7XG4gICAgICAgICAgICBvblJlamVjdGVkID0gdW5kZWY7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSBpZihvblByb2dyZXNzICYmICFpc0Z1bmN0aW9uKG9uUHJvZ3Jlc3MpKSB7XG4gICAgICAgICAgICBjdHggPSBvblByb2dyZXNzO1xuICAgICAgICAgICAgb25Qcm9ncmVzcyA9IHVuZGVmO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGNiO1xuXG4gICAgICAgIGlmKCF0aGlzLmlzUmVqZWN0ZWQoKSkge1xuICAgICAgICAgICAgY2IgPSB7IGRlZmVyIDogZGVmZXIsIGZuIDogaXNGdW5jdGlvbihvbkZ1bGZpbGxlZCk/IG9uRnVsZmlsbGVkIDogdW5kZWYsIGN0eCA6IGN0eCB9O1xuICAgICAgICAgICAgdGhpcy5pc0Z1bGZpbGxlZCgpP1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhbGxDYWxsYmFja3MoW2NiXSwgdGhpcy5fdmFsdWUpIDpcbiAgICAgICAgICAgICAgICB0aGlzLl9mdWxmaWxsZWRDYWxsYmFja3MucHVzaChjYik7XG4gICAgICAgIH1cblxuICAgICAgICBpZighdGhpcy5pc0Z1bGZpbGxlZCgpKSB7XG4gICAgICAgICAgICBjYiA9IHsgZGVmZXIgOiBkZWZlciwgZm4gOiBvblJlamVjdGVkLCBjdHggOiBjdHggfTtcbiAgICAgICAgICAgIHRoaXMuaXNSZWplY3RlZCgpP1xuICAgICAgICAgICAgICAgIHRoaXMuX2NhbGxDYWxsYmFja3MoW2NiXSwgdGhpcy5fdmFsdWUpIDpcbiAgICAgICAgICAgICAgICB0aGlzLl9yZWplY3RlZENhbGxiYWNrcy5wdXNoKGNiKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmKHRoaXMuX3N0YXR1cyA8PSBQUk9NSVNFX1NUQVRVUy5SRVNPTFZFRCkge1xuICAgICAgICAgICAgdGhpcy5fcHJvZ3Jlc3NDYWxsYmFja3MucHVzaCh7IGRlZmVyIDogZGVmZXIsIGZuIDogb25Qcm9ncmVzcywgY3R4IDogY3R4IH0pO1xuICAgICAgICB9XG4gICAgfSxcblxuICAgIF9jYWxsQ2FsbGJhY2tzIDogZnVuY3Rpb24oY2FsbGJhY2tzLCBhcmcpIHtcbiAgICAgICAgdmFyIGxlbiA9IGNhbGxiYWNrcy5sZW5ndGg7XG4gICAgICAgIGlmKCFsZW4pIHtcbiAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpc1Jlc29sdmVkID0gdGhpcy5pc1Jlc29sdmVkKCksXG4gICAgICAgICAgICBpc0Z1bGZpbGxlZCA9IHRoaXMuaXNGdWxmaWxsZWQoKTtcblxuICAgICAgICBuZXh0VGljayhmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBpID0gMCwgY2IsIGRlZmVyLCBmbjtcbiAgICAgICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgICAgICBjYiA9IGNhbGxiYWNrc1tpKytdO1xuICAgICAgICAgICAgICAgIGRlZmVyID0gY2IuZGVmZXI7XG4gICAgICAgICAgICAgICAgZm4gPSBjYi5mbjtcblxuICAgICAgICAgICAgICAgIGlmKGZuKSB7XG4gICAgICAgICAgICAgICAgICAgIHZhciBjdHggPSBjYi5jdHgsXG4gICAgICAgICAgICAgICAgICAgICAgICByZXM7XG4gICAgICAgICAgICAgICAgICAgIHRyeSB7XG4gICAgICAgICAgICAgICAgICAgICAgICByZXMgPSBjdHg/IGZuLmNhbGwoY3R4LCBhcmcpIDogZm4oYXJnKTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICBjYXRjaChlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5yZWplY3QoZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgIGlzUmVzb2x2ZWQ/XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5yZXNvbHZlKHJlcykgOlxuICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXIubm90aWZ5KHJlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgICAgICBpc1Jlc29sdmVkP1xuICAgICAgICAgICAgICAgICAgICAgICAgaXNGdWxmaWxsZWQ/XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgZGVmZXIucmVzb2x2ZShhcmcpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5yZWplY3QoYXJnKSA6XG4gICAgICAgICAgICAgICAgICAgICAgICBkZWZlci5ub3RpZnkoYXJnKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbn07XG5cbi8qKiBAbGVuZHMgUHJvbWlzZSAqL1xudmFyIHN0YXRpY01ldGhvZHMgPSB7XG4gICAgLyoqXG4gICAgICogQ29lcmNlcyB0aGUgZ2l2ZW4gYHZhbHVlYCB0byBhIHByb21pc2UsIG9yIHJldHVybnMgdGhlIGB2YWx1ZWAgaWYgaXQncyBhbHJlYWR5IGEgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgY2FzdCA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2b3cuY2FzdCh2YWx1ZSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlLCB0aGF0IHdpbGwgYmUgZnVsZmlsbGVkIG9ubHkgYWZ0ZXIgYWxsIHRoZSBpdGVtcyBpbiBgaXRlcmFibGVgIGFyZSBmdWxmaWxsZWQuXG4gICAgICogSWYgYW55IG9mIHRoZSBgaXRlcmFibGVgIGl0ZW1zIGdldHMgcmVqZWN0ZWQsIHRoZW4gdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBiZSByZWplY3RlZC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7QXJyYXl8T2JqZWN0fSBpdGVyYWJsZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBhbGwgOiBmdW5jdGlvbihpdGVyYWJsZSkge1xuICAgICAgICByZXR1cm4gdm93LmFsbChpdGVyYWJsZSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlLCB0aGF0IHdpbGwgYmUgZnVsZmlsbGVkIG9ubHkgd2hlbiBhbnkgb2YgdGhlIGl0ZW1zIGluIGBpdGVyYWJsZWAgYXJlIGZ1bGZpbGxlZC5cbiAgICAgKiBJZiBhbnkgb2YgdGhlIGBpdGVyYWJsZWAgaXRlbXMgZ2V0cyByZWplY3RlZCwgdGhlbiB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheX0gaXRlcmFibGVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgcmFjZSA6IGZ1bmN0aW9uKGl0ZXJhYmxlKSB7XG4gICAgICAgIHJldHVybiB2b3cuYW55UmVzb2x2ZWQoaXRlcmFibGUpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gcmVzb2x2ZWQgd2l0aCB0aGUgZ2l2ZW4gYHZhbHVlYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIGEgcHJvbWlzZSwgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBoYXZlIGB2YWx1ZWAncyBzdGF0ZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgcmVzb2x2ZSA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2b3cucmVzb2x2ZSh2YWx1ZSk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFzIGFscmVhZHkgYmVlbiByZWplY3RlZCB3aXRoIHRoZSBnaXZlbiBgcmVhc29uYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gcmVhc29uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHJlamVjdCA6IGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICByZXR1cm4gdm93LnJlamVjdChyZWFzb24pO1xuICAgIH1cbn07XG5cbmZvcih2YXIgcHJvcCBpbiBzdGF0aWNNZXRob2RzKSB7XG4gICAgc3RhdGljTWV0aG9kcy5oYXNPd25Qcm9wZXJ0eShwcm9wKSAmJlxuICAgICAgICAoUHJvbWlzZVtwcm9wXSA9IHN0YXRpY01ldGhvZHNbcHJvcF0pO1xufVxuXG52YXIgdm93ID0gLyoqIEBleHBvcnRzIHZvdyAqLyB7XG4gICAgRGVmZXJyZWQgOiBEZWZlcnJlZCxcblxuICAgIFByb21pc2UgOiBQcm9taXNlLFxuXG4gICAgLyoqXG4gICAgICogQ3JlYXRlcyBhIG5ldyBkZWZlcnJlZC4gVGhpcyBtZXRob2QgaXMgYSBmYWN0b3J5IG1ldGhvZCBmb3IgYHZvdzpEZWZlcnJlZGAgY2xhc3MuXG4gICAgICogSXQncyBlcXVpdmFsZW50IHRvIGBuZXcgdm93LkRlZmVycmVkKClgLlxuICAgICAqXG4gICAgICogQHJldHVybnMge3ZvdzpEZWZlcnJlZH1cbiAgICAgKi9cbiAgICBkZWZlciA6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gbmV3IERlZmVycmVkKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLnRoZW5gLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25GdWxmaWxsZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiBmdWxmaWxsZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25SZWplY3RlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHJlYXNvbiBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiByZWplY3RlZFxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IFtvblByb2dyZXNzXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gbm90aWZpZWRcbiAgICAgKiBAcGFyYW0ge09iamVjdH0gW2N0eF0gQ29udGV4dCBvZiB0aGUgY2FsbGJhY2tzIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICB3aGVuIDogZnVuY3Rpb24odmFsdWUsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvblByb2dyZXNzLCBjdHgpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5jYXN0KHZhbHVlKS50aGVuKG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvblByb2dyZXNzLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5mYWlsYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gb25SZWplY3RlZCBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgcmVhc29uIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlamVjdGVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBmYWlsIDogZnVuY3Rpb24odmFsdWUsIG9uUmVqZWN0ZWQsIGN0eCkge1xuICAgICAgICByZXR1cm4gdm93LndoZW4odmFsdWUsIHVuZGVmLCBvblJlamVjdGVkLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5hbHdheXNgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBvblJlc29sdmVkIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggdGhlIHByb21pc2UgYXMgYW4gYXJndW1lbnQsIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIHJlc29sdmVkLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFjayBleGVjdXRpb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgYWx3YXlzIDogZnVuY3Rpb24odmFsdWUsIG9uUmVzb2x2ZWQsIGN0eCkge1xuICAgICAgICByZXR1cm4gdm93LndoZW4odmFsdWUpLmFsd2F5cyhvblJlc29sdmVkLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5wcm9ncmVzc2AuXG4gICAgICogSWYgYHZhbHVlYCBpcyBub3QgYSBwcm9taXNlLCB0aGVuIGB2YWx1ZWAgaXMgdHJlYXRlZCBhcyBhIGZ1bGZpbGxlZCBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IG9uUHJvZ3Jlc3MgQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIG5vdGlmaWVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrIGV4ZWN1dGlvblxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBwcm9ncmVzcyA6IGZ1bmN0aW9uKHZhbHVlLCBvblByb2dyZXNzLCBjdHgpIHtcbiAgICAgICAgcmV0dXJuIHZvdy53aGVuKHZhbHVlKS5wcm9ncmVzcyhvblByb2dyZXNzLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5zcHJlYWRgLlxuICAgICAqIElmIGB2YWx1ZWAgaXMgbm90IGEgcHJvbWlzZSwgdGhlbiBgdmFsdWVgIGlzIHRyZWF0ZWQgYXMgYSBmdWxmaWxsZWQgcHJvbWlzZS5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25GdWxmaWxsZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCB2YWx1ZSBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiBmdWxmaWxsZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25SZWplY3RlZF0gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHJlYXNvbiBhZnRlciB0aGUgcHJvbWlzZSBoYXMgYmVlbiByZWplY3RlZFxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbY3R4XSBDb250ZXh0IG9mIHRoZSBjYWxsYmFja3MgZXhlY3V0aW9uXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHNwcmVhZCA6IGZ1bmN0aW9uKHZhbHVlLCBvbkZ1bGZpbGxlZCwgb25SZWplY3RlZCwgY3R4KSB7XG4gICAgICAgIHJldHVybiB2b3cud2hlbih2YWx1ZSkuc3ByZWFkKG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBjdHgpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5kb25lYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uRnVsZmlsbGVkXSBDYWxsYmFjayB0aGF0IHdpbGwgYmUgaW52b2tlZCB3aXRoIGEgcHJvdmlkZWQgdmFsdWUgYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gZnVsZmlsbGVkXG4gICAgICogQHBhcmFtIHtGdW5jdGlvbn0gW29uUmVqZWN0ZWRdIENhbGxiYWNrIHRoYXQgd2lsbCBiZSBpbnZva2VkIHdpdGggYSBwcm92aWRlZCByZWFzb24gYWZ0ZXIgdGhlIHByb21pc2UgaGFzIGJlZW4gcmVqZWN0ZWRcbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBbb25Qcm9ncmVzc10gQ2FsbGJhY2sgdGhhdCB3aWxsIGJlIGludm9rZWQgd2l0aCBhIHByb3ZpZGVkIHZhbHVlIGFmdGVyIHRoZSBwcm9taXNlIGhhcyBiZWVuIG5vdGlmaWVkXG4gICAgICogQHBhcmFtIHtPYmplY3R9IFtjdHhdIENvbnRleHQgb2YgdGhlIGNhbGxiYWNrcyBleGVjdXRpb25cbiAgICAgKi9cbiAgICBkb25lIDogZnVuY3Rpb24odmFsdWUsIG9uRnVsZmlsbGVkLCBvblJlamVjdGVkLCBvblByb2dyZXNzLCBjdHgpIHtcbiAgICAgICAgdm93LndoZW4odmFsdWUpLmRvbmUob25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIENoZWNrcyB3aGV0aGVyIHRoZSBnaXZlbiBgdmFsdWVgIGlzIGEgcHJvbWlzZS1saWtlIG9iamVjdFxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBgYGBqc1xuICAgICAqIHZvdy5pc1Byb21pc2UoJ3NvbWV0aGluZycpOyAvLyByZXR1cm5zIGZhbHNlXG4gICAgICogdm93LmlzUHJvbWlzZSh2b3cuZGVmZXIoKS5wcm9taXNlKCkpOyAvLyByZXR1cm5zIHRydWVcbiAgICAgKiB2b3cuaXNQcm9taXNlKHsgdGhlbiA6IGZ1bmN0aW9uKCkgeyB9KTsgLy8gcmV0dXJucyB0cnVlXG4gICAgICogYGBgXG4gICAgICovXG4gICAgaXNQcm9taXNlIDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIGlzT2JqZWN0KHZhbHVlKSAmJiBpc0Z1bmN0aW9uKHZhbHVlLnRoZW4pO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBDb2VyY2VzIHRoZSBnaXZlbiBgdmFsdWVgIHRvIGEgcHJvbWlzZSwgb3IgcmV0dXJucyB0aGUgYHZhbHVlYCBpZiBpdCdzIGFscmVhZHkgYSBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHt2b3c6UHJvbWlzZX1cbiAgICAgKi9cbiAgICBjYXN0IDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHZhbHVlICYmICEhdmFsdWUuX3Zvdz9cbiAgICAgICAgICAgIHZhbHVlIDpcbiAgICAgICAgICAgIHZvdy5yZXNvbHZlKHZhbHVlKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU3RhdGljIGVxdWl2YWxlbnQgdG8gYHByb21pc2UudmFsdWVPZmAuXG4gICAgICogSWYgYHZhbHVlYCBpcyBub3QgYSBwcm9taXNlLCB0aGVuIGB2YWx1ZWAgaXMgdHJlYXRlZCBhcyBhIGZ1bGZpbGxlZCBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHsqfVxuICAgICAqL1xuICAgIHZhbHVlT2YgOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgaXNGdW5jdGlvbih2YWx1ZS52YWx1ZU9mKT8gdmFsdWUudmFsdWVPZigpIDogdmFsdWU7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLmlzRnVsZmlsbGVkYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNGdWxmaWxsZWQgOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgaXNGdW5jdGlvbih2YWx1ZS5pc0Z1bGZpbGxlZCk/IHZhbHVlLmlzRnVsZmlsbGVkKCkgOiB0cnVlO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS5pc1JlamVjdGVkYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMge0Jvb2xlYW59XG4gICAgICovXG4gICAgaXNSZWplY3RlZCA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHJldHVybiB2YWx1ZSAmJiBpc0Z1bmN0aW9uKHZhbHVlLmlzUmVqZWN0ZWQpPyB2YWx1ZS5pc1JlamVjdGVkKCkgOiBmYWxzZTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogU3RhdGljIGVxdWl2YWxlbnQgdG8gYHByb21pc2UuaXNSZXNvbHZlZGAuXG4gICAgICogSWYgYHZhbHVlYCBpcyBub3QgYSBwcm9taXNlLCB0aGVuIGB2YWx1ZWAgaXMgdHJlYXRlZCBhcyBhIGZ1bGZpbGxlZCBwcm9taXNlLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSB2YWx1ZVxuICAgICAqIEByZXR1cm5zIHtCb29sZWFufVxuICAgICAqL1xuICAgIGlzUmVzb2x2ZWQgOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICByZXR1cm4gdmFsdWUgJiYgaXNGdW5jdGlvbih2YWx1ZS5pc1Jlc29sdmVkKT8gdmFsdWUuaXNSZXNvbHZlZCgpIDogdHJ1ZTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UgdGhhdCBoYXMgYWxyZWFkeSBiZWVuIHJlc29sdmVkIHdpdGggdGhlIGdpdmVuIGB2YWx1ZWAuXG4gICAgICogSWYgYHZhbHVlYCBpcyBhIHByb21pc2UsIHRoZSByZXR1cm5lZCBwcm9taXNlIHdpbGwgaGF2ZSBgdmFsdWVgJ3Mgc3RhdGUuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIHJlc29sdmUgOiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICB2YXIgcmVzID0gdm93LmRlZmVyKCk7XG4gICAgICAgIHJlcy5yZXNvbHZlKHZhbHVlKTtcbiAgICAgICAgcmV0dXJuIHJlcy5wcm9taXNlKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlIHRoYXQgaGFzIGFscmVhZHkgYmVlbiBmdWxmaWxsZWQgd2l0aCB0aGUgZ2l2ZW4gYHZhbHVlYC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIGEgcHJvbWlzZSwgdGhlIHJldHVybmVkIHByb21pc2Ugd2lsbCBiZSBmdWxmaWxsZWQgd2l0aCB0aGUgZnVsZmlsbC9yZWplY3Rpb24gdmFsdWUgb2YgYHZhbHVlYC5cbiAgICAgKlxuICAgICAqIEBwYXJhbSB7Kn0gdmFsdWVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgZnVsZmlsbCA6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHZhciBkZWZlciA9IHZvdy5kZWZlcigpLFxuICAgICAgICAgICAgcHJvbWlzZSA9IGRlZmVyLnByb21pc2UoKTtcblxuICAgICAgICBkZWZlci5yZXNvbHZlKHZhbHVlKTtcblxuICAgICAgICByZXR1cm4gcHJvbWlzZS5pc0Z1bGZpbGxlZCgpP1xuICAgICAgICAgICAgcHJvbWlzZSA6XG4gICAgICAgICAgICBwcm9taXNlLnRoZW4obnVsbCwgZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIHJlYXNvbjtcbiAgICAgICAgICAgIH0pO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IGhhcyBhbHJlYWR5IGJlZW4gcmVqZWN0ZWQgd2l0aCB0aGUgZ2l2ZW4gYHJlYXNvbmAuXG4gICAgICogSWYgYHJlYXNvbmAgaXMgYSBwcm9taXNlLCB0aGUgcmV0dXJuZWQgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkIHdpdGggdGhlIGZ1bGZpbGwvcmVqZWN0aW9uIHZhbHVlIG9mIGByZWFzb25gLlxuICAgICAqXG4gICAgICogQHBhcmFtIHsqfSByZWFzb25cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgcmVqZWN0IDogZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgICAgIHZhciBkZWZlciA9IHZvdy5kZWZlcigpO1xuICAgICAgICBkZWZlci5yZWplY3QocmVhc29uKTtcbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogSW52b2tlcyB0aGUgZ2l2ZW4gZnVuY3Rpb24gYGZuYCB3aXRoIGFyZ3VtZW50cyBgYXJnc2BcbiAgICAgKlxuICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGZuXG4gICAgICogQHBhcmFtIHsuLi4qfSBbYXJnc11cbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICpcbiAgICAgKiBAZXhhbXBsZVxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIHByb21pc2UxID0gdm93Lmludm9rZShmdW5jdGlvbih2YWx1ZSkge1xuICAgICAqICAgICAgICAgcmV0dXJuIHZhbHVlO1xuICAgICAqICAgICB9LCAnb2snKSxcbiAgICAgKiAgICAgcHJvbWlzZTIgPSB2b3cuaW52b2tlKGZ1bmN0aW9uKCkge1xuICAgICAqICAgICAgICAgdGhyb3cgRXJyb3IoKTtcbiAgICAgKiAgICAgfSk7XG4gICAgICpcbiAgICAgKiBwcm9taXNlMS5pc0Z1bGZpbGxlZCgpOyAvLyB0cnVlXG4gICAgICogcHJvbWlzZTEudmFsdWVPZigpOyAvLyAnb2snXG4gICAgICogcHJvbWlzZTIuaXNSZWplY3RlZCgpOyAvLyB0cnVlXG4gICAgICogcHJvbWlzZTIudmFsdWVPZigpOyAvLyBpbnN0YW5jZSBvZiBFcnJvclxuICAgICAqIGBgYFxuICAgICAqL1xuICAgIGludm9rZSA6IGZ1bmN0aW9uKGZuLCBhcmdzKSB7XG4gICAgICAgIHZhciBsZW4gPSBNYXRoLm1heChhcmd1bWVudHMubGVuZ3RoIC0gMSwgMCksXG4gICAgICAgICAgICBjYWxsQXJncztcbiAgICAgICAgaWYobGVuKSB7IC8vIG9wdGltaXphdGlvbiBmb3IgVjhcbiAgICAgICAgICAgIGNhbGxBcmdzID0gQXJyYXkobGVuKTtcbiAgICAgICAgICAgIHZhciBpID0gMDtcbiAgICAgICAgICAgIHdoaWxlKGkgPCBsZW4pIHtcbiAgICAgICAgICAgICAgICBjYWxsQXJnc1tpKytdID0gYXJndW1lbnRzW2ldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgIHJldHVybiB2b3cucmVzb2x2ZShjYWxsQXJncz9cbiAgICAgICAgICAgICAgICBmbi5hcHBseShnbG9iYWwsIGNhbGxBcmdzKSA6XG4gICAgICAgICAgICAgICAgZm4uY2FsbChnbG9iYWwpKTtcbiAgICAgICAgfVxuICAgICAgICBjYXRjaChlKSB7XG4gICAgICAgICAgICByZXR1cm4gdm93LnJlamVjdChlKTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBSZXR1cm5zIGEgcHJvbWlzZSwgdGhhdCB3aWxsIGJlIGZ1bGZpbGxlZCBvbmx5IGFmdGVyIGFsbCB0aGUgaXRlbXMgaW4gYGl0ZXJhYmxlYCBhcmUgZnVsZmlsbGVkLlxuICAgICAqIElmIGFueSBvZiB0aGUgYGl0ZXJhYmxlYCBpdGVtcyBnZXRzIHJlamVjdGVkLCB0aGUgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheXxPYmplY3R9IGl0ZXJhYmxlXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB3aXRoIGFycmF5OlxuICAgICAqIGBgYGpzXG4gICAgICogdmFyIGRlZmVyMSA9IHZvdy5kZWZlcigpLFxuICAgICAqICAgICBkZWZlcjIgPSB2b3cuZGVmZXIoKTtcbiAgICAgKlxuICAgICAqIHZvdy5hbGwoW2RlZmVyMS5wcm9taXNlKCksIGRlZmVyMi5wcm9taXNlKCksIDNdKVxuICAgICAqICAgICAudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAqICAgICAgICAgIC8vIHZhbHVlIGlzIFwiWzEsIDIsIDNdXCIgaGVyZVxuICAgICAqICAgICB9KTtcbiAgICAgKlxuICAgICAqIGRlZmVyMS5yZXNvbHZlKDEpO1xuICAgICAqIGRlZmVyMi5yZXNvbHZlKDIpO1xuICAgICAqIGBgYFxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiB3aXRoIG9iamVjdDpcbiAgICAgKiBgYGBqc1xuICAgICAqIHZhciBkZWZlcjEgPSB2b3cuZGVmZXIoKSxcbiAgICAgKiAgICAgZGVmZXIyID0gdm93LmRlZmVyKCk7XG4gICAgICpcbiAgICAgKiB2b3cuYWxsKHsgcDEgOiBkZWZlcjEucHJvbWlzZSgpLCBwMiA6IGRlZmVyMi5wcm9taXNlKCksIHAzIDogMyB9KVxuICAgICAqICAgICAudGhlbihmdW5jdGlvbih2YWx1ZSkge1xuICAgICAqICAgICAgICAgIC8vIHZhbHVlIGlzIFwieyBwMSA6IDEsIHAyIDogMiwgcDMgOiAzIH1cIiBoZXJlXG4gICAgICogICAgIH0pO1xuICAgICAqXG4gICAgICogZGVmZXIxLnJlc29sdmUoMSk7XG4gICAgICogZGVmZXIyLnJlc29sdmUoMik7XG4gICAgICogYGBgXG4gICAgICovXG4gICAgYWxsIDogZnVuY3Rpb24oaXRlcmFibGUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gbmV3IERlZmVycmVkKCksXG4gICAgICAgICAgICBpc1Byb21pc2VzQXJyYXkgPSBpc0FycmF5KGl0ZXJhYmxlKSxcbiAgICAgICAgICAgIGtleXMgPSBpc1Byb21pc2VzQXJyYXk/XG4gICAgICAgICAgICAgICAgZ2V0QXJyYXlLZXlzKGl0ZXJhYmxlKSA6XG4gICAgICAgICAgICAgICAgZ2V0T2JqZWN0S2V5cyhpdGVyYWJsZSksXG4gICAgICAgICAgICBsZW4gPSBrZXlzLmxlbmd0aCxcbiAgICAgICAgICAgIHJlcyA9IGlzUHJvbWlzZXNBcnJheT8gW10gOiB7fTtcblxuICAgICAgICBpZighbGVuKSB7XG4gICAgICAgICAgICBkZWZlci5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdmFyIGkgPSBsZW47XG4gICAgICAgIHZvdy5fZm9yRWFjaChcbiAgICAgICAgICAgIGl0ZXJhYmxlLFxuICAgICAgICAgICAgZnVuY3Rpb24odmFsdWUsIGlkeCkge1xuICAgICAgICAgICAgICAgIHJlc1trZXlzW2lkeF1dID0gdmFsdWU7XG4gICAgICAgICAgICAgICAgaWYoIS0taSkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlci5yZXNvbHZlKHJlcyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGRlZmVyLnJlamVjdCxcbiAgICAgICAgICAgIGRlZmVyLm5vdGlmeSxcbiAgICAgICAgICAgIGRlZmVyLFxuICAgICAgICAgICAga2V5cyk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UsIHRoYXQgd2lsbCBiZSBmdWxmaWxsZWQgb25seSBhZnRlciBhbGwgdGhlIGl0ZW1zIGluIGBpdGVyYWJsZWAgYXJlIHJlc29sdmVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheXxPYmplY3R9IGl0ZXJhYmxlXG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqXG4gICAgICogQGV4YW1wbGVcbiAgICAgKiBgYGBqc1xuICAgICAqIHZhciBkZWZlcjEgPSB2b3cuZGVmZXIoKSxcbiAgICAgKiAgICAgZGVmZXIyID0gdm93LmRlZmVyKCk7XG4gICAgICpcbiAgICAgKiB2b3cuYWxsUmVzb2x2ZWQoW2RlZmVyMS5wcm9taXNlKCksIGRlZmVyMi5wcm9taXNlKCldKS5zcHJlYWQoZnVuY3Rpb24ocHJvbWlzZTEsIHByb21pc2UyKSB7XG4gICAgICogICAgIHByb21pc2UxLmlzUmVqZWN0ZWQoKTsgLy8gcmV0dXJucyB0cnVlXG4gICAgICogICAgIHByb21pc2UxLnZhbHVlT2YoKTsgLy8gcmV0dXJucyBcIidlcnJvcidcIlxuICAgICAqICAgICBwcm9taXNlMi5pc0Z1bGZpbGxlZCgpOyAvLyByZXR1cm5zIHRydWVcbiAgICAgKiAgICAgcHJvbWlzZTIudmFsdWVPZigpOyAvLyByZXR1cm5zIFwiJ29rJ1wiXG4gICAgICogfSk7XG4gICAgICpcbiAgICAgKiBkZWZlcjEucmVqZWN0KCdlcnJvcicpO1xuICAgICAqIGRlZmVyMi5yZXNvbHZlKCdvaycpO1xuICAgICAqIGBgYFxuICAgICAqL1xuICAgIGFsbFJlc29sdmVkIDogZnVuY3Rpb24oaXRlcmFibGUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gbmV3IERlZmVycmVkKCksXG4gICAgICAgICAgICBpc1Byb21pc2VzQXJyYXkgPSBpc0FycmF5KGl0ZXJhYmxlKSxcbiAgICAgICAgICAgIGtleXMgPSBpc1Byb21pc2VzQXJyYXk/XG4gICAgICAgICAgICAgICAgZ2V0QXJyYXlLZXlzKGl0ZXJhYmxlKSA6XG4gICAgICAgICAgICAgICAgZ2V0T2JqZWN0S2V5cyhpdGVyYWJsZSksXG4gICAgICAgICAgICBpID0ga2V5cy5sZW5ndGgsXG4gICAgICAgICAgICByZXMgPSBpc1Byb21pc2VzQXJyYXk/IFtdIDoge307XG5cbiAgICAgICAgaWYoIWkpIHtcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUocmVzKTtcbiAgICAgICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgICAgIH1cblxuICAgICAgICB2YXIgb25SZXNvbHZlZCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIC0taSB8fCBkZWZlci5yZXNvbHZlKGl0ZXJhYmxlKTtcbiAgICAgICAgICAgIH07XG5cbiAgICAgICAgdm93Ll9mb3JFYWNoKFxuICAgICAgICAgICAgaXRlcmFibGUsXG4gICAgICAgICAgICBvblJlc29sdmVkLFxuICAgICAgICAgICAgb25SZXNvbHZlZCxcbiAgICAgICAgICAgIGRlZmVyLm5vdGlmeSxcbiAgICAgICAgICAgIGRlZmVyLFxuICAgICAgICAgICAga2V5cyk7XG5cbiAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICB9LFxuXG4gICAgYWxsUGF0aWVudGx5IDogZnVuY3Rpb24oaXRlcmFibGUpIHtcbiAgICAgICAgcmV0dXJuIHZvdy5hbGxSZXNvbHZlZChpdGVyYWJsZSkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciBpc1Byb21pc2VzQXJyYXkgPSBpc0FycmF5KGl0ZXJhYmxlKSxcbiAgICAgICAgICAgICAgICBrZXlzID0gaXNQcm9taXNlc0FycmF5P1xuICAgICAgICAgICAgICAgICAgICBnZXRBcnJheUtleXMoaXRlcmFibGUpIDpcbiAgICAgICAgICAgICAgICAgICAgZ2V0T2JqZWN0S2V5cyhpdGVyYWJsZSksXG4gICAgICAgICAgICAgICAgcmVqZWN0ZWRQcm9taXNlcywgZnVsZmlsbGVkUHJvbWlzZXMsXG4gICAgICAgICAgICAgICAgbGVuID0ga2V5cy5sZW5ndGgsIGkgPSAwLCBrZXksIHByb21pc2U7XG5cbiAgICAgICAgICAgIGlmKCFsZW4pIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gaXNQcm9taXNlc0FycmF5PyBbXSA6IHt9O1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB3aGlsZShpIDwgbGVuKSB7XG4gICAgICAgICAgICAgICAga2V5ID0ga2V5c1tpKytdO1xuICAgICAgICAgICAgICAgIHByb21pc2UgPSBpdGVyYWJsZVtrZXldO1xuICAgICAgICAgICAgICAgIGlmKHZvdy5pc1JlamVjdGVkKHByb21pc2UpKSB7XG4gICAgICAgICAgICAgICAgICAgIHJlamVjdGVkUHJvbWlzZXMgfHwgKHJlamVjdGVkUHJvbWlzZXMgPSBpc1Byb21pc2VzQXJyYXk/IFtdIDoge30pO1xuICAgICAgICAgICAgICAgICAgICBpc1Byb21pc2VzQXJyYXk/XG4gICAgICAgICAgICAgICAgICAgICAgICByZWplY3RlZFByb21pc2VzLnB1c2gocHJvbWlzZS52YWx1ZU9mKCkpIDpcbiAgICAgICAgICAgICAgICAgICAgICAgIHJlamVjdGVkUHJvbWlzZXNba2V5XSA9IHByb21pc2UudmFsdWVPZigpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICBlbHNlIGlmKCFyZWplY3RlZFByb21pc2VzKSB7XG4gICAgICAgICAgICAgICAgICAgIChmdWxmaWxsZWRQcm9taXNlcyB8fCAoZnVsZmlsbGVkUHJvbWlzZXMgPSBpc1Byb21pc2VzQXJyYXk/IFtdIDoge30pKVtrZXldID0gdm93LnZhbHVlT2YocHJvbWlzZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZihyZWplY3RlZFByb21pc2VzKSB7XG4gICAgICAgICAgICAgICAgdGhyb3cgcmVqZWN0ZWRQcm9taXNlcztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgcmV0dXJuIGZ1bGZpbGxlZFByb21pc2VzO1xuICAgICAgICB9KTtcbiAgICB9LFxuXG4gICAgLyoqXG4gICAgICogUmV0dXJucyBhIHByb21pc2UsIHRoYXQgd2lsbCBiZSBmdWxmaWxsZWQgaWYgYW55IG9mIHRoZSBpdGVtcyBpbiBgaXRlcmFibGVgIGlzIGZ1bGZpbGxlZC5cbiAgICAgKiBJZiBhbGwgb2YgdGhlIGBpdGVyYWJsZWAgaXRlbXMgZ2V0IHJlamVjdGVkLCB0aGUgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkICh3aXRoIHRoZSByZWFzb24gb2YgdGhlIGZpcnN0IHJlamVjdGVkIGl0ZW0pLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheX0gaXRlcmFibGVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgYW55IDogZnVuY3Rpb24oaXRlcmFibGUpIHtcbiAgICAgICAgdmFyIGRlZmVyID0gbmV3IERlZmVycmVkKCksXG4gICAgICAgICAgICBsZW4gPSBpdGVyYWJsZS5sZW5ndGg7XG5cbiAgICAgICAgaWYoIWxlbikge1xuICAgICAgICAgICAgZGVmZXIucmVqZWN0KEVycm9yKCkpO1xuICAgICAgICAgICAgcmV0dXJuIGRlZmVyLnByb21pc2UoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBpID0gMCwgcmVhc29uO1xuICAgICAgICB2b3cuX2ZvckVhY2goXG4gICAgICAgICAgICBpdGVyYWJsZSxcbiAgICAgICAgICAgIGRlZmVyLnJlc29sdmUsXG4gICAgICAgICAgICBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgaSB8fCAocmVhc29uID0gZSk7XG4gICAgICAgICAgICAgICAgKytpID09PSBsZW4gJiYgZGVmZXIucmVqZWN0KHJlYXNvbik7XG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgZGVmZXIubm90aWZ5LFxuICAgICAgICAgICAgZGVmZXIpO1xuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFJldHVybnMgYSBwcm9taXNlLCB0aGF0IHdpbGwgYmUgZnVsZmlsbGVkIG9ubHkgd2hlbiBhbnkgb2YgdGhlIGl0ZW1zIGluIGBpdGVyYWJsZWAgaXMgZnVsZmlsbGVkLlxuICAgICAqIElmIGFueSBvZiB0aGUgYGl0ZXJhYmxlYCBpdGVtcyBnZXRzIHJlamVjdGVkLCB0aGUgcHJvbWlzZSB3aWxsIGJlIHJlamVjdGVkLlxuICAgICAqXG4gICAgICogQHBhcmFtIHtBcnJheX0gaXRlcmFibGVcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgYW55UmVzb2x2ZWQgOiBmdW5jdGlvbihpdGVyYWJsZSkge1xuICAgICAgICB2YXIgZGVmZXIgPSBuZXcgRGVmZXJyZWQoKSxcbiAgICAgICAgICAgIGxlbiA9IGl0ZXJhYmxlLmxlbmd0aDtcblxuICAgICAgICBpZighbGVuKSB7XG4gICAgICAgICAgICBkZWZlci5yZWplY3QoRXJyb3IoKSk7XG4gICAgICAgICAgICByZXR1cm4gZGVmZXIucHJvbWlzZSgpO1xuICAgICAgICB9XG5cbiAgICAgICAgdm93Ll9mb3JFYWNoKFxuICAgICAgICAgICAgaXRlcmFibGUsXG4gICAgICAgICAgICBkZWZlci5yZXNvbHZlLFxuICAgICAgICAgICAgZGVmZXIucmVqZWN0LFxuICAgICAgICAgICAgZGVmZXIubm90aWZ5LFxuICAgICAgICAgICAgZGVmZXIpO1xuXG4gICAgICAgIHJldHVybiBkZWZlci5wcm9taXNlKCk7XG4gICAgfSxcblxuICAgIC8qKlxuICAgICAqIFN0YXRpYyBlcXVpdmFsZW50IHRvIGBwcm9taXNlLmRlbGF5YC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IGRlbGF5XG4gICAgICogQHJldHVybnMge3ZvdzpQcm9taXNlfVxuICAgICAqL1xuICAgIGRlbGF5IDogZnVuY3Rpb24odmFsdWUsIGRlbGF5KSB7XG4gICAgICAgIHJldHVybiB2b3cucmVzb2x2ZSh2YWx1ZSkuZGVsYXkoZGVsYXkpO1xuICAgIH0sXG5cbiAgICAvKipcbiAgICAgKiBTdGF0aWMgZXF1aXZhbGVudCB0byBgcHJvbWlzZS50aW1lb3V0YC5cbiAgICAgKiBJZiBgdmFsdWVgIGlzIG5vdCBhIHByb21pc2UsIHRoZW4gYHZhbHVlYCBpcyB0cmVhdGVkIGFzIGEgZnVsZmlsbGVkIHByb21pc2UuXG4gICAgICpcbiAgICAgKiBAcGFyYW0geyp9IHZhbHVlXG4gICAgICogQHBhcmFtIHtOdW1iZXJ9IHRpbWVvdXRcbiAgICAgKiBAcmV0dXJucyB7dm93OlByb21pc2V9XG4gICAgICovXG4gICAgdGltZW91dCA6IGZ1bmN0aW9uKHZhbHVlLCB0aW1lb3V0KSB7XG4gICAgICAgIHJldHVybiB2b3cucmVzb2x2ZSh2YWx1ZSkudGltZW91dCh0aW1lb3V0KTtcbiAgICB9LFxuXG4gICAgX2ZvckVhY2ggOiBmdW5jdGlvbihwcm9taXNlcywgb25GdWxmaWxsZWQsIG9uUmVqZWN0ZWQsIG9uUHJvZ3Jlc3MsIGN0eCwga2V5cykge1xuICAgICAgICB2YXIgbGVuID0ga2V5cz8ga2V5cy5sZW5ndGggOiBwcm9taXNlcy5sZW5ndGgsXG4gICAgICAgICAgICBpID0gMDtcblxuICAgICAgICB3aGlsZShpIDwgbGVuKSB7XG4gICAgICAgICAgICB2b3cud2hlbihcbiAgICAgICAgICAgICAgICBwcm9taXNlc1trZXlzPyBrZXlzW2ldIDogaV0sXG4gICAgICAgICAgICAgICAgd3JhcE9uRnVsZmlsbGVkKG9uRnVsZmlsbGVkLCBpKSxcbiAgICAgICAgICAgICAgICBvblJlamVjdGVkLFxuICAgICAgICAgICAgICAgIG9uUHJvZ3Jlc3MsXG4gICAgICAgICAgICAgICAgY3R4KTtcbiAgICAgICAgICAgICsraTtcbiAgICAgICAgfVxuICAgIH0sXG5cbiAgICBUaW1lZE91dEVycm9yIDogZGVmaW5lQ3VzdG9tRXJyb3JUeXBlKCdUaW1lZE91dCcpXG59O1xuXG52YXIgZGVmaW5lQXNHbG9iYWwgPSB0cnVlO1xuaWYodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgdHlwZW9mIG1vZHVsZS5leHBvcnRzID09PSAnb2JqZWN0Jykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gdm93O1xuICAgIGRlZmluZUFzR2xvYmFsID0gZmFsc2U7XG59XG5cbmlmKHR5cGVvZiBtb2R1bGVzID09PSAnb2JqZWN0JyAmJiBpc0Z1bmN0aW9uKG1vZHVsZXMuZGVmaW5lKSkge1xuICAgIG1vZHVsZXMuZGVmaW5lKCd2b3cnLCBmdW5jdGlvbihwcm92aWRlKSB7XG4gICAgICAgIHByb3ZpZGUodm93KTtcbiAgICB9KTtcbiAgICBkZWZpbmVBc0dsb2JhbCA9IGZhbHNlO1xufVxuXG5pZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nKSB7XG4gICAgZGVmaW5lKGZ1bmN0aW9uKHJlcXVpcmUsIGV4cG9ydHMsIG1vZHVsZSkge1xuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IHZvdztcbiAgICB9KTtcbiAgICBkZWZpbmVBc0dsb2JhbCA9IGZhbHNlO1xufVxuXG5kZWZpbmVBc0dsb2JhbCAmJiAoZ2xvYmFsLnZvdyA9IHZvdyk7XG5cbn0pKHRoaXMpO1xuIiwidmFyIExvZ2dlciA9IHJlcXVpcmUoJy4vbG9nZ2VyL2xvZ2dlcicpO1xudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoJ0F1ZGlvUGxheWVyJyk7XG5cbnZhciBFdmVudHMgPSByZXF1aXJlKCcuL2xpYi9hc3luYy9ldmVudHMnKTtcbnZhciBQcm9taXNlID0gcmVxdWlyZSgnLi9saWIvYXN5bmMvcHJvbWlzZScpO1xudmFyIERlZmVycmVkID0gcmVxdWlyZSgnLi9saWIvYXN5bmMvZGVmZXJyZWQnKTtcbnZhciBkZXRlY3QgPSByZXF1aXJlKCcuL2xpYi9icm93c2VyL2RldGVjdCcpO1xudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4vY29uZmlnJyk7XG52YXIgbWVyZ2UgPSByZXF1aXJlKCcuL2xpYi9kYXRhL21lcmdlJyk7XG52YXIgcmVqZWN0ID0gcmVxdWlyZSgnLi9saWIvYXN5bmMvcmVqZWN0Jyk7XG5cbnZhciBBdWRpb0Vycm9yID0gcmVxdWlyZSgnLi9lcnJvci9hdWRpby1lcnJvcicpO1xudmFyIEF1ZGlvU3RhdGljID0gcmVxdWlyZSgnLi9hdWRpby1zdGF0aWMnKTtcblxudmFyIHBsYXllcklkID0gMTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCd0LDRgdGC0YDQvtC50LrQsCDQtNC+0YHRgtGD0L/QvdGL0YUg0YLQuNC/0L7QsiDRgNC10LDQu9C40LfQsNGG0LjQuSDQuCDQuNGFINC/0YDQuNC+0YDQuNGC0LXRgtCwXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vVE9ETzog0YHQtNC10LvQsNGC0Ywg0LjQvdGC0LXRgNGE0LXQudGBINC00LvRjyDQstC+0LfQvNC+0LbQvdC+0YHRgtC4INC/0L7QtNC60LvRjtGH0LXQvdC40Y8g0L3QvtCy0YvRhSDRgtC40L/QvtCyXG52YXIgYXVkaW9UeXBlcyA9IHtcbiAgICBodG1sNTogcmVxdWlyZSgnLi9odG1sNS9hdWRpby1odG1sNScpLFxuICAgIGZsYXNoOiByZXF1aXJlKCcuL2ZsYXNoL2F1ZGlvLWZsYXNoJylcbn07XG5cbnZhciBkZXRlY3RTdHJpbmcgPSBcIkBcIiArIGRldGVjdC5wbGF0Zm9ybS52ZXJzaW9uICtcbiAgICBcIiBcIiArIGRldGVjdC5wbGF0Zm9ybS5vcyArXG4gICAgXCI6XCIgKyBkZXRlY3QuYnJvd3Nlci5uYW1lICtcbiAgICBcIi9cIiArIGRldGVjdC5icm93c2VyLnZlcnNpb247XG5cbmF1ZGlvVHlwZXMuZmxhc2gucHJpb3JpdHkgPSAwO1xuYXVkaW9UeXBlcy5odG1sNS5wcmlvcml0eSA9IGNvbmZpZy5odG1sNS5ibGFja2xpc3Quc29tZShmdW5jdGlvbihpdGVtKSB7IHJldHVybiBkZXRlY3RTdHJpbmcubWF0Y2goaXRlbSk7IH0pID8gLTEgOiAxO1xuXG4vL0lORk86INC/0YDRj9C8INCyINC80L7QvNC10L3RgiDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuCDQstGB0LXQs9C+INC80L7QtNGD0LvRjyDQvdC10LvRjNC30Y8g0L/QuNGB0LDRgtGMINCyINC70L7QsyAtINC+0L0g0L/RgNC+0LPQu9Cw0YLRi9Cy0LDQtdGCINGB0L7QvtCx0YnQtdC90LjRjywg0YIu0LouINC10YnQtSDQvdC10YIg0LLQvtC30LzQvtC20L3QvtGB0YLQuCDQvdCw0YHRgtGA0L7QuNGC0Ywg0LvQvtCz0LPQtdGALlxuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICBsb2dnZXIuaW5mbyh7XG4gICAgICAgIGZsYXNoOiB7XG4gICAgICAgICAgICBhdmFpbGFibGU6IGF1ZGlvVHlwZXMuZmxhc2guYXZhaWxhYmxlLFxuICAgICAgICAgICAgcHJpb3JpdHk6IGF1ZGlvVHlwZXMuZmxhc2gucHJpb3JpdHlcbiAgICAgICAgfSxcbiAgICAgICAgaHRtbDU6IHtcbiAgICAgICAgICAgIGF2YWlsYWJsZTogYXVkaW9UeXBlcy5odG1sNS5hdmFpbGFibGUsXG4gICAgICAgICAgICBwcmlvcml0eTogYXVkaW9UeXBlcy5odG1sNS5wcmlvcml0eSxcbiAgICAgICAgICAgIGF1ZGlvQ29udGV4dDogISFhdWRpb1R5cGVzLmh0bWw1LmF1ZGlvQ29udGV4dFxuICAgICAgICB9XG4gICAgfSwgXCJhdWRpb1R5cGVzXCIpO1xufSwgMCk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICBKU0RPQzog0LLRgdC/0L7QvNC+0LPQsNGC0LXQu9GM0L3Ri9C1INC60LvQsNGB0YHRi1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCe0L/QuNGB0LDQvdC40LUg0LLRgNC10LzQtdC90L3Ri9GFINC00LDQvdC90YvRhSDQv9C70LXQtdGA0LAuXG4gKiBAdHlwZWRlZiB7T2JqZWN0fSBBdWRpby5BdWRpb1BsYXllclRpbWVzXG4gKiBAcHJvcGVydHkge051bWJlcn0gZHVyYXRpb24g0JTQu9C40YLQtdC70YzQvdC+0YHRgtGMINCw0YPQtNC40L7RhNCw0LnQu9CwLlxuICogQHByb3BlcnR5IHtOdW1iZXJ9IGxvYWRlZCDQlNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4LlxuICogQHByb3BlcnR5IHtOdW1iZXJ9IHBvc2l0aW9uINCf0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBwbGF5ZWQg0JTQu9C40YLQtdC70YzQvdC+0YHRgtGMINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqL1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAgSlNET0M6INCe0LHRidC40LUg0YHQvtCx0YvRgtC40Y8g0L/Qu9C10LXRgNCwXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0L3QsNGH0LDQu9CwINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEBldmVudCB5YS5tdXNpYy5BdWRpbyNFVkVOVF9QTEFZXG4gKi9cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0LfQsNCy0LXRgNGI0LXQvdC40Y8g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPLlxuICogQGV2ZW50IHlhLm11c2ljLkF1ZGlvI0VWRU5UX0VOREVEXG4gKi9cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0LjQt9C80LXQvdC10L3QuNGPINCz0YDQvtC80LrQvtGB0YLQuC5cbiAqIEBldmVudCB5YS5tdXNpYy5BdWRpbyNFVkVOVF9WT0xVTUVcbiAqIEBwYXJhbSB7TnVtYmVyfSB2b2x1bWUg0J3QvtCy0L7QtSDQt9C90LDRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuC5cbiAqL1xuLyoqXG4gKiDQodC+0LHRi9GC0LjQtSDQstC+0LfQvdC40LrQvdC+0LLQtdC90LjRjyDQvtGI0LjQsdC60Lgg0L/RgNC4INC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4INC/0LvQtdC10YDQsC5cbiAqIEBldmVudCB5YS5tdXNpYy5BdWRpbyNFVkVOVF9DUkFTSEVEXG4gKi9cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0YHQvNC10L3RiyDRgdGC0LDRgtGD0YHQsCDQv9C70LXQtdGA0LAuXG4gKiBAZXZlbnQgeWEubXVzaWMuQXVkaW8jRVZFTlRfU1RBVEVcbiAqIEBwYXJhbSB7U3RyaW5nfSBzdGF0ZSDQndC+0LLRi9C5INGB0YLQsNGC0YPRgSDQv9C70LXQtdGA0LAuXG4gKi9cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0L/QtdGA0LXQutC70Y7Rh9C10L3QuNGPINCw0LrRgtC40LLQvdC+0LPQviDQv9C70LXQtdGA0LAg0Lgg0L/RgNC10LvQvtCw0LTQtdGA0LAuXG4gKiBAZXZlbnQgeWEubXVzaWMuQXVkaW8jRVZFTlRfU1dBUFxuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICBKU0RPQzog0YHQvtCx0YvRgtC40Y8g0LDQutGC0LjQstC90L7Qs9C+INC/0LvQtdC10YDQsFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCh0L7QsdGL0YLQuNC1INC+0YHRgtCw0L3QvtCy0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8uXG4gKiBAZXZlbnQgeWEubXVzaWMuQXVkaW8jRVZFTlRfU1RPUFxuICovXG5cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0L/QsNGD0LfRiyDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8uXG4gKiBAZXZlbnQgeWEubXVzaWMuQXVkaW8jRVZFTlRfUEFVU0VcbiAqL1xuXG4vKipcbiAqINCh0L7QsdGL0YLQuNC1INC+0LHQvdC+0LLQu9C10L3QuNGPINC/0L7Qt9C40YbQuNC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjyDQuNC70Lgg0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4LlxuICogQGV2ZW50IHlhLm11c2ljLkF1ZGlvI0VWRU5UX1BST0dSRVNTXG4gKiBAcGFyYW0ge3lhLm11c2ljLkF1ZGlvfkF1ZGlvUGxheWVyVGltZXN9IHRpbWVzINCY0L3RhNC+0YDQvNCw0YbQuNGPINC+INCy0YDQtdC80LXQvdC90YvRhSDQtNCw0L3QvdGL0YUg0LDRg9C00LjQvtGE0LDQudC70LAuXG4gKi9cblxuLyoqXG4gKiDQodC+0LHRi9GC0LjQtSDQvdCw0YfQsNC70LAg0LfQsNCz0YDRg9C30LrQuCDQsNGD0LTQuNC+0YTQsNC50LvQsC5cbiAqIEBldmVudCB5YS5tdXNpYy5BdWRpbyNFVkVOVF9MT0FESU5HXG4gKi9cblxuLyoqXG4gKiDQodC+0LHRi9GC0LjQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDQt9Cw0LPRgNGD0LfQutC4INCw0YPQtNC40L7RhNCw0LnQu9CwLlxuICogQGV2ZW50IHlhLm11c2ljLkF1ZGlvI0VWRU5UX0xPQURFRFxuICovXG5cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0L7RiNC40LHQutC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEBldmVudCB5YS5tdXNpYy5BdWRpbyNFVkVOVF9FUlJPUlxuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICBKU0RPQzog0YHQvtCx0YvRgtC40Y8g0L/RgNC10LTQt9Cw0LPRgNGD0LfRh9C40LrQsFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCh0L7QsdGL0YLQuNC1INC+0YHRgtCw0L3QvtCy0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8uXG4gKiBAZXZlbnQgeWEubXVzaWMuQXVkaW8jUFJFTE9BREVSX0VWRU5UK0VWRU5UX1NUT1BcbiAqL1xuXG4vKipcbiAqINCh0L7QsdGL0YLQuNC1INC+0LHQvdC+0LLQu9C10L3QuNGPINC/0L7Qt9C40YbQuNC4INC30LDQs9GA0YPQttC10L3QvdC+0Lkg0YfQsNGB0YLQuC5cbiAqIEBldmVudCB5YS5tdXNpYy5BdWRpbyNQUkVMT0FERVJfRVZFTlQrRVZFTlRfUFJPR1JFU1NcbiAqIEBwYXJhbSB7eWEubXVzaWMuQXVkaW9+QXVkaW9QbGF5ZXJUaW1lc30gdGltZXMg0JjQvdGE0L7RgNC80LDRhtC40Y8g0L4g0LLRgNC10LzQtdC90L3Ri9GFINC00LDQvdC90YvRhSDQsNGD0LTQuNC+0YTQsNC50LvQsC5cbiAqL1xuXG4vKipcbiAqINCh0L7QsdGL0YLQuNC1INC90LDRh9Cw0LvQsCDQt9Cw0LPRgNGD0LfQutC4INCw0YPQtNC40L7RhNCw0LnQu9CwLlxuICogQGV2ZW50IHlhLm11c2ljLkF1ZGlvI1BSRUxPQURFUl9FVkVOVCtFVkVOVF9MT0FESU5HXG4gKi9cblxuLyoqXG4gKiDQodC+0LHRi9GC0LjQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDQt9Cw0LPRgNGD0LfQutC4INCw0YPQtNC40L7RhNCw0LnQu9CwLlxuICogQGV2ZW50IHlhLm11c2ljLkF1ZGlvI1BSRUxPQURFUl9FVkVOVCtFVkVOVF9MT0FERURcbiAqL1xuXG4vKipcbiAqINCh0L7QsdGL0YLQuNC1INC+0YjQuNCx0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8uXG4gKiBAZXZlbnQgeWEubXVzaWMuQXVkaW8jUFJFTE9BREVSX0VWRU5UK0VWRU5UX0VSUk9SXG4gKi9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCa0L7QvdGB0YLRgNGD0LrRgtC+0YBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAY2xhc3NkZWNzINCQ0YPQtNC40L7Qv9C70LXQtdGAINC00LvRjyDQsdGA0LDRg9C30LXRgNCwLlxuICogQGNsYXNzIEF1ZGlvUGxheWVyXG4gKiBAYWxpYXMgeWEubXVzaWMuQXVkaW9cbiAqXG4gKiBAcGFyYW0ge1N0cmluZ30gW3ByZWZlcnJlZFR5cGU9XCJodG1sNVwiXSDQn9GA0LXQtNC/0L7Rh9C40YLQsNC10LzRi9C5INGC0LjQvyDQv9C70LXQtdGA0LAuINCc0L7QttC10YIg0L/RgNC40L3QuNC80LDRgtGMINC30L3QsNGH0LXQvdC40Y86IFwiaHRtbDVcIiwgXCJmbGFzaFwiINC40LvQuFxuICog0LvRjtCx0L7QtSDQu9C+0LbQvdC+0LUg0LfQvdCw0YfQtdC90LjQtSAoZmFsc2UsIG51bGwsIHVuZGVmaW5lZCwgMCwgXCJcIikuINCV0YHQu9C4INCy0YvQsdGA0LDQvdC90YvQuSDRgtC40L8g0L/Qu9C10LXRgNCwINC+0LrQsNC20LXRgtGB0Y8g0L3QtdC00L7RgdGC0YPQv9C10L0sINCx0YPQtNC10YIg0LfQsNC/0YPRidC10L1cbiAqINC+0YHRgtCw0LLRiNC40LnRgdGPINGC0LjQvy4g0JXRgdC70Lgg0YPQutCw0LfQsNC90L4g0LvQvtC20L3QvtC1INC30L3QsNGH0LXQvdC40LUg0LvQuNCx0L4g0L/QsNGA0LDQvNC10YLRgCDQvdC1INC/0LXRgNC10LTQsNC9LCDRgtC+IEFQSSDQsNCy0YLQvtC80LDRgtC40YfQtdGB0LrQuCDQstGL0LHQtdGA0LXRgiDQv9C+0LTQtNC10YDQttC40LLQsNC10LzRi9C5INGC0LjQvyDQv9C70LXQtdGA0LAuXG4gKiDQldGB0LvQuCDQsdGA0LDRg9C30LXRgCDQv9C+0LTQtNC10YDQttC40LLQsNC10YIg0L7QsdC1INGC0LXRhdC90L7Qu9C+0LPQuNC4LCDRgtC+INC/0L4g0YPQvNC+0LvRh9Cw0L3QuNGOIFlhbmRleEF1ZGlvINGB0L7Qt9C00LDQtdGCINCw0YPQtNC40L7Qv9C70LXQtdGAINC90LAg0L7RgdC90L7QstC1IEhUTUw1LlxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gW292ZXJsYXldIEhUTUwt0LrQvtC90YLQtdC50L3QtdGAINC00LvRjyDQvtGC0L7QsdGA0LDQttC10L3QuNGPIEZsYXNoLdCw0L/Qv9C70LXRgtCwLlxuICpcbiAqIEBtaXhlcyBBdWRpb1N0YXRpY1xuICogQGV4dGVuZHMgRXZlbnRzXG4gKlxuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvI0VWRU5UX1BMQVlcbiAqIEBmaXJlcyB5YS5tdXNpYy5BdWRpbyNFVkVOVF9FTkRFRFxuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvI0VWRU5UX1ZPTFVNRVxuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvI0VWRU5UX0NSQVNIRURcbiAqIEBmaXJlcyB5YS5tdXNpYy5BdWRpbyNFVkVOVF9TVEFURVxuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvI0VWRU5UX1NXQVBcbiAqXG4gKiBAZmlyZXMgeWEubXVzaWMuQXVkaW8jRVZFTlRfU1RPUFxuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvI0VWRU5UX1BBVVNFXG4gKiBAZmlyZXMgeWEubXVzaWMuQXVkaW8jRVZFTlRfUFJPR1JFU1NcbiAqIEBmaXJlcyB5YS5tdXNpYy5BdWRpbyNFVkVOVF9MT0FESU5HXG4gKiBAZmlyZXMgeWEubXVzaWMuQXVkaW8jRVZFTlRfTE9BREVEXG4gKiBAZmlyZXMgeWEubXVzaWMuQXVkaW8jRVZFTlRfRVJST1JcbiAqXG4gKiBAZmlyZXMgeWEubXVzaWMuQXVkaW8jUFJFTE9BREVSX0VWRU5UK0VWRU5UX1NUT1BcbiAqIEBmaXJlcyB5YS5tdXNpYy5BdWRpbyNQUkVMT0FERVJfRVZFTlQrRVZFTlRfUFJPR1JFU1NcbiAqIEBmaXJlcyB5YS5tdXNpYy5BdWRpbyNQUkVMT0FERVJfRVZFTlQrRVZFTlRfTE9BRElOR1xuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvI1BSRUxPQURFUl9FVkVOVCtFVkVOVF9MT0FERURcbiAqIEBmaXJlcyB5YS5tdXNpYy5BdWRpbyNQUkVMT0FERVJfRVZFTlQrRVZFTlRfRVJST1JcbiAqXG4gKiBAY29uc3RydWN0b3JcbiAqL1xudmFyIEF1ZGlvUGxheWVyID0gZnVuY3Rpb24ocHJlZmVycmVkVHlwZSwgb3ZlcmxheSkge1xuICAgIHRoaXMubmFtZSA9IHBsYXllcklkKys7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcImNvbnN0cnVjdG9yXCIpO1xuXG4gICAgRXZlbnRzLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLnByZWZlcnJlZFR5cGUgPSBwcmVmZXJyZWRUeXBlO1xuICAgIHRoaXMub3ZlcmxheSA9IG92ZXJsYXk7XG4gICAgdGhpcy5zdGF0ZSA9IEF1ZGlvUGxheWVyLlNUQVRFX0lOSVQ7XG4gICAgdGhpcy5fcGxheWVkID0gMDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IDA7XG4gICAgdGhpcy5fcGxheUlkID0gbnVsbDtcblxuICAgIHRoaXMuX3doZW5SZWFkeSA9IG5ldyBEZWZlcnJlZCgpO1xuICAgIHRoaXMud2hlblJlYWR5ID0gdGhpcy5fd2hlblJlYWR5LnByb21pc2UoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBsb2dnZXIuaW5mbyh0aGlzLCBcImltcGxlbWVudGF0aW9uIGZvdW5kXCIsIHRoaXMuaW1wbGVtZW50YXRpb24udHlwZSk7XG5cbiAgICAgICAgdGhpcy5pbXBsZW1lbnRhdGlvbi5vbihcIipcIiwgZnVuY3Rpb24oZXZlbnQsIG9mZnNldCwgZGF0YSkge1xuICAgICAgICAgICAgdGhpcy5fcG9wdWxhdGVFdmVudHMoZXZlbnQsIG9mZnNldCwgZGF0YSk7XG5cbiAgICAgICAgICAgIGlmICghb2Zmc2V0KSB7XG4gICAgICAgICAgICAgICAgc3dpdGNoIChldmVudCkge1xuICAgICAgICAgICAgICAgICAgICBjYXNlIEF1ZGlvUGxheWVyLkVWRU5UX1BMQVk6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9QTEFZSU5HKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuXG4gICAgICAgICAgICAgICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfRU5ERUQ6XG4gICAgICAgICAgICAgICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfU1dBUDpcbiAgICAgICAgICAgICAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9TVE9QOlxuICAgICAgICAgICAgICAgICAgICBjYXNlIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SOlxuICAgICAgICAgICAgICAgICAgICAgICAgbG9nZ2VyLmluZm8odGhpcywgXCJvbkVuZGVkXCIsIGV2ZW50LCBkYXRhKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldFN0YXRlKEF1ZGlvUGxheWVyLlNUQVRFX0lETEUpO1xuICAgICAgICAgICAgICAgICAgICAgICAgYnJlYWs7XG5cbiAgICAgICAgICAgICAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9QQVVTRTpcbiAgICAgICAgICAgICAgICAgICAgICAgIHRoaXMuX3NldFN0YXRlKEF1ZGlvUGxheWVyLlNUQVRFX1BBVVNFRCk7XG4gICAgICAgICAgICAgICAgICAgICAgICBicmVhaztcblxuICAgICAgICAgICAgICAgICAgICBjYXNlIEF1ZGlvUGxheWVyLkVWRU5UX0NSQVNIRUQ6XG4gICAgICAgICAgICAgICAgICAgICAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9DUkFTSEVEKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcblxuICAgICAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9JRExFKTtcbiAgICB9LmJpbmQodGhpcyksIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIEF1ZGlvRXJyb3IuTk9fSU1QTEVNRU5UQVRJT04sIGUpO1xuXG4gICAgICAgIHRoaXMuX3NldFN0YXRlKEF1ZGlvUGxheWVyLlNUQVRFX0NSQVNIRUQpO1xuICAgICAgICB0aHJvdyBlO1xuICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICB0aGlzLl9pbml0KDApO1xufTtcbkV2ZW50cy5taXhpbihBdWRpb1BsYXllcik7XG5tZXJnZShBdWRpb1BsYXllciwgQXVkaW9TdGF0aWMsIHRydWUpO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0KHRgtCw0YLQuNC60LBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQodC/0LjRgdC+0Log0LTQvtGB0YLRg9C/0L3Ri9GFINC/0LvQtdC10YDQvtCyXG4gKiBAdHlwZSB7T2JqZWN0fVxuICogQHN0YXRpY1xuICovXG5BdWRpb1BsYXllci5pbmZvID0ge1xuICAgIGh0bWw1OiBhdWRpb1R5cGVzLmh0bWw1LmF2YWlsYWJsZSxcbiAgICBmbGFzaDogYXVkaW9UeXBlcy5mbGFzaC5hdmFpbGFibGVcbn07XG5cbi8qKlxuICog0JrQvtC90YLQtdC60YHRgiDQtNC70Y8gV2ViIEF1ZGlvIEFQSS5cbiAqIEB0eXBlIHtBdWRpb0NvbnRleHR9XG4gKiBAc3RhdGljXG4gKi9cbkF1ZGlvUGxheWVyLmF1ZGlvQ29udGV4dCA9IGF1ZGlvVHlwZXMuaHRtbDUuYXVkaW9Db250ZXh0O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0JjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDRgdGC0LDRgtGD0YEg0L/Qu9C10LXRgNCwLlxuICogQHBhcmFtIHtTdHJpbmd9IHN0YXRlINCd0L7QstGL0Lkg0YHRgtCw0YLRg9GBLlxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLl9zZXRTdGF0ZSA9IGZ1bmN0aW9uKHN0YXRlKSB7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9zZXRTdGF0ZVwiLCBzdGF0ZSk7XG5cbiAgICBpZiAoc3RhdGUgPT09IEF1ZGlvUGxheWVyLlNUQVRFX1BBVVNFRCAmJiB0aGlzLnN0YXRlICE9PSBBdWRpb1BsYXllci5TVEFURV9QTEFZSU5HKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB2YXIgY2hhbmdlZCA9IHRoaXMuc3RhdGUgIT09IHN0YXRlO1xuICAgIHRoaXMuc3RhdGUgPSBzdGF0ZTtcblxuICAgIGlmIChjaGFuZ2VkKSB7XG4gICAgICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwibmV3U3RhdGVcIiwgc3RhdGUpO1xuICAgICAgICB0aGlzLnRyaWdnZXIoQXVkaW9QbGF5ZXIuRVZFTlRfU1RBVEUsIHN0YXRlKTtcbiAgICB9XG59O1xuXG4vKipcbiAqINCY0L3QuNGG0LjQsNC70LjQt9Cw0YbQuNGPINC/0LvQtdC10YDQsC5cbiAqIEBwYXJhbSB7aW50fSBbcmV0cnk9MF0g0JrQvtC70LjRh9C10YHRgtCy0L4g0L/QvtC/0YvRgtC+0LouXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbihyZXRyeSkge1xuICAgIHJldHJ5ID0gcmV0cnkgfHwgMDtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcIl9pbml0XCIsIHJldHJ5KTtcblxuICAgIGlmICghdGhpcy5fd2hlblJlYWR5LnBlbmRpbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGlmIChyZXRyeSA+IGNvbmZpZy5hdWRpby5yZXRyeSkge1xuICAgICAgICBsb2dnZXIuZXJyb3IodGhpcywgQXVkaW9FcnJvci5OT19JTVBMRU1FTlRBVElPTik7XG4gICAgICAgIHRoaXMuX3doZW5SZWFkeS5yZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5OT19JTVBMRU1FTlRBVElPTikpO1xuICAgIH1cblxuICAgIHZhciBpbml0U2VxID0gW1xuICAgICAgICBhdWRpb1R5cGVzLmh0bWw1LFxuICAgICAgICBhdWRpb1R5cGVzLmZsYXNoXG4gICAgXS5zb3J0KGZ1bmN0aW9uKGEsIGIpIHtcbiAgICAgICAgaWYgKGEuYXZhaWxhYmxlICE9PSBiLmF2YWlsYWJsZSkge1xuICAgICAgICAgICAgcmV0dXJuIGEuYXZhaWxhYmxlID8gLTEgOiAxO1xuICAgICAgICB9XG5cbiAgICAgICAgaWYgKGEuQXVkaW9JbXBsZW1lbnRhdGlvbi50eXBlID09PSB0aGlzLnByZWZlcnJlZFR5cGUpIHtcbiAgICAgICAgICAgIHJldHVybiAtMTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChiLkF1ZGlvSW1wbGVtZW50YXRpb24udHlwZSA9PT0gdGhpcy5wcmVmZXJyZWRUeXBlKSB7XG4gICAgICAgICAgICByZXR1cm4gMTtcbiAgICAgICAgfVxuXG4gICAgICAgIHJldHVybiBiLnByaW9yaXR5IC0gYS5wcmlvcml0eTtcbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgZnVuY3Rpb24gaW5pdCgpIHtcbiAgICAgICAgdmFyIHR5cGUgPSBpbml0U2VxLnNoaWZ0KCk7XG5cbiAgICAgICAgaWYgKCF0eXBlKSB7XG4gICAgICAgICAgICBzZWxmLl9pbml0KHJldHJ5ICsgMSk7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzZWxmLl9pbml0VHlwZSh0eXBlKS50aGVuKHNlbGYuX3doZW5SZWFkeS5yZXNvbHZlLCBpbml0KTtcbiAgICB9XG5cbiAgICBpbml0KCk7XG59O1xuXG4vKipcbiAqINCX0LDQv9GD0YHQuiDRgNC10LDQu9C40LfQsNGG0LjQuCDQv9C70LXQtdGA0LAg0YEg0YPQutCw0LfQsNC90L3Ri9C8INGC0LjQv9C+0LxcbiAqIEBwYXJhbSB7e3R5cGU6IHN0cmluZywgQXVkaW9JbXBsZW1lbnRhdGlvbjogZnVuY3Rpb259fSB0eXBlIC0g0L7QsdGK0LXQutGCINC+0L/QuNGB0LDQvdC40Y8g0YLQuNC/0LAg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LguXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5faW5pdFR5cGUgPSBmdW5jdGlvbih0eXBlKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJfaW5pdFR5cGVcIiwgdHlwZSk7XG5cbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWQoKTtcbiAgICB0cnkge1xuICAgICAgICAvKipcbiAgICAgICAgICog0KLQtdC60YPRidCw0Y8g0YDQtdCw0LvQuNC30LDRhtC40Y8g0LDRg9C00LjQvi3Qv9C70LXQtdGA0LBcbiAgICAgICAgICogQHR5cGUge0lBdWRpb0ltcGxlbWVudGF0aW9ufG51bGx9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLmltcGxlbWVudGF0aW9uID0gbmV3IHR5cGUuQXVkaW9JbXBsZW1lbnRhdGlvbih0aGlzLm92ZXJsYXkpO1xuICAgICAgICBpZiAodGhpcy5pbXBsZW1lbnRhdGlvbi53aGVuUmVhZHkpIHtcbiAgICAgICAgICAgIHRoaXMuaW1wbGVtZW50YXRpb24ud2hlblJlYWR5LnRoZW4oZGVmZXJyZWQucmVzb2x2ZSwgZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlc29sdmUoKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2goZSkge1xuICAgICAgICBkZWZlcnJlZC5yZWplY3QoZSk7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwiX2luaXRUeXBlRXJyb3JcIiwgdHlwZSwgZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIGRlZmVycmVkLnByb21pc2UoKTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQntCx0YDQsNCx0L7RgtC60LAg0YHQvtCx0YvRgtC40LlcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQodC+0LfQtNCw0L3QuNC1INC+0LHQtdGJ0LDQvdC40Y8sINC60L7RgtC+0YDQvtC1INGA0LDQt9GA0LXRiNCw0LXRgtGB0Y8g0L/RgNC4INC+0LTQvdC+0Lwg0LjQtyDRgdC/0LjRgdC60LAg0YHQvtCx0YvRgtC40LlcbiAqIEBwYXJhbSB7U3RyaW5nfSBhY3Rpb24gLSDQvdCw0LfQstCw0L3QuNC1INC00LXQudGB0YLQstC40Y9cbiAqIEBwYXJhbSB7QXJyYXkuPFN0cmluZz59IHJlc29sdmUgLSDRgdC/0LjRgdC+0Log0L7QttC40LTQsNC10LzRi9GFINGB0L7QsdGL0YLQuNC5INC00LvRjyDRgNCw0LfRgNC10YjQtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSByZWplY3QgLSDRgdC/0LjRgdC+0Log0L7QttC40LTQsNC10LzRi9C5INGB0L7QsdGL0YLQuNC5INC00LvRjyDQvtGC0LrQu9C+0L3QtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPXG4gKiBAcmV0dXJucyB7UHJvbWlzZX0gLS0g0YLQsNC60LbQtSDRgdC+0LfQtNCw0LXRgiBEZWZlcnJlZCDRgdCy0L7QudGB0YLQstC+INGBINC90LDQt9Cy0LDQvdC40LXQvCBfd2hlbjxBY3Rpb24+LCDQutC+0YLQvtGA0L7QtSDQttC40LLQtdGCINC00L4g0LzQvtC80LXQvdGC0LAg0YDQsNC30YDQtdGI0LXQvdC40Y9cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fd2FpdEV2ZW50cyA9IGZ1bmN0aW9uKGFjdGlvbiwgcmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkKCk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdGhpc1thY3Rpb25dID0gZGVmZXJyZWQ7XG5cbiAgICB2YXIgY2xlYW51cEV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXNvbHZlLmZvckVhY2goZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgICAgIHNlbGYub2ZmKGV2ZW50LCBkZWZlcnJlZC5yZXNvbHZlKTtcbiAgICAgICAgfSk7XG4gICAgICAgIHJlamVjdC5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgICAgICBzZWxmLm9mZihldmVudCwgZGVmZXJyZWQucmVqZWN0KTtcbiAgICAgICAgfSk7XG4gICAgICAgIGRlbGV0ZSBzZWxmW2FjdGlvbl07XG4gICAgfTtcblxuICAgIHJlc29sdmUuZm9yRWFjaChmdW5jdGlvbihldmVudCkge1xuICAgICAgICBzZWxmLm9uKGV2ZW50LCBkZWZlcnJlZC5yZXNvbHZlKTtcbiAgICB9KTtcblxuICAgIHJlamVjdC5mb3JFYWNoKGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIHNlbGYub24oZXZlbnQsIGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgICAgIHZhciBlcnJvciA9IGRhdGEgaW5zdGFuY2VvZiBFcnJvciA/IGRhdGEgOiBuZXcgQXVkaW9FcnJvcihkYXRhIHx8IGV2ZW50KTtcbiAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChlcnJvcik7XG4gICAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgZGVmZXJyZWQucHJvbWlzZSgpLnRoZW4oY2xlYW51cEV2ZW50cywgY2xlYW51cEV2ZW50cyk7XG5cbiAgICByZXR1cm4gZGVmZXJyZWQucHJvbWlzZSgpO1xufTtcblxuLyoqXG4gKiDQoNCw0YHRiNC40YDQtdC90LjQtSDRgdC+0LHRi9GC0LjQuSDQsNGD0LTQuNC+LdC/0LvQtdC10YDQsCDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C80Lgg0YHQstC+0LnRgdGC0LLQsNC80LguINCf0L7QtNC/0LjRgdGL0LLQsNC10YLRgdGPINC90LAg0LLRgdC1INGB0L7QsdGL0YLQuNGPINCw0YPQtNC40L4t0L/Qu9C10LXRgNCwLFxuICog0YLRgNC40LPQs9C10YDQuNGCINC40YLQvtCz0L7QstGL0LUg0YHQvtCx0YvRgtC40Y8sINGA0LDQt9C00LXQu9GP0Y8g0LjRhSDQv9C+INGC0LjQv9GDINCw0LrRgtC40LLQvdGL0Lkg0L/Qu9C10LXRgCDQuNC70Lgg0L/RgNC10LvQvtCw0LTQtdGALCDQtNC+0L/QvtC70L3Rj9C10YIg0YHQvtCx0YvRgtC40Y8g0LTQsNC90L3Ri9C80LguXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSDRgdC+0LHRi9GC0LjQtVxuICogQHBhcmFtIHtpbnR9IG9mZnNldCAtINC40YHRgtC+0YfQvdC40Log0YHQvtCx0YvRgtC40Y8uIDAgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAuIDEgLSDQv9GA0LXQu9C+0LDQtNC10YAuXG4gKiBAcGFyYW0geyp9IGRhdGEgLSDQtNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INC00LDQvdC90YvQtSDRgdC+0LHRi9GC0LjRjy5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5fcG9wdWxhdGVFdmVudHMgPSBmdW5jdGlvbihldmVudCwgb2Zmc2V0LCBkYXRhKSB7XG4gICAgaWYgKGV2ZW50ICE9PSBBdWRpb1BsYXllci5FVkVOVF9QUk9HUkVTUykge1xuICAgICAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiX3BvcHVsYXRlRXZlbnRzXCIsIGV2ZW50LCBvZmZzZXQsIGRhdGEpO1xuICAgIH1cblxuICAgIHZhciBvdXRlckV2ZW50ID0gKG9mZnNldCA/IEF1ZGlvUGxheWVyLlBSRUxPQURFUl9FVkVOVCA6IFwiXCIpICsgZXZlbnQ7XG5cbiAgICBzd2l0Y2ggKGV2ZW50KSB7XG4gICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfQ1JBU0hFRDpcbiAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9TV0FQOlxuICAgICAgICAgICAgdGhpcy50cmlnZ2VyKGV2ZW50LCBkYXRhKTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICBjYXNlIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SOlxuICAgICAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIFwiZXJyb3JcIiwgb3V0ZXJFdmVudCwgZGF0YSk7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIob3V0ZXJFdmVudCwgZGF0YSk7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgY2FzZSBBdWRpb1BsYXllci5FVkVOVF9WT0xVTUU6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoZXZlbnQsIHRoaXMuZ2V0Vm9sdW1lKCkpO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGNhc2UgQXVkaW9QbGF5ZXIuRVZFTlRfUFJPR1JFU1M6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIob3V0ZXJFdmVudCwge1xuICAgICAgICAgICAgICAgIGR1cmF0aW9uOiB0aGlzLmdldER1cmF0aW9uKG9mZnNldCksXG4gICAgICAgICAgICAgICAgbG9hZGVkOiB0aGlzLmdldExvYWRlZChvZmZzZXQpLFxuICAgICAgICAgICAgICAgIHBvc2l0aW9uOiBvZmZzZXQgPyAwIDogdGhpcy5nZXRQb3NpdGlvbigpLFxuICAgICAgICAgICAgICAgIHBsYXllZDogb2Zmc2V0ID8gMCA6IHRoaXMuZ2V0UGxheWVkKClcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIGRlZmF1bHQ6XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIob3V0ZXJFdmVudCk7XG4gICAgICAgICAgICBicmVhaztcbiAgICB9XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J7QsdGJ0LjQtSDRhNGD0L3QutGG0LjQuCDRg9C/0YDQsNCy0LvQtdC90LjRjyDQv9C70LXQtdGA0L7QvFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKlxuIElORk86INC00LDQvdC90YvQuSDQvNC10YLQvtC0INCx0YvQu9C+INGA0LXRiNC10L3QviDQvtGB0YLQsNCy0LjRgtGMLCDRgi7Qui4g0Y3RgtC+INGD0LTQvtCx0L3QtdC1INGH0LXQvCDQuNGB0L/QvtC70YzQt9C+0LLQsNGC0Ywg0L7QsdC10YnQsNC90LjQtSAtINC10YHRgtGMINCy0L7Qt9C80L7QttC90L7RgdGC0Ywg0LIg0L3QsNGH0LDQu9C1XG4g0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Lgg0L/QvtC70YPRh9C40YLRjCDRgdGA0LDQt9GDINGB0YHRi9C70LrRgyDQvdCwINGN0LrQt9C10LzQv9C70Y/RgCDQv9C70LXQtdGA0LAg0Lgg0L7QsdCy0LXRiNCw0YLRjCDQtdCz0L4g0L7QsdGA0LDQsdC+0YLRh9C40LrQsNC80Lgg0YHQvtCx0YvRgtC40LkuINCf0LvRjtGBINC6INGC0L7QvNGDINC/0YDQuFxuINGC0LDQutC+0Lwg0L/QvtC00YXQvtC00LUg0YDQtdC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNGOINC00LXQu9Cw0YLRjCDQv9GA0L7RidC1IC0g0L/RgNC4INC90LXQuSDQvdC1INC/0YDQuNC00LXRgtGB0Y8g0L/QtdGA0LXQvdCw0LfQvdCw0YfQsNGC0Ywg0L7QsdGA0LDQsdC+0YLRh9C40LrQuCDQuCDQvtCx0L3QvtCy0LvRj9GC0Ywg0LLQtdC30LTQtSDRgdGB0YvQu9C60YNcbiDQvdCwINGC0LXQutGD0YnQuNC5INGN0LrQt9C10LzQv9C70Y/RgCDQv9C70LXQtdGA0LAuXG4gKi9cblxuLyoqXG4gKiBAcmV0dXJucyB7UHJvbWlzZX0g0L7QsdC10YnQsNC90LjQtSwg0YDQsNC30YDQtdGI0LDRjtGJ0LXQtdGB0Y8g0L/QvtGB0LvQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuC5cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmluaXRQcm9taXNlID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMud2hlblJlYWR5O1xufTtcblxuLyoqXG4gKiBAcmV0dXJucyB7U3RyaW5nfSDRgdGC0LDRgtGD0YEg0L/Qu9C10LXRgNCwLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0U3RhdGUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5zdGF0ZTtcbn07XG5cbi8qKlxuICogQHJldHVybnMge1N0cmluZ3xudWxsfSDRgtC40L8g0YDQtdCw0LvQuNC30LDRhtC40Lgg0L/Qu9C10LXRgNCwLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0VHlwZSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uICYmIHRoaXMuaW1wbGVtZW50YXRpb24udHlwZTtcbn07XG5cbi8qKlxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0g0JHRgNCw0YLRjCDQsNGD0LTQuNC+0YTQsNC50LvQuNC3INCw0LrRgtC40LLQvdC+0LPQviDQv9C70LXQtdGA0LAg0LjQu9C4INC40Lcg0L/RgNC10LvQvtCw0LTQtdGA0LAuIDAgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAsIDEgLSDQv9GA0LXQu9C+0LDQtNC10YAuXG4gKiBAcmV0dXJucyB7U3RyaW5nfG51bGx9INGB0YHRi9C70LrRgyDQvdCwINGC0LXQutGD0YnQuNC5INGC0YDQtdC6LlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0U3JjID0gZnVuY3Rpb24ob2Zmc2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24gJiYgdGhpcy5pbXBsZW1lbnRhdGlvbi5nZXRTcmMob2Zmc2V0KTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQo9C/0YDQsNCy0LvQtdC90LjQtSDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LXQvFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLyoqXG4gKiDQl9Cw0L/Rg9GB0Log0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPLlxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyDQodGB0YvQu9C60LAg0L3QsCDRgtGA0LXQui5cbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dINCU0LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQsNGD0LTQuNC+0YTQsNC50LvQsC4g0JDQutGC0YPQsNC70YzQvdC+INC00LvRjyBGbGFzaC3RgNC10LDQu9C40LfQsNGG0LjQuCwg0LIg0L3QtdC5INC/0L7QutCwINCw0YPQtNC40L7RhNCw0LnQu9Cz0YDRg9C30LjRgtGB0Y9cbiAqINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQvtC/0YDQtdC00LXQu9GP0LXRgtGB0Y8g0YEg0L/QvtCz0YDQtdGI0L3QvtGB0YLRjNGOLlxuICogQHJldHVybnMge0Fib3J0YWJsZVByb21pc2V9XG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24oc3JjLCBkdXJhdGlvbikge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwicGxheVwiLCBsb2dnZXIuX3Nob3dVcmwoc3JjKSwgZHVyYXRpb24pO1xuXG4gICAgdGhpcy5fcGxheWVkID0gMDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IDA7XG4gICAgdGhpcy5fZ2VuZXJhdGVQbGF5SWQoKTtcblxuICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QoXCJwbGF5XCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJwbGF5XCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblN0b3ApIHtcbiAgICAgICAgdGhpcy5fd2hlblN0b3AucmVqZWN0KFwicGxheVwiKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBsYXlcIiwgW0F1ZGlvUGxheWVyLkVWRU5UX1BMQVldLCBbXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX1NUT1AsXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SLFxuICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgXSk7XG5cbiAgICBwcm9taXNlLmFib3J0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICAgICAgdGhpcy5fd2hlblBsYXkucmVqZWN0LmFwcGx5KHRoaXMuX3doZW5QbGF5LCBhcmd1bWVudHMpO1xuICAgICAgICAgICAgdGhpcy5zdG9wKCk7XG4gICAgICAgIH1cbiAgICB9LmJpbmQodGhpcyk7XG5cbiAgICB0aGlzLl9zZXRTdGF0ZShBdWRpb1BsYXllci5TVEFURV9QQVVTRUQpO1xuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucGxheShzcmMsIGR1cmF0aW9uKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQn9C10YDQtdC30LDQv9GD0YHQuiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8uXG4gKiBAcmV0dXJucyB7QWJvcnRhYmxlUHJvbWlzZX0gUHJvbWlzZS3QvtCx0YrQtdC60YIsINC60L7RgtC+0YDRi9C5INGA0LDQt9GA0LXRiNC40YLRgdGPLCDQutC+0LPQtNCwINGC0YDQtdC6INCx0YPQtNC10YIg0L/QtdGA0LXQt9Cw0L/Rg9GJ0LXQvS5cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLnJlc3RhcnQgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuZ2V0RHVyYXRpb24oKSkge1xuICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBBdWRpb0Vycm9yKEF1ZGlvRXJyb3IuQkFEX1NUQVRFKSk7XG4gICAgfVxuXG4gICAgdGhpcy5fZ2VuZXJhdGVQbGF5SWQoKTtcbiAgICB0aGlzLnNldFBvc2l0aW9uKDApO1xuICAgIHRoaXMuX3BsYXllZCA9IDA7XG4gICAgdGhpcy5fbGFzdFNraXAgPSAwO1xuICAgIHJldHVybiB0aGlzLnJlc3VtZSgpO1xufTtcblxuLyoqXG4gKiDQntGB0YLQsNC90L7QstC60LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPLlxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0g0JDQutGC0LjQstC90YvQuSDQv9C70LXQtdGAINC40LvQuCDQv9GA0LXQu9C+0LDQtNC10YAuIDAgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAuIDEgLSDQv9GA0LXQu9C+0LDQtNC10YAuXG4gKiBAcmV0dXJucyB7QWJvcnRhYmxlUHJvbWlzZX0gUHJvbWlzZS3QvtCx0YrQtdC60YIsINC60L7RgtC+0YDRi9C5INGA0LDQt9GA0LXRiNC40YLRgdGPLCDQutC+0LPQtNCwINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtSDQsdGD0LTQtdGCINC+0YHRgtCw0L3QvtCy0LvQtdC90L4uXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24ob2Zmc2V0KSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJzdG9wXCIsIG9mZnNldCk7XG5cbiAgICBpZiAob2Zmc2V0ICE9PSAwKSB7XG4gICAgICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLnN0b3Aob2Zmc2V0KTtcbiAgICB9XG5cbiAgICB0aGlzLl9wbGF5ZWQgPSAwO1xuICAgIHRoaXMuX2xhc3RTa2lwID0gMDtcblxuICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QoXCJzdG9wXCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJzdG9wXCIpO1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlO1xuICAgIGlmICh0aGlzLl93aGVuU3RvcCkge1xuICAgICAgICBwcm9taXNlID0gdGhpcy5fd2hlblN0b3AucHJvbWlzZSgpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHByb21pc2UgPSB0aGlzLl93YWl0RXZlbnRzKFwiX3doZW5TdG9wXCIsIFtBdWRpb1BsYXllci5FVkVOVF9TVE9QXSwgW1xuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfUExBWSxcbiAgICAgICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SLFxuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfQ1JBU0hFRFxuICAgICAgICBdKTtcbiAgICB9XG5cbiAgICB0aGlzLmltcGxlbWVudGF0aW9uLnN0b3AoKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQn9C+0YHRgtCw0LLQuNGC0Ywg0L/Qu9C10LXRgCDQvdCwINC/0LDRg9C30YMuXG4gKiBAcmV0dXJucyB7QWJvcnRhYmxlUHJvbWlzZX0gUHJvbWlzZS3QvtCx0YrQtdC60YIsINC60L7RgtC+0YDRi9C5INGA0LDQt9GA0LXRiNC40YLRgdGPLCDQutC+0LPQtNCwINC/0LvQtdC10YAg0LHRg9C00LXRgiDQv9C+0YHRgtCw0LLQu9C10L0g0L3QsCDQv9Cw0YPQt9GDLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInBhdXNlXCIpO1xuXG4gICAgaWYgKHRoaXMuc3RhdGUgIT09IEF1ZGlvUGxheWVyLlNUQVRFX1BMQVlJTkcpIHtcbiAgICAgICAgcmV0dXJuIHJlamVjdChuZXcgQXVkaW9FcnJvcihBdWRpb0Vycm9yLkJBRF9TVEFURSkpO1xuICAgIH1cblxuICAgIHZhciBwcm9taXNlO1xuXG4gICAgaWYgKHRoaXMuX3doZW5QbGF5KSB7XG4gICAgICAgIHRoaXMuX3doZW5QbGF5LnJlamVjdChcInBhdXNlXCIpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLl93aGVuUGF1c2UpIHtcbiAgICAgICAgcHJvbWlzZSA9IHRoaXMuX3doZW5QYXVzZS5wcm9taXNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBhdXNlXCIsIFtBdWRpb1BsYXllci5FVkVOVF9QQVVTRV0sIFtcbiAgICAgICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX1NUT1AsXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9QTEFZLFxuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1IsXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgICAgIF0pO1xuICAgIH1cblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucGF1c2UoKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQodC90Y/RgtC40LUg0L/Qu9C10LXRgNCwINGBINC/0LDRg9C30YsuXG4gKiBAcmV0dXJucyB7QWJvcnRhYmxlUHJvbWlzZX0gUHJvbWlzZS3QvtCx0YrQtdC60YIsINC60L7RgtC+0YDRi9C5INGA0LDQt9GA0LXRiNC40YLRgdGPLCDQutC+0LPQtNCwINC90LDRh9C90LXRgtGB0Y8g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1LlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUucmVzdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJyZXN1bWVcIik7XG5cbiAgICBpZiAodGhpcy5zdGF0ZSA9PT0gQXVkaW9QbGF5ZXIuU1RBVEVfUExBWUlORyAmJiAhdGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoISh0aGlzLnN0YXRlID09PSBBdWRpb1BsYXllci5TVEFURV9JRExFIHx8IHRoaXMuc3RhdGUgPT09IEF1ZGlvUGxheWVyLlNUQVRFX1BBVVNFRFxuICAgICAgICB8fCB0aGlzLnN0YXRlID09PSBBdWRpb1BsYXllci5TVEFURV9QTEFZSU5HKSkge1xuICAgICAgICByZXR1cm4gcmVqZWN0KG5ldyBBdWRpb0Vycm9yKEF1ZGlvRXJyb3IuQkFEX1NUQVRFKSk7XG4gICAgfVxuXG4gICAgdmFyIHByb21pc2U7XG5cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJyZXN1bWVcIik7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuX3doZW5QbGF5KSB7XG4gICAgICAgIHByb21pc2UgPSB0aGlzLl93aGVuUGxheS5wcm9taXNlKCk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBsYXlcIiwgW0F1ZGlvUGxheWVyLkVWRU5UX1BMQVldLCBbXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9TVE9QLFxuICAgICAgICAgICAgQXVkaW9QbGF5ZXIuRVZFTlRfRVJST1IsXG4gICAgICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgICAgIF0pO1xuXG4gICAgICAgIHByb21pc2UuYWJvcnQgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICAgICAgICAgIHRoaXMuX3doZW5QbGF5LnJlamVjdC5hcHBseSh0aGlzLl93aGVuUGxheSwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgICAgICB0aGlzLnN0b3AoKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgIH1cblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucmVzdW1lKCk7XG5cbiAgICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbi8qKlxuICog0JfQsNC/0YPRgdC6INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjyDQv9GA0LXQtNC30LDQs9GA0YPQttC10L3QvdC+0LPQviDQsNGD0LTQuNC+0YTQsNC50LvQsC5cbiAqIEBwYXJhbSB7U3RyaW5nfSBbc3JjXSDQodGB0YvQu9C60LAg0L3QsCDQsNGD0LTQuNC+0YTQsNC50LsgKNC00LvRjyDQv9GA0L7QstC10YDQutC4LCDRh9GC0L4g0LIg0L/RgNC10LvQvtCw0LTQtdGA0LUg0L3Rg9C20L3Ri9C5INGC0YDQtdC6KS5cbiAqIEByZXR1cm5zIHtBYm9ydGFibGVQcm9taXNlfSBQcm9taXNlLdC+0LHRitC10LrRgiwg0LrQvtGC0L7RgNGL0Lkg0YDQsNC30YDQtdGI0LjRgtGB0Y8sINC60L7Qs9C00LAg0L3QsNGH0L3QtdGC0YHRjyDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0L/RgNC10LTQt9Cw0LPRgNGD0LbQtdC90L3QvtCz0L4g0LDRg9C00LjQvtGE0LDQudC70LAuXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5wbGF5UHJlbG9hZGVkID0gZnVuY3Rpb24oc3JjKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJwbGF5UHJlbG9hZGVkXCIsIGxvZ2dlci5fc2hvd1VybChzcmMpKTtcblxuICAgIGlmICghc3JjKSB7XG4gICAgICAgIHNyYyA9IHRoaXMuZ2V0U3JjKDEpO1xuICAgIH1cblxuICAgIGlmICghdGhpcy5pc1ByZWxvYWRlZChzcmMpKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwicGxheVByZWxvYWRlZEJhZFRyYWNrXCIsIEF1ZGlvRXJyb3IuTk9UX1BSRUxPQURFRCk7XG4gICAgICAgIHJldHVybiByZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5OT1RfUFJFTE9BREVEKSk7XG4gICAgfVxuXG4gICAgdGhpcy5fcGxheWVkID0gMDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IDA7XG4gICAgdGhpcy5fZ2VuZXJhdGVQbGF5SWQoKTtcblxuICAgIGlmICh0aGlzLl93aGVuUGxheSkge1xuICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QoXCJwbGF5UHJlbG9hZGVkXCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblBhdXNlKSB7XG4gICAgICAgIHRoaXMuX3doZW5QYXVzZS5yZWplY3QoXCJwbGF5UHJlbG9hZGVkXCIpO1xuICAgIH1cbiAgICBpZiAodGhpcy5fd2hlblN0b3ApIHtcbiAgICAgICAgdGhpcy5fd2hlblN0b3AucmVqZWN0KFwicGxheVByZWxvYWRlZFwiKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblBsYXlcIiwgW0F1ZGlvUGxheWVyLkVWRU5UX1BMQVldLCBbXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX1NUT1AsXG4gICAgICAgIEF1ZGlvUGxheWVyLkVWRU5UX0VSUk9SLFxuICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVEXG4gICAgXSk7XG4gICAgcHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fd2hlblBsYXkpIHtcbiAgICAgICAgICAgIHRoaXMuX3doZW5QbGF5LnJlamVjdC5hcHBseSh0aGlzLl93aGVuUGxheSwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgpO1xuICAgICAgICB9XG4gICAgfS5iaW5kKHRoaXMpO1xuXG4gICAgdGhpcy5fc2V0U3RhdGUoQXVkaW9QbGF5ZXIuU1RBVEVfUEFVU0VEKTtcbiAgICB2YXIgcmVzdWx0ID0gdGhpcy5pbXBsZW1lbnRhdGlvbi5wbGF5UHJlbG9hZGVkKCk7XG5cbiAgICBpZiAoIXJlc3VsdCkge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInBsYXlQcmVsb2FkZWRFcnJvclwiLCBBdWRpb0Vycm9yLk5PVF9QUkVMT0FERUQpO1xuICAgICAgICB0aGlzLl93aGVuUGxheS5yZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5OT1RfUFJFTE9BREVEKSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHByb21pc2U7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J/RgNC10LTQt9Cw0LPRgNGD0LfQutCwXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0J/RgNC10LTQt9Cw0LPRgNGD0LfQutCwINCw0YPQtNC40L7RhNCw0LnQu9CwLlxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyDQodGB0YvQu9C60LAg0L3QsCDRgtGA0LXQui5cbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dINCU0LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQsNGD0LTQuNC+0YTQsNC50LvQsC4g0JDQutGC0YPQsNC70YzQvdC+INC00LvRjyBGbGFzaC3RgNC10LDQu9C40LfQsNGG0LjQuCwg0LIg0L3QtdC5INC/0L7QutCwINCw0YPQtNC40L7RhNCw0LnQuyDQs9GA0YPQt9C40YLRgdGPXG4gKiDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0L7Qv9GA0LXQtNC10LvRj9C10YLRgdGPINGBINC/0L7Qs9GA0LXRiNC90L7RgdGC0YzRji5cbiAqIEByZXR1cm5zIHtBYm9ydGFibGVQcm9taXNlfSBQcm9taXNlLdC+0LHRitC10LrRgiwg0LrQvtGC0L7RgNGL0Lkg0YDQsNC30YDQtdGI0LjRgtGB0Y8sINC60L7Qs9C00LAg0L3QsNGH0L3QtdGC0YHRjyDQv9GA0LXQtNC30LDQs9GA0YPQt9C60LAg0LDRg9C00LjQvtGE0LDQudC70LAuXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5wcmVsb2FkID0gZnVuY3Rpb24oc3JjLCBkdXJhdGlvbikge1xuICAgIGlmIChkZXRlY3QuYnJvd3Nlci5uYW1lID09PSBcIm1zaWVcIiAmJiBkZXRlY3QuYnJvd3Nlci52ZXJzaW9uWzBdID09IFwiOVwiKSB7XG4gICAgICAgIHJldHVybiByZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5OT1RfUFJFTE9BREVEKSk7XG4gICAgfVxuXG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJwcmVsb2FkXCIsIGxvZ2dlci5fc2hvd1VybChzcmMpLCBkdXJhdGlvbik7XG5cbiAgICBpZiAodGhpcy5fd2hlblByZWxvYWQpIHtcbiAgICAgICAgdGhpcy5fd2hlblByZWxvYWQucmVqZWN0KFwicHJlbG9hZFwiKTtcbiAgICB9XG5cbiAgICB2YXIgcHJvbWlzZSA9IHRoaXMuX3dhaXRFdmVudHMoXCJfd2hlblByZWxvYWRcIiwgW1xuICAgICAgICBBdWRpb1BsYXllci5QUkVMT0FERVJfRVZFTlQgKyBBdWRpb1BsYXllci5FVkVOVF9MT0FESU5HLFxuICAgICAgICBBdWRpb1BsYXllci5FVkVOVF9TV0FQXG4gICAgXSwgW1xuICAgICAgICBBdWRpb1BsYXllci5QUkVMT0FERVJfRVZFTlQgKyBBdWRpb1BsYXllci5FVkVOVF9DUkFTSEVELFxuICAgICAgICBBdWRpb1BsYXllci5QUkVMT0FERVJfRVZFTlQgKyBBdWRpb1BsYXllci5FVkVOVF9FUlJPUixcbiAgICAgICAgQXVkaW9QbGF5ZXIuUFJFTE9BREVSX0VWRU5UICsgQXVkaW9QbGF5ZXIuRVZFTlRfU1RPUFxuICAgIF0pO1xuXG4gICAgcHJvbWlzZS5hYm9ydCA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAodGhpcy5fd2hlblByZWxvYWQpIHtcbiAgICAgICAgICAgIHRoaXMuX3doZW5QcmVsb2FkLnJlamVjdC5hcHBseSh0aGlzLl93aGVuUHJlbG9hZCwgYXJndW1lbnRzKTtcbiAgICAgICAgICAgIHRoaXMuc3RvcCgxKTtcbiAgICAgICAgfVxuICAgIH0uYmluZCh0aGlzKTtcblxuICAgIHRoaXMuaW1wbGVtZW50YXRpb24ucHJlbG9hZChzcmMsIGR1cmF0aW9uKTtcblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLyoqXG4gKiDQn9GA0L7QstC10YDQutCwLCDRh9GC0L4g0LDRg9C00LjQvtGE0LDQudC7INC/0YDQtdC00LfQsNCz0YDRg9C20LXQvS5cbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMg0KHRgdGL0LvQutCwINC90LAg0YLRgNC10LouXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSwg0LXRgdC70Lgg0LDRg9C00LjQvtGE0LDQudC7INC/0YDQtdC00LLQsNGA0LjRgtC10LvRjNC90L4g0LfQsNCz0YDRg9C20LXQvSwgZmFsc2UgLSDQuNC90LDRh9C1LlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuaXNQcmVsb2FkZWQgPSBmdW5jdGlvbihzcmMpIHtcbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5pc1ByZWxvYWRlZChzcmMpO1xufTtcblxuLyoqXG4gKiDQn9GA0L7QstC10YDQutCwLCDRh9GC0L4g0LDRg9C00LjQvtGE0LDQudC7INC/0YDQtdC00LfQsNCz0YDRg9C20LDQtdGC0YHRjy5cbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMg0KHRgdGL0LvQutCwINC90LAg0YLRgNC10LouXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSwg0LXRgdC70Lgg0LDRg9C00LjQvtGE0LDQudC7INC90LDRh9Cw0Lsg0L/RgNC10LTQstCw0YDQuNGC0LXQu9GM0L3QviDQt9Cw0LPRgNGD0LbQsNGC0YzRgdGPLCBmYWxzZSAtINC40L3QsNGH0LUuXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5pc1ByZWxvYWRpbmcgPSBmdW5jdGlvbihzcmMpIHtcbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5pc1ByZWxvYWRpbmcoc3JjLCAxKTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQotCw0LnQvNC40L3Qs9C4XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0J/QvtC70YPRh9C10L3QuNC1INC/0L7Qt9C40YbQuNC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEByZXR1cm5zIHtOdW1iZXJ9INC/0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjyAo0LIg0YHQtdC60YPQvdC00LDRhSkuXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5nZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLmdldFBvc2l0aW9uKCkgfHwgMDtcbn07XG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQutCwINC/0L7Qt9C40YbQuNC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEBwYXJhbSB7TnVtYmVyfSBwb3NpdGlvbiDQndC+0LLQsNGPINC/0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjyAo0LIg0YHQtdC60YPQvdC00LDRhSkuXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDQutC+0L3QtdGH0L3QsNGPINC/0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLnNldFBvc2l0aW9uID0gZnVuY3Rpb24ocG9zaXRpb24pIHtcbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInNldFBvc2l0aW9uXCIsIHBvc2l0aW9uKTtcblxuICAgIGlmICh0aGlzLmltcGxlbWVudGF0aW9uLnR5cGUgPT0gXCJmbGFzaFwiKSB7XG4gICAgICAgIHBvc2l0aW9uID0gTWF0aC5tYXgoMCwgTWF0aC5taW4odGhpcy5nZXRMb2FkZWQoKSAtIDEsIHBvc2l0aW9uKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgcG9zaXRpb24gPSBNYXRoLm1heCgwLCBNYXRoLm1pbih0aGlzLmdldER1cmF0aW9uKCkgLSAxLCBwb3NpdGlvbikpO1xuICAgIH1cblxuICAgIHRoaXMuX3BsYXllZCArPSB0aGlzLmdldFBvc2l0aW9uKCkgLSB0aGlzLl9sYXN0U2tpcDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IHBvc2l0aW9uO1xuXG4gICAgdGhpcy5pbXBsZW1lbnRhdGlvbi5zZXRQb3NpdGlvbihwb3NpdGlvbik7XG5cbiAgICByZXR1cm4gcG9zaXRpb247XG59O1xuXG4vKipcbiAqIEBwYXJhbSB7Qm9vbGVhbnxpbnR9IHByZWxvYWRlciDQkNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAg0LjQu9C4INC/0YDQtdC00LfQsNCz0YDRg9C30YfQuNC6LiAwIC0g0LDQutGC0LjQstC90YvQuSDQv9C70LXQtdGALCAxIC0g0L/RgNC10LTQt9Cw0LPRgNGD0LfRh9C40LouXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0LDRg9C00LjQvtGE0LDQudC70LAgKNCyINGB0LXQutGD0L3QtNCw0YUpLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbihwcmVsb2FkZXIpIHtcbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5nZXREdXJhdGlvbihwcmVsb2FkZXIgPyAxIDogMCkgfHwgMDtcbn07XG5cbi8qKlxuICogQHBhcmFtIHtCb29sZWFufGludH0gcHJlbG9hZGVyINCQ0LrRgtC40LLQvdGL0Lkg0L/Qu9C10LXRgCDQuNC70Lgg0L/RgNC10LTQt9Cw0LPRgNGD0LfRh9C40LouIDAgLSDQsNC60YLQuNCy0L3Ri9C5INC/0LvQtdC10YAsIDEgLSDQv9GA0LXQtNC30LDQs9GA0YPQt9GH0LjQui5cbiAqIEByZXR1cm5zIHtOdW1iZXJ9INC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDQt9Cw0LPRgNGD0LbQtdC90L3QvtC5INGH0LDRgdGC0LggKNCyINGB0LXQutGD0L3QtNCw0YUpLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0TG9hZGVkID0gZnVuY3Rpb24ocHJlbG9hZGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24uZ2V0TG9hZGVkKHByZWxvYWRlciA/IDEgOiAwKSB8fCAwO1xufTtcblxuLyoqXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPICjQsiDRgdC10LrRg9C90LTQsNGFKS5cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLmdldFBsYXllZCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwb3NpdGlvbiA9IHRoaXMuZ2V0UG9zaXRpb24oKTtcbiAgICB0aGlzLl9wbGF5ZWQgKz0gcG9zaXRpb24gLSB0aGlzLl9sYXN0U2tpcDtcbiAgICB0aGlzLl9sYXN0U2tpcCA9IHBvc2l0aW9uO1xuXG4gICAgcmV0dXJuIHRoaXMuX3BsYXllZDtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQk9GA0L7QvNC60L7RgdGC0YxcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDRgtC10LrRg9GJ0LXQtSDQt9C90LDRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuCDQv9C70LXQtdGA0LAuXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5nZXRWb2x1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuaW1wbGVtZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24uZ2V0Vm9sdW1lKCk7XG59O1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LrQsCDQs9GA0L7QvNC60L7RgdGC0Lgg0L/Qu9C10LXRgNCwLlxuICogQHBhcmFtIHtOdW1iZXJ9IHZvbHVtZSDQndC+0LLQvtC1INC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4LlxuICogQHJldHVybnMge051bWJlcn0g0LjRgtC+0LPQvtCy0L7QtSDQt9C90LDRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuC5cbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLnNldFZvbHVtZSA9IGZ1bmN0aW9uKHZvbHVtZSkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJzZXRWb2x1bWVcIiwgdm9sdW1lKTtcblxuICAgIGlmICghdGhpcy5pbXBsZW1lbnRhdGlvbikge1xuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi5zZXRWb2x1bWUodm9sdW1lKTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LrQsCwg0YfRgtC+INCz0YDQvtC80LrQvtGB0YLRjCDRg9C/0YDQsNCy0LvRj9C10YLRgdGPINGD0YHRgtGA0L7QudGB0YLQstC+0LwsINCwINC90LUg0L/RgNC+0LPRgNCw0LzQvNC90L4uXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0gdHJ1ZSwg0LXRgdC70Lgg0LPRgNC+0LzQutC+0YHRgtGMINGD0L/RgNCw0LLQu9GP0LXRgtGB0Y8g0YPRgdGC0YDQvtC50YHRgtCy0L7QvCwgZmFsc2UgLSDQuNC90LDRh9C1LlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuaXNEZXZpY2VWb2x1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuaW1wbGVtZW50YXRpb24pIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuaW1wbGVtZW50YXRpb24uaXNEZXZpY2VWb2x1bWUoKTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICBXZWIgQXVkaW8gQVBJXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5BdWRpb1BsYXllci5wcm90b3R5cGUudG9nZ2xlQ3Jvc3NEb21haW4gPSBmdW5jdGlvbihzdGF0ZSkge1xuICAgIGlmICh0aGlzLmltcGxlbWVudGF0aW9uLnR5cGUgIT09IFwiaHRtbDVcIikge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInRvZ2dsZUNyb3NzRG9tYWluRmFpbGVkXCIsIHRoaXMuaW1wbGVtZW50YXRpb24udHlwZSk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICB0aGlzLmltcGxlbWVudGF0aW9uLnRvZ2dsZUNyb3NzRG9tYWluKHN0YXRlKTtcbn07XG5cbi8qKlxuICog0J/QtdGA0LXQutC70Y7Rh9C10L3QuNC1INGA0LXQttC40LzQsCDQuNGB0L/QvtC70YzQt9C+0LLQsNC90LjRjyBXZWIgQXVkaW8gQVBJLiDQlNC+0YHRgtGD0L/QtdC9INGC0L7Qu9GM0LrQviDQv9GA0LggaHRtbDUt0YDQtdCw0LvQuNC30LDRhtC40Lgg0L/Qu9C10LXRgNCwLlxuICogPG5vdGUgdHlwZT1cImF0dGVudGlvblwiPiDQv9C+0YHQu9C1INCy0LrQu9GO0YfQtdC90LjRjyDRgNC10LbQuNC80LAgV2ViIEF1ZGlvIEFQSSDQvtC9INC90LUg0L7RgtC60LvRjtGH0LDQtdGC0YHRjyDQv9C+0LvQvdC+0YHRgtGM0Y4sINGCLtC6LiDQtNC70Y8g0Y3RgtC+0LPQviDRgtGA0LXQsdGD0LXRgtGB0Y9cbiAqINGA0LXQuNC90LjRhtC40LDQu9C40LfQsNGG0LjRjyDQv9C70LXQtdGA0LAsINC60L7RgtC+0YDQvtC5INGC0YDQtdCx0YPQtdGC0YHRjyDQutC70LjQuiDQv9C+0LvRjNC30L7QstCw0YLQtdC70Y8uINCf0YDQuCDQvtGC0LrQu9GO0YfQtdC90LjQuCDQuNC3INCz0YDQsNGE0LAg0L7QsdGA0LDQsdC+0YLQutC4INC40YHQutC70Y7Rh9Cw0Y7RgtGB0Y9cbiAqINCy0YHQtSDQvdC+0LTRiyDQutGA0L7QvNC1INC90L7QtC3QuNGB0YLQvtGH0L3QuNC60L7QsiDQuCDQvdC+0LTRiyDQstGL0LLQvtC00LAsINGD0L/RgNCw0LLQu9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLRjNGOINC/0LXRgNC10LrQu9GO0YfQsNC10YLRgdGPINC90LAg0Y3Qu9C10LzQtdC90YLRiyBhdWRpbywg0LHQtdC3XG4gKiDQuNGB0L/QvtC70YzQt9C+0LLQsNC90LjRjyBHYWluTm9kZS4gPC9ub3RlPlxuICogQHBhcmFtIHtCb29sZWFufSBzdGF0ZSDQl9Cw0L/RgNCw0YjQuNCy0LDQtdC80YvQuSDRgdGC0LDRgtGD0YEuXG4gKiBAcmV0dXJucyB7Qm9vbGVhbn0g0JjRgtC+0LPQvtCy0YvQuSDRgdGC0LDRgtGD0YEg0L/Qu9C10LXRgNCwLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUudG9nZ2xlV2ViQXVkaW9BUEkgPSBmdW5jdGlvbihzdGF0ZSkge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwidG9nZ2xlV2ViQXVkaW9BUElcIiwgc3RhdGUpO1xuICAgIGlmICh0aGlzLmltcGxlbWVudGF0aW9uLnR5cGUgIT09IFwiaHRtbDVcIikge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInRvZ2dsZVdlYkF1ZGlvQVBJRmFpbGVkXCIsIHRoaXMuaW1wbGVtZW50YXRpb24udHlwZSk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5pbXBsZW1lbnRhdGlvbi50b2dnbGVXZWJBdWRpb0FQSShzdGF0ZSk7XG59O1xuXG4vKipcbiAqINCQ0YPQtNC40L4t0L/RgNC10L/RgNC+0YbQtdGB0YHQvtGALlxuICogQHR5cGVkZWYge09iamVjdH0gQXVkaW8uQXVkaW9QcmVwcm9jZXNzb3JcbiAqXG4gKiBAcHJvcGVydHkge0F1ZGlvTm9kZX0gaW5wdXQg0J3QvtC00LAsINCyINC60L7RgtC+0YDRg9GOINC/0LXRgNC10L3QsNC/0YDQsNCy0LvRj9C10YLRgdGPINCy0YvQstC+0LQg0LDRg9C00LjQvi5cbiAqIEBwcm9wZXJ0eSB7QXVkaW9Ob2RlfSBvdXRwdXQg0J3QvtC00LAsINC40Lcg0LrQvtGC0L7RgNC+0Lkg0LLRi9Cy0L7QtCDQv9C+0LTQsNC10YLRgdGPINC90LAg0YPRgdC40LvQuNGC0LXQu9GMLlxuICovXG5cbi8qKlxuICog0J/QvtC00LrQu9GO0YfQtdC90LjQtSDQsNGD0LTQuNC+INC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgNCwLiDQktGF0L7QtCDQv9GA0LXQv9GA0L7RhtC10YHRgdC+0YDQsCDQv9C+0LTQutC70Y7Rh9Cw0LXRgtGB0Y8g0Log0LDRg9C00LjQvtGN0LvQtdC80LXQvdGC0YMsINGDINC60L7RgtC+0YDQvtCz0L4g0LLRi9GB0YLQsNCy0LvQtdC90LBcbiAqIDEwMCUg0LPRgNC+0LzQutC+0YHRgtGMLiDQktGL0YXQvtC0INC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgNCwINC/0L7QtNC60LvRjtGH0LDQtdGC0YHRjyDQuiBHYWluTm9kZSwg0LrQvtGC0L7RgNCw0Y8g0YDQtdCz0YPQu9C40YDRg9C10YIg0LjRgtC+0LPQvtCy0YPRjiDQs9GA0L7QvNC60L7RgdGC0YwuXG4gKiBAcGFyYW0ge3lhLm11c2ljLkF1ZGlvfkF1ZGlvUHJlcHJvY2Vzc29yfSBwcmVwcm9jZXNzb3Ig0J/RgNC10L/RgNC+0YbQtdGB0YHQvtGALlxuICogQHJldHVybnMge2Jvb2xlYW59INGB0YLQsNGC0YPRgSDRg9GB0L/QtdGF0LAuXG4gKi9cbkF1ZGlvUGxheWVyLnByb3RvdHlwZS5zZXRBdWRpb1ByZXByb2Nlc3NvciA9IGZ1bmN0aW9uKHByZXByb2Nlc3Nvcikge1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwic2V0QXVkaW9QcmVwcm9jZXNzb3JcIik7XG4gICAgaWYgKHRoaXMuaW1wbGVtZW50YXRpb24udHlwZSAhPT0gXCJodG1sNVwiKSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwic2V0QXVkaW9QcmVwcm9jZXNzb3JGYWlsZWRcIiwgdGhpcy5pbXBsZW1lbnRhdGlvbi50eXBlKTtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLmltcGxlbWVudGF0aW9uLnNldEF1ZGlvUHJlcHJvY2Vzc29yKHByZXByb2Nlc3Nvcik7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0JvQvtCz0LPQuNGA0L7QstCw0L3QuNC1XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0JPQtdC90LXRgNCw0YbQuNGPIHBsYXlJZFxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9QbGF5ZXIucHJvdG90eXBlLl9nZW5lcmF0ZVBsYXlJZCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3BsYXlJZCA9IE1hdGgucmFuZG9tKCkudG9TdHJpbmcoKS5zbGljZSgyKTtcbn07XG5cbi8qKlxuICogQHJldHVybnMge1N0cmluZ30gcGxheUlkLlxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuZ2V0UGxheUlkID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHRoaXMuX3BsYXlJZDtcbn07XG5cbi8qKlxuICog0JLRgdC/0L7QvNC+0LPQsNGC0LXQu9GM0L3QsNGPINGE0YPQvdC60YbQuNGPINC00LvRjyDQvtGC0L7QsdGA0LDQttC10L3QuNGPINGB0L7RgdGC0L7Rj9C90LjRjyDQv9C70LXQtdGA0LAg0LIg0LvQvtCz0LUuXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb1BsYXllci5wcm90b3R5cGUuX2xvZ2dlciA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGluZGV4OiB0aGlzLmltcGxlbWVudGF0aW9uICYmIHRoaXMuaW1wbGVtZW50YXRpb24ubmFtZSxcbiAgICAgICAgc3JjOiB0aGlzLmltcGxlbWVudGF0aW9uICYmIHRoaXMuaW1wbGVtZW50YXRpb24uX2xvZ2dlcigpLFxuICAgICAgICB0eXBlOiB0aGlzLmltcGxlbWVudGF0aW9uICYmIHRoaXMuaW1wbGVtZW50YXRpb24udHlwZVxuICAgIH07XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEF1ZGlvUGxheWVyO1xuIiwiLyoqXG4gKiBAbmFtZXNwYWNlIEF1ZGlvU3RhdGljXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgQXVkaW9TdGF0aWMgPSB7fTtcblxuLyoqXG4gKiDQndCw0YfQsNC70L4g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPINGC0YDQtdC60LAuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvU3RhdGljLkVWRU5UX1BMQVkgPSBcInBsYXlcIjtcbi8qKlxuICog0J7RgdGC0LDQvdC+0LLQutCwINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfU1RPUCA9IFwic3RvcFwiO1xuLyoqXG4gKiDQn9Cw0YPQt9CwINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfUEFVU0UgPSBcInBhdXNlXCI7XG4vKipcbiAqINCe0LHQvdC+0LLQu9C10L3QuNC1INC/0L7Qt9C40YbQuNC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfUFJPR1JFU1MgPSBcInByb2dyZXNzXCI7XG4vKipcbiAqINCd0LDRh9Cw0LvQsNGB0Ywg0LfQsNCz0YDRg9C30LrQsCDRgtGA0LXQutCwLlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb1N0YXRpYy5FVkVOVF9MT0FESU5HID0gXCJsb2FkaW5nXCI7XG4vKipcbiAqINCX0LDQs9GA0YPQt9C60LAg0YLRgNC10LrQsCDQt9Cw0LLQtdGA0YjQtdC90LAuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvU3RhdGljLkVWRU5UX0xPQURFRCA9IFwibG9hZGVkXCI7XG4vKipcbiAqINCY0LfQvNC10L3QtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LguXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvU3RhdGljLkVWRU5UX1ZPTFVNRSA9IFwidm9sdW1lY2hhbmdlXCI7XG5cbi8qKlxuICog0JLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INGC0YDQtdC60LAg0LfQsNCy0LXRgNGI0LXQvdC+LlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb1N0YXRpYy5FVkVOVF9FTkRFRCA9IFwiZW5kZWRcIjtcbi8qKlxuICog0JLQvtC30L3QuNC60LvQsCDQvtGI0LjQsdC60LAg0L/RgNC4INC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4INC/0LvQtdC10YDQsC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfQ1JBU0hFRCA9IFwiY3Jhc2hlZFwiO1xuLyoqXG4gKiDQktC+0LfQvdC40LrQu9CwINC+0YjQuNCx0LrQsCDQv9GA0Lgg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC4LlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb1N0YXRpYy5FVkVOVF9FUlJPUiA9IFwiZXJyb3JcIjtcbi8qKlxuICog0JjQt9C80LXQvdC10L3QuNC1INGB0YLQsNGC0YPRgdCwINC/0LvQtdC10YDQsC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuRVZFTlRfU1RBVEUgPSBcInN0YXRlXCI7XG4vKipcbiAqINCf0LXRgNC10LrQu9GO0YfQtdC90LjQtSDQvNC10LbQtNGDINGC0LXQutGD0YnQuNC8INC4INC/0YDQtdC00LfQsNCz0YDRg9C20LXQvdC90YvQvCDRgtGA0LXQutC+0LwuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvU3RhdGljLkVWRU5UX1NXQVAgPSBcInN3YXBcIjtcbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0L/RgNC10LTQt9Cw0LPRgNGD0LfRh9C40LrQsC4g0JjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPINCyINC60LDRh9C10YHRgtCy0LUg0L/RgNC10YTQuNC60YHQsC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuUFJFTE9BREVSX0VWRU5UID0gXCJwcmVsb2FkZXI6XCI7XG4vKipcbiAqINCf0LvQtdC10YAg0L3QsNGF0L7QtNC40YLRgdGPINCyINGB0L7RgdGC0L7Rj9C90LjQuCDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuU1RBVEVfSU5JVCA9IFwiaW5pdFwiO1xuLyoqXG4gKiDQndC1INGD0LTQsNC70L7RgdGMINC40L3QuNGG0LjQsNC70LjQt9C40YDQvtCy0LDRgtGMINC/0LvQtdC10YAuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvU3RhdGljLlNUQVRFX0NSQVNIRUQgPSBcImNyYXNoZWRcIjtcbi8qKlxuICog0J/Qu9C10LXRgCDQs9C+0YLQvtCyINC4INC+0LbQuNC00LDQtdGCLlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb1N0YXRpYy5TVEFURV9JRExFID0gXCJpZGxlXCI7XG4vKipcbiAqINCf0LvQtdC10YAg0L/RgNC+0LjQs9GA0YvQstCw0LXRgiDRgtGA0LXQui5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9TdGF0aWMuU1RBVEVfUExBWUlORyA9IFwicGxheWluZ1wiO1xuLyoqXG4gKiDQn9C70LXQtdGAINC/0L7RgdGC0LDQstC70LXQvSDQvdCwINC/0LDRg9C30YMuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvU3RhdGljLlNUQVRFX1BBVVNFRCA9IFwicGF1c2VkXCI7XG5cbm1vZHVsZS5leHBvcnRzID0gQXVkaW9TdGF0aWM7XG4iLCIvKipcbiAqINCd0LDRgdGC0YDQvtC50LrQuCDQsdC40LHQu9C40L7RgtC10LrQuC5cbiAqIEBhbGlhcyB5YS5tdXNpYy5BdWRpby5jb25maWdcbiAqIEBuYW1lc3BhY2VcbiAqL1xudmFyIGNvbmZpZyA9IHtcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvLyAg0J7QsdGJ0LjQtSDQvdCw0YHRgtGA0L7QudC60LhcblxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiDQntCx0YnQuNC1INC90LDRgdGC0YDQvtC50LrQuC5cbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICovXG4gICAgYXVkaW86IHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCa0L7Qu9C40YfQtdGB0YLQstC+INC/0L7Qv9GL0YLQvtC6INGA0LXQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgcmV0cnk6IDNcbiAgICB9LFxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vICBGbGFzaC3Qv9C70LXQtdGAXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICog0J3QsNGB0YLRgNC+0LnQutC4INC/0L7QtNC60LvRjtGH0LXQvdC40Y8gRmxhc2gt0L/Qu9C10LXRgNCwLlxuICAgICAqIEBuYW1lc3BhY2VcbiAgICAgKi9cbiAgICBmbGFzaDoge1xuICAgICAgICAvKipcbiAgICAgICAgICog0J/Rg9GC0Ywg0LogLnN3ZiDRhNCw0LnQu9GDINGE0LvQtdGILdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgcGF0aDogXCJkaXN0XCIsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQmNC80Y8gLnN3ZiDRhNCw0LnQu9CwINGE0LvQtdGILdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7U3RyaW5nfVxuICAgICAgICAgKi9cbiAgICAgICAgbmFtZTogXCJwbGF5ZXItMl8xLnN3ZlwiLFxuICAgICAgICAvKipcbiAgICAgICAgICog0JzQuNC90LjQvNCw0LvRjNC90LDRjyDQstC10YDRgdC40Y8g0YTQu9C10Ygt0L/Qu9C10LXRgNCwXG4gICAgICAgICAqIEB0eXBlIHtTdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICB2ZXJzaW9uOiBcIjkuMC4yOFwiLFxuICAgICAgICAvKipcbiAgICAgICAgICogSUQsINC60L7RgtC+0YDRi9C5INCx0YPQtNC10YIg0LLRi9GB0YLQsNCy0LvQtdC9INC00LvRjyDRjdC70LXQvNC10L3RgtCwINGBIEZsYXNoLdC/0LvQtdC10YDQvtC8XG4gICAgICAgICAqIEB0eXBlIHtTdHJpbmd9XG4gICAgICAgICAqL1xuICAgICAgICBwbGF5ZXJJRDogXCJZYW5kZXhBdWRpb0ZsYXNoUGxheWVyXCIsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQmNC80Y8g0YTRg9C90LrRhtC40Lgt0L7QsdGA0LDQsdC+0YLRh9C40LrQsCDRgdC+0LHRi9GC0LjQuSBGbGFzaC3Qv9C70LXQtdGA0LBcbiAgICAgICAgICogQHR5cGUge1N0cmluZ31cbiAgICAgICAgICogQGNvbnN0XG4gICAgICAgICAqL1xuICAgICAgICBjYWxsYmFjazogXCJ5YS5tdXNpYy5BdWRpby5fZmxhc2hDYWxsYmFja1wiLFxuICAgICAgICAvKipcbiAgICAgICAgICog0KLQsNC50LzQsNGD0YIg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LhcbiAgICAgICAgICogQHR5cGUge051bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIGluaXRUaW1lb3V0OiAzMDAwLCAvLyAzIHNlY1xuICAgICAgICAvKipcbiAgICAgICAgICog0KLQsNC50LzQsNGD0YIg0LfQsNCz0YDRg9C30LrQuFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgbG9hZFRpbWVvdXQ6IDUwMDAsXG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQotCw0LnQvNCw0YPRgiDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuCDQv9C+0YHQu9C1INC60LvQuNC60LBcbiAgICAgICAgICogQHR5cGUge051bWJlcn1cbiAgICAgICAgICovXG4gICAgICAgIGNsaWNrVGltZW91dDogMTAwMCxcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCY0L3RgtC10YDQstCw0Lsg0L/RgNC+0LLQtdGA0LrQuCDQtNC+0YHRgtGD0L/QvdC+0YHRgtC4IEZsYXNoLdC/0LvQtdC10YDQsFxuICAgICAgICAgKiBAdHlwZSB7TnVtYmVyfVxuICAgICAgICAgKi9cbiAgICAgICAgaGVhcnRCZWF0SW50ZXJ2YWw6IDEwMDBcbiAgICB9LFxuXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8vICBIVE1MNS3Qv9C70LXQtdGAXG5cbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4gICAgLyoqXG4gICAgICog0J7Qv9C40YHQsNC90LjQtSDQvdCw0YHRgtGA0L7QtdC6IEhUTUw1INC/0LvQtdC10YDQsC5cbiAgICAgKiBAbmFtZXNwYWNlXG4gICAgICovXG4gICAgaHRtbDU6IHtcbiAgICAgICAgLyoqXG4gICAgICAgICAqINCh0L/QuNGB0L7QuiDQuNC00LXQvdGC0LjRhNC40LrQsNGC0L7RgNC+0LIg0LTQu9GPINC60L7RgtC+0YDRi9GFINC70YPRh9GI0LUg0L3QtSDQuNGB0L/QvtC70YzQt9C+0LLQsNGC0YwgaHRtbDUg0L/Qu9C10LXRgC4g0JjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPINC/0YDQuFxuICAgICAgICAgKiDQsNCy0YLQvi3QvtC/0YDQtdC00LXQu9C10L3QuNC4INGC0LjQv9CwINC/0LvQtdC10YDQsC4g0JjQtNC10L3RgtC40YTQuNC60LDRgtC+0YDRiyDRgdGA0LDQstC90LjQstCw0Y7RgtGB0Y8g0YHQviDRgdGC0YDQvtC60L7QuSDQv9C+0YHRgtGA0L7QtdC90L3QvtC5INC/0L4g0YjQsNCx0LvQvtC90YNcbiAgICAgICAgICogYEAmbHQ7cGxhdGZvcm0udmVyc2lvbiZndDsgJmx0O3BsYXRmb3JtLm9zJmd0OzombHQ7YnJvd3Nlci5uYW1lJmd0Oy8mbHQ7YnJvd3Nlci52ZXJzaW9uJmd0O2BcbiAgICAgICAgICogQHR5cGUge0FycmF5LjxTdHJpbmc+fVxuICAgICAgICAgKi9cbiAgICAgICAgYmxhY2tsaXN0OiBbXCJsaW51eDptb3ppbGxhXCIsIFwidW5peDptb3ppbGxhXCIsIFwibWFjb3M6bW96aWxsYVwiLCBcIjpvcGVyYVwiLCBcIkBOVCA1XCIsIFwiQE5UIDRcIiwgXCI6bXNpZS85XCJdXG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBjb25maWc7XG4iLCJ2YXIgRXJyb3JDbGFzcyA9IHJlcXVpcmUoJy4uL2xpYi9jbGFzcy9lcnJvci1jbGFzcycpO1xuXG4vKipcbiAqIEBjbGFzcyBBdWRpb0Vycm9yXG4gKiBAYWxpYXMgeWEubXVzaWMuQXVkaW9+QXVkaW9FcnJvclxuICogQGNsYXNzZGVjcyDQmtC70LDRgdGBINC+0YjQuNCx0LrQuCDQsNGD0LTQuNC+0L/Qu9C70LXQtdGA0LAuXG4gKiBAZXh0ZW5kcyBFcnJvclxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2Ug0KLQtdC60YHRgiDQvtGI0LjQsdC60LguXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBBdWRpb0Vycm9yID0gZnVuY3Rpb24obWVzc2FnZSkge1xuICAgIEVycm9yQ2xhc3MuY2FsbCh0aGlzLCBtZXNzYWdlKTtcbn07XG5BdWRpb0Vycm9yLnByb3RvdHlwZSA9IEVycm9yQ2xhc3MuY3JlYXRlKFwiQXVkaW9FcnJvclwiKTtcblxuLyoqXG4gKiDQndC1INC90LDQudC00LXQvdCwINGA0LXQsNC70LjQt9Cw0YbQuNGPINC/0LvQtdC10YDQsCDQuNC70Lgg0LLQvtC30L3QuNC60LvQsCDQvtGI0LjQsdC60LAg0L/RgNC4INC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4INCy0YHQtdGFINC00L7RgdGC0YPQv9C90YvRhSDRgNC10LDQu9C40LfQsNGG0LjQuS5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5OT19JTVBMRU1FTlRBVElPTiA9IFwiY2Fubm90IGZpbmQgc3VpdGFibGUgaW1wbGVtZW50YXRpb25cIjtcbi8qKlxuICog0JDRg9C00LjQvtGE0LDQudC7INC90LUg0LHRi9C7INC/0YDQtdC00LfQsNCz0YDRg9C20LXQvSDQuNC70Lgg0LLQviDQstGA0LXQvNGPINC30LDQs9GA0YPQt9C60Lgg0L/RgNC+0LjQt9C+0YjQu9CwINC+0YjQuNCx0LrQsC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5OT1RfUFJFTE9BREVEID0gXCJ0cmFjayBpcyBub3QgcHJlbG9hZGVkXCI7XG4vKipcbiAqINCU0LXQudGB0YLQstC40LUg0L3QtdC00L7RgdGC0YPQv9C90L4g0LjQtyDRgtC10LrRg9GJ0LXQs9C+INGB0L7RgdGC0L7Rj9C90LjRjy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5CQURfU1RBVEUgPSBcImFjdGlvbiBpcyBub3QgcGVybWl0ZWQgZnJvbSBjdXJyZW50IHN0YXRlXCI7XG5cbi8qKlxuICogRmxhc2gt0L/Qu9C10LXRgCDQsdGL0Lsg0LfQsNCx0LvQvtC60LjRgNC+0LLQsNC9LlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0Vycm9yLkZMQVNIX0JMT0NLRVIgPSBcImZsYXNoIGlzIHJlamVjdGVkIGJ5IGZsYXNoIGJsb2NrZXIgcGx1Z2luXCI7XG4vKipcbiAqINCS0L7Qt9C90LjQutC70LAg0L7RiNC40LHQutCwINC/0YDQuCDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuCBGbGFzaC3Qv9C70LXQtdGA0LAg0L/QviDQvdC10LjQt9Cy0LXRgdGC0L3Ri9C8INC/0YDQuNGH0LjQvdCw0LwuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvRXJyb3IuRkxBU0hfVU5LTk9XTl9DUkFTSCA9IFwiZmxhc2ggaXMgY3Jhc2hlZCB3aXRob3V0IHJlYXNvblwiO1xuLyoqXG4gKiDQktC+0LfQvdC40LrQu9CwINC+0YjQuNCx0LrQsCDQv9GA0Lgg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LggRmxhc2gt0L/Qu9C10LXRgNCwINC40Lct0LfQsCDRgtCw0LnQvNCw0YPRgtCwLlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0Vycm9yLkZMQVNIX0lOSVRfVElNRU9VVCA9IFwiZmxhc2ggaW5pdCB0aW1lZCBvdXRcIjtcbi8qKlxuICog0JLQvdGD0YLRgNC10L3QvdGP0Y8g0L7RiNC40LHQutCwIEZsYXNoLdC/0LvQtdC10YDQsC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5GTEFTSF9JTlRFUk5BTF9FUlJPUiA9IFwiZmxhc2ggaW50ZXJuYWwgZXJyb3JcIjtcbi8qKlxuICog0J/QvtC/0YvRgtC60LAg0LLRi9C30LLQsNGC0Ywg0L3QtdC00L7RgdGC0YPQv9C90YvQuSDRjdC60LfQtdC80LvRj9GAIEZsYXNoLdC/0LvQtdC10YDQsC5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5GTEFTSF9FTU1JVEVSX05PVF9GT1VORCA9IFwiZmxhc2ggZXZlbnQgZW1taXRlciBub3QgZm91bmRcIjtcbi8qKlxuICogRmxhc2gt0L/Qu9C10LXRgCDQv9C10YDQtdGB0YLQsNC7INC+0YLQstC10YfQsNGC0Ywg0L3QsCDQt9Cw0L/RgNC+0YHRiy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9FcnJvci5GTEFTSF9OT1RfUkVTUE9ORElORyA9IFwiZmxhc2ggcGxheWVyIGRvZXNuJ3QgcmVzcG9uc2VcIjtcblxubW9kdWxlLmV4cG9ydHMgPSBBdWRpb0Vycm9yO1xuIiwicmVxdWlyZSgnLi4vZXhwb3J0Jyk7XG5cbnZhciBBdWRpb0Vycm9yID0gcmVxdWlyZSgnLi9hdWRpby1lcnJvcicpO1xudmFyIFBsYXliYWNrRXJyb3IgPSByZXF1aXJlKCcuL3BsYXliYWNrLWVycm9yJyk7XG5cbnlhLm11c2ljLkF1ZGlvLkF1ZGlvRXJyb3IgPSBBdWRpb0Vycm9yO1xueWEubXVzaWMuQXVkaW8uUGxheWJhY2tFcnJvciA9IFBsYXliYWNrRXJyb3I7XG4iLCJ2YXIgRXJyb3JDbGFzcyA9IHJlcXVpcmUoJy4uL2xpYi9jbGFzcy9lcnJvci1jbGFzcycpO1xuXG4vKipcbiAqIEBjbGFzcyBQbGF5YmFja0Vycm9yXG4gKiBAYWxpYXMgeWEubXVzaWMuQXVkaW9+UGxheWJhY2tFcnJvclxuICogQGNsYXNzZGVjcyDQmtC70LDRgdGBINC+0YjQuNCx0LrQuCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8uXG4gKiBAZXh0ZW5kcyBFcnJvclxuICogQHBhcmFtIFN0cmluZyBtZXNzYWdlINCi0LXQutGB0YIg0L7RiNC40LHQutC4LlxuICogQHBhcmFtIFN0cmluZyBzcmMg0KHRgdGL0LvQutCwINC90LAg0YLRgNC10LouXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBQbGF5YmFja0Vycm9yID0gZnVuY3Rpb24obWVzc2FnZSwgc3JjKSB7XG4gICAgRXJyb3JDbGFzcy5jYWxsKHRoaXMsIG1lc3NhZ2UpO1xuXG4gICAgdGhpcy5zcmMgPSBzcmM7XG59O1xuXG5QbGF5YmFja0Vycm9yLnByb3RvdHlwZSA9IEVycm9yQ2xhc3MuY3JlYXRlKFwiUGxheWJhY2tFcnJvclwiKTtcblxuLyoqXG4gKiDQntGC0LzQtdC90LAg0YHQvtC10LTQuNC90LXQvdC90LjRjy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuUGxheWJhY2tFcnJvci5DT05ORUNUSU9OX0FCT1JURUQgPSBcIkNvbm5lY3Rpb24gYWJvcnRlZFwiO1xuLyoqXG4gKiDQodC10YLQtdCy0LDRjyDQvtGI0LjQsdC60LAuXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cblBsYXliYWNrRXJyb3IuTkVUV09SS19FUlJPUiA9IFwiTmV0d29yayBlcnJvclwiO1xuLyoqXG4gKiDQntGI0LjQsdC60LAg0LTQtdC60L7QtNC40YDQvtCy0LDQvdC40Y8g0LDRg9C00LjQvi5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuUGxheWJhY2tFcnJvci5ERUNPREVfRVJST1IgPSBcIkRlY29kZSBlcnJvclwiO1xuLyoqXG4gKiDQndC10LTQvtGB0YLRg9C/0L3Ri9C5INC40YHRgtC+0YfQvdC40LouXG4gKiBAdHlwZSB7U3RyaW5nfVxuICogQGNvbnN0XG4gKi9cblBsYXliYWNrRXJyb3IuQkFEX0RBVEEgPSBcIkJhZCBkYXRhXCI7XG5cbi8qKlxuICog0J3QtSDQt9Cw0L/Rg9GB0LrQsNC10YLRgdGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtS5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuUGxheWJhY2tFcnJvci5ET05UX1NUQVJUID0gXCJQbGF5YmFjayBzdGFydCBlcnJvclwiO1xuXG4vKipcbiAqINCi0LDQsdC70LjRhtCwINGB0L7QvtGC0LLQtdGC0YHRgtCy0LjRjyDQutC+0LTQvtCyINC+0YjQuNCx0L7QuiBIVE1MNSDQv9C70LXQtdGA0LAuIFxuICogXG4gKiBAY29uc3RcbiAqIEB0eXBlIHtPYmplY3R9XG4gKi9cblBsYXliYWNrRXJyb3IuaHRtbDUgPSB7XG4gICAgMTogUGxheWJhY2tFcnJvci5DT05ORUNUSU9OX0FCT1JURUQsXG4gICAgMjogUGxheWJhY2tFcnJvci5ORVRXT1JLX0VSUk9SLFxuICAgIDM6IFBsYXliYWNrRXJyb3IuREVDT0RFX0VSUk9SLFxuICAgIDQ6IFBsYXliYWNrRXJyb3IuQkFEX0RBVEFcbn07XG5cbi8vVE9ETzog0YHQtNC10LvQsNGC0Ywg0LrQu9Cw0YHRgdC40YTQuNC60LDRgtC+0YAg0L7RiNC40LHQvtC6IGZsYXNoLdC/0LvQtdC10YDQsFxuXG5tb2R1bGUuZXhwb3J0cyA9IFBsYXliYWNrRXJyb3I7XG4iLCJpZiAodHlwZW9mIERFViA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHdpbmRvdy5ERVYgPSB0cnVlO1xufVxuXG5pZiAodHlwZW9mIHdpbmRvdy55YSA9PT0gXCJ1bmRlZmluZWRcIikge1xuICAgIHdpbmRvdy55YSA9IHt9O1xufVxuXG52YXIgeWEgPSB3aW5kb3cueWE7XG5cbmlmICh0eXBlb2YgeWEubXVzaWMgPT09IFwidW5kZWZpbmVkXCIpIHtcbiAgICB5YS5tdXNpYyA9IHt9O1xufVxuXG5pZiAodHlwZW9mIHlhLm11c2ljLkF1ZGlvID09PSBcInVuZGVmaW5lZFwiKSB7XG4gICAgeWEubXVzaWMuQXVkaW8gPSB7fTtcbn1cblxudmFyIGNvbmZpZyA9IHJlcXVpcmUoJy4vY29uZmlnJyk7XG52YXIgQXVkaW9QbGF5ZXIgPSByZXF1aXJlKCcuL2F1ZGlvLXBsYXllcicpO1xudmFyIFByb3h5ID0gcmVxdWlyZSgnLi9saWIvY2xhc3MvcHJveHknKTtcblxueWEubXVzaWMuQXVkaW8gPSBQcm94eS5jcmVhdGVDbGFzcyhBdWRpb1BsYXllcik7XG55YS5tdXNpYy5BdWRpby5jb25maWcgPSBjb25maWc7XG5cbm1vZHVsZS5leHBvcnRzID0geWEubXVzaWMuQXVkaW87XG4iLCJ2YXIgY29uZmlnID0gcmVxdWlyZSgnLi4vY29uZmlnJyk7XG52YXIgc3dmb2JqZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvc3dmb2JqZWN0Jyk7XG52YXIgZGV0ZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvZGV0ZWN0Jyk7XG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2xvZ2dlcicpO1xudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoJ0F1ZGlvRmxhc2gnKTtcbnZhciBGbGFzaE1hbmFnZXIgPSByZXF1aXJlKCcuL2ZsYXNoLW1hbmFnZXInKTtcbnZhciBGbGFzaEludGVyZmFjZSA9IHJlcXVpcmUoJy4vZmxhc2gtaW50ZXJmYWNlJyk7XG52YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vbGliL2FzeW5jL2V2ZW50cycpO1xuXG52YXIgcGxheWVySWQgPSAxO1xuXG52YXIgZmxhc2hNYW5hZ2VyO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J/RgNC+0LLQtdGA0LrQsCDQtNC+0YHRgtGD0L/QvdC+0YHRgtC4IGZsYXNoLdC/0LvQtdC10YDQsFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG52YXIgZmxhc2hWZXJzaW9uID0gc3dmb2JqZWN0LmdldEZsYXNoUGxheWVyVmVyc2lvbigpO1xuZGV0ZWN0LmZsYXNoVmVyc2lvbiA9IGZsYXNoVmVyc2lvbi5tYWpvciArIFwiLlwiICsgZmxhc2hWZXJzaW9uLm1pbm9yICsgXCIuXCIgKyBmbGFzaFZlcnNpb24ucmVsZWFzZTtcblxuZXhwb3J0cy5hdmFpbGFibGUgPSBzd2ZvYmplY3QuaGFzRmxhc2hQbGF5ZXJWZXJzaW9uKGNvbmZpZy5mbGFzaC52ZXJzaW9uKTtcbmxvZ2dlci5pbmZvKHRoaXMsIFwiZGV0ZWN0aW9uXCIsIGV4cG9ydHMuYXZhaWxhYmxlKTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCa0L7QvdGB0YLRgNGD0LrRgtC+0YBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAY2xhc3NkZXNjINCa0LvQsNGB0YEgZmxhc2gg0LDRg9C00LjQvi3Qv9C70LXQtdGA0LBcbiAqIEBleHRlbmRzIElBdWRpb0ltcGxlbWVudGF0aW9uXG4gKlxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1BMQVlcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9FTkRFRFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1ZPTFVNRVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0NSQVNIRURcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9TV0FQXG4gKlxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1NUT1BcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9QQVVTRVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1BST0dSRVNTXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jRVZFTlRfTE9BRElOR1xuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0xPQURFRFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0VSUk9SXG4gKlxuICogQHBhcmFtIHtIVE1MRWxlbWVudH0gW292ZXJsYXldIC0g0LzQtdGB0YLQviDQtNC70Y8g0LLRgdGC0YDQsNC40LLQsNC90LjRjyDQv9C70LXQtdGA0LAgKNCw0LrRgtGD0LDQu9GM0L3QviDRgtC+0LvRjNC60L4g0LTQu9GPIGZsYXNoLdC/0LvQtdC10YDQsClcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gW2ZvcmNlPWZhbHNlXSAtINGB0L7Qt9C00LDRgtGMINC90L7QstGL0Lkg0Y3QutC30LXQv9C70Y/RgCBGbGFzaE1hbmFnZXJcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIEF1ZGlvRmxhc2ggPSBmdW5jdGlvbihvdmVybGF5LCBmb3JjZSkge1xuICAgIHRoaXMubmFtZSA9IHBsYXllcklkKys7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcImNvbnN0cnVjdG9yXCIpO1xuXG4gICAgaWYgKCFmbGFzaE1hbmFnZXIgfHwgZm9yY2UpIHtcbiAgICAgICAgZmxhc2hNYW5hZ2VyID0gbmV3IEZsYXNoTWFuYWdlcihvdmVybGF5KTtcbiAgICB9XG5cbiAgICBFdmVudHMuY2FsbCh0aGlzKTtcblxuICAgIHRoaXMud2hlblJlYWR5ID0gZmxhc2hNYW5hZ2VyLmNyZWF0ZVBsYXllcih0aGlzKTtcbiAgICB0aGlzLndoZW5SZWFkeS50aGVuKGZ1bmN0aW9uKGRhdGEpIHtcbiAgICAgICAgbG9nZ2VyLmluZm8odGhpcywgXCJyZWFkeVwiLCBkYXRhKTtcbiAgICB9LmJpbmQodGhpcyksIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIFwiZmFpbGVkXCIsIGUpO1xuICAgIH0uYmluZCh0aGlzKSk7XG59O1xuRXZlbnRzLm1peGluKEF1ZGlvRmxhc2gpO1xuXG5leHBvcnRzLnR5cGUgPSBBdWRpb0ZsYXNoLnR5cGUgPSBBdWRpb0ZsYXNoLnByb3RvdHlwZS50eXBlID0gXCJmbGFzaFwiO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0KHQvtC30LTQsNC90LjQtSDQvNC10YLQvtC00L7QsiDRgNCw0LHQvtGC0Ysg0YEg0L/Qu9C10LXRgNC+0LxcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuT2JqZWN0LmtleXMoRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlKS5maWx0ZXIoZnVuY3Rpb24oa2V5KSB7XG4gICAgcmV0dXJuIEZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eShrZXkpICYmIGtleVswXSAhPT0gXCJfXCI7XG59KS5tYXAoZnVuY3Rpb24obWV0aG9kKSB7XG4gICAgQXVkaW9GbGFzaC5wcm90b3R5cGVbbWV0aG9kXSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIS9eZ2V0Ly50ZXN0KG1ldGhvZCkpIHtcbiAgICAgICAgICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgbWV0aG9kKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICghdGhpcy5oYXNPd25Qcm9wZXJ0eShcImlkXCIpKSB7XG4gICAgICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInBsYXllciBpcyBub3QgcmVhZHlcIik7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgfVxuXG4gICAgICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICBhcmdzLnVuc2hpZnQodGhpcy5pZCk7XG4gICAgICAgIHJldHVybiBmbGFzaE1hbmFnZXIuZmxhc2hbbWV0aG9kXS5hcHBseShmbGFzaE1hbmFnZXIuZmxhc2gsIGFyZ3MpO1xuICAgIH1cbn0pO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAgSlNET0NcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQn9GA0L7QuNCz0YDQsNGC0Ywg0YLRgNC10LpcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNwbGF5XG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dIC0g0JTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LAgKNC90LUg0LjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPKVxuICovXG5cbi8qKlxuICog0J/QvtGB0YLQsNCy0LjRgtGMINGC0YDQtdC6INC90LAg0L/QsNGD0LfRg1xuICogQG1ldGhvZCBBdWRpb0ZsYXNoI3BhdXNlXG4gKi9cblxuLyoqXG4gKiDQodC90Y/RgtGMINGC0YDQtdC6INGBINC/0LDRg9C30YtcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNyZXN1bWVcbiAqL1xuXG4vKipcbiAqINCe0YHRgtCw0L3QvtCy0LjRgtGMINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtSDQuCDQt9Cw0LPRgNGD0LfQutGDINGC0YDQtdC60LBcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNzdG9wXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INC00LvRjyDRgtC10LrRg9GJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwLCAxOiDQtNC70Y8g0YHQu9C10LTRg9GO0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LBcbiAqL1xuXG4vKipcbiAqINCf0YDQtdC00LfQsNCz0YDRg9C30LjRgtGMINGC0YDQtdC6XG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjcHJlbG9hZFxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINCh0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge051bWJlcn0gW2R1cmF0aW9uXSAtINCU0LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwICjQvdC1INC40YHQv9C+0LvRjNC30YPQtdGC0YHRjylcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKi9cblxuLyoqXG4gKiDQn9GA0L7QstC10YDQuNGC0Ywg0YfRgtC+INGC0YDQtdC6INC/0YDQtdC00LfQsNCz0YDRg9C20LDQtdGC0YHRj1xuICogQG1ldGhvZCBBdWRpb0ZsYXNoI2lzUHJlbG9hZGVkXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqL1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDRh9GC0L4g0YLRgNC10Log0L/RgNC10LTQt9Cw0LPRgNGD0LbQsNC10YLRgdGPXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqL1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDRh9GC0L4g0YLRgNC10Log0L3QsNGH0LDQuyDQv9GA0LXQtNC30LDQs9GA0YPQttCw0YLRjNGB0Y9cbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNpc1ByZWxvYWRpbmdcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5cbi8qKlxuICog0JfQsNC/0YPRgdGC0LjRgtGMINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtSDQv9GA0LXQtNC30LDQs9GA0YPQttC10L3QvdC+0LPQviDRgtGA0LXQutCwXG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjcGxheVByZWxvYWRlZFxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtib29sZWFufSAtLSDQtNC+0YHRgtGD0L/QvdC+0YHRgtGMINC00LDQvdC90L7Qs9C+INC00LXQudGB0YLQstC40Y9cbiAqL1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0L/QvtC30LjRhtC40Y4g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjZ2V0UG9zaXRpb25cbiAqIEByZXR1cm5zIHtudW1iZXJ9XG4gKi9cblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDRgtC10LrRg9GJ0YPRjiDQv9C+0LfQuNGG0LjRjiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNzZXRQb3NpdGlvblxuICogQHBhcmFtIHtudW1iZXJ9IHBvc2l0aW9uXG4gKi9cblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwXG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjZ2V0RHVyYXRpb25cbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4INGC0YDQtdC60LBcbiAqIEBtZXRob2QgQXVkaW9GbGFzaCNnZXRMb2FkZWRcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDRgtC10LrRg9GJ0LXQtSDQt9C90LDRh9C10L3QuNC1INCz0YDQvtC80LrQvtGB0YLQuFxuICogQG1ldGhvZCBBdWRpb0ZsYXNoI2dldFZvbHVtZVxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LjRgtGMINC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4XG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjc2V0Vm9sdW1lXG4gKiBAcGFyYW0ge251bWJlcn0gdm9sdW1lXG4gKi9cblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINGB0YHRi9C70LrRgyDQvdCwINGC0YDQtdC6XG4gKiBAbWV0aG9kIEF1ZGlvRmxhc2gjZ2V0U3JjXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge1N0cmluZ3xCb29sZWFufSAtLSDQodGB0YvQu9C60LAg0L3QsCDRgtGA0LXQuiDQuNC70LggZmFsc2UsINC10YHQu9C4INC90LXRgiDQt9Cw0LPRgNGD0LbQsNC10LzQvtCz0L4g0YLRgNC10LrQsFxuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQn9C+0LvRg9GH0LXQvdC40LUg0LTQsNC90L3Ri9GFINC+INC/0LvQtdC10YDQtVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDQtNC+0YHRgtGD0L/QtdC9INC70Lgg0L/RgNC+0LPRgNCw0LzQvNC90YvQuSDQutC+0L3RgtGA0L7Qu9GMINCz0YDQvtC80LrQvtGB0YLQuFxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbkF1ZGlvRmxhc2gucHJvdG90eXBlLmlzRGV2aWNlVm9sdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCb0L7Qs9Cz0LjRgNC+0LLQsNC90LjQtVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCS0YHQv9C+0LzQvtCz0LDRgtC10LvRjNC90LDRjyDRhNGD0L3QutGG0LjRjyDQtNC70Y8g0L7RgtC+0LHRgNCw0LbQtdC90LjRjyDRgdC+0YHRgtC+0Y/QvdC40Y8g0L/Qu9C10LXRgNCwINCyINC70L7Qs9C1LlxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9GbGFzaC5wcm90b3R5cGUuX2xvZ2dlciA9IGZ1bmN0aW9uKCkge1xuICAgIHRyeSB7XG4gICAgICAgIGlmICghdGhpcy5oYXNPd25Qcm9wZXJ0eShcImlkXCIpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICAgIG1haW46IFwibm90IHJlYWR5XCIsXG4gICAgICAgICAgICAgICAgcHJlbG9hZGVyOiBcIm5vdCByZWFkeVwiXG4gICAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBtYWluOiBsb2dnZXIuX3Nob3dVcmwodGhpcy5nZXRTcmMoMCkpLFxuICAgICAgICAgICAgcHJlbG9hZGVyOiBsb2dnZXIuX3Nob3dVcmwodGhpcy5nZXRTcmMoMSkpXG4gICAgICAgIH07XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIHJldHVybiBcIlwiO1xuICAgIH1cbn07XG5cbmV4cG9ydHMuQXVkaW9JbXBsZW1lbnRhdGlvbiA9IEF1ZGlvRmxhc2g7XG4iLCJ2YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2xvZ2dlcicpO1xudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoJ0ZsYXNoSW50ZXJmYWNlJyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQmtC+0L3RgdGC0YDRg9C60YLQvtGAXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQGNsYXNzZGVzYyDQntC/0LjRgdCw0L3QuNC1INCy0L3QtdGI0L3QtdCz0L4g0LjQvdGC0LXRgNGE0LXQudGB0LAgZmxhc2gt0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge09iamVjdH0gZmxhc2ggLSBzd2Yt0L7QsdGK0LXQutGCXG4gKiBAY29uc3RydWN0b3JcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBGbGFzaEludGVyZmFjZSA9IGZ1bmN0aW9uKGZsYXNoKSB7XG4gICAgLy9GSVhNRTog0L3Rg9C20L3QviDQv9GA0LjQtNGD0LzQsNGC0Ywg0L3QvtGA0LzQsNC70YzQvdGL0Lkg0LzQtdGC0L7QtCDRjdC60YHQv9C+0YDRgtCwXG4gICAgdGhpcy5mbGFzaCA9IHlhLm11c2ljLkF1ZGlvLl9mbGFzaCA9IGZsYXNoO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCe0LHRidC10L3QuNC1INGBIGZsYXNoLdC/0LvQtdC10YDQvtC8XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0JLRi9C30LLQsNGC0Ywg0LzQtdGC0L7QtCBmbGFzaC3Qv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBmbiAtINC90LDQt9Cy0LDQvdC40LUg0LzQtdGC0L7QtNCwXG4gKiBAcmV0dXJucyB7Kn1cbiAqIEBwcml2YXRlXG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5fY2FsbEZsYXNoID0gZnVuY3Rpb24oZm4pIHtcbiAgICAvL0RFViAmJiBsb2dnZXIuZGVidWcodGhpcywgZm4sIGFyZ3VtZW50cyk7XG5cbiAgICB0cnkge1xuICAgICAgICByZXR1cm4gdGhpcy5mbGFzaC5jYWxsLmFwcGx5KHRoaXMuZmxhc2gsIGFyZ3VtZW50cyk7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcih0aGlzLCBcIl9jYWxsRmxhc2hFcnJvclwiLCBlLCBhcmd1bWVudHNbMF0sIGFyZ3VtZW50c1sxXSwgYXJndW1lbnRzWzJdKTtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQn9GA0L7QstC10YDQutCwINC+0LHRgNCw0YLQvdC+0Lkg0YHQstGP0LfQuCDRgSBmbGFzaC3Qv9C70LXQtdGA0L7QvFxuICogQHRocm93cyDQntGI0LjQsdC60LAg0LTQvtGB0YLRg9C/0LAg0LogZmxhc2gt0L/Qu9C10LXRgNGDXG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuX2hlYXJ0QmVhdCA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX2NhbGxGbGFzaChcImhlYXJ0QmVhdFwiLCAtMSk7XG59O1xuXG4vKipcbiAqINCU0L7QsdCw0LLQuNGC0Ywg0L3QvtCy0YvQuSDQv9C70LXQtdGAXG4gKiBAcmV0dXJucyB7aW50fSAtLSBpZCDQvdC+0LLQvtCz0L4g0L/Qu9C10LXRgNCwXG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuX2FkZFBsYXllciA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLl9jYWxsRmxhc2goXCJhZGRQbGF5ZXJcIiwgLTEpO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCc0LXRgtC+0LTRiyDRg9C/0YDQsNCy0LvQtdC90LjRjyDQv9C70LXQtdGA0L7QvFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LjRgtGMINCz0YDQvtC80LrQvtGB0YLRjFxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge051bWJlcn0gdm9sdW1lIC0g0LbQtdC70LDQtdC80LDRjyDQs9GA0L7QvNC60L7RgdGC0YxcbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLnNldFZvbHVtZSA9IGZ1bmN0aW9uKGlkLCB2b2x1bWUpIHtcbiAgICB0aGlzLl9jYWxsRmxhc2goXCJzZXRWb2x1bWVcIiwgLTEsIHZvbHVtZSk7XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0LfQvdCw0YfQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LhcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5nZXRWb2x1bWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwiZ2V0Vm9sdW1lXCIsIC0xKTtcbn07XG5cbi8qKlxuICog0JfQsNC/0YPRgdGC0LjRgtGMINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtSDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtOdW1iZXJ9IGR1cmF0aW9uIC0g0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LBcbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbihpZCwgc3JjLCBkdXJhdGlvbikge1xuICAgIHRoaXMuX2NhbGxGbGFzaChcInBsYXlcIiwgaWQsIHNyYywgZHVyYXRpb24pO1xufTtcblxuLyoqXG4gKiDQntGB0YLQsNC90L7QstC40YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0Lgg0LfQsNCz0YDRg9C30LrRgyDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0LTQu9GPINGC0LXQutGD0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LAsIDE6INC00LvRjyDRgdC70LXQtNGD0Y7RidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsFxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKGlkLCBvZmZzZXQpIHtcbiAgICB0aGlzLl9jYWxsRmxhc2goXCJzdG9wXCIsIGlkLCBvZmZzZXQgfHwgMCk7XG59O1xuXG4vKipcbiAqINCf0L7RgdGC0LDQstC40YLRjCDRgtGA0LXQuiDQvdCwINC/0LDRg9C30YNcbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbihpZCkge1xuICAgIHRoaXMuX2NhbGxGbGFzaChcInBhdXNlXCIsIGlkKTtcbn07XG5cbi8qKlxuICog0KHQvdGP0YLRjCDRgtGA0LXQuiDRgSDQv9Cw0YPQt9GLXG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLnJlc3VtZSA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgdGhpcy5fY2FsbEZsYXNoKFwicmVzdW1lXCIsIGlkKTtcbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQv9C+0LfQuNGG0LjRjiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHJldHVybnMge051bWJlcn1cbiAqL1xuRmxhc2hJbnRlcmZhY2UucHJvdG90eXBlLmdldFBvc2l0aW9uID0gZnVuY3Rpb24oaWQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwiZ2V0UG9zaXRpb25cIiwgaWQpO1xufTtcblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDRgtC10LrRg9GJ0YPRjiDQv9C+0LfQuNGG0LjRjiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtudW1iZXJ9IHBvc2l0aW9uXG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5zZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKGlkLCBwb3NpdGlvbikge1xuICAgIHRoaXMuX2NhbGxGbGFzaChcInNldFBvc2l0aW9uXCIsIGlkLCBwb3NpdGlvbik7XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LBcbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5nZXREdXJhdGlvbiA9IGZ1bmN0aW9uKGlkLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwiZ2V0RHVyYXRpb25cIiwgaWQsIG9mZnNldCB8fCAwKTtcbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQtNC70LjRgtC10LvRjNC90L7RgdGC0Ywg0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4INGC0YDQtdC60LBcbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtOdW1iZXJ9XG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5nZXRMb2FkZWQgPSBmdW5jdGlvbihpZCwgb2Zmc2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhbGxGbGFzaChcImdldExvYWRlZFwiLCBpZCwgb2Zmc2V0IHx8IDApO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCf0YDQtdC00LfQsNCz0YDRg9C30LrQsFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCf0YDQtdC00LfQsNCz0YDRg9C30LjRgtGMINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gaWQgLSBpZCDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtOdW1iZXJ9IGR1cmF0aW9uIC0g0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0LTQu9GPINGC0LXQutGD0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LAsIDE6INC00LvRjyDRgdC70LXQtNGD0Y7RidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsFxuICogQHJldHVybnMge0Jvb2xlYW59IC0tINCy0L7Qt9C80L7QttC90L7RgdGC0Ywg0LTQsNC90L3QvtCz0L4g0LTQtdC50YHRgtCy0LjRj1xuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUucHJlbG9hZCA9IGZ1bmN0aW9uKGlkLCBzcmMsIGR1cmF0aW9uLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwicHJlbG9hZFwiLCBpZCwgc3JjLCBkdXJhdGlvbiwgb2Zmc2V0ID09IG51bGwgPyAxIDogb2Zmc2V0KTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQv9GA0LXQtNC30LDQs9GA0YPQttCw0LXRgtGB0Y9cbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INC00LvRjyDRgtC10LrRg9GJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwLCAxOiDQtNC70Y8g0YHQu9C10LTRg9GO0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LBcbiAqIEByZXR1cm5zIHtCb29sZWFufVxuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUuaXNQcmVsb2FkZWQgPSBmdW5jdGlvbihpZCwgc3JjLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwiaXNQcmVsb2FkZWRcIiwgaWQsIHNyYywgb2Zmc2V0ID09IG51bGwgPyAxIDogb2Zmc2V0KTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQvdCw0YfQsNC7INC/0YDQtdC00LfQsNCz0YDRg9C20LDRgtGM0YHRj1xuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0YHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0LTQu9GPINGC0LXQutGD0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LAsIDE6INC00LvRjyDRgdC70LXQtNGD0Y7RidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsFxuICogQHJldHVybnMge0Jvb2xlYW59XG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5pc1ByZWxvYWRpbmcgPSBmdW5jdGlvbihpZCwgc3JjLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwiaXNQcmVsb2FkaW5nXCIsIGlkLCBzcmMsIG9mZnNldCA9PSBudWxsID8gMSA6IG9mZnNldCk7XG59O1xuXG4vKipcbiAqINCX0LDQv9GD0YHRgtC40YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0L/RgNC10LTQt9Cw0LPRgNGD0LbQtdC90L3QvtCz0L4g0YLRgNC10LrQsFxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge2Jvb2xlYW59IC0tINC00L7RgdGC0YPQv9C90L7RgdGC0Ywg0LTQsNC90L3QvtCz0L4g0LTQtdC50YHRgtCy0LjRj1xuICovXG5GbGFzaEludGVyZmFjZS5wcm90b3R5cGUucGxheVByZWxvYWRlZCA9IGZ1bmN0aW9uKGlkLCBvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fY2FsbEZsYXNoKFwicGxheVByZWxvYWRlZFwiLCBpZCwgb2Zmc2V0ID09IG51bGwgPyAxIDogb2Zmc2V0KTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQn9C+0LvRg9GH0LXQvdC40LUg0LTQsNC90L3Ri9GFINC+INC/0LvQtdC10YDQtVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0YHRgdGL0LvQutGDINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7aW50fSBpZCAtIGlkINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MF0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtTdHJpbmd9XG4gKi9cbkZsYXNoSW50ZXJmYWNlLnByb3RvdHlwZS5nZXRTcmMgPSBmdW5jdGlvbihpZCwgb2Zmc2V0KSB7XG4gICAgcmV0dXJuIHRoaXMuX2NhbGxGbGFzaChcImdldFNyY1wiLCBpZCwgb2Zmc2V0IHx8IDApO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGbGFzaEludGVyZmFjZTtcbiIsInZhciBMb2dnZXIgPSByZXF1aXJlKCcuLi9sb2dnZXIvbG9nZ2VyJyk7XG52YXIgbG9nZ2VyID0gbmV3IExvZ2dlcignRmxhc2hNYW5hZ2VyJyk7XG5cbnZhciBjb25maWcgPSByZXF1aXJlKCcuLi9jb25maWcnKTtcblxudmFyIEF1ZGlvU3RhdGljID0gcmVxdWlyZSgnLi4vYXVkaW8tc3RhdGljJyk7XG52YXIgZmxhc2hMb2FkZXIgPSByZXF1aXJlKCcuL2xvYWRlcicpO1xudmFyIEZsYXNoSW50ZXJmYWNlID0gcmVxdWlyZSgnLi9mbGFzaC1pbnRlcmZhY2UnKTtcblxudmFyIFByb21pc2UgPSByZXF1aXJlKCcuLi9saWIvYXN5bmMvcHJvbWlzZScpO1xudmFyIERlZmVycmVkID0gcmVxdWlyZSgnLi4vbGliL2FzeW5jL2RlZmVycmVkJyk7XG5cbnZhciBBdWRpb0Vycm9yID0gcmVxdWlyZSgnLi4vZXJyb3IvYXVkaW8tZXJyb3InKTtcbnZhciBMb2FkZXJFcnJvciA9IHJlcXVpcmUoJy4uL2xpYi9uZXQvZXJyb3IvbG9hZGVyLWVycm9yJyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQmtC+0L3RgdGC0YDRg9C60YLQvtGAXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQGNsYXNzZGVzYyDQl9Cw0LPRgNGD0LfQutCwIGZsYXNoLdC/0LvQtdC10YDQsCDQuCDQvtCx0YDQsNCx0L7RgtC60LAg0YHQvtCx0YvRgtC40LlcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IG92ZXJsYXkgLSDQvtCx0YrQtdC60YIg0LTQu9GPINC30LDQs9GA0YPQt9C60Lgg0Lgg0L/QvtC60LDQt9CwIGZsYXNoLdC/0LvQtdC10YDQsFxuICogQGNvbnN0cnVjdG9yXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgRmxhc2hNYW5hZ2VyID0gZnVuY3Rpb24ob3ZlcmxheSkgeyAvLyBzaW5nbGV0b24hXG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcImNvbnN0cnVjdG9yXCIsIG92ZXJsYXkpO1xuXG4gICAgdGhpcy5zdGF0ZSA9IFwiaW5pdFwiO1xuICAgIHRoaXMub3ZlcmxheSA9IG92ZXJsYXk7XG4gICAgdGhpcy5lbW1pdGVycyA9IFtdO1xuXG4gICAgdmFyIGRlZmVycmVkID0gdGhpcy5kZWZlcnJlZCA9IG5ldyBEZWZlcnJlZCgpO1xuICAgIC8qKlxuICAgICAqINCe0LHQtdGJ0LDQvdC40LUsINC60L7RgtC+0YDQvtC1INGA0LDQt9GA0LXRiNCw0LXRgtGB0Y8g0L/RgNC4INC30LDQstC10YDRiNC10L3QuNC4INC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4XG4gICAgICogQHR5cGUge1Byb21pc2V9XG4gICAgICovXG4gICAgdGhpcy53aGVuUmVhZHkgPSB0aGlzLmRlZmVycmVkLnByb21pc2UoKTtcblxuICAgIHZhciBjYWxsYmFja1BhdGggPSBjb25maWcuZmxhc2guY2FsbGJhY2suc3BsaXQoXCIuXCIpO1xuICAgIHZhciBjYWxsYmFja05hbWUgPSBjYWxsYmFja1BhdGgucG9wKCk7XG4gICAgdmFyIGNhbGxiYWNrQ29udCA9IHdpbmRvdztcbiAgICBjYWxsYmFja1BhdGguZm9yRWFjaChmdW5jdGlvbihwYXJ0KSB7XG4gICAgICAgIGlmICghY2FsbGJhY2tDb250W3BhcnRdKSB7XG4gICAgICAgICAgICBjYWxsYmFja0NvbnRbcGFydF0gPSB7fTtcbiAgICAgICAgfVxuICAgICAgICBjYWxsYmFja0NvbnQgPSBjYWxsYmFja0NvbnRbcGFydF07XG4gICAgfSk7XG4gICAgY2FsbGJhY2tDb250W2NhbGxiYWNrTmFtZV0gPSB0aGlzLl9vbkV2ZW50LmJpbmQodGhpcyk7XG5cbiAgICB0aGlzLl9fbG9hZFRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuX29uTG9hZFRpbWVvdXQuYmluZCh0aGlzKSwgY29uZmlnLmZsYXNoLmxvYWRUaW1lb3V0KTtcbiAgICBmbGFzaExvYWRlcihjb25maWcuZmxhc2gucGF0aCArIFwiL1wiXG4gICAgICAgICsgY29uZmlnLmZsYXNoLm5hbWUsIGNvbmZpZy5mbGFzaC52ZXJzaW9uLCBjb25maWcuZmxhc2gucGxheWVySUQsIHRoaXMuX29uTG9hZC5iaW5kKHRoaXMpLCB7fSwgb3ZlcmxheSk7XG5cbiAgICBpZiAob3ZlcmxheSkge1xuICAgICAgICB2YXIgdGltZW91dDtcbiAgICAgICAgb3ZlcmxheS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIGZ1bmN0aW9uKCkgeyAvL0tOT1dMRURHRTogb25seSBtb3VzZWRvd24gZXZlbnQgYW5kIG9ubHkgd21vZGU6IHRyYW5zcGFyZW50XG4gICAgICAgICAgICB0aW1lb3V0ID0gdGltZW91dCB8fCBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgICAgICBkZWZlcnJlZC5yZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5GTEFTSF9OT1RfUkVTUE9ORElORykpO1xuICAgICAgICAgICAgICAgIH0sIGNvbmZpZy5mbGFzaC5jbGlja1RpbWVvdXQpO1xuICAgICAgICB9LCB0cnVlKTtcbiAgICB9XG5cbiAgICB0aGlzLndoZW5SZWFkeS50aGVuKGZ1bmN0aW9uKHJlc3VsdCkge1xuICAgICAgICB0aW1lb3V0ID0gdGltZW91dCAmJiBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwicmVhZHlcIiwgcmVzdWx0KTtcbiAgICB9LmJpbmQodGhpcyksIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIFwiZmFpbGVkXCIsIGUpO1xuICAgIH0uYmluZCh0aGlzKSk7XG59O1xuXG5GbGFzaE1hbmFnZXIuRVZFTlRfSU5JVCA9IFwiaW5pdFwiO1xuRmxhc2hNYW5hZ2VyLkVWRU5UX0ZBSUwgPSBcImZhaWxlZFwiO1xuRmxhc2hNYW5hZ2VyLkVWRU5UX0VSUk9SID0gXCJlcnJvclwiO1xuRmxhc2hNYW5hZ2VyLkVWRU5UX0RFQlVHID0gXCJkZWJ1Z1wiO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J7QsdGA0LDQsdC+0YLRh9C40LrQuCDRgdC+0LHRi9GC0LjQuSDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuCBmbGFzaFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCe0LHRgNCw0LHQvtGC0YfQuNC6INGB0L7QsdGL0YLQuNGPINC30LDQs9GA0YPQt9C60Lgg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0gZGF0YVxuICogQHByaXZhdGVcbiAqL1xuRmxhc2hNYW5hZ2VyLnByb3RvdHlwZS5fb25Mb2FkID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJfb25Mb2FkXCIsIGRhdGEpO1xuXG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX19sb2FkVGltZW91dCk7XG4gICAgZGVsZXRlIHRoaXMuX19sb2FkVGltZW91dDtcblxuICAgIGlmIChkYXRhLnN1Y2Nlc3MpIHtcbiAgICAgICAgdGhpcy5mbGFzaCA9IG5ldyBGbGFzaEludGVyZmFjZShkYXRhLnJlZik7XG5cbiAgICAgICAgaWYgKHRoaXMuc3RhdGUgPT09IFwicmVhZHlcIikge1xuICAgICAgICAgICAgdGhpcy5kZWZlcnJlZC5yZXNvbHZlKGRhdGEucmVmKTtcbiAgICAgICAgfSBlbHNlIGlmICghdGhpcy5vdmVybGF5KSB7XG4gICAgICAgICAgICB0aGlzLl9faW5pdFRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMuX29uSW5pdFRpbWVvdXQuYmluZCh0aGlzKSwgY29uZmlnLmZsYXNoLmluaXRUaW1lb3V0KTtcbiAgICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuc3RhdGUgPSBcImZhaWxlZFwiO1xuICAgICAgICB0aGlzLmRlZmVycmVkLnJlamVjdChuZXcgQXVkaW9FcnJvcihkYXRhLl9fZmJuID8gQXVkaW9FcnJvci5GTEFTSF9CTE9DS0VSIDogQXVkaW9FcnJvci5GTEFTSF9VTktOT1dOX0NSQVNIKSk7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtGH0LjQuiDRgtCw0LnQvNCw0YPRgtCwINC30LDQs9GA0YPQt9C60LhcbiAqIEBwcml2YXRlXG4gKi9cbkZsYXNoTWFuYWdlci5wcm90b3R5cGUuX29uTG9hZFRpbWVvdXQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnN0YXRlID0gXCJmYWlsZWRcIjtcbiAgICB0aGlzLmRlZmVycmVkLnJlamVjdChuZXcgTG9hZGVyRXJyb3IoTG9hZGVyRXJyb3IuVElNRU9VVCkpO1xufTtcblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtGH0LjQuiDRgtCw0LnQvNCw0YPRgtCwINC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4XG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLl9vbkluaXRUaW1lb3V0ID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zdGF0ZSA9IFwiZmFpbGVkXCI7XG4gICAgdGhpcy5kZWZlcnJlZC5yZWplY3QobmV3IEF1ZGlvRXJyb3IoQXVkaW9FcnJvci5GTEFTSF9JTklUX1RJTUVPVVQpKTtcbn07XG5cbi8qKlxuICog0J7QsdGA0LDQsdC+0YLRh9C40Log0YPRgdC/0LXRiNC90L7RgdGC0Lgg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LhcbiAqIEBwcml2YXRlXG4gKi9cbkZsYXNoTWFuYWdlci5wcm90b3R5cGUuX29uSW5pdCA9IGZ1bmN0aW9uKCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJfb25Jbml0XCIpO1xuXG4gICAgdGhpcy5zdGF0ZSA9IFwicmVhZHlcIjtcblxuICAgIGlmICh0aGlzLl9faW5pdFRpbWVvdXQpIHtcbiAgICAgICAgY2xlYXJUaW1lb3V0KHRoaXMuX19pbml0VGltZW91dCk7XG4gICAgICAgIGRlbGV0ZSB0aGlzLl9faW5pdFRpbWVvdXQ7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuZmxhc2gpIHtcbiAgICAgICAgdGhpcy5kZWZlcnJlZC5yZXNvbHZlKHRoaXMuZmxhc2gpO1xuICAgICAgICB0aGlzLl9faGVhcnRiZWF0ID0gc2V0SW50ZXJ2YWwodGhpcy5fb25IZWFydEJlYXQuYmluZCh0aGlzKSwgMTAwMCk7XG4gICAgfVxufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCe0LHRgNCw0LHQvtGC0YfQuNC60Lgg0YHQvtCx0YvRgtC40LkgZmxhc2gt0L/Qu9C10LXRgNCwXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0J7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40LksINGB0L7Qt9C00LDQstCw0LXQvNGL0YUgZmxhc2gt0L/Qu9C10LXRgNC+0LxcbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudFxuICogQHBhcmFtIHtpbnR9IGlkIC0gaWQg0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge2ludH0gb2Zmc2V0IC0gMDog0LTQu9GPINGC0LXQutGD0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LAsIDE6INC00LvRjyDRgdC70LXQtNGD0Y7RidC10LPQviDQt9Cw0LPRgNGD0LfRh9C40LrQsFxuICogQHBhcmFtIHsqfSBkYXRhIC0g0LTQsNC90L3Ri9C1INC/0LXRgNC10LTQsNC90L3Ri9C1INCy0LzQtdGB0YLQtSDRgSDRgdC+0LHRi9GC0LjQtdC8XG4gKiBAcHJpdmF0ZVxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLl9vbkV2ZW50ID0gZnVuY3Rpb24oZXZlbnQsIGlkLCBvZmZzZXQsIGRhdGEpIHtcbiAgICBpZiAodGhpcy5zdGF0ZSA9PT0gXCJmYWlsZWRcIikge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcIm9uRXZlbnRGYWlsZWRcIiwgZXZlbnQsIGlkLCBvZmZzZXQsIGRhdGEpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgaWYgKGV2ZW50ID09PSBGbGFzaE1hbmFnZXIuRVZFTlRfREVCVUcpIHtcbiAgICAgICAgbG9nZ2VyLmluZm8odGhpcywgXCJmbGFzaERFQlVHXCIsIGlkLCBvZmZzZXQsIGRhdGEpO1xuICAgIH0gZWxzZSBpZiAoZXZlbnQgPT09IEZsYXNoTWFuYWdlci5FVkVOVF9FUlJPUikge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcImZsYXNoRXJyb3JcIiwgaWQsIG9mZnNldCwgZGF0YSk7XG4gICAgfSBlbHNlIHtcbiAgICAgICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIm9uRXZlbnRcIiwgZXZlbnQsIGlkLCBvZmZzZXQpO1xuICAgIH1cblxuICAgIGlmIChldmVudCA9PT0gRmxhc2hNYW5hZ2VyLkVWRU5UX0lOSVQpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX29uSW5pdCgpO1xuICAgIH1cblxuICAgIGlmIChldmVudCA9PT0gRmxhc2hNYW5hZ2VyLkVWRU5UX0ZBSUwpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIFwiZmFpbGVkXCIsIEF1ZGlvRXJyb3IuRkxBU0hfSU5URVJOQUxfRVJST1IpO1xuICAgICAgICB0aGlzLmRlZmVycmVkLnJlamVjdChuZXcgQXVkaW9FcnJvcihBdWRpb0Vycm9yLkZMQVNIX0lOVEVSTkFMX0VSUk9SKSk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICAvL0lORk86INCyINC+0LHRgNCw0LHQvtGC0YfQuNC60LUg0YHQvtCx0YvRgtC40Y8g0L/QtdGA0LXQtNCw0L3QvdC+0LPQviDQuNC3INGE0LvQtdGI0LAg0L3QtdC70YzQt9GPINC+0LHRgNCw0YnQsNGC0YzRgdGPINC6INGE0LvQtdGILdC+0LHRitC10LrRgtGDLCDQv9C+0Y3RgtC+0LzRgyDQtNC10LvQsNC10Lwg0YDQsNGB0YHQuNC90YXRgNC+0L3QuNC30LDRhtC40Y5cbiAgICBpZiAoaWQgPT0gLTEpIHtcbiAgICAgICAgUHJvbWlzZS5yZXNvbHZlKCkudGhlbihmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHRoaXMuZW1taXRlcnMuZm9yRWFjaChmdW5jdGlvbihlbW1pdGVyKSB7XG4gICAgICAgICAgICAgICAgZW1taXRlci50cmlnZ2VyKGV2ZW50LCBvZmZzZXQsIGRhdGEpO1xuICAgICAgICAgICAgfSk7XG4gICAgICAgIH0uYmluZCh0aGlzKSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLmVtbWl0ZXJzW2lkXSkge1xuICAgICAgICBQcm9taXNlLnJlc29sdmUoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdGhpcy5lbW1pdGVyc1tpZF0udHJpZ2dlcihldmVudCwgb2Zmc2V0LCBkYXRhKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IodGhpcywgQXVkaW9FcnJvci5GTEFTSF9FTU1JVEVSX05PVF9GT1VORCwgaWQpO1xuICAgIH1cbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LrQsCDQtNC+0YHRgtGD0L/QvdC+0YHRgtC4IGZsYXNoLdC/0LvQtdC10YDQsFxuICogQHByaXZhdGVcbiAqL1xuRmxhc2hNYW5hZ2VyLnByb3RvdHlwZS5fb25IZWFydEJlYXQgPSBmdW5jdGlvbigpIHtcbiAgICB0cnkge1xuICAgICAgICB0aGlzLmZsYXNoLl9oZWFydEJlYXQoKTtcbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKHRoaXMsIFwiY3Jhc2hlZFwiLCBlKTtcbiAgICAgICAgdGhpcy5fb25FdmVudChBdWRpb1N0YXRpYy5FVkVOVF9DUkFTSEVELCAtMSwgZSk7XG4gICAgfVxufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCj0L/RgNCw0LLQu9C10L3QuNC1INC/0LvQtdC10YDQvtC8XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQvtC30LTQsNC90LjQtSDQvdC+0LLQvtCz0L4g0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge0F1ZGlvRmxhc2h9IGF1ZGlvRmxhc2ggLSBmbGFzaCDQsNGD0LTQuNC+LdC/0LvQtdC10YAsINC60L7RgtC+0YDRi9C5INCx0YPQtNC10YIg0L7QsdGB0LvRg9C20LjQstCw0YLRjCDRgdC+0LfQtNCw0L3QvdGL0Lkg0L/Qu9C10LXRgFxuICogQHJldHVybnMge1Byb21pc2V9IC0tINC+0LHQtdGJ0LDQvdC40LUsINC60L7RgtC+0YDQvtC1INGA0LDQt9GA0LXRiNCw0LXRgtGB0Y8g0L/QvtGB0LvQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDRgdC+0LfQtNCw0L3QuNGPINC/0LvQtdC10YDQsFxuICovXG5GbGFzaE1hbmFnZXIucHJvdG90eXBlLmNyZWF0ZVBsYXllciA9IGZ1bmN0aW9uKGF1ZGlvRmxhc2gpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiY3JlYXRlUGxheWVyXCIpO1xuXG4gICAgdmFyIHByb21pc2UgPSB0aGlzLndoZW5SZWFkeS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICBhdWRpb0ZsYXNoLmlkID0gdGhpcy5mbGFzaC5fYWRkUGxheWVyKCk7XG4gICAgICAgIHRoaXMuZW1taXRlcnNbYXVkaW9GbGFzaC5pZF0gPSBhdWRpb0ZsYXNoO1xuICAgICAgICByZXR1cm4gYXVkaW9GbGFzaC5pZDtcbiAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgcHJvbWlzZS50aGVuKGZ1bmN0aW9uKHBsYXllcklkKSB7XG4gICAgICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJjcmVhdGVQbGF5ZXJTdWNjZXNzXCIsIHBsYXllcklkKTtcbiAgICB9LmJpbmQodGhpcyksIGZ1bmN0aW9uKGVycikge1xuICAgICAgICBsb2dnZXIuZXJyb3IodGhpcywgXCJjcmVhdGVQbGF5ZXJFcnJvclwiLCBlcnIpO1xuICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICByZXR1cm4gcHJvbWlzZTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmxhc2hNYW5hZ2VyO1xuIiwiLyoqXG4gKiBAaWdub3JlXG4gKiBAZmlsZVxuICogVGhpcyBpcyBhIHdyYXBwZXIgZm9yIHN3Zm9iamVjdCB0aGF0IGRldGVjdHMgRmxhc2hCbG9jayBpbiBicm93c2VyLlxuICpcbiAqIFdyYXBwZXIgZGV0ZWN0czpcbiAqICAgLSBDaHJvbWVcbiAqICAgICAtIEZsYXNoQmxvY2sgKGh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL2NkbmdpYWRtbmtoZ2Vta2lta2hpaWxnZmZiamlqY2llKVxuICogICAgIC0gRmxhc2hCbG9jayAoaHR0cHM6Ly9jaHJvbWUuZ29vZ2xlLmNvbS93ZWJzdG9yZS9kZXRhaWwvZ29maGpram1rcGluaHBvaWFianBsb2JjYWlnbmFibmwpXG4gKiAgICAgLSBGbGFzaEZyZWUgKGh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL2VibWllY2tsbG1taWZqamJpcG5wcGlucGlvaHBmYWhtKVxuICogICAtIEZpcmVmb3ggRmxhc2hibG9jayAoaHR0cHM6Ly9hZGRvbnMubW96aWxsYS5vcmcvcnUvZmlyZWZveC9hZGRvbi9mbGFzaGJsb2NrLylcbiAqICAgLSBPcGVyYSA+PSAxMS41IFwiRW5hYmxlIHBsdWdpbnMgb24gZGVtYW5kXCIgc2V0dGluZ1xuICogICAtIFNhZmFyaSBDbGlja1RvRmxhc2ggRXh0ZW5zaW9uIChodHRwOi8vaG95b2lzLmdpdGh1Yi5jb20vc2FmYXJpZXh0ZW5zaW9ucy9jbGlja3RvcGx1Z2luLylcbiAqICAgLSBTYWZhcmkgQ2xpY2tUb0ZsYXNoIFBsdWdpbiAoZm9yIFNhZmFyaSA8IDUuMC42KSAoaHR0cDovL3JlbnR6c2NoLmdpdGh1Yi5jb20vY2xpY2t0b2ZsYXNoLylcbiAqXG4gKiBUZXN0ZWQgb246XG4gKiAgIC0gQ2hyb21lIDEyXG4gKiAgICAgLSBGbGFzaEJsb2NrIGJ5IExleDEgMS4yLjExLjEyXG4gKiAgICAgLSBGbGFzaEJsb2NrIGJ5IGpvc29yZWsgMC45LjMxXG4gKiAgICAgLSBGbGFzaEZyZWUgMS4xLjNcbiAqICAgLSBGaXJlZm94IDUuMC4xICsgRmxhc2hibG9jayAxLjUuMTUuMVxuICogICAtIE9wZXJhIDExLjVcbiAqICAgLSBTYWZhcmkgNS4xICsgQ2xpY2tUb0ZsYXNoICgyLjMuMilcbiAqXG4gKiBBbHNvIHRoaXMgd3JhcHBlciBjYW4gcmVtb3ZlIGJsb2NrZWQgc3dmIGFuZCBsZXQgeW91IGRvd25ncmFkZSB0byBvdGhlciBvcHRpb25zLlxuICpcbiAqIEZlZWwgZnJlZSB0byBjb250YWN0IG1lIHZpYSBlbWFpbC5cbiAqXG4gKiBDb3B5cmlnaHQgMjAxMSwgQWxleGV5IEFuZHJvc292XG4gKiBEdWFsIGxpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgKGh0dHA6Ly93d3cub3BlbnNvdXJjZS5vcmcvbGljZW5zZXMvbWl0LWxpY2Vuc2UucGhwKSBvciBHUEwgVmVyc2lvbiAzIChodHRwOi8vd3d3LmdudS5vcmcvbGljZW5zZXMvZ3BsLmh0bWwpIGxpY2Vuc2VzLlxuICpcbiAqIFRoYW5rcyB0byBmbGFzaGJsb2NrZGV0ZWN0b3IgcHJvamVjdCAoaHR0cDovL2NvZGUuZ29vZ2xlLmNvbS9wL2ZsYXNoYmxvY2tkZXRlY3RvcilcbiAqXG4gKiBAcmVxdWlyZXMgc3dmb2JqZWN0XG4gKiBAYXV0aG9yIEFsZXhleSBBbmRyb3NvdiA8ZG9vY2hpa0B5YS5ydT5cbiAqIEB2ZXJzaW9uIDEuMFxuICovXG5cbnZhciBzd2ZvYmplY3QgPSByZXF1aXJlKCcuLi9saWIvYnJvd3Nlci9zd2ZvYmplY3QnKTtcblxuZnVuY3Rpb24gcmVtb3ZlKG5vZGUpIHtcbiAgICBub2RlLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQobm9kZSk7XG59XG5cbi8qKlxuICog0JzQvtC00YPQu9GMINC30LDQs9GA0YPQt9C60Lgg0YTQu9C10Ygt0L/Qu9C10LXRgNCwINGBINCy0L7Qt9C80L7QttC90L7RgdGC0YzRjiDQvtGC0YHQu9C10LbQuNCy0LDQvdC40Y8g0LHQu9C+0LrQuNGA0L7QstGJ0LjQutC+0LJcbiAqIEBuYW1lc3BhY2VcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBGbGFzaEJsb2NrTm90aWZpZXIgPSB7XG5cbiAgICAvKipcbiAgICAgKiBDU1MtY2xhc3MgZm9yIHN3ZiB3cmFwcGVyLlxuICAgICAqIEBwcm90ZWN0ZWRcbiAgICAgKiBAZGVmYXVsdCBmYm4tc3dmLXdyYXBwZXJcbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKi9cbiAgICBfX1NXRl9XUkFQUEVSX0NMQVNTOiAnZmJuLXN3Zi13cmFwcGVyJyxcblxuICAgIC8qKlxuICAgICAqIFRpbWVvdXQgZm9yIGZsYXNoIGJsb2NrIGRldGVjdFxuICAgICAqIEBkZWZhdWx0IDUwMFxuICAgICAqIEBwcm90ZWN0ZWRcbiAgICAgKiBAdHlwZSBOdW1iZXJcbiAgICAgKi9cbiAgICBfX1RJTUVPVVQ6IDUwMCxcblxuICAgIF9fVEVTVFM6IFtcbiAgICAgICAgLy8gQ2hvbWUgRmxhc2hCbG9jayBleHRlbnNpb24gKGh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL2NkbmdpYWRtbmtoZ2Vta2lta2hpaWxnZmZiamlqY2llKVxuICAgICAgICAvLyBDaG9tZSBGbGFzaEJsb2NrIGV4dGVuc2lvbiAoaHR0cHM6Ly9jaHJvbWUuZ29vZ2xlLmNvbS93ZWJzdG9yZS9kZXRhaWwvZ29maGpram1rcGluaHBvaWFianBsb2JjYWlnbmFibmwpXG4gICAgICAgIGZ1bmN0aW9uKHN3Zk5vZGUsIHdyYXBwZXJOb2RlKSB7XG4gICAgICAgICAgICAvLyB3ZSBleHBlY3QgdGhhdCBzd2YgaXMgdGhlIG9ubHkgY2hpbGQgb2Ygd3JhcHBlclxuICAgICAgICAgICAgcmV0dXJuIHdyYXBwZXJOb2RlLmNoaWxkTm9kZXMubGVuZ3RoID4gMVxuICAgICAgICB9LCAvLyBvbGRlciBTYWZhcmkgQ2xpY2tUb0ZsYXNoIChodHRwOi8vcmVudHpzY2guZ2l0aHViLmNvbS9jbGlja3RvZmxhc2gvKVxuICAgICAgICBmdW5jdGlvbihzd2ZOb2RlKSB7XG4gICAgICAgICAgICAvLyBJRSBoYXMgbm8gc3dmTm9kZS50eXBlXG4gICAgICAgICAgICByZXR1cm4gc3dmTm9kZS50eXBlICYmIHN3Zk5vZGUudHlwZSAhPSAnYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2gnXG4gICAgICAgIH0sIC8vIEZsYXNoQmxvY2sgZm9yIEZpcmVmb3ggKGh0dHBzOi8vYWRkb25zLm1vemlsbGEub3JnL3J1L2ZpcmVmb3gvYWRkb24vZmxhc2hibG9jay8pXG4gICAgICAgIC8vIENocm9tZSBGbGFzaEZyZWUgKGh0dHBzOi8vY2hyb21lLmdvb2dsZS5jb20vd2Vic3RvcmUvZGV0YWlsL2VibWllY2tsbG1taWZqamJpcG5wcGlucGlvaHBmYWhtKVxuICAgICAgICBmdW5jdGlvbihzd2ZOb2RlKSB7XG4gICAgICAgICAgICAvLyBzd2YgaGF2ZSBiZWVuIGRldGFjaGVkIGZyb20gRE9NXG4gICAgICAgICAgICByZXR1cm4gIXN3Zk5vZGUucGFyZW50Tm9kZTtcbiAgICAgICAgfSwgLy8gU2FmYXJpIENsaWNrVG9GbGFzaCBFeHRlbnNpb24gKGh0dHA6Ly9ob3lvaXMuZ2l0aHViLmNvbS9zYWZhcmlleHRlbnNpb25zL2NsaWNrdG9wbHVnaW4vKVxuICAgICAgICBmdW5jdGlvbihzd2ZOb2RlKSB7XG4gICAgICAgICAgICByZXR1cm4gc3dmTm9kZS5wYXJlbnROb2RlLmNsYXNzTmFtZS5pbmRleE9mKCdDVEZub2Rpc3BsYXknKSA+IC0xO1xuICAgICAgICB9XG4gICAgXSxcblxuICAgIC8qKlxuICAgICAqIEVtYmVkIFNXRiBpbmZvIHBhZ2UuIFRoaXMgZnVuY3Rpb24gaGFzIHNhbWUgb3B0aW9ucyBhcyBzd2ZvYmplY3QuZW1iZWRTV0YgZXhjZXB0IGxhc3QgcGFyYW0gcmVtb3ZlQmxvY2tlZFNXRi5cbiAgICAgKiBAc2VlIGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9zd2ZvYmplY3Qvd2lraS9hcGlcbiAgICAgKiBAcGFyYW0gc3dmVXJsU3RyXG4gICAgICogQHBhcmFtIHJlcGxhY2VFbGVtSWRTdHJcbiAgICAgKiBAcGFyYW0gd2lkdGhTdHJcbiAgICAgKiBAcGFyYW0gaGVpZ2h0U3RyXG4gICAgICogQHBhcmFtIHN3ZlZlcnNpb25TdHJcbiAgICAgKiBAcGFyYW0geGlTd2ZVcmxTdHJcbiAgICAgKiBAcGFyYW0gZmxhc2h2YXJzT2JqXG4gICAgICogQHBhcmFtIHBhck9ialxuICAgICAqIEBwYXJhbSBhdHRPYmpcbiAgICAgKiBAcGFyYW0gY2FsbGJhY2tGblxuICAgICAqIEBwYXJhbSB7Qm9vbGVhbn0gW3JlbW92ZUJsb2NrZWRTV0Y9dHJ1ZV0gUmVtb3ZlIHN3ZiBpZiBibG9ja2VkXG4gICAgICovXG4gICAgZW1iZWRTV0Y6IGZ1bmN0aW9uKFxuICAgICAgICBzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosXG4gICAgICAgIHBhck9iaiwgYXR0T2JqLCBjYWxsYmFja0ZuLCByZW1vdmVCbG9ja2VkU1dGXG4gICAgKSB7XG4gICAgICAgIC8vIHZhciBzd2ZvYmplY3QgPSB3aW5kb3dbJ3N3Zm9iamVjdCddO1xuXG4gICAgICAgIGlmICghc3dmb2JqZWN0KSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBzd2ZvYmplY3QuYWRkRG9tTG9hZEV2ZW50KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgdmFyIHJlcGxhY2VFbGVtZW50ID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQocmVwbGFjZUVsZW1JZFN0cik7XG4gICAgICAgICAgICBpZiAoIXJlcGxhY2VFbGVtZW50KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAvLyBXZSBuZWVkIHRvIGNyZWF0ZSBkaXYtd3JhcHBlciBiZWNhdXNlIHNvbWUgZmxhc2ggYmxvY2sgcGx1Z2lucyByZXBsYWNlIHN3ZiB3aXRoIGFub3RoZXIgY29udGVudC5cbiAgICAgICAgICAgIC8vIEFsc28gc29tZSBmbGFzaCByZXF1aXJlcyB3cmFwcGVyIHRvIHdvcmsgcHJvcGVybHkuXG4gICAgICAgICAgICB2YXIgd3JhcHBlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuICAgICAgICAgICAgd3JhcHBlci5jbGFzc05hbWUgPSBGbGFzaEJsb2NrTm90aWZpZXIuX19TV0ZfV1JBUFBFUl9DTEFTUztcblxuICAgICAgICAgICAgcmVwbGFjZUVsZW1lbnQucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQod3JhcHBlciwgcmVwbGFjZUVsZW1lbnQpO1xuICAgICAgICAgICAgd3JhcHBlci5hcHBlbmRDaGlsZChyZXBsYWNlRWxlbWVudCk7XG5cbiAgICAgICAgICAgIHN3Zm9iamVjdC5lbWJlZFNXRihzd2ZVcmxTdHIsXG4gICAgICAgICAgICAgICAgcmVwbGFjZUVsZW1JZFN0cixcbiAgICAgICAgICAgICAgICB3aWR0aFN0cixcbiAgICAgICAgICAgICAgICBoZWlnaHRTdHIsXG4gICAgICAgICAgICAgICAgc3dmVmVyc2lvblN0cixcbiAgICAgICAgICAgICAgICB4aVN3ZlVybFN0cixcbiAgICAgICAgICAgICAgICBmbGFzaHZhcnNPYmosXG4gICAgICAgICAgICAgICAgcGFyT2JqLFxuICAgICAgICAgICAgICAgIGF0dE9iaixcbiAgICAgICAgICAgICAgICBmdW5jdGlvbihlKSB7XG4gICAgICAgICAgICAgICAgICAgIC8vIGUuc3VjY2VzcyA9PT0gZmFsc2UgbWVhbnMgdGhhdCBicm93c2VyIGRvbid0IGhhdmUgZmxhc2ggb3IgZmxhc2ggaXMgdG9vIG9sZFxuICAgICAgICAgICAgICAgICAgICAvLyBAc2VlIGh0dHA6Ly9jb2RlLmdvb2dsZS5jb20vcC9zd2ZvYmplY3Qvd2lraS9hcGlcbiAgICAgICAgICAgICAgICAgICAgaWYgKCFlIHx8IGUuc3VjY2VzcyA9PT0gZmFsc2UpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrRm4oZSk7XG5cbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzd2ZFbGVtZW50ID0gZVsncmVmJ107XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBPcGVyYSAxMS41IGFuZCBhYm92ZSByZXBsYWNlcyBmbGFzaCB3aXRoIFNWRyBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1zaWUgKGFuZCBjYW5hcnkgY2hyb21lIDMyLjApIGNyYXNoZXMgb24gc3dmRWxlbWVudFsnZ2V0U1ZHRG9jdW1lbnQnXSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVwbGFjZWRCeVNWRyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBsYWNlZEJ5U1ZHID0gc3dmRWxlbWVudCAmJiBzd2ZFbGVtZW50WydnZXRTVkdEb2N1bWVudCddXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHN3ZkVsZW1lbnRbJ2dldFNWR0RvY3VtZW50J10oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2goZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVwbGFjZWRCeVNWRykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uRmFpbHVyZShlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL3NldCB0aW1lb3V0IHRvIGxldCBGbGFzaEJsb2NrIHBsdWdpbiBkZXRlY3Qgc3dmIGFuZCByZXBsYWNlIGl0IHNvbWUgY29udGVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIFRFU1RTID0gRmxhc2hCbG9ja05vdGlmaWVyLl9fVEVTVFM7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBqID0gVEVTVFMubGVuZ3RoOyBpIDwgajsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBpZiAoVEVTVFNbaV0oc3dmRWxlbWVudCwgd3JhcHBlcikpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvbkZhaWx1cmUoZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrRm4oZSk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfSwgRmxhc2hCbG9ja05vdGlmaWVyLl9fVElNRU9VVCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBvbkZhaWx1cmUoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgaWYgKHJlbW92ZUJsb2NrZWRTV0YgIT09IGZhbHNlKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9yZW1vdmUgc3dmXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgc3dmb2JqZWN0LnJlbW92ZVNXRihyZXBsYWNlRWxlbUlkU3RyKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL3JlbW92ZSB3cmFwcGVyXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlKHdyYXBwZXIpO1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9yZW1vdmUgZXh0ZW5zaW9uIGFydGVmYWN0c1xuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9DbGlja1RvRmxhc2ggYXJ0ZWZhY3RzXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgdmFyIGN0ZiA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKCdDVEZzdGFjaycpO1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIGlmIChjdGYpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgcmVtb3ZlKGN0Zik7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgLy9DaHJvbWUgRmxhc2hCbG9jayBhcnRlZmFjdFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgIHZhciBsYXN0Qm9keUNoaWxkID0gZG9jdW1lbnQuYm9keS5sYXN0Q2hpbGQ7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgaWYgKGxhc3RCb2R5Q2hpbGQgJiYgbGFzdEJvZHlDaGlsZC5jbGFzc05hbWUgPT0gJ3Vqc19mbGFzaGJsb2NrX3BsYWNlaG9sZGVyJykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICByZW1vdmUobGFzdEJvZHlDaGlsZCk7XG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdWNjZXNzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBlLl9fZmJuID0gdHJ1ZTtcbiAgICAgICAgICAgICAgICAgICAgICAgIGNhbGxiYWNrRm4oZSk7XG4gICAgICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgICB9KTtcbiAgICAgICAgfSk7XG4gICAgfVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBGbGFzaEJsb2NrTm90aWZpZXI7XG4iLCJ2YXIgc3dmb2JqZWN0ID0gcmVxdWlyZSgnLi4vbGliL2Jyb3dzZXIvc3dmb2JqZWN0Jyk7XG5cbi8qKlxuICog0JzQvtC00YPQu9GMINC30LDQs9GA0YPQt9C60Lgg0YTQu9C10Ygt0L/Qu9C10LXRgNCwXG4gKiBAbmFtZXNwYWNlXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgRmxhc2hFbWJlZGRlciA9IHtcblxuICAgIC8qKlxuICAgICAqIENTUy1jbGFzcyBmb3Igc3dmIHdyYXBwZXIuXG4gICAgICogQHByb3RlY3RlZFxuICAgICAqIEBkZWZhdWx0IGZlbWItc3dmLXdyYXBwZXJcbiAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgKi9cbiAgICBfX1NXRl9XUkFQUEVSX0NMQVNTOiAnZmVtYi1zd2Ytd3JhcHBlcicsXG5cbiAgICAvKipcbiAgICAgKiBUaW1lb3V0IGZvciBmbGFzaCBibG9jayBkZXRlY3RcbiAgICAgKiBAZGVmYXVsdCA1MDBcbiAgICAgKiBAcHJvdGVjdGVkXG4gICAgICogQHR5cGUgTnVtYmVyXG4gICAgICovXG4gICAgX19USU1FT1VUOiA1MDAsXG5cbiAgICAvKipcbiAgICAgKiBFbWJlZCBTV0YgaW5mbyBwYWdlLiBUaGlzIGZ1bmN0aW9uIGhhcyBzYW1lIG9wdGlvbnMgYXMgc3dmb2JqZWN0LmVtYmVkU1dGXG4gICAgICogQHNlZSBodHRwOi8vY29kZS5nb29nbGUuY29tL3Avc3dmb2JqZWN0L3dpa2kvYXBpXG4gICAgICogQHBhcmFtIHN3ZlVybFN0clxuICAgICAqIEBwYXJhbSByZXBsYWNlRWxlbUlkU3RyXG4gICAgICogQHBhcmFtIHdpZHRoU3RyXG4gICAgICogQHBhcmFtIGhlaWdodFN0clxuICAgICAqIEBwYXJhbSBzd2ZWZXJzaW9uU3RyXG4gICAgICogQHBhcmFtIHhpU3dmVXJsU3RyXG4gICAgICogQHBhcmFtIGZsYXNodmFyc09ialxuICAgICAqIEBwYXJhbSBwYXJPYmpcbiAgICAgKiBAcGFyYW0gYXR0T2JqXG4gICAgICogQHBhcmFtIGNhbGxiYWNrRm5cbiAgICAgKi9cbiAgICBlbWJlZFNXRjogZnVuY3Rpb24oXG4gICAgICAgIHN3ZlVybFN0ciwgcmVwbGFjZUVsZW1JZFN0ciwgd2lkdGhTdHIsIGhlaWdodFN0ciwgc3dmVmVyc2lvblN0ciwgeGlTd2ZVcmxTdHIsIGZsYXNodmFyc09iaixcbiAgICAgICAgcGFyT2JqLCBhdHRPYmosIGNhbGxiYWNrRm5cbiAgICApIHtcbiAgICAgICAgc3dmb2JqZWN0LmFkZERvbUxvYWRFdmVudChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHZhciByZXBsYWNlRWxlbWVudCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKHJlcGxhY2VFbGVtSWRTdHIpO1xuICAgICAgICAgICAgaWYgKCFyZXBsYWNlRWxlbWVudCkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gV2UgbmVlZCB0byBjcmVhdGUgZGl2LXdyYXBwZXIgYmVjYXVzZSBzb21lIGZsYXNoIGJsb2NrIHBsdWdpbnMgcmVwbGFjZSBzd2Ygd2l0aCBhbm90aGVyIGNvbnRlbnQuXG4gICAgICAgICAgICAvLyBBbHNvIHNvbWUgZmxhc2ggcmVxdWlyZXMgd3JhcHBlciB0byB3b3JrIHByb3Blcmx5LlxuICAgICAgICAgICAgdmFyIHdyYXBwZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkaXYnKTtcbiAgICAgICAgICAgIHdyYXBwZXIuY2xhc3NOYW1lID0gRmxhc2hFbWJlZGRlci5fX1NXRl9XUkFQUEVSX0NMQVNTO1xuXG4gICAgICAgICAgICByZXBsYWNlRWxlbWVudC5wYXJlbnROb2RlLnJlcGxhY2VDaGlsZCh3cmFwcGVyLCByZXBsYWNlRWxlbWVudCk7XG4gICAgICAgICAgICB3cmFwcGVyLmFwcGVuZENoaWxkKHJlcGxhY2VFbGVtZW50KTtcblxuICAgICAgICAgICAgc3dmb2JqZWN0LmVtYmVkU1dGKHN3ZlVybFN0cixcbiAgICAgICAgICAgICAgICByZXBsYWNlRWxlbUlkU3RyLFxuICAgICAgICAgICAgICAgIHdpZHRoU3RyLFxuICAgICAgICAgICAgICAgIGhlaWdodFN0cixcbiAgICAgICAgICAgICAgICBzd2ZWZXJzaW9uU3RyLFxuICAgICAgICAgICAgICAgIHhpU3dmVXJsU3RyLFxuICAgICAgICAgICAgICAgIGZsYXNodmFyc09iaixcbiAgICAgICAgICAgICAgICBwYXJPYmosXG4gICAgICAgICAgICAgICAgYXR0T2JqLFxuICAgICAgICAgICAgICAgIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgICAgICAgICAgICAgLy8gZS5zdWNjZXNzID09PSBmYWxzZSBtZWFucyB0aGF0IGJyb3dzZXIgZG9uJ3QgaGF2ZSBmbGFzaCBvciBmbGFzaCBpcyB0b28gb2xkXG4gICAgICAgICAgICAgICAgICAgIC8vIEBzZWUgaHR0cDovL2NvZGUuZ29vZ2xlLmNvbS9wL3N3Zm9iamVjdC93aWtpL2FwaVxuICAgICAgICAgICAgICAgICAgICBpZiAoIWUgfHwgZS5zdWNjZXNzID09PSBmYWxzZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tGbihlKTtcbiAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHZhciBzd2ZFbGVtZW50ID0gZVsncmVmJ107XG4gICAgICAgICAgICAgICAgICAgICAgICAvLyBPcGVyYSAxMS41IGFuZCBhYm92ZSByZXBsYWNlcyBmbGFzaCB3aXRoIFNWRyBidXR0b25cbiAgICAgICAgICAgICAgICAgICAgICAgIC8vIG1zaWUgKGFuZCBjYW5hcnkgY2hyb21lIDMyLjApIGNyYXNoZXMgb24gc3dmRWxlbWVudFsnZ2V0U1ZHRG9jdW1lbnQnXSgpXG4gICAgICAgICAgICAgICAgICAgICAgICB2YXIgcmVwbGFjZWRCeVNWRyA9IGZhbHNlO1xuICAgICAgICAgICAgICAgICAgICAgICAgdHJ5IHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICByZXBsYWNlZEJ5U1ZHID0gc3dmRWxlbWVudCAmJiBzd2ZFbGVtZW50WydnZXRTVkdEb2N1bWVudCddXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICYmIHN3ZkVsZW1lbnRbJ2dldFNWR0RvY3VtZW50J10oKTtcbiAgICAgICAgICAgICAgICAgICAgICAgIH0gY2F0Y2goZXJyKSB7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgICAgICBpZiAocmVwbGFjZWRCeVNWRykge1xuICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9uRmFpbHVyZShlKTtcblxuICAgICAgICAgICAgICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAvL3NldCB0aW1lb3V0IHRvIGxldCBGbGFzaEJsb2NrIHBsdWdpbiBkZXRlY3Qgc3dmIGFuZCByZXBsYWNlIGl0IHNvbWUgY29udGVudHNcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB3aW5kb3cuc2V0VGltZW91dChmdW5jdGlvbigpIHtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgY2FsbGJhY2tGbihlKTtcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICB9LCBGbGFzaEVtYmVkZGVyLl9fVElNRU9VVCk7XG4gICAgICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgICAgICBmdW5jdGlvbiBvbkZhaWx1cmUoZSkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZS5zdWNjZXNzID0gZmFsc2U7XG4gICAgICAgICAgICAgICAgICAgICAgICBjYWxsYmFja0ZuKGUpO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfSk7XG4gICAgICAgIH0pO1xuICAgIH1cbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRmxhc2hFbWJlZGRlcjtcbiIsInZhciBGbGFzaEJsb2NrTm90aWZpZXIgPSByZXF1aXJlKCcuL2ZsYXNoYmxvY2tub3RpZmllcicpO1xudmFyIEZsYXNoRW1iZWRkZXIgPSByZXF1aXJlKCcuL2ZsYXNoZW1iZWRkZXInKTtcbnZhciBkZXRlY3QgPSByZXF1aXJlKCcuLi9saWIvYnJvd3Nlci9kZXRlY3QnKTtcblxudmFyIHdpblNhZmFyaSA9IGRldGVjdC5wbGF0Zm9ybS5vcyA9PT0gJ3dpbmRvd3MnICYmIGRldGVjdC5icm93c2VyLm5hbWUgPT09ICdzYWZhcmknO1xuXG52YXIgQ09OVEFJTkVSX0NMQVNTID0gXCJ5YS1mbGFzaC1wbGF5ZXItd3JhcHBlclwiO1xuXG4vKipcbiAqINCX0LDQs9GA0YPQt9GH0LjQuiDRhNC70LXRiC3Qv9C70LXQtdGA0LBcbiAqXG4gKiBAYWxpYXMgRmxhc2hNYW5hZ2VyfmZsYXNoTG9hZGVyXG4gKlxuICogQHBhcmFtIHtzdHJpbmd9IHVybCAtINCh0YHRi9C70LrQsCDQvdCwINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtzdHJpbmd9IG1pblZlcnNpb24gLSDQvNC40L3QuNC80LDQu9GM0L3QsNGPINCy0LXRgNGB0LjRjyDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7c3RyaW5nfG51bWJlcn0gaWQgLSDQuNC00LXQvdGC0LjRhNC40LrQsNGC0L7RgCDQvdC+0LLQvtCz0L4g0L/Qu9C10LXRgNCwXG4gKiBAcGFyYW0ge2Z1bmN0aW9ufSBsb2FkQ2FsbGJhY2sgLSDQutC+0LvQsdC10Log0LTQu9GPINGB0L7QsdGL0YLQuNGPINC30LDQs9GA0YPQt9C60LhcbiAqIEBwYXJhbSB7b2JqZWN0fSBmbGFzaFZhcnMgLSDQtNCw0L3QvdGL0LUg0L/QtdGA0LXQtNCw0LLQsNC10LzRi9C1INCy0L4g0YTQu9C10YhcbiAqIEBwYXJhbSB7SFRNTEVsZW1lbnR9IGNvbnRhaW5lciAtINC60L7QvdGC0LXQudC90LXRgCDQtNC70Y8g0LLQuNC00LjQvNC+0LPQviDRhNC70LXRiC3Qv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7c3RyaW5nfSBzaXplWCAtINGA0LDQt9C80LXRgCDQv9C+INCz0L7RgNC40LfQvtC90YLQsNC70LhcbiAqIEBwYXJhbSB7c3RyaW5nfSBzaXplWSAtINGA0LDQt9C80LXRgCDQv9C+INCy0LXRgNGC0LjQutCw0LvQuFxuICpcbiAqIEByZXR1cm5zIHtIVE1MRWxlbWVudH0gLS0g0JrQvtC90YLQtdC50L3QtdGAINGE0LvQtdGILdC/0LvQtdC10YDQsFxuICovXG5tb2R1bGUuZXhwb3J0cyA9IGZ1bmN0aW9uKHVybCwgbWluVmVyc2lvbiwgaWQsIGxvYWRDYWxsYmFjaywgZmxhc2hWYXJzLCBjb250YWluZXIsIHNpemVYLCBzaXplWSkge1xuICAgIHZhciAkZmxhc2hQbGF5ZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuICAgICRmbGFzaFBsYXllci5pZCA9IFwid3JhcHBlcl9cIiArIGlkO1xuICAgICRmbGFzaFBsYXllci5pbm5lckhUTUwgPSAnPGRpdiBpZD1cIicgKyBpZCArICdcIj48L2Rpdj4nO1xuXG4gICAgc2l6ZVggPSBzaXplWCB8fCBcIjEwMDBcIjtcbiAgICBzaXplWSA9IHNpemVZIHx8IFwiMTAwMFwiO1xuXG4gICAgdmFyIGVtYmVkZGVyLFxuICAgICAgICBmbGFzaFNpemVYLFxuICAgICAgICBmbGFzaFNpemVZLFxuICAgICAgICBvcHRpb25zO1xuXG4gICAgaWYgKGNvbnRhaW5lciAmJiAhd2luU2FmYXJpKSB7XG4gICAgICAgIGVtYmVkZGVyID0gRmxhc2hFbWJlZGRlcjtcbiAgICAgICAgZmxhc2hTaXplWCA9IHNpemVYO1xuICAgICAgICBmbGFzaFNpemVZID0gc2l6ZVk7XG4gICAgICAgIG9wdGlvbnMgPSB7YWxsb3dzY3JpcHRhY2Nlc3M6IFwiYWx3YXlzXCIsIHdtb2RlOiBcInRyYW5zcGFyZW50XCJ9O1xuXG4gICAgICAgICRmbGFzaFBsYXllci5jbGFzc05hbWUgPSBDT05UQUlORVJfQ0xBU1M7XG4gICAgICAgICRmbGFzaFBsYXllci5zdHlsZS5jc3NUZXh0ID0gJ3Bvc2l0aW9uOiByZWxhdGl2ZTsgd2lkdGg6IDEwMCU7IGhlaWdodDogMTAwJTsgb3ZlcmZsb3c6IGhpZGRlbjsnO1xuICAgICAgICBjb250YWluZXIuYXBwZW5kQ2hpbGQoJGZsYXNoUGxheWVyKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBlbWJlZGRlciA9IEZsYXNoQmxvY2tOb3RpZmllcjtcbiAgICAgICAgZmxhc2hTaXplWCA9IGZsYXNoU2l6ZVkgPSBcIjFcIjtcbiAgICAgICAgb3B0aW9ucyA9IHthbGxvd3NjcmlwdGFjY2VzczogXCJhbHdheXNcIn07XG5cbiAgICAgICAgJGZsYXNoUGxheWVyLnN0eWxlLmNzc1RleHQgPSAncG9zaXRpb246IGFic29sdXRlOyBsZWZ0OiAtMXB4OyB0b3A6IC0xcHg7IHdpZHRoOiAwcHg7IGhlaWdodDogMHB4OyBvdmVyZmxvdzogaGlkZGVuOyc7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuYXBwZW5kQ2hpbGQoJGZsYXNoUGxheWVyKTtcbiAgICB9XG5cbiAgICBlbWJlZGRlci5lbWJlZFNXRihcbiAgICAgICAgdXJsLFxuICAgICAgICBpZCxcbiAgICAgICAgZmxhc2hTaXplWCxcbiAgICAgICAgZmxhc2hTaXplWSxcbiAgICAgICAgbWluVmVyc2lvbixcbiAgICAgICAgXCJcIixcbiAgICAgICAgZmxhc2hWYXJzLFxuICAgICAgICBvcHRpb25zLFxuICAgICAgICB7fSxcbiAgICAgICAgbG9hZENhbGxiYWNrXG4gICAgKTtcblxuICAgIHJldHVybiAkZmxhc2hQbGF5ZXI7XG59O1xuIiwibW9kdWxlLmV4cG9ydHMgPSBbNjAsIDE3MCwgMzEwLCA2MDAsIDEwMDAsIDMwMDAsIDYwMDAsIDEyMDAwLCAxNDAwMCwgMTYwMDBdO1xuIiwibW9kdWxlLmV4cG9ydHMgPSBbXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiZGVmYXVsdFwiLFxuICAgICAgICBcInByZWFtcFwiOiAwLFxuICAgICAgICBcImJhbmRzXCI6IFswLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwLCAwXVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiQ2xhc3NpY2FsXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0wLjUsXG4gICAgICAgIFwiYmFuZHNcIjogWy0wLjUsIC0wLjUsIC0wLjUsIC0wLjUsIC0wLjUsIC0wLjUsIC0zLjUsIC0zLjUsIC0zLjUsIC00LjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJDbHViXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0zLjM1OTk5OTg5NTA5NTgyNSxcbiAgICAgICAgXCJiYW5kc1wiOiBbLTAuNSwgLTAuNSwgNCwgMi41LCAyLjUsIDIuNSwgMS41LCAtMC41LCAtMC41LCAtMC41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiRGFuY2VcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTIuMTU5OTk5ODQ3NDEyMTA5NCxcbiAgICAgICAgXCJiYW5kc1wiOiBbNC41LCAzLjUsIDEsIC0wLjUsIC0wLjUsIC0yLjUsIC0zLjUsIC0zLjUsIC0wLjUsIC0wLjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJGdWxsIEJhc3NcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTMuNTk5OTk5OTA0NjMyNTY4NCxcbiAgICAgICAgXCJiYW5kc1wiOiBbNCwgNC41LCA0LjUsIDIuNSwgMC41LCAtMiwgLTQsIC01LCAtNS41LCAtNS41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiRnVsbCBCYXNzICYgVHJlYmxlXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC01LjAzOTk5OTk2MTg1MzAyNyxcbiAgICAgICAgXCJiYW5kc1wiOiBbMy41LCAyLjUsIC0wLjUsIC0zLjUsIC0yLCAwLjUsIDQsIDUuNSwgNiwgNl1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIkZ1bGwgVHJlYmxlXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC02LFxuICAgICAgICBcImJhbmRzXCI6IFstNC41LCAtNC41LCAtNC41LCAtMiwgMSwgNS41LCA4LCA4LCA4LCA4XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiTGFwdG9wIFNwZWFrZXJzIC8gSGVhZHBob25lXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC00LjA3OTk5OTkyMzcwNjA1NSxcbiAgICAgICAgXCJiYW5kc1wiOiBbMiwgNS41LCAyLjUsIC0xLjUsIC0xLCAwLjUsIDIsIDQuNSwgNiwgN11cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIkxhcmdlIEhhbGxcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTMuNTk5OTk5OTA0NjMyNTY4NCxcbiAgICAgICAgXCJiYW5kc1wiOiBbNSwgNSwgMi41LCAyLjUsIC0wLjUsIC0yLCAtMiwgLTIsIC0wLjUsIC0wLjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJMaXZlXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0yLjYzOTk5OTg2NjQ4NTU5NTcsXG4gICAgICAgIFwiYmFuZHNcIjogWy0yLCAtMC41LCAyLCAyLjUsIDIuNSwgMi41LCAyLCAxLCAxLCAxXVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiUGFydHlcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTIuNjM5OTk5ODY2NDg1NTk1NyxcbiAgICAgICAgXCJiYW5kc1wiOiBbMy41LCAzLjUsIC0wLjUsIC0wLjUsIC0wLjUsIC0wLjUsIC0wLjUsIC0wLjUsIDMuNSwgMy41XVxuICAgIH0sXG4gICAge1xuICAgICAgICBcImlkXCI6IFwiUG9wXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC0zLjExOTk5OTg4NTU1OTA4MixcbiAgICAgICAgXCJiYW5kc1wiOiBbLTAuNSwgMiwgMy41LCA0LCAyLjUsIC0wLjUsIC0xLCAtMSwgLTAuNSwgLTAuNV1cbiAgICB9LFxuICAgIHtcbiAgICAgICAgXCJpZFwiOiBcIlJlZ2dhZVwiLFxuICAgICAgICBcInByZWFtcFwiOiAtNC4wNzk5OTk5MjM3MDYwNTUsXG4gICAgICAgIFwiYmFuZHNcIjogWy0wLjUsIC0wLjUsIC0wLjUsIC0yLjUsIC0wLjUsIDMsIDMsIC0wLjUsIC0wLjUsIC0wLjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJSb2NrXCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC01LjAzOTk5OTk2MTg1MzAyNyxcbiAgICAgICAgXCJiYW5kc1wiOiBbNCwgMiwgLTIuNSwgLTQsIC0xLjUsIDIsIDQsIDUuNSwgNS41LCA1LjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJTa2FcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTUuNTE5OTk5OTgwOTI2NTE0LFxuICAgICAgICBcImJhbmRzXCI6IFstMSwgLTIsIC0yLCAtMC41LCAyLCAyLjUsIDQsIDQuNSwgNS41LCA0LjVdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJTb2Z0XCIsXG4gICAgICAgIFwicHJlYW1wXCI6IC00Ljc5OTk5OTcxMzg5NzcwNSxcbiAgICAgICAgXCJiYW5kc1wiOiBbMiwgMC41LCAtMC41LCAtMSwgLTAuNSwgMiwgNCwgNC41LCA1LjUsIDZdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJTb2Z0IFJvY2tcIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTIuNjM5OTk5ODY2NDg1NTk1NyxcbiAgICAgICAgXCJiYW5kc1wiOiBbMiwgMiwgMSwgLTAuNSwgLTIsIC0yLjUsIC0xLjUsIC0wLjUsIDEsIDRdXG4gICAgfSxcbiAgICB7XG4gICAgICAgIFwiaWRcIjogXCJUZWNobm9cIixcbiAgICAgICAgXCJwcmVhbXBcIjogLTMuODM5OTk5OTE0MTY5MzExNSxcbiAgICAgICAgXCJiYW5kc1wiOiBbNCwgMi41LCAtMC41LCAtMi41LCAtMiwgLTAuNSwgNCwgNC41LCA0LjUsIDRdXG4gICAgfVxuXTtcbiIsInZhciBFdmVudHMgPSByZXF1aXJlKCcuLi8uLi9saWIvYXN5bmMvZXZlbnRzJyk7XG52YXIgRXF1YWxpemVyU3RhdGljID0gcmVxdWlyZSgnLi9lcXVhbGl6ZXItc3RhdGljJyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQmtC+0L3RgdGC0YDRg9C60YLQvtGAXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQvtCx0YvRgtC40LUg0LjQt9C80LXQvdC10L3QuNGPINC30L3QsNGH0LXQvdC40Y8g0YPRgdC40LvQtdC90LjRjy5cbiAqIEBldmVudCBBdWRpby5meC5FcXVhbGl6ZXIuRXF1YWxpemVyQmFuZCNFVkVOVF9DSEFOR0VcbiAqIEBwYXJhbSB7TnVtYmVyfSB2YWx1ZSDQndC+0LLQvtC1INC30L3QsNGH0LXQvdC40LUuXG4gKi9cblxuLyoqXG4gKiBAY2xhc3MgRXF1YWxpemVyQmFuZFxuICogQGFsaWFzIHlhLm11c2ljLkF1ZGlvLmZ4LkVxdWFsaXplcn5FcXVhbGl6ZXJCYW5kXG4gKiBAY2xhc3NkZWNzINCf0L7Qu9C+0YHQsCDQv9GA0L7Qv9GD0YHQutCw0L3QuNGPINGN0LrQstCw0LvQsNC50LfQtdGA0LAuXG4gKiBAZXh0ZW5kcyBFdmVudHNcbiAqXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYXVkaW9Db250ZXh0INCa0L7QvdGC0LXQutGB0YIgV2ViIEF1ZGlvIEFQSS5cbiAqIEBwYXJhbSB7U3RyaW5nfSB0eXBlINCi0LjQvyDRhNC40LvRjNGC0YDQsC5cbiAqIEBwYXJhbSB7TnVtYmVyfSBmcmVxdWVuY3kg0KfQsNGB0YLQvtGC0LAg0YTQuNC70YzRgtGA0LAuXG4gKlxuICogQGZpcmVzIHlhLm11c2ljLkF1ZGlvLmZ4LkVxdWFsaXplcn5FcXVhbGl6ZXJCYW5kI0VWRU5UX0NIQU5HRVxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRXF1YWxpemVyQmFuZCA9IGZ1bmN0aW9uKGF1ZGlvQ29udGV4dCwgdHlwZSwgZnJlcXVlbmN5KSB7XG4gICAgRXZlbnRzLmNhbGwodGhpcyk7XG5cbiAgICB0aGlzLnR5cGUgPSB0eXBlO1xuXG4gICAgdGhpcy5maWx0ZXIgPSBhdWRpb0NvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgdGhpcy5maWx0ZXIudHlwZSA9IHR5cGU7XG4gICAgdGhpcy5maWx0ZXIuZnJlcXVlbmN5LnZhbHVlID0gZnJlcXVlbmN5O1xuICAgIHRoaXMuZmlsdGVyLlEudmFsdWUgPSAxO1xuICAgIHRoaXMuZmlsdGVyLmdhaW4udmFsdWUgPSAwO1xufTtcbkV2ZW50cy5taXhpbihFcXVhbGl6ZXJCYW5kKTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCj0L/RgNCw0LLQu9C10L3QuNC1INC90LDRgdGC0YDQvtC50LrQsNC80LhcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDRh9Cw0YHRgtC+0YLRgyDQv9C+0LvQvtGB0Ysg0L/RgNC+0L/Rg9GB0LrQsNC90LjRjy5cbiAqL1xuRXF1YWxpemVyQmFuZC5wcm90b3R5cGUuZ2V0RnJlcSA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmZpbHRlci5mcmVxdWVuY3kudmFsdWU7XG59O1xuXG4vKipcbiAqIEByZXR1cm5zIHtOdW1iZXJ9INCX0L3QsNGH0LXQvdC40LUg0YPRgdC40LvQtdC90LjRjy5cbiAqL1xuRXF1YWxpemVyQmFuZC5wcm90b3R5cGUuZ2V0VmFsdWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIuZ2Fpbi52YWx1ZTtcbn07XG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0LfQvdCw0YfQtdC90LjQtSDRg9GB0LjQu9C10L3QuNGPLlxuICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlINCX0L3QsNGH0LXQvdC40LUuXG4gKi9cbkVxdWFsaXplckJhbmQucHJvdG90eXBlLnNldFZhbHVlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB0aGlzLmZpbHRlci5nYWluLnZhbHVlID0gdmFsdWU7XG4gICAgdGhpcy50cmlnZ2VyKEVxdWFsaXplclN0YXRpYy5FVkVOVF9DSEFOR0UsIHZhbHVlKTtcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXF1YWxpemVyQmFuZDtcbiIsIi8qKlxuICogQG5hbWVzcGFjZSBFcXVhbGl6ZXJTdGF0aWNcbiAqIEBwcml2YXRlXG4gKi9cbnZhciBFcXVhbGl6ZXJTdGF0aWMgPSB7fTtcblxuLyoqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3QqL1xuRXF1YWxpemVyU3RhdGljLkVWRU5UX0NIQU5HRSA9IFwiY2hhbmdlXCI7XG5cbm1vZHVsZS5leHBvcnRzID0gRXF1YWxpemVyU3RhdGljO1xuIiwidmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uLy4uL2xpYi9hc3luYy9ldmVudHMnKTtcbnZhciBtZXJnZSA9IHJlcXVpcmUoJy4uLy4uL2xpYi9kYXRhL21lcmdlJyk7XG5cbnZhciBFcXVhbGl6ZXJTdGF0aWMgPSByZXF1aXJlKCcuL2VxdWFsaXplci1zdGF0aWMnKTtcbnZhciBFcXVhbGl6ZXJCYW5kID0gcmVxdWlyZSgnLi9lcXVhbGl6ZXItYmFuZCcpO1xuXG4vKipcbiAqINCe0L/QuNGB0LDQvdC40LUg0L3QsNGB0YLRgNC+0LXQuiDRjdC60LLQsNC70LDQudC30LXRgNCwLlxuICogQHR5cGVkZWYge09iamVjdH0gQXVkaW8uZnguRXF1YWxpemVyLkVxdWFsaXplclByZXNldFxuICogQHByb3BlcnR5IHtTdHJpbmd9IFtpZF0g0JjQtNC10L3RgtC40YTQuNC60LDRgtC+0YAg0L3QsNGB0YLRgNC+0LXQui5cbiAqIEBwcm9wZXJ0eSB7TnVtYmVyfSBwcmVhbXAg0J/RgNC10LTRg9GB0LjQu9C40YLQtdC70YwuXG4gKiBAcHJvcGVydHkge0FycmF5LjxOdW1iZXI+fSBiYW5kcyDQl9C90LDRh9C10L3QuNGPINC00LvRjyDQv9C+0LvQvtGBINGN0LrQstCw0LvQsNC50LfQtdGA0LAuXG4gKi9cblxuLyoqXG4gKiDQodC+0LHRi9GC0LjQtSDQuNC30LzQtdC90LXQvdC40Y8g0L/QvtC70L7RgdGLINC/0YDQvtC/0YPRgdC60LDQvdC40Y9cbiAqIEBldmVudCBBdWRpby5meC5FcXVhbGl6ZXIjRVZFTlRfQ0hBTkdFXG4gKlxuICogQHBhcmFtIHtOdW1iZXJ9IGZyZXEg0KfQsNGB0YLQvtGC0LAg0L/QvtC70L7RgdGLINC/0YDQvtC/0YPRgdC60LDQvdC40Y8uXG4gKiBAcGFyYW0ge051bWJlcn0gdmFsdWUg0JfQvdCw0YfQtdC90LjQtSDRg9GB0LjQu9C10L3QuNGPLlxuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQmtC+0L3RgdGC0YDRg9C60YLQvtGAXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQGNsYXNzZGVjcyDQrdC60LLQsNC70LDQudC30LXRgC5cbiAqIEBjbGFzcyBFcXVhbGl6ZXJcbiAqIEBhbGlhcyB5YS5tdXNpYy5BdWRpby5meC5FcXVhbGl6ZXJcbiAqXG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYXVkaW9Db250ZXh0INCa0L7QvdGC0LXQutGB0YIgV2ViIEF1ZGlvIEFQSS5cbiAqIEBwYXJhbSB7QXJyYXkuPE51bWJlcj59IGJhbmRzINCh0L/QuNGB0L7QuiDRh9Cw0YHRgtC+0YIg0LTQu9GPINC/0L7Qu9C+0YEg0Y3QutCy0LDQu9Cw0LnQt9C10YDQsC5cbiAqXG4gKiBAZXh0ZW5kcyBFdmVudHNcbiAqIEBtaXhlcyBFcXVhbGl6ZXJTdGF0aWNcbiAqXG4gKiBAZmlyZXMgeWEubXVzaWMuQXVkaW8uZnguRXF1YWxpemVyI0VWRU5UX0NIQU5HRVxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgRXF1YWxpemVyID0gZnVuY3Rpb24oYXVkaW9Db250ZXh0LCBiYW5kcykge1xuICAgIEV2ZW50cy5jYWxsKHRoaXMpO1xuXG4gICAgdGhpcy5wcmVhbXAgPSBuZXcgRXF1YWxpemVyQmFuZChhdWRpb0NvbnRleHQsIFwiaGlnaHNoZWxmXCIsIDApO1xuICAgIHRoaXMucHJlYW1wLm9uKFwiKlwiLCB0aGlzLl9vbkJhbmRFdmVudC5iaW5kKHRoaXMsIHRoaXMucHJlYW1wKSk7XG5cbiAgICBiYW5kcyA9IGJhbmRzIHx8IEVxdWFsaXplci5ERUZBVUxUX0JBTkRTO1xuXG4gICAgdmFyIHByZXY7XG4gICAgdGhpcy5iYW5kcyA9IGJhbmRzLm1hcChmdW5jdGlvbihmcmVxdWVuY3ksIGlkeCkge1xuICAgICAgICB2YXIgYmFuZCA9IG5ldyBFcXVhbGl6ZXJCYW5kKFxuICAgICAgICAgICAgYXVkaW9Db250ZXh0LFxuXG4gICAgICAgICAgICBpZHggPT0gMCA/ICdsb3dzaGVsZidcbiAgICAgICAgICAgICAgICA6IGlkeCArIDEgPCBiYW5kcy5sZW5ndGggPyBcInBlYWtpbmdcIlxuICAgICAgICAgICAgICAgIDogXCJoaWdoc2hlbGZcIixcblxuICAgICAgICAgICAgZnJlcXVlbmN5XG4gICAgICAgICk7XG4gICAgICAgIGJhbmQub24oXCIqXCIsIHRoaXMuX29uQmFuZEV2ZW50LmJpbmQodGhpcywgYmFuZCkpO1xuXG4gICAgICAgIGlmICghcHJldikge1xuICAgICAgICAgICAgdGhpcy5wcmVhbXAuZmlsdGVyLmNvbm5lY3QoYmFuZC5maWx0ZXIpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgcHJldi5maWx0ZXIuY29ubmVjdChiYW5kLmZpbHRlcik7XG4gICAgICAgIH1cblxuICAgICAgICBwcmV2ID0gYmFuZDtcbiAgICAgICAgcmV0dXJuIGJhbmQ7XG4gICAgfS5iaW5kKHRoaXMpKTtcblxuICAgIHRoaXMuaW5wdXQgPSB0aGlzLnByZWFtcC5maWx0ZXI7XG4gICAgdGhpcy5vdXRwdXQgPSB0aGlzLmJhbmRzW3RoaXMuYmFuZHMubGVuZ3RoIC0gMV0uZmlsdGVyO1xufTtcbkV2ZW50cy5taXhpbihFcXVhbGl6ZXIpO1xubWVyZ2UoRXF1YWxpemVyLCBFcXVhbGl6ZXJTdGF0aWMsIHRydWUpO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J3QsNGB0YLRgNC+0LnQutC4INC/0L4t0YPQvNC+0LvRh9Cw0L3QuNGOXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0J3QsNCx0L7RgCDRh9Cw0YHRgtC+0YIg0Y3QutCy0LDQu9Cw0LnQt9C10YDQsCwg0L/RgNC40LzQtdC90Y/RjtGJ0LjQudGB0Y8g0L/QviDRg9C80L7Qu9GH0LDQvdC40Y4uXG4gKiBAdHlwZSB7QXJyYXkuPE51bWJlcj59XG4gKiBAY29uc3RcbiAqL1xuRXF1YWxpemVyLkRFRkFVTFRfQkFORFMgPSByZXF1aXJlKCcuL2RlZmF1bHQuYmFuZHMuanMnKTtcblxuLyoqXG4gKiDQndCw0LHQvtGAINGA0LDRgdC/0YDQvtGB0YLRgNCw0L3QtdC90L3Ri9GFINC/0YDQtdGB0LXRgtC+0LIg0Y3QutCy0LDQu9Cw0LnQt9C10YDQsCDQtNC70Y8g0L3QsNCx0L7RgNCwINGH0LDRgdGC0L7RgiDQv9C+INGD0LzQvtC70YfQsNC90LjRji5cbiAqIEB0eXBlIHtPYmplY3QuPFN0cmluZywgeWEubXVzaWMuQXVkaW8uZnguRXF1YWxpemVyfkVxdWFsaXplclByZXNldD59XG4gKiBAY29uc3RcbiAqL1xuRXF1YWxpemVyLkRFRkFVTFRfUFJFU0VUUyA9IHJlcXVpcmUoJy4vZGVmYXVsdC5wcmVzZXRzLmpzJyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQntCx0YDQsNCx0L7RgtC60LAg0YHQvtCx0YvRgtC40LlcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtC60LAg0YHQvtCx0YvRgtC40Y8g0L/QvtC70L7RgdGLINGN0LrQstCw0LvQsNC50LfQtdGA0LBcbiAqIEBwYXJhbSB7RXF1YWxpemVyQmFuZH0gYmFuZCAtINC/0L7Qu9C+0YHQsCDRjdC60LLQsNC70LDQudC30LXRgNCwXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQgLSDRgdC+0LHRi9GC0LjQtVxuICogQHBhcmFtIHsqfSBkYXRhIC0g0LTQsNC90L3Ri9C1INGB0L7QsdGL0YLQuNGPXG4gKiBAcHJpdmF0ZVxuICovXG5FcXVhbGl6ZXIucHJvdG90eXBlLl9vbkJhbmRFdmVudCA9IGZ1bmN0aW9uKGJhbmQsIGV2ZW50LCBkYXRhKSB7XG4gICAgdGhpcy50cmlnZ2VyKGV2ZW50LCBiYW5kLmdldEZyZXEoKSwgZGF0YSk7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0JfQsNCz0YDRg9C30LrQsCDQuCDRgdC+0YXRgNCw0L3QtdC90LjQtSDQvdCw0YHRgtGA0L7QtdC6XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0JfQsNCz0YDRg9C30LjRgtGMINC90LDRgdGC0YDQvtC50LrQuC5cbiAqIEBwYXJhbSB7eWEubXVzaWMuQXVkaW8uZnguRXF1YWxpemVyfkVxdWFsaXplclByZXNldH0gcHJlc2V0INCd0LDRgdGC0YDQvtC50LrQuC5cbiAqL1xuRXF1YWxpemVyLnByb3RvdHlwZS5sb2FkUHJlc2V0ID0gZnVuY3Rpb24ocHJlc2V0KSB7XG4gICAgcHJlc2V0LmJhbmRzLmZvckVhY2goZnVuY3Rpb24odmFsdWUsIGlkeCkge1xuICAgICAgICB0aGlzLmJhbmRzW2lkeF0uc2V0VmFsdWUodmFsdWUpO1xuICAgIH0uYmluZCh0aGlzKSk7XG4gICAgdGhpcy5wcmVhbXAuc2V0VmFsdWUocHJlc2V0LnByZWFtcCk7XG59O1xuXG4vKipcbiAqINCh0L7RhdGA0LDQvdC40YLRjCDRgtC10LrRg9GJ0LjQtSDQvdCw0YHRgtGA0L7QudC60LguXG4gKiBAcmV0dXJucyB7eWEubXVzaWMuQXVkaW8uZnguRXF1YWxpemVyfkVxdWFsaXplclByZXNldH1cbiAqL1xuRXF1YWxpemVyLnByb3RvdHlwZS5zYXZlUHJlc2V0ID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgICAgcHJlYW1wOiB0aGlzLnByZWFtcC5nZXRWYWx1ZSgpLFxuICAgICAgICBiYW5kczogdGhpcy5iYW5kcy5tYXAoZnVuY3Rpb24oYmFuZCkgeyByZXR1cm4gYmFuZC5nZXRWYWx1ZSgpOyB9KVxuICAgIH07XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0JzQsNGC0LXQvNCw0YLQuNC60LBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy9UT0RPOiDQv9GA0L7QstC10YDQuNGC0Ywg0L/RgNC10LTQv9C+0LvQvtC20LXQvdC40LUgKNGB0LrQvtGA0LXQtSDQstGB0LXQs9C+INC90YPQttC90LAg0LrQsNGA0YLQsCDQstC10YHQvtCyINC00LvRjyDRgNCw0LfQu9C40YfQvdGL0YUg0YfQsNGB0YLQvtGCINC40LvQuCDQtNCw0LbQtSDQvdC10LrQsNGPINGE0YPQvdC60YbQuNGPKVxuLyoqXG4gKiDQktGL0YfQuNGB0LvRj9C10YIg0L7Qv9GC0LjQvNCw0LvRjNC90L7QtSDQt9C90LDRh9C10L3QuNC1INC/0YDQtdC00YPRgdC40LvQtdC90LjRjy4g0KTRg9C90LrRhtC40Y8g0Y/QstC70Y/QtdGC0YHRjyDRjdC60YHQv9C10YDQuNC80LXQvdGC0LDQu9GM0L3QvtC5LlxuICogQGV4cGVyaW1lbnRhbFxuICogQHJldHVybnMge251bWJlcn0g0LfQvdCw0YfQtdC90LjQtSDQv9GA0LXQtNGD0YHQuNC70LXQvdC40Y8uXG4gKi9cbkVxdWFsaXplci5wcm90b3R5cGUuZ3Vlc3NQcmVhbXAgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgdiA9IDA7XG4gICAgZm9yICh2YXIgayA9IDAsIGwgPSB0aGlzLmJhbmRzLmxlbmd0aDsgayA8IGw7IGsrKykge1xuICAgICAgICB2ICs9IHRoaXMuYmFuZHNba10uZ2V0VmFsdWUoKTtcbiAgICB9XG5cbiAgICByZXR1cm4gLXYgLyAyO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBFcXVhbGl6ZXI7XG4iLCJyZXF1aXJlKCcuLi9leHBvcnQnKTtcblxueWEubXVzaWMuQXVkaW8uZnguRXF1YWxpemVyID0gcmVxdWlyZSgnLi9lcXVhbGl6ZXInKTtcbiIsInJlcXVpcmUoJy4uL2V4cG9ydCcpO1xuXG55YS5tdXNpYy5BdWRpby5meCA9IHt9O1xuIiwicmVxdWlyZSgnLi4vZXhwb3J0Jyk7XG5cbnlhLm11c2ljLkF1ZGlvLmZ4LnZvbHVtZUxpYiA9IHJlcXVpcmUoJy4vdm9sdW1lLWxpYicpO1xuIiwiLyoqXG4gKiDQnNC10YLQvtC00Ysg0LrQvtC90LLQtdGA0YLQsNGG0LjQuCDQt9C90LDRh9C10L3QuNC5INCz0YDQvtC80LrQvtGB0YLQuC5cbiAqIEBhbGlhcyB5YS5tdXNpYy5BdWRpby5meC52b2x1bWVMaWJcbiAqIEBuYW1lc3BhY2VcbiAqL1xudmFyIHZvbHVtZUxpYiA9IHt9O1xuXG4vKipcbiAqINCc0LjQvdC40LzQsNC70YzQvdC+0LUg0LfQvdCw0YfQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LgsINC/0YDQuCDQutC+0YLQvtGA0L7QvCDQv9GA0L7QuNGB0YXQvtC00LjRgiDQvtGC0LrQu9GO0YfQtdC90LjQtSDQt9Cy0YPQutCwLlxuICog0J7Qs9GA0LDQvdC40YfQtdC90LjQtSDQsiAwLjAxINC/0L7QtNC+0LHRgNCw0L3QviDRjdC80L/QuNGA0LjRh9C10YHQutC4LlxuICogQHR5cGUge251bWJlcn1cbiAqL1xudm9sdW1lTGliLkVQU0lMT04gPSAwLjAxO1xuXG4vKipcbiAqINCa0L7RjdGE0YTQuNGG0LjQtdC90YIg0LTQu9GPINC/0YDQtdC+0LHRgNCw0LfQvtCy0LDQvdC40Lkg0LPRgNC+0LzQutC+0YHRgtC4INC40Lcg0L7RgtC90L7RgdC40YLQtdC70YzQvdC+0Lkg0YjQutCw0LvRiyDQsiDQtNC10YbQuNCx0LXQu9GLLlxuICogQHR5cGUgTnVtYmVyXG4gKiBAcHJpdmF0ZVxuICovXG52b2x1bWVMaWIuX0RCRlNfQ09FRiA9IDIwIC8gTWF0aC5sb2coMTApO1xuXG4vKipcbiAqINCS0YvRh9C40YHQu9C10L3QuNC1INC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4INC/0L4g0LfQvdCw0YfQtdC90LjRjiDQvdCwINC70L7Qs9Cw0YDQuNGE0LzQuNGH0LXRgdC60L7QuSDRiNC60LDQu9C1LlxuICogQHBhcmFtIHtOdW1iZXJ9IHZhbHVlINCX0L3QsNGH0LXQvdC40LUg0L3QsCDRiNC60LDQu9C1LlxuICogQHJldHVybnMge051bWJlcn0g0LfQvdCw0YfQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0LguXG4gKi9cbnZvbHVtZUxpYi50b0V4cG9uZW50ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICB2YXIgdm9sdW1lID0gTWF0aC5wb3codm9sdW1lTGliLkVQU0lMT04sIDEgLSB2YWx1ZSk7XG4gICAgcmV0dXJuIHZvbHVtZSA+IHZvbHVtZUxpYi5FUFNJTE9OID8gdm9sdW1lIDogMDtcbn07XG5cbi8qKlxuICogQHBhcmFtIHtOdW1iZXJ9IHZvbHVtZSDQk9GA0L7QvNC60L7RgdGC0YwuXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDQt9C90LDRh9C10L3QuNGPINC/0L7Qu9C+0LbQtdC90LjRjyDQvdCwINC70L7Qs9Cw0YDQuNGE0LzQuNGH0LXRgdC60L7QuSDRiNC60LDQu9C1INC/0L4g0LfQvdCw0YfQtdC90LjRjiDQs9GA0L7QvNC60L7RgdGC0LguXG4gKi9cbnZvbHVtZUxpYi5mcm9tRXhwb25lbnQgPSBmdW5jdGlvbih2b2x1bWUpIHtcbiAgICByZXR1cm4gMSAtIE1hdGgubG9nKE1hdGgubWF4KHZvbHVtZSwgdm9sdW1lTGliLkVQU0lMT04pKSAvIE1hdGgubG9nKHZvbHVtZUxpYi5FUFNJTE9OKTtcbn07XG5cbi8qKlxuICogQHBhcmFtIHtOdW1iZXJ9IHZvbHVtZSDQntGC0L3QvtGB0LjRgtC10LvRjNC90LDRjyDQs9GA0L7QvNC60L7RgdGC0YwuXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDQt9C90LDRh9C10L3QuNGPIGRCRlMg0LjQtyDQvtGC0L3QvtGB0LjRgtC10LvRjNC90L7Qs9C+INC30L3QsNGH0LXQvdC40Y8g0LPRgNC+0LzQutC+0YHRgtC4LlxuICovXG52b2x1bWVMaWIudG9EQkZTID0gZnVuY3Rpb24odm9sdW1lKSB7XG4gICAgcmV0dXJuIE1hdGgubG9nKHZvbHVtZSkgKiB2b2x1bWVMaWIuX0RCRlNfQ09FRjtcbn07XG5cbi8qKlxuICogQHBhcmFtIHtOdW1iZXJ9IGRiZnMg0JPRgNC+0LzQutC+0YHRgtGMINCyIGRCRlMuXG4gKiBAcmV0dXJucyB7TnVtYmVyfSDQt9C90LDRh9C10L3QuNGPINC+0YLQvdC+0YHQuNGC0LXQu9GM0L3QvtC5INCz0YDQvtC80LrQvtGB0YLQuCDQuNC3INC30L3QsNGH0LXQvdC40Y8gZEJGUy5cbiAqL1xudm9sdW1lTGliLmZyb21EQkZTID0gZnVuY3Rpb24oZGJmcykge1xuICAgIHJldHVybiBNYXRoLmV4cChkYmZzIC8gdm9sdW1lTGliLl9EQkZTX0NPRUYpO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSB2b2x1bWVMaWI7XG4iLCJ2YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2xvZ2dlcicpO1xudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoJ0F1ZGlvSFRNTDVMb2FkZXInKTtcblxudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL2xpYi9hc3luYy9ldmVudHMnKTtcbnZhciBEZWZlcnJlZCA9IHJlcXVpcmUoJy4uL2xpYi9hc3luYy9kZWZlcnJlZCcpO1xudmFyIEF1ZGlvU3RhdGljID0gcmVxdWlyZSgnLi4vYXVkaW8tc3RhdGljJyk7XG52YXIgUGxheWJhY2tFcnJvciA9IHJlcXVpcmUoJy4uL2Vycm9yL3BsYXliYWNrLWVycm9yJyk7XG52YXIgbm9vcCA9IHJlcXVpcmUoJy4uL2xpYi9ub29wJyk7XG5cbnZhciBsb2FkZXJJZCA9IDE7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQmtC+0L3RgdGC0YDRg9C60YLQvtGAXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQGNsYXNzZGVzYyDQntCx0ZHRgNGC0LrQsCDQtNC70Y8g0L3QsNGC0LjQstC90L7Qs9C+INC60LvQsNGB0YHQsCBBdWRpb1xuICogQGV4dGVuZHMgRXZlbnRzXG4gKipcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9QTEFZXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jRVZFTlRfRU5ERURcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9TVE9QXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jRVZFTlRfUEFVU0VcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9QUk9HUkVTU1xuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0xPQURJTkdcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9MT0FERURcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9FUlJPUlxuICpcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIEF1ZGlvSFRNTDVMb2FkZXIgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLm5hbWUgPSBsb2FkZXJJZCsrO1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJjb25zdHJ1Y3RvclwiKTtcblxuICAgIEV2ZW50cy5jYWxsKHRoaXMpO1xuICAgIHRoaXMub24oXCIqXCIsIGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIGlmIChldmVudCAhPT0gQXVkaW9TdGF0aWMuRVZFTlRfUFJPR1JFU1MpIHtcbiAgICAgICAgICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJvbkV2ZW50XCIsIGV2ZW50KTtcbiAgICAgICAgfVxuICAgIH0uYmluZCh0aGlzKSk7XG5cbiAgICAvKipcbiAgICAgKiDQmtC+0L3RgtC10LnQvdC10YAg0LTQu9GPINGA0LDQt9C70LjRh9C90YvRhSDQvtC20LjQtNCw0L3QuNC5INGB0L7QsdGL0YLQuNC5XG4gICAgICogQHR5cGUge09iamVjdC48U3RyaW5nLCBEZWZlcnJlZD59XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB0aGlzLnByb21pc2VzID0ge307XG5cbiAgICAvKipcbiAgICAgKiDQodGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICAgICAqIEB0eXBlIHtzdHJpbmd9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB0aGlzLnNyYyA9IFwiXCI7XG4gICAgLyoqXG4gICAgICog0J3QsNC30L3QsNGH0LXQvdC90LDRjyDQv9C+0LfQuNGG0LjRjyDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAgICAgKiBAdHlwZSB7bnVtYmVyfVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpcy5wb3NpdGlvbiA9IDA7XG5cbiAgICAvKipcbiAgICAgKiDQktGA0LXQvNGPINC/0L7RgdC70LXQtNC90LXQs9C+INC+0LHQvdC+0LLQu9C10L3QuNGPINC00LDQvdC90YvRhVxuICAgICAqIEB0eXBlIHtudW1iZXJ9XG4gICAgICogQHByaXZhdGVcbiAgICAgKi9cbiAgICB0aGlzLmxhc3RVcGRhdGUgPSAwO1xuXG4gICAgLyoqXG4gICAgICog0KTQu9Cw0LMg0L3QsNGH0LDQu9CwINC30LDQs9GA0YPQt9C60LhcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHRoaXMubm90TG9hZGluZyA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiDQktGL0YXQvtC0INC00LvRjyBXZWIgQXVkaW8gQVBJXG4gICAgICogQHR5cGUge0F1ZGlvTm9kZX1cbiAgICAgKiBAcHJpdmF0ZVxuICAgICAqL1xuICAgIHRoaXMub3V0cHV0ID0gbnVsbDtcblxuICAgIC8vLS0tINCh0LDRhdCw0YAg0LTQu9GPINC30LDRidC40YLRiyDQvtGCINGD0YLQtdGH0LXQuiDQv9Cw0LzRj9GC0LhcbiAgICB0aGlzLl9fc3RhcnRQbGF5ID0gdGhpcy5fc3RhcnRQbGF5LmJpbmQodGhpcyk7XG4gICAgdGhpcy5fX3Jlc3RhcnQgPSB0aGlzLl9yZXN0YXJ0LmJpbmQodGhpcyk7XG4gICAgdGhpcy5fX3N0YXJ0dXBBdWRpbyA9IHRoaXMuX3N0YXJ0dXBBdWRpby5iaW5kKHRoaXMpO1xuXG4gICAgdGhpcy5fX3VwZGF0ZVByb2dyZXNzID0gdGhpcy5fdXBkYXRlUHJvZ3Jlc3MuYmluZCh0aGlzKTtcbiAgICB0aGlzLl9fb25OYXRpdmVMb2FkaW5nID0gdGhpcy5fb25OYXRpdmVMb2FkaW5nLmJpbmQodGhpcyk7XG4gICAgdGhpcy5fX29uTmF0aXZlRW5kZWQgPSB0aGlzLl9vbk5hdGl2ZUVuZGVkLmJpbmQodGhpcyk7XG4gICAgdGhpcy5fX29uTmF0aXZlRXJyb3IgPSB0aGlzLl9vbk5hdGl2ZUVycm9yLmJpbmQodGhpcyk7XG4gICAgdGhpcy5fX29uTmF0aXZlUGF1c2UgPSB0aGlzLl9vbk5hdGl2ZVBhdXNlLmJpbmQodGhpcyk7XG5cbiAgICB0aGlzLl9fb25OYXRpdmVQbGF5ID0gdGhpcy50cmlnZ2VyLmJpbmQodGhpcywgQXVkaW9TdGF0aWMuRVZFTlRfUExBWSk7XG5cbiAgICB0aGlzLl9pbml0QXVkaW8oKTtcbn07XG5FdmVudHMubWl4aW4oQXVkaW9IVE1MNUxvYWRlcik7XG5cbi8qKlxuICog0JjQvdGC0LXRgNCy0LDQuyDQvtCx0L3QvtCy0LvQtdC90LjRjyDRgtCw0LnQvNC40L3Qs9C+0LIg0YLRgNC10LrQsFxuICogQHR5cGUge251bWJlcn1cbiAqIEBwcml2YXRlXG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5fdXBkYXRlSW50ZXJ2YWwgPSAzMDtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCd0LDRgtC40LLQvdGL0LUg0YHQvtCx0YvRgtC40Y8gQXVkaW9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQndCw0YLQuNCy0L3QvtC1INGB0L7QsdGL0YLQuNC1INC90LDRh9Cw0LvQsCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfUExBWSA9IFwicGxheVwiO1xuXG4vKipcbiAqINCd0LDRgtC40LLQvdC+0LUg0YHQvtCx0YvRgtC40LUg0L/QsNGD0LfRi1xuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9QQVVTRSA9IFwicGF1c2VcIjtcblxuLyoqXG4gKiDQndCw0YLQuNCy0L3QvtC1INGB0L7QsdGL0YLQuNC1INC+0LHQvdC+0LLQu9C10L3QuNC1INC/0L7Qt9C40YbQuNC4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9USU1FVVBEQVRFID0gXCJ0aW1ldXBkYXRlXCI7XG5cbi8qKlxuICog0J3QsNGC0LjQstC90L7QtSDRgdC+0LHRi9GC0LjQtSDQt9Cw0LLQtdGA0YjQtdC90LjRjyDRgtGA0LXQutCwXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0VOREVEID0gXCJlbmRlZFwiO1xuXG4vKipcbiAqINCd0LDRgtC40LLQvdC+0LUg0YHQvtCx0YvRgtC40LUg0LjQt9C80LXQvdC10L3QuNGPINC00LvQuNGC0LXQu9GM0L3QvtGB0YLQuFxuICogQHR5cGUge3N0cmluZ31cbiAqIEBjb25zdFxuICovXG5BdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9EVVJBVElPTiA9IFwiZHVyYXRpb25jaGFuZ2VcIjtcblxuLyoqXG4gKiDQndCw0YLQuNCy0L3QvtC1INGB0L7QsdGL0YLQuNC1INC40LfQvNC10L3QtdC90LjRjyDQtNC70LjRgtC10LvRjNC90L7RgdGC0Lgg0LfQsNCz0YDRg9C20LXQvdC90L7QuSDRh9Cw0YHRgtC4XG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0xPQURJTkcgPSBcInByb2dyZXNzXCI7XG5cbi8qKlxuICog0J3QsNGC0LjQstC90L7QtSDRgdC+0LHRi9GC0LjQtSDQtNC+0YHRgtGD0L/QvdC+0YHRgtC4INC80LXRgtCwLdC00LDQvdC90YvRhSDRgtGA0LXQutCwXG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX01FVEEgPSBcImxvYWRlZG1ldGFkYXRhXCI7XG5cbi8qKlxuICog0J3QsNGC0LjQstC90L7QtSDRgdC+0LHRi9GC0LjQtSDQstC+0LfQvNC+0LbQvdC+0YHRgtC4INC90LDRh9Cw0YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LVcbiAqIEB0eXBlIHtzdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfQ0FOUExBWSA9IFwiY2FucGxheVwiO1xuXG4vKipcbiAqINCd0LDRgtC40LLQvdC+0LUg0YHQvtCx0YvRgtC40LUg0L7RiNC40LHQutC4XG4gKiBAdHlwZSB7c3RyaW5nfVxuICogQGNvbnN0XG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0VSUk9SID0gXCJlcnJvclwiO1xuXG4vKipcbiAqINCX0LDQs9C70YPRiNC60LAg0LTQu9GPIF9faW5pdExpc3RlbmVyJ9CwINC90LAg0LLRgNC10LzRjyDQvtC20LjQtNCw0L3QuNGPINC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjNGB0LrQvtCz0L4g0LTQtdC50YHRgtCy0LjRj1xuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5fZGVmYXVsdEluaXRMaXN0ZW5lciA9IGZ1bmN0aW9uKCkge307XG5BdWRpb0hUTUw1TG9hZGVyLl9kZWZhdWx0SW5pdExpc3RlbmVyLnN0ZXAgPSBcInVzZXJcIjtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCe0LHRgNCw0LHQvtGC0YfQuNC60Lgg0YHQvtCx0YvRgtC40LlcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtGH0LjQuiDQvtCx0L3QvtCy0LvQtdC90LjRjyDRgtCw0LnQvNC40L3Qs9C+0LIg0YLRgNC10LrQsFxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX3VwZGF0ZVByb2dyZXNzID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGN1cnJlbnRUaW1lID0gK25ldyBEYXRlKCk7XG4gICAgaWYgKGN1cnJlbnRUaW1lIC0gdGhpcy5sYXN0VXBkYXRlIDwgQXVkaW9IVE1MNUxvYWRlci5fdXBkYXRlSW50ZXJ2YWwpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMubGFzdFVwZGF0ZSA9IGN1cnJlbnRUaW1lO1xuICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9QUk9HUkVTUyk7XG59O1xuXG4vKipcbiAqINCe0LHRgNCw0LHQvtGC0YfQuNC6INGB0L7QsdGL0YLQuNC5INC30LDQs9GA0YPQt9C60Lgg0YLRgNC10LrQsFxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX29uTmF0aXZlTG9hZGluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3VwZGF0ZVByb2dyZXNzKCk7XG5cbiAgICBpZiAodGhpcy5hdWRpby5idWZmZXJlZC5sZW5ndGgpIHtcbiAgICAgICAgdmFyIGxvYWRlZCA9IHRoaXMuYXVkaW8uYnVmZmVyZWQuZW5kKDApIC0gdGhpcy5hdWRpby5idWZmZXJlZC5zdGFydCgwKTtcblxuICAgICAgICBpZiAodGhpcy5ub3RMb2FkaW5nICYmIGxvYWRlZCkge1xuICAgICAgICAgICAgdGhpcy5ub3RMb2FkaW5nID0gZmFsc2U7XG4gICAgICAgICAgICB0aGlzLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfTE9BRElORyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAobG9hZGVkID49IHRoaXMuYXVkaW8uZHVyYXRpb24gLSAwLjEpIHtcbiAgICAgICAgICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9MT0FERUQpO1xuICAgICAgICB9XG4gICAgfVxufTtcblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtGH0LjQuiDRgdC+0LHRi9GC0LjRjyDQvtC60L7QvdGH0LDQvdC40Y8g0YLRgNC10LrQsFxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX29uTmF0aXZlRW5kZWQgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfUFJPR1JFU1MpO1xuICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9FTkRFRCk7XG4gICAgdGhpcy5lbmRlZCA9IHRydWU7XG4gICAgdGhpcy5wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5hdWRpby5wYXVzZSgpO1xufTtcblxuLyoqXG4gKiDQntCx0YDQsNCx0L7RgtGH0LjQuiDQvtGI0LjQsdC+0Log0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge0V2ZW50fSBlIC0g0KHQvtCx0YvRgtC40LUg0L7RiNC40LHQutC4XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fb25OYXRpdmVFcnJvciA9IGZ1bmN0aW9uKGUpIHtcbiAgICBpZiAoIXRoaXMuc3JjKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5hdWRpby5lcnJvci5jb2RlID09IDIpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJOZXR3b3JrIGVycm9yLiBSZXN0YXJ0aW5nLi4uXCIsIGxvZ2dlci5fc2hvd1VybCh0aGlzLnNyYykpO1xuICAgICAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5hdWRpby5jdXJyZW50VGltZTtcbiAgICAgICAgdGhpcy5fcmVzdGFydCgpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIGVycm9yID0gbmV3IFBsYXliYWNrRXJyb3IodGhpcy5hdWRpby5lcnJvclxuICAgICAgICAgICAgPyBQbGF5YmFja0Vycm9yLmh0bWw1W3RoaXMuYXVkaW8uZXJyb3IuY29kZV1cbiAgICAgICAgICAgIDogZSBpbnN0YW5jZW9mIEVycm9yID8gZS5tZXNzYWdlIDogZSxcbiAgICAgICAgdGhpcy5zcmMpO1xuXG4gICAgdGhpcy5wbGF5aW5nID0gZmFsc2U7XG5cbiAgICB0aGlzLnRyaWdnZXIoQXVkaW9TdGF0aWMuRVZFTlRfRVJST1IsIGVycm9yKTtcbn07XG5cbi8qKlxuICog0J7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40Y8g0L/QsNGD0LfRi1xuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX29uTmF0aXZlUGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBpZiAoIXRoaXMuZW5kZWQpIHtcbiAgICAgICAgdGhpcy50cmlnZ2VyKEF1ZGlvU3RhdGljLkVWRU5UX1BBVVNFKTtcbiAgICB9XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0JjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0Lgg0LTQtdC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNGPIEF1ZGlvXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0JjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0YHQu9GD0YjQsNGC0LXQu9C10Lkg0L/QvtC70YzQt9C+0LLQsNGC0LXQu9GM0YHQutC40YUg0YHQvtCx0YvRgtC40Lkg0LTQu9GPINC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNC4INC/0LvQtdC10YDQsFxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX2luaXRVc2VyRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIHRoaXMuX19zdGFydHVwQXVkaW8sIHRydWUpO1xuICAgIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgdGhpcy5fX3N0YXJ0dXBBdWRpbywgdHJ1ZSk7XG4gICAgZG9jdW1lbnQuYm9keS5hZGRFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLl9fc3RhcnR1cEF1ZGlvLCB0cnVlKTtcbn07XG5cbi8qKlxuICog0JTQtdC40L3QuNGG0LjQsNC70LjQt9Cw0YbQuNGPINGB0LvRg9GI0LDRgtC10LvQtdC5INC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjNGB0LrQuNGFINGB0L7QsdGL0YLQuNC5INC00LvRjyDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuCDQv9C70LXQtdGA0LBcbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9kZWluaXRVc2VyRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVFdmVudExpc3RlbmVyKFwibW91c2Vkb3duXCIsIHRoaXMuX19zdGFydHVwQXVkaW8sIHRydWUpO1xuICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgdGhpcy5fX3N0YXJ0dXBBdWRpbywgdHJ1ZSk7XG4gICAgZG9jdW1lbnQuYm9keS5yZW1vdmVFdmVudExpc3RlbmVyKFwidG91Y2hzdGFydFwiLCB0aGlzLl9fc3RhcnR1cEF1ZGlvLCB0cnVlKTtcbn07XG5cbi8qKlxuICog0JjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0YHQu9GD0YjQsNGC0LXQu9C10Lkg0L3QsNGC0LjQstC90YvRhSDRgdC+0LHRi9GC0LjQuSBhdWRpby3RjdC70LXQvNC10L3RgtCwXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5faW5pdE5hdGl2ZUV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9QQVVTRSwgdGhpcy5fX29uTmF0aXZlUGF1c2UpO1xuICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9QTEFZLCB0aGlzLl9fb25OYXRpdmVQbGF5KTtcbiAgICB0aGlzLmF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfRU5ERUQsIHRoaXMuX19vbk5hdGl2ZUVuZGVkKTtcbiAgICB0aGlzLmF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfVElNRVVQREFURSwgdGhpcy5fX3VwZGF0ZVByb2dyZXNzKTtcbiAgICB0aGlzLmF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfRFVSQVRJT04sIHRoaXMuX191cGRhdGVQcm9ncmVzcyk7XG4gICAgdGhpcy5hdWRpby5hZGRFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0xPQURJTkcsIHRoaXMuX19vbk5hdGl2ZUxvYWRpbmcpO1xuICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9FUlJPUiwgdGhpcy5fX29uTmF0aXZlRXJyb3IpO1xufTtcblxuLyoqXG4gKiDQlNC10LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0YHQu9GD0YjQsNGC0LXQu9C10Lkg0L3QsNGC0LjQstC90YvRhSDRgdC+0LHRi9GC0LjQuSBhdWRpby3RjdC70LXQvNC10L3RgtCwXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fZGVpbml0TmF0aXZlRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5hdWRpby5yZW1vdmVFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX1BBVVNFLCB0aGlzLl9fb25OYXRpdmVQYXVzZSk7XG4gICAgdGhpcy5hdWRpby5yZW1vdmVFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX1BMQVksIHRoaXMuX19vbk5hdGl2ZVBsYXkpO1xuICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9FTkRFRCwgdGhpcy5fX29uTmF0aXZlRW5kZWQpO1xuICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9USU1FVVBEQVRFLCB0aGlzLl9fdXBkYXRlUHJvZ3Jlc3MpO1xuICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9EVVJBVElPTiwgdGhpcy5fX3VwZGF0ZVByb2dyZXNzKTtcbiAgICB0aGlzLmF1ZGlvLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfTE9BRElORywgdGhpcy5fX29uTmF0aXZlTG9hZGluZyk7XG4gICAgdGhpcy5hdWRpby5yZW1vdmVFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0VSUk9SLCB0aGlzLl9fb25OYXRpdmVFcnJvcik7XG59O1xuXG4vKipcbiAqINCh0L7Qt9C00LDQvdC40LUg0L7QsdGK0LXQutGC0LAgQXVkaW8g0Lgg0L3QsNC30L3QsNGH0LXQvdC40LUg0L7QsdGA0LDQsdC+0YLRh9C40LrQvtCyINGB0L7QsdGL0YLQuNC5XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5faW5pdEF1ZGlvID0gZnVuY3Rpb24oKSB7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9pbml0QXVkaW9cIik7XG5cbiAgICB0aGlzLm11dGVFdmVudHMoKTtcblxuICAgIHRoaXMuYXVkaW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYXVkaW9cIik7XG4gICAgdGhpcy5hdWRpby5sb29wID0gZmFsc2U7IC8vIGZvciBJRVxuICAgIHRoaXMuYXVkaW8ucHJlbG9hZCA9IHRoaXMuYXVkaW8uYXV0b2J1ZmZlciA9IFwiYXV0b1wiOyAvLyAxMDAlXG4gICAgdGhpcy5hdWRpby5hdXRvcGxheSA9IGZhbHNlO1xuICAgIHRoaXMuYXVkaW8uc3JjID0gXCJcIjtcblxuICAgIHRoaXMuX2luaXRVc2VyRXZlbnRzKCk7XG4gICAgdGhpcy5fX2luaXRMaXN0ZW5lciA9IEF1ZGlvSFRNTDVMb2FkZXIuX2RlZmF1bHRJbml0TGlzdGVuZXI7XG5cbiAgICB0aGlzLl9pbml0TmF0aXZlRXZlbnRzKCk7XG59O1xuXG4vKipcbiAqINCe0YLQutC70Y7Rh9C10L3QuNC1INC+0LHRgNCw0LHQvtGC0YfQuNC60L7QsiDRgdC+0LHRi9GC0LjQuSDQuCDRg9C00LDQu9C10L3QuNC1INC+0LHRitC10LrRgtCwIEF1ZGlvXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fZGVpbml0QXVkaW8gPSBmdW5jdGlvbigpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiX2RlaW5pdEF1ZGlvXCIpO1xuXG4gICAgdGhpcy5tdXRlRXZlbnRzKCk7XG5cbiAgICB0aGlzLl9kZWluaXRVc2VyRXZlbnRzKCk7XG4gICAgdGhpcy5fZGVpbml0TmF0aXZlRXZlbnRzKCk7XG5cbiAgICB0aGlzLmF1ZGlvID0gbnVsbDtcbn07XG5cbi8qKlxuICog0JjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0L7QsdGK0LXQutGC0LAgQXVkaW8uINCU0LvRjyDQvdCw0YfQsNC70LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INGC0YDQtdCx0YPQtdGC0YHRjyDQu9GO0LHQvtC1INC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjNGB0LrQvtC1INC00LXQudGB0YLQstC40LUuXG4gKlxuICog0KHQvtCy0LXRgNGI0LXQvdC90L4g0Y3Qt9C+0YLQtdGA0LjRh9C90YvQuSDQuCDQvNCw0LPQuNGH0LXRgdC60LjQuSDQvNC10YLQvtC0LiDQlNC70Y8g0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Lgg0L/Qu9C10LXRgNCwINGC0YDQtdCx0YPQtdGC0YHRjyDQstGL0LfRi9Cy0LDRgtGMINC80LXRgtC+0LQgcGxheSDQsiDQvtCx0YDQsNCx0L7RgtGH0LjQutC1XG4gKiDQv9C+0LvRjNC30L7QstCw0YLQtdC70YzRgdC60L7Qs9C+INGB0L7QsdGL0YLQuNGPLiDQn9C+0YHQu9C1INGN0YLQvtCz0L4g0YLRgNC10LHRg9C10YLRgdGPINC/0L7RgdGC0LDQstC40YLRjCDQv9C70LXQtdGAINC+0LHRgNCw0YLQvdC+INC90LAg0L/QsNGD0LfRgywg0YIu0LouINC90LXQutC+0YLQvtGA0YvQtSDQsdGA0LDRg9C30LXRgNGLXG4gKiDQsiDQv9GA0L7RgtC40LLQvdC+0Lwg0YHQu9GD0YfQsNC1INC90LDRh9C40L3QsNGO0YIg0L/RgNC+0LjQs9GA0YvQstCw0YLRjCDRgtGA0LXQuiDQsNCy0YLQvtC80LDRgtC40YfQtdGB0LrQuCDQutCw0Log0YLQvtC70YzQutC+INC+0L0g0LfQsNCz0YDRg9C20LDQtdGC0YHRjy4g0J/RgNC4INGN0YLQvtC8INCyINC90LXQutC+0YLQvtGA0YvRhSDQsdGA0LDRg9C30LXRgNCw0YVcbiAqINC/0L7RgdC70LUg0LLRi9C30L7QstCwINC80LXRgtC+0LTQsCBsb2FkINGB0L7QsdGL0YLQuNC1IHBsYXkg0L3QuNC60L7Qs9C00LAg0L3QtSDQvdCw0YHRgtGD0L/QsNC10YIsINGC0LDQuiDRh9GC0L4g0L/RgNC40YXQvtC00LjRgtGB0Y8g0YHQu9GD0YjQsNGC0Ywg0YHQvtCx0YvRgtC40Y8g0L/QvtC70YPRh9C10L3QuNGPINC80LXRgtCw0LTQsNC90L3Ri9GFXG4gKiDQuNC70Lgg0L7RiNC40LHQutC4INC30LDQs9GA0YPQt9C60LggKNC10YHQu9C4IHNyYyDQvdC1INGD0LrQsNC30LDQvSkuINCSINC90LXQutC+0YLQvtGA0YvRhSDQsdGA0LDRg9C30LXRgNCw0YUg0YLQsNC60LbQtSDQvNC+0LbQtdGCINC90LUg0L3QsNGB0YLRg9C/0LjRgtGMINGB0L7QsdGL0YLQuNC1IHBhdXNlLiDQn9GA0Lgg0Y3RgtC+0LxcbiAqINGB0YLQvtC40YIg0LXRidGRINGD0YfQuNGC0YvQstCw0YLRjCwg0YfRgtC+INGC0YDQtdC6INC80L7QttC10YIg0LPRgNGD0LfQuNGC0YzRgdGPINC40Lcg0LrQtdGI0LAsINGC0L7Qs9C00LAg0YHQvtCx0YvRgtC40Y8g0L/QvtC70YPRh9C10L3QuNGPINC80LXRgtCwLdC00LDQvdC90YvRhSDQuCDQstC+0LfQvNC+0LbQvdC+0YHRgtC4XG4gKiDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y8g0LzQvtCz0YPRgiDQstC+0LfQvdC40LrQvdGD0YLRjCDQsdGL0YHRgtGA0LXQtSDRgdC+0LHRi9GC0LjRjyBwbGF5INC40LvQuCBwYXVzZSwg0YLQsNC6INGH0YLQviDQvdGD0LbQvdC+INC/0YDQtdC00YPRgdC80LDRgtGA0LjQstCw0YLRjCDQv9GA0LXRgNGL0LLQsNC90LjQtSDQv9GA0L7RhtC10YHRgdCwXG4gKiDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQuC5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9zdGFydHVwQXVkaW8gPSBmdW5jdGlvbigpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiX3N0YXJ0dXBBdWRpb1wiKTtcblxuICAgIHRoaXMuX2RlaW5pdFVzZXJFdmVudHMoKTtcblxuICAgIC8vSU5GTzog0L/QvtGB0LvQtSDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjQvtC90L3QvtCz0L4g0LLRi9C30L7QstCwIHBsYXkg0L3Rg9C20L3QviDQtNC+0LbQtNCw0YLRjNGB0Y8g0YHQvtCx0YvRgtC40Y8g0Lgg0LLRi9C30LLQsNGC0YwgcGF1c2UuXG4gICAgdGhpcy5fX2luaXRMaXN0ZW5lciA9IGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgaWYgKCF0aGlzLl9faW5pdExpc3RlbmVyKSB7XG4gICAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmF1ZGlvLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfUExBWSwgdGhpcy5fX2luaXRMaXN0ZW5lcik7XG4gICAgICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9DQU5QTEFZLCB0aGlzLl9faW5pdExpc3RlbmVyKTtcbiAgICAgICAgdGhpcy5hdWRpby5yZW1vdmVFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX01FVEEsIHRoaXMuX19pbml0TGlzdGVuZXIpO1xuICAgICAgICB0aGlzLmF1ZGlvLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfRVJST1IsIHRoaXMuX19pbml0TGlzdGVuZXIpO1xuXG4gICAgICAgIC8vSU5GTzog0L/QvtGB0LvQtSDQstGL0LfQvtCy0LAgcGF1c2Ug0L3Rg9C20L3QviDQtNC+0LbQtNCw0YLRjNGB0Y8g0YHQvtCx0YvRgtC40Y8sINC30LDQstC10YDRiNC40YLRjCDQuNC90LjRhtC40LDQu9C40LfQsNGG0LjRjiDQuCDRgNCw0LfRgNC10YjQuNGC0Ywg0L/QtdGA0LXQtNCw0YfRgyDRgdC+0LHRi9GC0LjQuVxuICAgICAgICB0aGlzLl9faW5pdExpc3RlbmVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBpZiAoIXRoaXMuX19pbml0TGlzdGVuZXIpIHtcbiAgICAgICAgICAgICAgICByZXR1cm47XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9QQVVTRSwgdGhpcy5fX2luaXRMaXN0ZW5lcik7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fX2luaXRMaXN0ZW5lcjtcbiAgICAgICAgICAgIHRoaXMudW5tdXRlRXZlbnRzKCk7XG4gICAgICAgICAgICBsb2dnZXIuaW5mbyh0aGlzLCBcIl9zdGFydHVwQXVkaW86cmVhZHlcIik7XG4gICAgICAgIH0uYmluZCh0aGlzKTtcbiAgICAgICAgdGhpcy5fX2luaXRMaXN0ZW5lci5zdGVwID0gXCJwYXVzZVwiO1xuXG4gICAgICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9QQVVTRSwgdGhpcy5fX2luaXRMaXN0ZW5lcik7XG4gICAgICAgIHRoaXMuYXVkaW8ucGF1c2UoKTtcblxuICAgICAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwiX3N0YXJ0dXBBdWRpbzpwbGF5XCIsIGUudHlwZSk7XG4gICAgfS5iaW5kKHRoaXMpO1xuICAgIHRoaXMuX19pbml0TGlzdGVuZXIuc3RlcCA9IFwicGxheVwiO1xuXG4gICAgdGhpcy5hdWRpby5hZGRFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX1BMQVksIHRoaXMuX19pbml0TGlzdGVuZXIpO1xuICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9DQU5QTEFZLCB0aGlzLl9faW5pdExpc3RlbmVyKTtcbiAgICB0aGlzLmF1ZGlvLmFkZEV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfTUVUQSwgdGhpcy5fX2luaXRMaXN0ZW5lcik7XG4gICAgdGhpcy5hdWRpby5hZGRFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0VSUk9SLCB0aGlzLl9faW5pdExpc3RlbmVyKTtcblxuICAgIC8vSU5GTzog0L/QtdGA0LXQtCDQuNGB0L/QvtC70YzQt9C+0LLQsNC90LjQtdC8INC+0LHRitC10LrRgiBBdWRpbyDRgtGA0LXQsdGD0LXRgtGB0Y8g0LjQvdC40YbQuNCw0LvQuNC30LjRgNC+0LLQsNGC0YwsINCyINC+0LHRgNCw0LHQvtGC0YfQuNC60LUg0L/QvtC70YzQt9C+0LLQsNGC0LXQu9GM0YHQutC+0LPQviDRgdC+0LHRi9GC0LjRj1xuICAgIHRoaXMuYXVkaW8ubG9hZCgpO1xuICAgIHRoaXMuYXVkaW8ucGxheSgpO1xufTtcblxuLyoqXG4gKiDQldGB0LvQuCDQvNC10YLQvtC0IF9zdGFydFBsYXkg0LLRi9C30LLQsNC9INGA0LDQvdGM0YjQtSwg0YfQtdC8INC30LDQutC+0L3Rh9C40LvQsNGB0Ywg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8sINC90YPQttC90L4g0L7RgtC80LXQvdC40YLRjCDRgtC10LrRg9GJ0LjQuSDRiNCw0LMg0LjQvdC40YbQuNCw0LvQuNC30LDRhtC40LguXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fYnJlYWtTdGFydHVwID0gZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgdGhpcy5fZGVpbml0VXNlckV2ZW50cygpO1xuICAgIHRoaXMudW5tdXRlRXZlbnRzKCk7XG5cbiAgICBpZiAoIXRoaXMuX19pbml0TGlzdGVuZXIpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9QTEFZLCB0aGlzLl9faW5pdExpc3RlbmVyKTtcbiAgICB0aGlzLmF1ZGlvLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfQ0FOUExBWSwgdGhpcy5fX2luaXRMaXN0ZW5lcik7XG4gICAgdGhpcy5hdWRpby5yZW1vdmVFdmVudExpc3RlbmVyKEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX01FVEEsIHRoaXMuX19pbml0TGlzdGVuZXIpO1xuICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihBdWRpb0hUTUw1TG9hZGVyLkVWRU5UX05BVElWRV9FUlJPUiwgdGhpcy5fX2luaXRMaXN0ZW5lcik7XG5cbiAgICB0aGlzLmF1ZGlvLnJlbW92ZUV2ZW50TGlzdGVuZXIoQXVkaW9IVE1MNUxvYWRlci5FVkVOVF9OQVRJVkVfUEFVU0UsIHRoaXMuX19pbml0TGlzdGVuZXIpO1xuXG4gICAgbG9nZ2VyLndhcm4odGhpcywgXCJfc3RhcnR1cEF1ZGlvOmludGVycnVwdGVkXCIsIHRoaXMuX19pbml0TGlzdGVuZXIuc3RlcCwgcmVhc29uKTtcbiAgICBkZWxldGUgdGhpcy5fX2luaXRMaXN0ZW5lcjtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQnNC10YLQvtC00Ysg0L7QttC40LTQsNC90LjRjyDRgNCw0LfQu9C40YfQvdGL0YUg0YHQvtCx0YvRgtC40Lkg0Lgg0LPQtdC90LXRgNCw0YbQuNC4INC+0LHQtdGJ0LDQvdC40LlcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQlNC+0LbQtNCw0YLRjNGB0Y8g0L7Qv9GA0LXQtNC10LvRkdC90L3QvtCz0L4g0YHQvtGB0YLQvtGP0L3QuNGPINC/0LvQtdC10YDQsFxuICogQHBhcmFtIHtTdHJpbmd9IG5hbWUgLSDQuNC80Y8g0YHQvtGB0YLQvtGP0L3QuNGPXG4gKiBAcGFyYW0ge0Z1bmN0aW9ufSBjaGVjayAtINC80LXRgtC+0LQg0L/RgNC+0LLQtdGA0LrQuCwg0YfRgtC+INC80Ysg0L3QsNGF0L7QtNC40LzRgdGPINCyINC90YPQttC90L7QvCDRgdC+0YHRgtC+0Y/QvdC40LhcbiAqIEBwYXJhbSB7QXJyYXkuPFN0cmluZz59IGxpc3RlbiAtINGB0L/QuNGB0L7QuiDRgdC+0LHRi9GC0LjQuSwg0L/RgNC4INC60L7RgtC+0YDRi9GFINC80L7QttC10YIg0YHQvNC10L3QuNGC0YzRgdGPINGB0L7RgdGC0L7Rj9C90LjQtVxuICogQHJldHVybnMge1Byb21pc2V9XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fd2FpdEZvciA9IGZ1bmN0aW9uKG5hbWUsIGNoZWNrLCBsaXN0ZW4pIHtcbiAgICBpZiAoIXRoaXMucHJvbWlzZXNbbmFtZV0pIHtcbiAgICAgICAgdmFyIGRlZmVycmVkID0gbmV3IERlZmVycmVkKCk7XG4gICAgICAgIHRoaXMucHJvbWlzZXNbbmFtZV0gPSBkZWZlcnJlZDtcblxuICAgICAgICBpZiAoY2hlY2suY2FsbCh0aGlzKSkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdmFyIGxpc3RlbmVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgaWYgKGNoZWNrLmNhbGwodGhpcykpIHtcbiAgICAgICAgICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH0uYmluZCh0aGlzKTtcblxuICAgICAgICAgICAgdmFyIGNsZWFyTGlzdGVuZXJzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgaSA9IDAsIGwgPSBsaXN0ZW4ubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICAgICAgICAgIHRoaXMuYXVkaW8ucmVtb3ZlRXZlbnRMaXN0ZW5lcihsaXN0ZW5baV0sIGxpc3RlbmVyKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9LmJpbmQodGhpcyk7XG5cbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gbGlzdGVuLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuYXVkaW8uYWRkRXZlbnRMaXN0ZW5lcihsaXN0ZW5baV0sIGxpc3RlbmVyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgZGVmZXJyZWQucHJvbWlzZSgpLnRoZW4oY2xlYXJMaXN0ZW5lcnMsIGNsZWFyTGlzdGVuZXJzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnByb21pc2VzW25hbWVdLnByb21pc2UoKTtcbn07XG5cbi8qKlxuICog0J7RgtC80LXQvdCwINC+0LbQuNC00LDQvdC40Y8g0YHQvtGB0YLQvtGP0L3QuNGPXG4gKiBAcGFyYW0ge1N0cmluZ30gbmFtZSAtINC40LzRjyDRgdC+0YHRgtC+0Y/QvdC40Y9cbiAqIEBwYXJhbSB7U3RyaW5nfSByZWFzb24gLSDQv9GA0LjRh9C40L3QsCDQvtGC0LzQtdC90Ysg0L7QttC40LTQsNC90LjRj1xuICogQHRvZG8gcmVhc29uINGB0LTQtdC70LDRgtGMINC90LDRgdC70LXQtNC90LjQutC+0Lwg0LrQu9Cw0YHRgdCwIEVycm9yXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fY2FuY2VsV2FpdCA9IGZ1bmN0aW9uKG5hbWUsIHJlYXNvbikge1xuICAgIHZhciBwcm9taXNlO1xuICAgIGlmIChwcm9taXNlID0gdGhpcy5wcm9taXNlc1tuYW1lXSkge1xuICAgICAgICBkZWxldGUgdGhpcy5wcm9taXNlc1tuYW1lXTtcbiAgICAgICAgcHJvbWlzZS5yZWplY3QocmVhc29uKTtcbiAgICB9XG59O1xuXG4vKipcbiAqINCe0YLQvNC10L3QsCDQstGB0LXRhSDQvtC20LjQtNCw0L3QuNC5XG4gKiBAcGFyYW0ge1N0cmluZ30gcmVhc29uIC0g0L/RgNC40YfQuNC90LAg0L7RgtC80LXQvdGLINC+0LbQuNC00LDQvdC40Y9cbiAqIEB0b2RvIHJlYXNvbiDRgdC00LXQu9Cw0YLRjCDQvdCw0YHQu9C10LTQvdC40LrQvtC8INC60LvQsNGB0YHQsCBFcnJvclxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX2Fib3J0UHJvbWlzZXMgPSBmdW5jdGlvbihyZWFzb24pIHtcbiAgICBmb3IgKHZhciBrZXkgaW4gdGhpcy5wcm9taXNlcykge1xuICAgICAgICBpZiAodGhpcy5wcm9taXNlcy5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICB0aGlzLl9jYW5jZWxXYWl0KGtleSwgcmVhc29uKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQntC20LjQtNCw0L3QuNC1INC/0L7Qu9GD0YfQtdC90LjRjyDQvNC10YLQsNC00LDQvdC90YvRhSDRgtGA0LXQutCwXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQv9C40YHQvtC6INGB0L7QsdGL0YLQuNC5INC/0LvQtdC10YDQsCDQv9GA0Lgg0LrQvtGC0L7RgNGL0YUg0LzQvtC20L3QviDQvtC20LjQtNCw0YLRjCDQs9C+0YLQvtCy0L3QvtGB0YLQuCDQvNC10YLQsNC00LDQvdC90YvRhVxuICogQHR5cGUge0FycmF5LjxTdHJpbmc+fVxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5fcHJvbWlzZU1ldGFkYXRhRXZlbnRzID0gW0F1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX01FVEEsIEF1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0NBTlBMQVldO1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC60LAg0L/QvtC70YPRh9C10L3QuNGPINC80LXRgtCw0LTQsNC90L3Ri9GFXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9wcm9taXNlTWV0YWRhdGFDaGVjayA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLmF1ZGlvLnJlYWR5U3RhdGUgPiB0aGlzLmF1ZGlvLkhBVkVfTUVUQURBVEE7XG59O1xuXG4vKipcbiAqINCe0LbQuNC00LDQvdC40LUg0L/QvtC70YPRh9C10L3QuNGPINC80LXRgtCw0LTQsNC90L3Ri9GFXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9wcm9taXNlTWV0YWRhdGEgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fd2FpdEZvcihcIm1ldGFkYXRhXCIsIHRoaXMuX3Byb21pc2VNZXRhZGF0YUNoZWNrLCBBdWRpb0hUTUw1TG9hZGVyLl9wcm9taXNlTWV0YWRhdGFFdmVudHMpO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCe0LbQuNC00LDQvdC40LUg0LfQsNCz0YDRg9C30LrQuCDQvdGD0LbQvdC+0Lkg0YfQsNGB0YLQuCDRgtGA0LXQutCwXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQv9C40YHQvtC6INGB0L7QsdGL0YLQuNC5INC/0LvQtdC10YDQsCDQv9GA0Lgg0LrQvtGC0L7RgNGL0YUg0LzQvtC20L3QviDQvtC20LjQtNCw0YLRjCDQt9Cw0LPRgNGD0LfQutC4XG4gKiBAdHlwZSB7QXJyYXkuPFN0cmluZz59XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLl9wcm9taXNlTG9hZGVkRXZlbnRzID0gW0F1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX0xPQURJTkddO1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC60LAsINGH0YLQviDQt9Cw0LPRgNGD0LbQtdC90LAg0L3Rg9C20L3QsNGPINGH0LDRgdGC0Ywg0YLRgNC10LrQsFxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fcHJvbWlzZUxvYWRlZENoZWNrID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5fX2xvYWRlclRpbWVyID0gdGhpcy5fX2xvYWRlclRpbWVyICYmIGNsZWFyVGltZW91dCh0aGlzLl9fbG9hZGVyVGltZXIpIHx8IHNldFRpbWVvdXQoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLl9jYW5jZWxXYWl0KFwibG9hZGVkXCIsIFwidGltZW91dFwiKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCA1MDAwKTtcblxuICAgIC8vSU5GTzog0L/QvtC30LjRhtC40Y4g0L3Rg9C20L3QviDQsdGA0LDRgtGMINGBINCx0L7Qu9GM0YjQuNC8INC30LDQv9Cw0YHQvtC8LCDRgi7Qui4g0LTQsNC90L3Ri9C1INC30LDQv9C40YHQsNC90Ysg0LHQu9C+0LrQsNC80Lgg0Lgg0L3QsNC8INC90YPQttC90L4g0LTQvtC20LTQsNGC0YzRgdGPINC30LDQs9GA0YPQt9C60Lgg0LHQu9C+0LrQsFxuICAgIHZhciBsb2FkZWQgPSBNYXRoLm1pbih0aGlzLnBvc2l0aW9uICsgNDUsIHRoaXMuYXVkaW8uZHVyYXRpb24pO1xuICAgIHJldHVybiB0aGlzLmF1ZGlvLmJ1ZmZlcmVkLmxlbmd0aFxuICAgICAgICAmJiB0aGlzLmF1ZGlvLmJ1ZmZlcmVkLmVuZCgwKSAtIHRoaXMuYXVkaW8uYnVmZmVyZWQuc3RhcnQoMCkgPj0gbG9hZGVkO1xufTtcblxuLyoqXG4gKiDQntC20LjQtNCw0L3QuNC1INC30LDQs9GA0YPQt9C60Lgg0L3Rg9C20L3QvtC5INGH0LDRgdGC0Lgg0YLRgNC10LrQsFxuICogQHJldHVybnMge1Byb21pc2V9XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fcHJvbWlzZUxvYWRlZCA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwcm9taXNlID0gdGhpcy5fd2FpdEZvcihcImxvYWRlZFwiLCB0aGlzLl9wcm9taXNlTG9hZGVkQ2hlY2ssIEF1ZGlvSFRNTDVMb2FkZXIuX3Byb21pc2VMb2FkZWRFdmVudHMpO1xuXG4gICAgaWYgKCFwcm9taXNlLmNsZWFuVGltZXIpIHtcbiAgICAgICAgcHJvbWlzZS5jbGVhblRpbWVyID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICB0aGlzLl9fbG9hZGVyVGltZXIgPSBjbGVhclRpbWVvdXQodGhpcy5fX2xvYWRlclRpbWVyKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpO1xuICAgICAgICBwcm9taXNlLnRoZW4ocHJvbWlzZS5jbGVhblRpbWVyLCBwcm9taXNlLmNsZWFuVGltZXIpO1xuICAgIH1cblxuICAgIHJldHVybiBwcm9taXNlO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCe0LbQuNC00LDQvdC40LUg0L/RgNC+0LjQs9GA0YvQstCw0L3QuNGPINC90YPQttC90L7QuSDRh9Cw0YHRgtC4INGC0YDQtdC60LBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQodC/0LjRgdC+0Log0YHQvtCx0YvRgtC40Lkg0L/Qu9C10LXRgNCwINC/0YDQuCDQutC+0YLQvtGA0YvRhSDQvNC+0LbQvdC+INC+0LbQuNC00LDRgtGMINC/0YDQvtC40LPRgNGL0LLQsNC90LjRjyDQvdGD0LbQvdC+INGH0LDRgdGC0LhcbiAqIEB0eXBlIHtBcnJheS48U3RyaW5nPn1cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIuX3Byb21pc2VQbGF5aW5nRXZlbnRzID0gW0F1ZGlvSFRNTDVMb2FkZXIuRVZFTlRfTkFUSVZFX1RJTUVVUERBVEVdO1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC60LAsINGH0YLQviDQv9GA0L7QuNCz0YDRi9Cy0LDQtdGC0YHRjyDQvdGD0LbQvdCw0Y8g0YfQsNGB0YLRjCDRgtGA0LXQutCwXG4gKiBAcmV0dXJucyB7Ym9vbGVhbn1cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9wcm9taXNlUGxheWluZ0NoZWNrID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRpbWUgPSBNYXRoLm1pbih0aGlzLnBvc2l0aW9uICsgMC4yLCB0aGlzLmF1ZGlvLmR1cmF0aW9uKTtcbiAgICByZXR1cm4gdGhpcy5hdWRpby5jdXJyZW50VGltZSA+PSB0aW1lO1xufTtcblxuLyoqXG4gKiDQntC20LjQtNCw0L3QuNC1INC/0YDQvtC40LPRgNGL0LLQsNC90LjRjyDQvdGD0LbQvdC+0Lkg0YfQsNGB0YLQuCDRgtGA0LXQutCwXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9wcm9taXNlUGxheWluZyA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLl93YWl0Rm9yKFwicGxheWluZ1wiLCB0aGlzLl9wcm9taXNlUGxheWluZ0NoZWNrLCBBdWRpb0hUTUw1TG9hZGVyLl9wcm9taXNlUGxheWluZ0V2ZW50cyk7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J7QttC40LTQsNC90LjQtSDQvdCw0YfQsNC70LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0J7QttC40LTQsNC90LjQtSDQvdCw0YfQsNC70LAg0LLQvtGB0L/RgNC+0LjQstC10LTQtdC90LjRjywg0L/QtdGA0LXQt9Cw0L/Rg9GB0Log0YLRgNC10LrQsCwg0LXRgdC70Lgg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC90LUg0L3QsNGH0LDQu9C+0YHRjFxuICogQHJldHVybnMge1Byb21pc2V9XG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fcHJvbWlzZVN0YXJ0UGxheWluZyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmICghdGhpcy5wcm9taXNlc1tcInN0YXJ0UGxheWluZ1wiXSkge1xuICAgICAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWQoKTtcbiAgICAgICAgdGhpcy5wcm9taXNlc1tcInN0YXJ0UGxheWluZ1wiXSA9IGRlZmVycmVkO1xuXG4gICAgICAgIC8vSU5GTzog0LXRgdC70Lgg0L7RgtC80LXQvdC10L3QviDQvtC20LjQtNCw0L3QuNC1INC30LDQs9GA0YPQt9C60Lgg0LjQu9C4INCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRjywg0YLQviDQvdGD0LbQvdC+INC+0YLQvNC10L3QuNGC0Ywg0Lgg0Y3RgtC+INC+0LHQtdGJ0LDQvdC40LVcbiAgICAgICAgdmFyIHJlamVjdCA9IGZ1bmN0aW9uKHJlYXNvbikge1xuICAgICAgICAgICAgcmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgdGhpcy5fY2FuY2VsV2FpdChcInN0YXJ0UGxheWluZ1wiLCByZWFzb24pO1xuICAgICAgICB9LmJpbmQodGhpcyk7XG5cbiAgICAgICAgdmFyIHRpbWVyO1xuICAgICAgICB2YXIgcmVhZHkgPSBmYWxzZTtcbiAgICAgICAgdmFyIGNsZWFuVGltZXIgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNsZWFyVGltZW91dCh0aW1lcik7XG4gICAgICAgIH07XG5cbiAgICAgICAgdGhpcy5fcHJvbWlzZVBsYXlpbmcoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgcmVhZHkgPSB0cnVlO1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgICAgICAgICAgbG9nZ2VyLmluZm8odGhpcywgXCJzdGFydFBsYXlpbmc6c3VjY2Vzc1wiKTtcbiAgICAgICAgfS5iaW5kKHRoaXMpLCByZWplY3QpO1xuXG4gICAgICAgIHRoaXMuX3Byb21pc2VMb2FkZWQoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgaWYgKHJlYWR5KSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGltZXIgPSBzZXRUaW1lb3V0KGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgICAgIGRlZmVycmVkLnJlamVjdChcInRpbWVvdXRcIik7XG4gICAgICAgICAgICAgICAgdGhpcy5fY2FuY2VsV2FpdChcInBsYXlpbmdcIiwgXCJ0aW1lb3V0XCIpO1xuICAgICAgICAgICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwic3RhcnRQbGF5aW5nOmZhaWxlZFwiKTtcbiAgICAgICAgICAgIH0uYmluZCh0aGlzKSwgNTAwMCk7XG4gICAgICAgIH0uYmluZCh0aGlzKSwgcmVqZWN0KTtcblxuICAgICAgICB0aGlzLl9wcm9taXNlUGxheWluZygpLnRoZW4oY2xlYW5UaW1lciwgY2xlYW5UaW1lcik7XG4gICAgICAgIGRlZmVycmVkLnByb21pc2UoKS50aGVuKGNsZWFuVGltZXIsIGNsZWFuVGltZXIpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzLnByb21pc2VzW1wic3RhcnRQbGF5aW5nXCJdLnByb21pc2UoKTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQo9C/0YDQsNCy0LvQtdC90LjQtSDRjdC70LXQvNC10L3RgtC+0LwgQXVkaW9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQndCw0YfQsNGC0Ywg0LfQsNCz0YDRg9C30LrRgyDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLmxvYWQgPSBmdW5jdGlvbihzcmMpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwibG9hZFwiLCBzcmMpO1xuXG4gICAgdGhpcy5fYWJvcnRQcm9taXNlcyhcImxvYWRcIik7XG4gICAgdGhpcy5fYnJlYWtTdGFydHVwKFwibG9hZFwiKTtcblxuICAgIHRoaXMuZW5kZWQgPSBmYWxzZTtcbiAgICB0aGlzLnBsYXlpbmcgPSBmYWxzZTtcbiAgICB0aGlzLm5vdExvYWRpbmcgPSB0cnVlO1xuICAgIHRoaXMucG9zaXRpb24gPSAwO1xuXG4gICAgdGhpcy5zcmMgPSBzcmM7XG4gICAgdGhpcy5hdWRpby5zcmMgPSBzcmM7XG4gICAgdGhpcy5hdWRpby5sb2FkKCk7XG59O1xuXG4vKiog0J7RgdGC0LDQvdC+0LLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC4INC30LDQs9GA0YPQt9C60YMg0YLRgNC10LrQsCAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJzdG9wXCIpO1xuXG4gICAgdGhpcy5fYWJvcnRQcm9taXNlcyhcInN0b3BcIik7XG4gICAgdGhpcy5fYnJlYWtTdGFydHVwKFwic3RvcFwiKTtcblxuICAgIHRoaXMubG9hZChcIlwiKTtcbn07XG5cbi8qKlxuICog0J3QsNGH0LDRgtGMINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtSDRgtGA0LXQutCwXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fc3RhcnRQbGF5ID0gZnVuY3Rpb24oKSB7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9zdGFydFBsYXlcIik7XG5cbiAgICB0aGlzLmF1ZGlvLmN1cnJlbnRUaW1lID0gdGhpcy5wb3NpdGlvbjtcblxuICAgIGlmICghdGhpcy5wbGF5aW5nKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLl9icmVha1N0YXJ0dXAoXCJzdGFydFBsYXlcIik7XG4gICAgdGhpcy5hdWRpby5wbGF5KCk7XG5cbiAgICAvL1RISU5LOiDQvdGD0LbQvdC+INC70Lgg0YLRgNC40LPQs9C10YDQuNGC0Ywg0YHQvtCx0YvRgtC40LUg0LIg0YHQu9GD0YfQsNC1INGD0YHQv9C10YXQsFxuICAgIHRoaXMuX3Byb21pc2VTdGFydFBsYXlpbmcoKS50aGVuKGZ1bmN0aW9uKCkge1xuICAgICAgICB0aGlzLnJldHJ5ID0gMDtcbiAgICB9LmJpbmQodGhpcyksIHRoaXMuX19yZXN0YXJ0KTtcbn07XG5cbi8qKlxuICog0J/QtdGA0LXQt9Cw0L/Rg9GB0YLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INGC0YDQtdC60LBcbiAqIEBwYXJhbSB7U3RyaW5nfSBbcmVhc29uXSAtINC10YHQu9C4INC/0YDQuNGH0LjQvdCwINCy0YvQt9C+0LLQsCDRg9C60LDQt9Cw0L3QsCDQuCDQvdC1INGA0LDQstC90LAgXCJ0aW1lb3V0XCIg0L3QuNGH0LXQs9C+INC90LUg0L/RgNC+0LjRgdGF0L7QtNC40YJcbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLl9yZXN0YXJ0ID0gZnVuY3Rpb24ocmVhc29uKSB7XG4gICAgbG9nZ2VyLmluZm8odGhpcywgXCJfcmVzdGFydFwiLCByZWFzb24sIHRoaXMucG9zaXRpb24sIHRoaXMucGxheWluZyk7XG5cbiAgICBpZiAoIXRoaXMuc3JjIHx8IHJlYXNvbiAmJiByZWFzb24gIT09IFwidGltZW91dFwiKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICB0aGlzLnJldHJ5Kys7XG5cbiAgICBpZiAodGhpcy5yZXRyeSA+IDUpIHtcbiAgICAgICAgdGhpcy5wbGF5aW5nID0gZmFsc2U7XG4gICAgICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9FUlJPUiwgbmV3IFBsYXliYWNrRXJyb3IoUGxheWJhY2tFcnJvci5ET05UX1NUQVJULCB0aGlzLnNyYykpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgLy9JTkZPOiDQl9Cw0L/QvtC80LjQvdCw0LXQvCDRgtC10LrRg9GJ0LXQtSDRgdC+0YHRgtC+0Y/QvdC40LUsINGCLtC6LiDQvtC90L4g0YHQsdGA0L7RgdC40YLRgdGPINC/0L7RgdC70LUg0L/QtdGA0LXQt9Cw0LPRgNGD0LfQutC4XG4gICAgdmFyIHBvc2l0aW9uID0gdGhpcy5wb3NpdGlvbjtcbiAgICB2YXIgcGxheWluZyA9IHRoaXMucGxheWluZztcblxuICAgIHRoaXMubG9hZCh0aGlzLnNyYyk7XG5cbiAgICBpZiAocGxheWluZykge1xuICAgICAgICB0aGlzLl9wbGF5KHBvc2l0aW9uKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLnNldFBvc2l0aW9uKHBvc2l0aW9uKTtcbiAgICB9XG59O1xuXG4vKipcbiAqINCS0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjQtSDRgtGA0LXQutCwL9C+0YLQvNC10L3QsCDQv9Cw0YPQt9GLXG4gKiBAcGFyYW0ge051bWJlcn0gW3Bvc2l0aW9uXSAtINC/0L7Qt9C40YbQuNGPINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24ocG9zaXRpb24pIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwicGxheVwiLCBwb3NpdGlvbik7XG4gICAgdGhpcy5yZXRyeSA9IDA7XG4gICAgcmV0dXJuIHRoaXMuX3BsYXkocG9zaXRpb24pO1xufTtcblxuLyoqXG4gKiDQktC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0YLRgNC10LrQsC/QvtGC0LzQtdC90LAg0L/QsNGD0LfRiyAtINCy0L3Rg9GC0YDQtdC90L3QuNC5INC80LXRgtC+0LRcbiAqIEBwYXJhbSB7TnVtYmVyfSBbcG9zaXRpb25dIC0g0L/QvtC30LjRhtC40Y8g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcHJpdmF0ZVxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS5fcGxheSA9IGZ1bmN0aW9uKHBvc2l0aW9uKSB7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIl9wbGF5XCIsIHBvc2l0aW9uKTtcblxuICAgIGlmICh0aGlzLnBsYXlpbmcpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMuX2JyZWFrU3RhcnR1cChcInBsYXlcIik7XG5cbiAgICB0aGlzLmVuZGVkID0gZmFsc2U7XG4gICAgdGhpcy5wbGF5aW5nID0gdHJ1ZTtcbiAgICB0aGlzLnBvc2l0aW9uID0gcG9zaXRpb24gPT0gbnVsbCA/IHRoaXMucG9zaXRpb24gfHwgMCA6IHBvc2l0aW9uO1xuICAgIHRoaXMuX3Byb21pc2VNZXRhZGF0YSgpLnRoZW4odGhpcy5fX3N0YXJ0UGxheSwgbm9vcCk7XG59O1xuXG4vKiog0J/QsNGD0LfQsCAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwicGF1c2VcIik7XG5cbiAgICB0aGlzLnBsYXlpbmcgPSBmYWxzZTtcblxuICAgIHRoaXMuX2NhbmNlbFdhaXQoXCJzdGFydFBsYXlpbmdcIiwgXCJwYXVzZVwiKTtcbiAgICB0aGlzLl9icmVha1N0YXJ0dXAoXCJwYXVzZVwiKTtcblxuICAgIHRoaXMuYXVkaW8ucGF1c2UoKTtcbiAgICB0aGlzLnBvc2l0aW9uID0gdGhpcy5hdWRpby5jdXJyZW50VGltZTtcbn07XG5cbi8qKlxuICog0KPRgdGC0LDQvdC+0LLQuNGC0Ywg0L/QvtC30LjRhtC40Y4g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge051bWJlcn0gcG9zaXRpb24gLSDQv9C+0LfQuNGG0LjRjyDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40Y9cbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuc2V0UG9zaXRpb24gPSBmdW5jdGlvbihwb3NpdGlvbikge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJzZXRQb3NpdGlvblwiLCBwb3NpdGlvbik7XG5cbiAgICBpZiAoIWlzRmluaXRlKHBvc2l0aW9uKSkge1xuICAgICAgICBsb2dnZXIud2Fybih0aGlzLCBcInNldFBvc2l0aW9uRmFpbGVkXCIsIHBvc2l0aW9uKTtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIHRoaXMucG9zaXRpb24gPSBwb3NpdGlvbjtcblxuICAgIHRoaXMuX3Byb21pc2VNZXRhZGF0YSgpLnRoZW4oZnVuY3Rpb24oKSB7XG4gICAgICAgIHRoaXMuYXVkaW8uY3VycmVudFRpbWUgPSB0aGlzLnBvc2l0aW9uO1xuICAgIH0uYmluZCh0aGlzKSwgbm9vcCk7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J/QvtC00LrQu9GO0YfQtdC90LjQtS/QvtGC0LrQu9GO0YfQtdC90LjQtSDQuNGB0YLQvtGH0L3QuNC60LAg0LTQu9GPIFdlYiBBdWRpbyBBUElcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8qKlxuICog0JLQutC70Y7Rh9C40YLRjCDRgNC10LbQuNC8IGNyb3NzRG9tYWluINC00LvRjyBIVE1MNSDQv9C70LXQtdGA0LBcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gc3RhdGUgLSDQstC60LvRjtGH0LjRgtGML9Cy0YvQutC70Y7Rh9C40YLRjFxuICovXG5BdWRpb0hUTUw1TG9hZGVyLnByb3RvdHlwZS50b2dnbGVDcm9zc0RvbWFpbiA9IGZ1bmN0aW9uKHN0YXRlKSB7XG4gICAgaWYgKHN0YXRlKSB7XG4gICAgICAgIHRoaXMuYXVkaW8uY3Jvc3NPcmlnaW4gPSBcImFub255bW91c1wiO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMuYXVkaW8ucmVtb3ZlQXR0cmlidXRlKFwiY3Jvc3NPcmlnaW5cIik7XG4gICAgfVxuXG4gICAgdGhpcy5fcmVzdGFydCgpO1xufTtcblxuLyoqXG4gKiDQodC+0LfQtNCw0YLRjCDQuNGB0YLQvtGH0L3QuNC6INC00LvRjyBXZWIgQXVkaW8gQVBJXG4gKiAhISHQktC90LjQvNCw0L3QuNC1ISEhIC0g0L/RgNC4INC40YHQv9C+0LvRjNC30L7QstCw0L3QuNC4IFdlYiBBdWRpbyBBUEkg0LIg0LHRgNCw0YPQt9C10YDQtSDRgdGC0L7QuNGCINGD0YfQuNGC0YvQstCw0YLRjCwg0YfRgtC+INCy0YHQtSDRgtGA0LXQutC4INC00L7Qu9C20L3RiyDQu9C40LHQviDQt9Cw0LPRgNGD0LbQsNGC0YzRgdGPXG4gKiDRgSDRgtC+0LPQviDQttC1INC00L7QvNC10L3QsCwg0LvQuNCx0L4g0LTQu9GPINC90LjRhSDQtNC+0LvQttC90Ysg0LHRi9GC0Ywg0L/RgNCw0LLQuNC70YzQvdC+INCy0YvRgdGC0LDQstC70LXQvdGLINC30LDQs9C+0LvQvtCy0LrQuCBDT1JTLlxuICog0J/RgNC4INCy0YvQt9C+0LLQtSDQtNCw0L3QvdC+0LPQviDQvNC10YLQvtC00LAg0YLRgNC10Log0LHRg9C00LXRgiDQv9C10YDQtdC30LDQv9GD0YnQtdC9XG4gKiBAcGFyYW0ge0F1ZGlvQ29udGV4dH0gYXVkaW9Db250ZXh0IC0g0LrQvtC90YLQtdC60YHRgiBXZWIgQXVkaW8gQVBJXG4gKi9cbkF1ZGlvSFRNTDVMb2FkZXIucHJvdG90eXBlLmNyZWF0ZVNvdXJjZSA9IGZ1bmN0aW9uKGF1ZGlvQ29udGV4dCkge1xuICAgIGlmICh0aGlzLm91dHB1dCkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcImNyZWF0ZVNvdXJjZVwiKTtcblxuICAgIHZhciBuZWVkUmVzdGFydCA9ICF0aGlzLmF1ZGlvLmNyb3NzT3JpZ2luO1xuXG4gICAgdGhpcy5hdWRpby5jcm9zc09yaWdpbiA9IFwiYW5vbnltb3VzXCI7XG4gICAgdGhpcy5vdXRwdXQgPSBhdWRpb0NvbnRleHQuY3JlYXRlTWVkaWFFbGVtZW50U291cmNlKHRoaXMuYXVkaW8pO1xuICAgIHRoaXMub3V0cHV0LmNvbm5lY3QoYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcblxuICAgIGlmIChuZWVkUmVzdGFydCkge1xuICAgICAgICB0aGlzLl9yZXN0YXJ0KCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQo9C00LDQu9C40YLRjCDQuNGB0YLQvtGH0L3QuNC6INC00LvRjyBXZWIgQXVkaW8gQVBJLiDQo9C00LDQu9GP0LXRgiDQuNGB0YLQvtGH0L3QuNC6LCDQv9C10YDQtdGB0L7Qt9C00LDRkdGCINC+0LHRitC10LrRgiBBdWRpby5cbiAqICEhIdCS0L3QuNC80LDQvdC40LUhISEgLSDQlNCw0L3QvdGL0Lkg0LzQtdGC0L7QtCDQvNC+0LbQvdC+INCy0YvQt9GL0LLQsNGC0Ywg0YLQvtC70YzQutC+INCyINC+0LHRgNCw0LHQvtGC0YfQuNC60LUg0L/QvtC70YzQt9C+0LLQsNGC0LXQu9GM0YHQutC+0LPQviDRgdC+0LHRi9GC0LjRjywg0YIu0LouINGB0LLQtdC20LXRgdC+0LfQtNCw0L3QvdGL0LlcbiAqINGN0LvQtdC80LXQvdGCIEF1ZGlvINC90YPQttC90L4g0LjQvdC40YbQuNCw0LvQuNC30LjRgNC+0LLQsNGC0YwgLSDQuNC90LDRh9C1INCx0YPQtNC10YIg0L3QtdC00L7RgdGC0YPQv9C90L4g0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1LiDQmNC90LjRhtC40LDQu9C40LfQsNGG0LjRjyDRjdC70LXQvNC10L3RgtCwXG4gKiBBdWRpbyDQstC+0LfQvNC+0LbQvdCwINGC0L7Qu9GM0LrQviDQsiDQvtCx0YDQsNCx0L7RgtGH0LjQutC1INC/0L7Qu9GM0LfQvtCy0LDRgtC10LvRjNGB0LrQvtCz0L4g0YHQvtCx0YvRgtC40Y8gKNC60LvQuNC6LCDRgtCw0Yct0YHQvtCx0YvRgtC40LUg0LjQu9C4INC60LvQsNCy0LjQsNGC0YPRgNC90L7QtSDRgdC+0LHRi9GC0LjQtSlcbiAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuZGVzdHJveVNvdXJjZSA9IGZ1bmN0aW9uKCkge1xuICAgIC8vSU5GTzog0LXQtNC40L3RgdGC0LLQtdC90L3Ri9C5INGB0L/QvtGB0L7QsSDQvtGC0L7RgNCy0LDRgtGMIE1lZGlhRWxlbWVudFNvdXJjZSDQvtGCIEF1ZGlvIC0g0YHQvtC30LTQsNGC0Ywg0L3QvtCy0YvQuSDQvtCx0YrQtdC60YIgQXVkaW9cblxuICAgIGlmICghdGhpcy5vdXRwdXQpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGxvZ2dlci53YXJuKHRoaXMsIFwiZGVzdHJveVNvdXJjZVwiKTtcblxuICAgIHRoaXMub3V0cHV0LmRpc2Nvbm5lY3QoKTtcbiAgICB0aGlzLm91dHB1dCA9IG51bGw7XG5cbiAgICB0aGlzLl9hYm9ydFByb21pc2VzKFwiZGVzdHJveVwiKTtcblxuICAgIHRoaXMuX2RlaW5pdEF1ZGlvKCk7XG4gICAgdGhpcy5faW5pdEF1ZGlvKCk7XG4gICAgdGhpcy5fc3RhcnR1cEF1ZGlvKCk7XG5cbiAgICB0aGlzLl9yZXN0YXJ0KCk7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0KPQtNCw0LvQtdC90LjQtSDQstGB0LXRhSDQvtCx0YDQsNCx0L7RgtGH0LjQutC+0LIg0Lgg0L7QsdGK0LXQutGC0LAgQXVkaW9cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqINCj0LTQsNC70LXQvdC40LUg0LLRgdC10YUg0L7QsdGA0LDQsdC+0YLRh9C40LrQvtCyINC4INC+0LHRitC10LrRgtCwIEF1ZGlvLiDQn9C+0YHQu9C1INCy0YvQt9C+0LLQsCDQtNCw0L3QvdC+0LPQviDQvNC10YLQvtC00LAg0Y3RgtC+0YIg0L7QsdGK0LXQutGCINCx0YPQtNC10YIg0L3QtdC70YzQt9GPINC40YHQv9C+0LvRjNC30L7QstCw0YLRjCAqL1xuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuZGVzdHJveSA9IGZ1bmN0aW9uKCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJkZXN0cm95XCIpO1xuXG4gICAgaWYgKHRoaXMub3V0cHV0KSB7XG4gICAgICAgIHRoaXMub3V0cHV0LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgdGhpcy5vdXRwdXQgPSBudWxsO1xuICAgIH1cblxuICAgIHRoaXMuX2Fib3J0UHJvbWlzZXMoKTtcbiAgICB0aGlzLl9kZWluaXRBdWRpbygpO1xuXG4gICAgdGhpcy5fX3Jlc3RhcnQgPSBudWxsO1xuICAgIHRoaXMuX19zdGFydFBsYXkgPSBudWxsO1xuICAgIHRoaXMucHJvbWlzZXMgPSBudWxsO1xufTtcblxuQXVkaW9IVE1MNUxvYWRlci5wcm90b3R5cGUuX2xvZ2dlciA9IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB7XG4gICAgICAgIGluaXQ6ICEhdGhpcy5fX2luaXRMaXN0ZW5lciAmJiB0aGlzLl9faW5pdExpc3RlbmVyLnN0ZXAsXG4gICAgICAgIHNyYzogbG9nZ2VyLl9zaG93VXJsKHRoaXMuc3JjKSxcbiAgICAgICAgcGxheWluZzogdGhpcy5wbGF5aW5nLFxuICAgICAgICBlbmRlZDogdGhpcy5lbmRlZCxcbiAgICAgICAgbm90TG9hZGluZzogdGhpcy5ub3RMb2FkaW5nLFxuICAgICAgICBwb3NpdGlvbjogdGhpcy5wb3NpdGlvblxuICAgIH07XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IEF1ZGlvSFRNTDVMb2FkZXI7XG4iLCJ2YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi4vbG9nZ2VyL2xvZ2dlcicpO1xudmFyIGxvZ2dlciA9IG5ldyBMb2dnZXIoJ0F1ZGlvSFRNTDUnKTtcblxudmFyIGRldGVjdCA9IHJlcXVpcmUoJy4uL2xpYi9icm93c2VyL2RldGVjdCcpO1xudmFyIEV2ZW50cyA9IHJlcXVpcmUoJy4uL2xpYi9hc3luYy9ldmVudHMnKTtcbnZhciBBdWRpb1N0YXRpYyA9IHJlcXVpcmUoJy4uL2F1ZGlvLXN0YXRpYycpO1xuXG52YXIgQXVkaW9IVE1MNUxvYWRlciA9IHJlcXVpcmUoJy4vYXVkaW8taHRtbDUtbG9hZGVyJyk7XG5cbnZhciBwbGF5ZXJJZCA9IDE7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQn9GA0L7QstC10YDQutC4INC00L7RgdGC0YPQv9C90L7RgdGC0LggSFRNTDUgQXVkaW8g0LggV2ViIEF1ZGlvIEFQSVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5leHBvcnRzLmF2YWlsYWJsZSA9IChmdW5jdGlvbigpIHtcbiAgICAvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0g0JHQsNC30L7QstCw0Y8g0L/RgNC+0LLQtdGA0LrQsCDQv9C+0LTQtNC10YDQttC60Lgg0LHRgNCw0YPQt9C10YDQvtC8XG4gICAgdmFyIGh0bWw1X2F2YWlsYWJsZSA9IHRydWU7XG4gICAgdHJ5IHtcbiAgICAgICAgLy9zb21lIGJyb3dzZXJzIGRvZXNuJ3QgdW5kZXJzdGFuZCBuZXcgQXVkaW8oKVxuICAgICAgICB2YXIgYXVkaW8gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhdWRpbycpO1xuICAgICAgICB2YXIgY2FuUGxheSA9IGF1ZGlvLmNhblBsYXlUeXBlKFwiYXVkaW8vbXBlZ1wiKTtcbiAgICAgICAgaWYgKCFjYW5QbGF5IHx8IGNhblBsYXkgPT09ICdubycpIHtcblxuICAgICAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJIVE1MNSBkZXRlY3Rpb24gZmFpbGVkIHdpdGggcmVhc29uXCIsIGNhblBsYXkpO1xuICAgICAgICAgICAgaHRtbDVfYXZhaWxhYmxlID0gZmFsc2U7XG4gICAgICAgIH1cbiAgICB9IGNhdGNoKGUpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJIVE1MNSBkZXRlY3Rpb24gZmFpbGVkIHdpdGggZXJyb3JcIiwgZSk7XG4gICAgICAgIGh0bWw1X2F2YWlsYWJsZSA9IGZhbHNlO1xuICAgIH1cblxuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwiZGV0ZWN0aW9uXCIsIGh0bWw1X2F2YWlsYWJsZSk7XG4gICAgcmV0dXJuIGh0bWw1X2F2YWlsYWJsZTtcbn0pKCk7XG5cbmlmIChkZXRlY3QucGxhdGZvcm0ubW9iaWxlIHx8IGRldGVjdC5wbGF0Zm9ybS50YWJsZXQpIHtcbiAgICBhdWRpb0NvbnRleHQgPSBudWxsO1xuICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwiV2ViQXVkaW9BUEkgbm90IGFsbG93ZWQgZm9yIG1vYmlsZVwiKTtcbn0gZWxzZSB7XG4gICAgdHJ5IHtcbiAgICAgICAgdmFyIGF1ZGlvQ29udGV4dCA9IG5ldyBBdWRpb0NvbnRleHQoKTtcbiAgICAgICAgbG9nZ2VyLmluZm8odGhpcywgXCJXZWJBdWRpb0FQSSBjb250ZXh0IGNyZWF0ZWRcIik7XG4gICAgfSBjYXRjaChlKSB7XG4gICAgICAgIGF1ZGlvQ29udGV4dCA9IG51bGw7XG4gICAgICAgIGxvZ2dlci5pbmZvKHRoaXMsIFwiV2ViQXVkaW9BUEkgbm90IGRldGVjdGVkXCIpO1xuICAgIH1cbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCa0L7QvdGB0YLRgNGD0LrRgtC+0YBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAY2xhc3NkZXNjINCa0LvQsNGB0YEgaHRtbDUg0LDRg9C00LjQvi3Qv9C70LXQtdGA0LBcbiAqIEBleHRlbmRzIElBdWRpb0ltcGxlbWVudGF0aW9uXG4gKlxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1BMQVlcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9FTkRFRFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1ZPTFVNRVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0NSQVNIRURcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9TV0FQXG4gKlxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1NUT1BcbiAqIEBmaXJlcyBJQXVkaW9JbXBsZW1lbnRhdGlvbiNFVkVOVF9QQVVTRVxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX1BST0dSRVNTXG4gKiBAZmlyZXMgSUF1ZGlvSW1wbGVtZW50YXRpb24jRVZFTlRfTE9BRElOR1xuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0xPQURFRFxuICogQGZpcmVzIElBdWRpb0ltcGxlbWVudGF0aW9uI0VWRU5UX0VSUk9SXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgQXVkaW9IVE1MNSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMubmFtZSA9IHBsYXllcklkKys7XG4gICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcImNvbnN0cnVjdG9yXCIpO1xuXG4gICAgRXZlbnRzLmNhbGwodGhpcyk7XG4gICAgdGhpcy5vbihcIipcIiwgZnVuY3Rpb24oZXZlbnQpIHtcbiAgICAgICAgaWYgKGV2ZW50ICE9PSBBdWRpb1N0YXRpYy5FVkVOVF9QUk9HUkVTUykge1xuICAgICAgICAgICAgREVWICYmIGxvZ2dlci5kZWJ1Zyh0aGlzLCBcIm9uRXZlbnRcIiwgZXZlbnQpO1xuICAgICAgICB9XG4gICAgfS5iaW5kKHRoaXMpKTtcblxuICAgIHRoaXMud2ViQXVkaW9BcGkgPSBmYWxzZTtcbiAgICB0aGlzLmFjdGl2ZUxvYWRlciA9IDA7XG4gICAgdGhpcy52b2x1bWUgPSAxO1xuICAgIHRoaXMubG9hZGVycyA9IFtdO1xuXG4gICAgdGhpcy5fYWRkTG9hZGVyKCk7XG4gICAgdGhpcy5fYWRkTG9hZGVyKCk7XG5cbiAgICB0aGlzLl9zZXRBY3RpdmUoMCk7XG59O1xuRXZlbnRzLm1peGluKEF1ZGlvSFRNTDUpO1xuZXhwb3J0cy50eXBlID0gQXVkaW9IVE1MNS50eXBlID0gQXVkaW9IVE1MNS5wcm90b3R5cGUudHlwZSA9IFwiaHRtbDVcIjtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCg0LDQsdC+0YLQsCDRgSDQt9Cw0LPRgNGD0LfRh9C40LrQsNC80LhcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQlNC+0LHQsNCy0LjRgtGMINC30LDQs9GA0YPQt9GH0LjQuiDQsNGD0LTQuNC+LdGE0LDQudC70L7QslxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuX2FkZExvYWRlciA9IGZ1bmN0aW9uKCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJfYWRkTG9hZGVyXCIpO1xuXG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBsb2FkZXIgPSBuZXcgQXVkaW9IVE1MNUxvYWRlcigpO1xuICAgIGxvYWRlci5pbmRleCA9IHRoaXMubG9hZGVycy5wdXNoKGxvYWRlcikgLSAxO1xuXG4gICAgbG9hZGVyLm9uKFwiKlwiLCBmdW5jdGlvbihldmVudCwgZGF0YSkge1xuICAgICAgICB2YXIgb2Zmc2V0ID0gKHNlbGYubG9hZGVycy5sZW5ndGggKyBsb2FkZXIuaW5kZXggLSBzZWxmLmFjdGl2ZUxvYWRlcikgJSBzZWxmLmxvYWRlcnMubGVuZ3RoO1xuICAgICAgICBzZWxmLnRyaWdnZXIoZXZlbnQsIG9mZnNldCwgZGF0YSk7XG4gICAgfSk7XG5cbiAgICBpZiAodGhpcy53ZWJBdWRpb0FwaSkge1xuICAgICAgICBsb2FkZXIuY3JlYXRlU291cmNlKGF1ZGlvQ29udGV4dCk7XG4gICAgfVxufTtcblxuLyoqXG4gKiDQo9GB0YLQsNC90L7QstC40YLRjCDQsNC60YLQuNCy0L3Ri9C5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHBhcmFtIHtpbnR9IG9mZnNldCAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuX3NldEFjdGl2ZSA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJfc2V0QWN0aXZlXCIsIG9mZnNldCk7XG5cbiAgICB0aGlzLmFjdGl2ZUxvYWRlciA9ICh0aGlzLmFjdGl2ZUxvYWRlciArIG9mZnNldCkgJSB0aGlzLmxvYWRlcnMubGVuZ3RoO1xuICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9TV0FQLCBvZmZzZXQpO1xuXG4gICAgaWYgKG9mZnNldCAhPT0gMCkge1xuICAgICAgICAvL0lORk86INC10YHQu9C4INGA0LXQu9C40LfQvtCy0YvQstCw0YLRjCDQutC+0L3RhtC10L/RhtC40Y4g0LzQvdC+0LbQtdGB0YLQstCwINC30LDQs9GA0YPQt9GH0LjQutC+0LIsINGC0L4g0Y3RgtC+INC90YPQttC90L4g0LTQvtGA0LDQsdC+0YLQsNGC0YwuXG4gICAgICAgIHRoaXMuc3RvcChvZmZzZXQpO1xuICAgIH1cbn07XG5cbi8qKlxuICog0J/QvtC70YPRh9C40YLRjCDQt9Cw0LPRgNGD0LfRh9C40Log0Lgg0L7RgtC/0LjRgdCw0YLRjCDQtdCz0L4g0L7RgiDRgdC+0LHRi9GC0LjQuSDRgdGC0LDRgNGC0LAg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNGPXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge0F1ZGlvfVxuICogQHByaXZhdGVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuX2dldExvYWRlciA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIG9mZnNldCA9IG9mZnNldCB8fCAwO1xuICAgIHJldHVybiB0aGlzLmxvYWRlcnNbKHRoaXMuYWN0aXZlTG9hZGVyICsgb2Zmc2V0KSAlIHRoaXMubG9hZGVycy5sZW5ndGhdO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCf0L7QtNC60LvRjtGH0LXQvdC40LUgV2ViIEF1ZGlvIEFQSVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuLyoqXG4gKiDQktC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwIENPUlMuICoqKtCS0JDQltCd0J4hKioqIC0g0LXRgdC70Lgg0LLQutC70Y7Rh9C40YLRjCDRgNC10LbQuNC8IENPUlMsINCw0YPQtNC40L4g0Y3Qu9C10LzQtdC90YIg0L3QtSDRgdC80L7QttC10YIg0LfQsNCz0YDRg9C20LDRgtGMINC00LDQvdC90YvQtSDRgdC+XG4gKiDRgdGC0L7RgNC+0L3QvdC40YUg0LTQvtC80LXQvdC+0LIsINC10YHQu9C4INCyINC+0YLQstC10YLQtSDQvdC1INCx0YPQtNC10YIg0L/RgNCw0LLQuNC70YzQvdC+0LPQviDQt9Cw0LPQvtC70L7QstC60LAgQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luLiDQldGB0LvQuCDQvdC1INC/0LvQsNC90LjRgNGD0LXRgtGB0Y9cbiAqINC40YHQv9C+0LvRjNC30L7QstCw0L3QuNC1IFdlYiBBdWRpbyBBUEksINC90LUg0YHRgtC+0LjRgiDQstC60LvRjtGH0LDRgtGMINGN0YLQvtGCINGA0LXQttC40LwuXG4gKiBAcGFyYW0gc3RhdGVcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUudG9nZ2xlQ3Jvc3NEb21haW4gPSBmdW5jdGlvbihzdGF0ZSkge1xuICAgIHRoaXMubG9hZGVycy5mb3JFYWNoKGZ1bmN0aW9uKGxvYWRlcikge1xuICAgICAgICBsb2FkZXIudG9nZ2xlQ3Jvc3NEb21haW4oc3RhdGUpO1xuICAgIH0pO1xufTtcblxuLyoqXG4gKiDQn9C10YDQtdC60LvRjtGH0LXQvdC40LUg0YDQtdC20LjQvNCwINC40YHQv9C+0LvRjNC30L7QstCw0L3QuNGPIFdlYiBBdWRpbyBBUEkuINCU0L7RgdGC0YPQv9C10L0g0YLQvtC70YzQutC+INC/0YDQuCBodG1sNS3RgNC10LDQu9C40LfQsNGG0LjQuCDQv9C70LXQtdGA0LAuXG4gKlxuICogKirQktC90LjQvNCw0L3QuNC1ISoqIC0g0L/QvtGB0LvQtSDQstC60LvRjtGH0LXQvdC40Y8g0YDQtdC20LjQvNCwIFdlYiBBdWRpbyBBUEkg0L7QvSDQvdC1INC+0YLQutC70Y7Rh9Cw0LXRgtGB0Y8g0L/QvtC70L3QvtGB0YLRjNGOLCDRgi7Qui4g0LTQu9GPINGN0YLQvtCz0L4g0YLRgNC10LHRg9C10YLRgdGPXG4gKiDRgNC10LjQvdC40YbQuNCw0LvQuNC30LDRhtC40Y8g0L/Qu9C10LXRgNCwLCDQutC+0YLQvtGA0L7QuSDRgtGA0LXQsdGD0LXRgtGB0Y8g0LrQu9C40Log0L/QvtC70YzQt9C+0LLQsNGC0LXQu9GPLiDQn9GA0Lgg0L7RgtC60LvRjtGH0LXQvdC40Lgg0LjQtyDQs9GA0LDRhNCwINC+0LHRgNCw0LHQvtGC0LrQuCDQuNGB0LrQu9GO0YfQsNGO0YLRgdGPXG4gKiDQstGB0LUg0L3QvtC00Ysg0LrRgNC+0LzQtSDQvdC+0LQt0LjRgdGC0L7Rh9C90LjQutC+0LIg0Lgg0L3QvtC00Ysg0LLRi9Cy0L7QtNCwLCDRg9C/0YDQsNCy0LvQtdC90LjQtSDQs9GA0L7QvNC60L7RgdGC0YzRjiDQv9C10YDQtdC60LvRjtGH0LDQtdGC0YHRjyDQvdCwINGN0LvQtdC80LXQvdGC0YsgYXVkaW8sINCx0LXQt1xuICog0LjRgdC/0L7Qu9GM0LfQvtCy0LDQvdC40Y8gR2Fpbk5vZGVcbiAqIEBwYXJhbSB7Qm9vbGVhbn0gc3RhdGUgLSDQt9Cw0L/RgNCw0YjQuNCy0LDQtdC80YvQuSDRgdGC0LDRgtGD0YFcbiAqIEByZXR1cm5zIHtCb29sZWFufSAtLSDQuNGC0L7Qs9C+0LLRi9C5INGB0YLQsNGC0YPRgSDQv9C70LXQtdGA0LBcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUudG9nZ2xlV2ViQXVkaW9BUEkgPSBmdW5jdGlvbihzdGF0ZSkge1xuICAgIGlmICghYXVkaW9Db250ZXh0KSB7XG4gICAgICAgIGxvZ2dlci53YXJuKHRoaXMsIFwidG9nZ2xlV2ViQXVkaW9BUElFcnJvclwiLCBzdGF0ZSk7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInRvZ2dsZVdlYkF1ZGlvQVBJXCIsIHN0YXRlKTtcblxuICAgIGlmICh0aGlzLndlYkF1ZGlvQXBpID09IHN0YXRlKSB7XG4gICAgICAgIHJldHVybiBzdGF0ZTtcbiAgICB9XG5cbiAgICBpZiAoc3RhdGUpIHtcbiAgICAgICAgdGhpcy5hdWRpb091dHB1dCA9IGF1ZGlvQ29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgICAgIHRoaXMuYXVkaW9PdXRwdXQuZ2Fpbi52YWx1ZSA9IHRoaXMudm9sdW1lO1xuICAgICAgICB0aGlzLmF1ZGlvT3V0cHV0LmNvbm5lY3QoYXVkaW9Db250ZXh0LmRlc3RpbmF0aW9uKTtcblxuICAgICAgICBpZiAodGhpcy5wcmVwcm9jZXNzb3IpIHtcbiAgICAgICAgICAgIHRoaXMucHJlcHJvY2Vzc29yLm91dHB1dC5jb25uZWN0KHRoaXMuYXVkaW9PdXRwdXQpO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5sb2FkZXJzLmZvckVhY2goZnVuY3Rpb24obG9hZGVyKSB7XG4gICAgICAgICAgICBsb2FkZXIuYXVkaW8udm9sdW1lID0gMTtcbiAgICAgICAgICAgIGxvYWRlci5jcmVhdGVTb3VyY2UoYXVkaW9Db250ZXh0KTtcblxuICAgICAgICAgICAgbG9hZGVyLm91dHB1dC5kaXNjb25uZWN0KCk7XG4gICAgICAgICAgICBsb2FkZXIub3V0cHV0LmNvbm5lY3QodGhpcy5wcmVwcm9jZXNzb3IgPyB0aGlzLnByZXByb2Nlc3Nvci5pbnB1dCA6IHRoaXMuYXVkaW9PdXRwdXQpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgfSBlbHNlIGlmICh0aGlzLmF1ZGlvT3V0cHV0KSB7XG4gICAgICAgIGlmICh0aGlzLnByZXByb2Nlc3Nvcikge1xuICAgICAgICAgICAgdGhpcy5wcmVwcm9jZXNzb3Iub3V0cHV0LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuYXVkaW9PdXRwdXQuZGlzY29ubmVjdCgpO1xuICAgICAgICBkZWxldGUgdGhpcy5hdWRpb091dHB1dDtcblxuICAgICAgICB0aGlzLmxvYWRlcnMuZm9yRWFjaChmdW5jdGlvbihsb2FkZXIpIHtcbiAgICAgICAgICAgIGxvYWRlci5hdWRpby52b2x1bWUgPSB0aGlzLnZvbHVtZTtcblxuICAgICAgICAgICAgLy9JTkZPOiDQv9C+0YHQu9C1INGC0L7Qs9C+INC60LDQuiDQvNGLINCy0LrQu9GO0YfQuNC70Lggd2ViQXVkaW9BUEkg0LXQs9C+INGD0LbQtSDQvdC10LvRjNC30Y8g0L/RgNC+0YHRgtC+INGC0LDQuiDQstGL0LrQu9GO0YfQuNGC0YwuXG4gICAgICAgICAgICBsb2FkZXIub3V0cHV0LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIGxvYWRlci5vdXRwdXQuY29ubmVjdChhdWRpb0NvbnRleHQuZGVzdGluYXRpb24pO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuICAgIH1cblxuICAgIHRoaXMud2ViQXVkaW9BcGkgPSBzdGF0ZTtcblxuICAgIHJldHVybiBzdGF0ZTtcbn07XG5cbi8qKlxuICog0J/QvtC00LrQu9GO0YfQtdC90LjQtSDQsNGD0LTQuNC+INC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgNCwLiDQktGF0L7QtCDQv9GA0LXQv9GA0L7RhtC10YHRgdC+0YDQsCDQv9C+0LTQutC70Y7Rh9Cw0LXRgtGB0Y8g0Log0LDRg9C00LjQvi3RjdC70LXQvNC10L3RgtGDINGDINC60L7RgtC+0YDQvtCz0L4g0LLRi9GB0YLQsNCy0LvQtdC90LBcbiAqIDEwMCUg0LPRgNC+0LzQutC+0YHRgtGMLiDQktGL0YXQvtC0INC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgNCwINC/0L7QtNC60LvRjtGH0LDQtdGC0YHRjyDQuiBHYWluTm9kZSwg0LrQvtGC0L7RgNCw0Y8g0YDQtdCz0YPQu9C40YDRg9C10YIg0LjRgtC+0LPQvtCy0YPRjiDQs9GA0L7QvNC60L7RgdGC0YxcbiAqIEBwYXJhbSB7eWEubXVzaWMuQXVkaW9+QXVkaW9QcmVwcm9jZXNzb3J9IHByZXByb2Nlc3NvciAtINC/0YDQtdC/0YDQvtGG0LXRgdGB0L7RgFxuICogQHJldHVybnMge2Jvb2xlYW59IC0tINGB0YLQsNGC0YPRgSDRg9GB0L/QtdGF0LBcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuc2V0QXVkaW9QcmVwcm9jZXNzb3IgPSBmdW5jdGlvbihwcmVwcm9jZXNzb3IpIHtcbiAgICBpZiAoIXRoaXMud2ViQXVkaW9BcGkpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4odGhpcywgXCJzZXRBdWRpb1ByZXByb2Nlc3NvckVycm9yXCIsIHByZXByb2Nlc3Nvcik7XG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG5cbiAgICBsb2dnZXIuaW5mbyh0aGlzLCBcInNldEF1ZGlvUHJlcHJvY2Vzc29yXCIpO1xuXG4gICAgaWYgKHRoaXMucHJlcHJvY2Vzc29yID09PSBwcmVwcm9jZXNzb3IpIHtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMucHJlcHJvY2Vzc29yKSB7XG4gICAgICAgIHRoaXMucHJlcHJvY2Vzc29yLm91dHB1dC5kaXNjb25uZWN0KCk7XG4gICAgfVxuXG4gICAgdGhpcy5wcmVwcm9jZXNzb3IgPSBwcmVwcm9jZXNzb3I7XG5cbiAgICBpZiAoIXByZXByb2Nlc3Nvcikge1xuICAgICAgICB0aGlzLmxvYWRlcnMuZm9yRWFjaChmdW5jdGlvbihsb2FkZXIpIHtcbiAgICAgICAgICAgIGxvYWRlci5vdXRwdXQuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgbG9hZGVyLm91dHB1dC5jb25uZWN0KHRoaXMuYXVkaW9PdXRwdXQpO1xuICAgICAgICB9LmJpbmQodGhpcykpO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHRoaXMubG9hZGVycy5mb3JFYWNoKGZ1bmN0aW9uKGxvYWRlcikge1xuICAgICAgICBsb2FkZXIub3V0cHV0LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgbG9hZGVyLm91dHB1dC5jb25uZWN0KHByZXByb2Nlc3Nvci5pbnB1dCk7XG4gICAgfSk7XG5cbiAgICBwcmVwcm9jZXNzb3Iub3V0cHV0LmNvbm5lY3QodGhpcy5hdWRpb091dHB1dCk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQo9C/0YDQsNCy0LvQtdC90LjQtSDQv9C70LXQtdGA0L7QvFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCf0YDQvtC40LPRgNCw0YLRjCDRgtGA0LXQulxuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge051bWJlcn0gW2R1cmF0aW9uXSAtINCU0LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwICjQvdC1INC40YHQv9C+0LvRjNC30YPQtdGC0YHRjylcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUucGxheSA9IGZ1bmN0aW9uKHNyYywgZHVyYXRpb24pIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwicGxheVwiLCBzcmMpO1xuXG4gICAgdmFyIGxvYWRlciA9IHRoaXMuX2dldExvYWRlcigpO1xuXG4gICAgbG9hZGVyLmxvYWQoc3JjKTtcbiAgICBsb2FkZXIucGxheSgwKTtcbn07XG5cbi8qKiDQn9C+0YHRgtCw0LLQuNGC0Ywg0YLRgNC10Log0L3QsCDQv9Cw0YPQt9GDICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJwYXVzZVwiKTtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5fZ2V0TG9hZGVyKCk7XG4gICAgbG9hZGVyLnBhdXNlKCk7XG59O1xuXG4vKiog0KHQvdGP0YLRjCDRgtGA0LXQuiDRgSDQv9Cw0YPQt9GLICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5yZXN1bWUgPSBmdW5jdGlvbigpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwicmVzdW1lXCIpO1xuICAgIHZhciBsb2FkZXIgPSB0aGlzLl9nZXRMb2FkZXIoKTtcbiAgICBsb2FkZXIucGxheSgpO1xufTtcblxuLyoqXG4gKiDQntGB0YLQsNC90L7QstC40YLRjCDQstC+0YHQv9GA0L7QuNC30LLQtdC00LXQvdC40LUg0Lgg0LfQsNCz0YDRg9C30LrRgyDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INC00LvRjyDRgtC10LrRg9GJ0LXQs9C+INC30LDQs9GA0YPQt9GH0LjQutCwLCAxOiDQtNC70Y8g0YHQu9C10LTRg9GO0YnQtdCz0L4g0LfQsNCz0YDRg9C30YfQuNC60LBcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJzdG9wXCIsIG9mZnNldCk7XG4gICAgdmFyIGxvYWRlciA9IHRoaXMuX2dldExvYWRlcihvZmZzZXQgfHwgMCk7XG4gICAgbG9hZGVyLnN0b3AoKTtcblxuICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9TVE9QLCBvZmZzZXQpO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC/0L7Qt9C40YbQuNGOINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuZ2V0UG9zaXRpb24gPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0TG9hZGVyKCkuYXVkaW8uY3VycmVudFRpbWU7XG59O1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LjRgtGMINGC0LXQutGD0YnRg9GOINC/0L7Qt9C40YbQuNGOINCy0L7RgdC/0YDQvtC40LfQstC10LTQtdC90LjRj1xuICogQHBhcmFtIHtudW1iZXJ9IHBvc2l0aW9uXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLnNldFBvc2l0aW9uID0gZnVuY3Rpb24ocG9zaXRpb24pIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwic2V0UG9zaXRpb25cIiwgcG9zaXRpb24pO1xuICAgIHRoaXMuX2dldExvYWRlcigpLnNldFBvc2l0aW9uKHBvc2l0aW9uIC0gMC4wMDEpOyAvL1RISU5LOiBsZWdhY3kt0LrQvtC0LiDQn9C+0L3Rj9GC0Ywg0L3QsNGE0LjQsyDRgtGD0YIg0L3Rg9C20LXQvSAwLjAwMVxufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINC00LvQuNGC0LXQu9GM0L3QvtGB0YLRjCDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuZ2V0RHVyYXRpb24gPSBmdW5jdGlvbihvZmZzZXQpIHtcbiAgICByZXR1cm4gdGhpcy5fZ2V0TG9hZGVyKG9mZnNldCkuYXVkaW8uZHVyYXRpb247XG59O1xuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0LTQu9C40YLQtdC70YzQvdC+0YHRgtGMINC30LDQs9GA0YPQttC10L3QvdC+0Lkg0YfQsNGB0YLQuCDRgtGA0LXQutCwXG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0wXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge251bWJlcn1cbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUuZ2V0TG9hZGVkID0gZnVuY3Rpb24ob2Zmc2V0KSB7XG4gICAgdmFyIGxvYWRlciA9IHRoaXMuX2dldExvYWRlcihvZmZzZXQpO1xuXG4gICAgaWYgKGxvYWRlci5hdWRpby5idWZmZXJlZC5sZW5ndGgpIHtcbiAgICAgICAgcmV0dXJuIGxvYWRlci5hdWRpby5idWZmZXJlZC5lbmQoMCkgLSBsb2FkZXIuYXVkaW8uYnVmZmVyZWQuc3RhcnQoMCk7XG4gICAgfVxuICAgIHJldHVybiAwO1xufTtcblxuLyoqXG4gKiDQn9C+0LvRg9GH0LjRgtGMINGC0LXQutGD0YnQtdC1INC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4XG4gKiBAcmV0dXJucyB7bnVtYmVyfVxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5nZXRWb2x1bWUgPSBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gdGhpcy52b2x1bWU7XG59O1xuXG4vKipcbiAqINCj0YHRgtCw0L3QvtCy0LjRgtGMINC30L3QsNGH0LXQvdC40LUg0LPRgNC+0LzQutC+0YHRgtC4XG4gKiBAcGFyYW0ge251bWJlcn0gdm9sdW1lXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLnNldFZvbHVtZSA9IGZ1bmN0aW9uKHZvbHVtZSkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJzZXRWb2x1bWVcIiwgdm9sdW1lKTtcbiAgICB0aGlzLnZvbHVtZSA9IHZvbHVtZTtcblxuICAgIGlmICh0aGlzLndlYkF1ZGlvQXBpKSB7XG4gICAgICAgIHRoaXMuYXVkaW9PdXRwdXQuZ2Fpbi52YWx1ZSA9IHZvbHVtZTtcbiAgICB9IGVsc2Uge1xuICAgICAgICB0aGlzLmxvYWRlcnMuZm9yRWFjaChmdW5jdGlvbihsb2FkZXIpIHtcbiAgICAgICAgICAgIGxvYWRlci5hdWRpby52b2x1bWUgPSB2b2x1bWU7XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMudHJpZ2dlcihBdWRpb1N0YXRpYy5FVkVOVF9WT0xVTUUpO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCf0YDQtdC00LfQsNCz0YDRg9C30LrQsFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCf0YDQtdC00LfQsNCz0YDRg9C30LjRgtGMINGC0YDQtdC6XG4gKiBAcGFyYW0ge1N0cmluZ30gc3JjIC0g0KHRgdGL0LvQutCwINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7TnVtYmVyfSBbZHVyYXRpb25dIC0g0JTQu9C40YLQtdC70YzQvdC+0YHRgtGMINGC0YDQtdC60LAgKNC90LUg0LjRgdC/0L7Qu9GM0LfRg9C10YLRgdGPKVxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqL1xuQXVkaW9IVE1MNS5wcm90b3R5cGUucHJlbG9hZCA9IGZ1bmN0aW9uKHNyYywgZHVyYXRpb24sIG9mZnNldCkge1xuICAgIERFViAmJiBsb2dnZXIuZGVidWcodGhpcywgXCJwcmVsb2FkXCIsIHNyYywgb2Zmc2V0KTtcblxuICAgIG9mZnNldCA9IG9mZnNldCA9PSBudWxsID8gMSA6IG9mZnNldDtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5fZ2V0TG9hZGVyKG9mZnNldCk7XG4gICAgbG9hZGVyLmxvYWQoc3JjKTtcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQv9GA0LXQtNC30LDQs9GA0YPQttCw0LXRgtGB0Y9cbiAqIEBwYXJhbSB7U3RyaW5nfSBzcmMgLSDRgdGB0YvQu9C60LAg0L3QsCDRgtGA0LXQulxuICogQHBhcmFtIHtpbnR9IFtvZmZzZXQ9MV0gLSAwOiDRgtC10LrRg9GJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LosIDE6INGB0LvQtdC00YPRjtGJ0LjQuSDQt9Cw0LPRgNGD0LfRh9C40LpcbiAqIEByZXR1cm5zIHtib29sZWFufVxuICovXG5BdWRpb0hUTUw1LnByb3RvdHlwZS5pc1ByZWxvYWRlZCA9IGZ1bmN0aW9uKHNyYywgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0ID09IG51bGwgPyAxIDogb2Zmc2V0O1xuICAgIHZhciBsb2FkZXIgPSB0aGlzLl9nZXRMb2FkZXIob2Zmc2V0KTtcbiAgICByZXR1cm4gbG9hZGVyLnNyYyA9PT0gc3JjICYmICFsb2FkZXIubm90TG9hZGluZztcbn07XG5cbi8qKlxuICog0J/RgNC+0LLQtdGA0LjRgtGMINGH0YLQviDRgtGA0LXQuiDQvdCw0YfQsNC7INC/0YDQtdC00LfQsNCz0YDRg9C20LDRgtGM0YHRj1xuICogQHBhcmFtIHtTdHJpbmd9IHNyYyAtINGB0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6XG4gKiBAcGFyYW0ge2ludH0gW29mZnNldD0xXSAtIDA6INGC0LXQutGD0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQuiwgMTog0YHQu9C10LTRg9GO0YnQuNC5INC30LDQs9GA0YPQt9GH0LjQulxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmlzUHJlbG9hZGluZyA9IGZ1bmN0aW9uKHNyYywgb2Zmc2V0KSB7XG4gICAgb2Zmc2V0ID0gb2Zmc2V0ID09IG51bGwgPyAxIDogb2Zmc2V0O1xuICAgIHZhciBsb2FkZXIgPSB0aGlzLl9nZXRMb2FkZXIob2Zmc2V0KTtcbiAgICByZXR1cm4gbG9hZGVyLnNyYyA9PT0gc3JjO1xufTtcblxuLyoqXG4gKiDQl9Cw0L/Rg9GB0YLQuNGC0Ywg0LLQvtGB0L/RgNC+0LjQt9Cy0LXQtNC10L3QuNC1INC/0YDQtdC00LfQsNCz0YDRg9C20LXQvdC90L7Qs9C+INGC0YDQtdC60LBcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTFdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7Ym9vbGVhbn0gLS0g0LTQvtGB0YLRg9C/0L3QvtGB0YLRjCDQtNCw0L3QvdC+0LPQviDQtNC10LnRgdGC0LLQuNGPXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLnBsYXlQcmVsb2FkZWQgPSBmdW5jdGlvbihvZmZzZXQpIHtcbiAgICBERVYgJiYgbG9nZ2VyLmRlYnVnKHRoaXMsIFwicGxheVByZWxvYWRlZFwiLCBvZmZzZXQpO1xuICAgIG9mZnNldCA9IG9mZnNldCA9PSBudWxsID8gMSA6IG9mZnNldDtcbiAgICB2YXIgbG9hZGVyID0gdGhpcy5fZ2V0TG9hZGVyKG9mZnNldCk7XG5cbiAgICBpZiAoIWxvYWRlci5zcmMpIHtcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cblxuICAgIHRoaXMuX3NldEFjdGl2ZShvZmZzZXQpO1xuICAgIGxvYWRlci5wbGF5KCk7XG5cbiAgICByZXR1cm4gdHJ1ZTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQn9C+0LvRg9GH0LXQvdC40LUg0LTQsNC90L3Ri9GFINC+INC/0LvQtdC10YDQtVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCf0L7Qu9GD0YfQuNGC0Ywg0YHRgdGL0LvQutGDINC90LAg0YLRgNC10LpcbiAqIEBwYXJhbSB7aW50fSBbb2Zmc2V0PTBdIC0gMDog0YLQtdC60YPRidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6LCAxOiDRgdC70LXQtNGD0Y7RidC40Lkg0LfQsNCz0YDRg9C30YfQuNC6XG4gKiBAcmV0dXJucyB7U3RyaW5nfEJvb2xlYW59IC0tINCh0YHRi9C70LrQsCDQvdCwINGC0YDQtdC6INC40LvQuCBmYWxzZSwg0LXRgdC70Lgg0L3QtdGCINC30LDQs9GA0YPQttCw0LXQvNC+0LPQviDRgtGA0LXQutCwXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmdldFNyYyA9IGZ1bmN0aW9uKG9mZnNldCkge1xuICAgIHJldHVybiB0aGlzLl9nZXRMb2FkZXIob2Zmc2V0KS5zcmM7XG59O1xuXG4vKipcbiAqINCf0YDQvtCy0LXRgNC40YLRjCDQtNC+0YHRgtGD0L/QtdC9INC70Lgg0L/RgNC+0LPRgNCw0LzQvNC90YvQuSDQutC+0L3RgtGA0L7Qu9GMINCz0YDQvtC80LrQvtGB0YLQuFxuICogQHJldHVybnMge2Jvb2xlYW59XG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLmlzRGV2aWNlVm9sdW1lID0gZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIGRldGVjdC5vbmx5RGV2aWNlVm9sdW1lO1xufTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCb0L7Qs9C40YDQvtCy0LDQvdC40LVcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQktGB0L/QvtC80L7Qs9Cw0YLQtdC70YzQvdCw0Y8g0YTRg9C90LrRhtC40Y8g0LTQu9GPINC+0YLQvtCx0YDQsNC20LXQvdC40Y8g0YHQvtGB0YLQvtGP0L3QuNGPINC/0LvQtdC10YDQsCDQsiDQu9C+0LPQtS5cbiAqIEBwcml2YXRlXG4gKi9cbkF1ZGlvSFRNTDUucHJvdG90eXBlLl9sb2dnZXIgPSBmdW5jdGlvbigpIHtcbiAgICB0cnkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgbWFpbjogbG9nZ2VyLl9zaG93VXJsKHRoaXMuZ2V0U3JjKDApKSxcbiAgICAgICAgICAgIHByZWxvYWRlcjogbG9nZ2VyLl9zaG93VXJsKHRoaXMuZ2V0U3JjKDEpKVxuICAgICAgICB9O1xuICAgIH0gY2F0Y2goZSkge1xuICAgICAgICByZXR1cm4gXCJcIjtcbiAgICB9XG59O1xuXG5leHBvcnRzLmF1ZGlvQ29udGV4dCA9IGF1ZGlvQ29udGV4dDtcbmV4cG9ydHMuQXVkaW9JbXBsZW1lbnRhdGlvbiA9IEF1ZGlvSFRNTDU7XG4iLCJ2YXIgWWFuZGV4QXVkaW8gPSByZXF1aXJlKCcuL2V4cG9ydCcpO1xucmVxdWlyZSgnLi9lcnJvci9leHBvcnQnKTtcbnJlcXVpcmUoJy4vbGliL25ldC9lcnJvci9leHBvcnQnKTtcbnJlcXVpcmUoJy4vbG9nZ2VyL2V4cG9ydCcpO1xucmVxdWlyZSgnLi9meC9lcXVhbGl6ZXIvZXhwb3J0Jyk7XG5yZXF1aXJlKCcuL2Z4L3ZvbHVtZS9leHBvcnQnKTtcblxubW9kdWxlLmV4cG9ydHMgPSBZYW5kZXhBdWRpbztcbiIsInZhciBQcm9taXNlID0gcmVxdWlyZSgnLi9wcm9taXNlJyk7XG52YXIgbm9vcCA9IHJlcXVpcmUoJy4uL25vb3AnKTtcblxuLyoqXG4gKiBAY2xhc3NkZXNjINCe0YLQu9C+0LbQtdC90L3QvtC1INC00LXQudGB0YLQstC40LVcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIERlZmVycmVkID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuXG4gICAgdmFyIF9wcm9taXNlID0gbmV3IFByb21pc2UoZnVuY3Rpb24ocmVzb2x2ZSwgcmVqZWN0KSB7XG4gICAgICAgIC8qKlxuICAgICAgICAgKiDQoNCw0LfRgNC10YjQuNGC0Ywg0L7QsdC10YnQsNC90LjQtVxuICAgICAgICAgKiBAbWV0aG9kIERlZmVycmVkI3Jlc29sdmVcbiAgICAgICAgICogQHBhcmFtIHsqfSBkYXRhIC0g0L/QtdGA0LXQtNCw0YLRjCDQtNCw0L3QvdGL0LUg0LIg0L7QsdC10YnQsNC90LjQtVxuICAgICAgICAgKi9cbiAgICAgICAgc2VsZi5yZXNvbHZlID0gcmVzb2x2ZTtcblxuICAgICAgICAvKipcbiAgICAgICAgICog0J7RgtC60LvQvtC90LjRgtGMINC+0LHQtdGJ0LDQvdC40LVcbiAgICAgICAgICogQG1ldGhvZCBEZWZlcnJlZCNyZWplY3RcbiAgICAgICAgICogQHBhcmFtIHtFcnJvcn0gZXJyb3IgLSDQv9C10YDQtdC00LDRgtGMINC+0YjQuNCx0LrRg1xuICAgICAgICAgKi9cbiAgICAgICAgc2VsZi5yZWplY3QgPSByZWplY3Q7XG4gICAgfSk7XG5cbiAgICB2YXIgcHJvbWlzZSA9IF9wcm9taXNlLnRoZW4oZnVuY3Rpb24oZGF0YSkge1xuICAgICAgICBzZWxmLnJlc29sdmVkID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5wZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIHJldHVybiBkYXRhO1xuICAgIH0sIGZ1bmN0aW9uKGVycikge1xuICAgICAgICBzZWxmLnJlamVjdGVkID0gdHJ1ZTtcbiAgICAgICAgc2VsZi5wZW5kaW5nID0gZmFsc2U7XG4gICAgICAgIHRocm93IGVycjtcbiAgICB9KTtcbiAgICBwcm9taXNlW1wiY2F0Y2hcIl0obm9vcCk7IC8vIERvbid0IHRocm93IGVycm9ycyB0byBjb25zb2xlXG5cbiAgICAvKipcbiAgICAgKiDQktGL0L/QvtC70L3QuNC70L7RgdGMINC70Lgg0L7QsdC10YnQsNC90LjQtVxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHRoaXMucGVuZGluZyA9IHRydWU7XG5cbiAgICAvKipcbiAgICAgKiDQntGC0LrQu9C+0L3QuNC70L7RgdGMINC70Lgg0L7QsdC10YnQsNC90LjQtVxuICAgICAqIEB0eXBlIHtib29sZWFufVxuICAgICAqL1xuICAgIHRoaXMucmVqZWN0ZWQgPSBmYWxzZTtcblxuICAgIC8qKlxuICAgICAqINCf0L7Qu9GD0YfQuNGC0Ywg0L7QsdC10YnQsNC90LjQtVxuICAgICAqIEBtZXRob2QgRGVmZXJyZWQjcHJvbWlzZVxuICAgICAqIEByZXR1cm5zIHtQcm9taXNlfVxuICAgICAqL1xuICAgIHRoaXMucHJvbWlzZSA9IGZ1bmN0aW9uKCkgeyByZXR1cm4gcHJvbWlzZTsgfTtcbn07XG5cbi8qKlxuICog0J7QttC40LTQsNC90LjQtSDQstGL0L/QvtC70L3QtdC90LjRjyDRgdC/0LjRgdC60LAg0L7QsdC10YnQsNC90LjQuVxuICogQHBhcmFtIHsuLi4qfSBhcmdzIC0g0L7QsdC10YnQsNC90LjRjywg0LrQvtGC0L7RgNGL0LUg0YLRgNC10LHRg9C10YLRgdGPINC+0LbQuNC00LDRgtGMXG4gKiBAcmV0dXJucyBBYm9ydGFibGVQcm9taXNlXG4gKi9cbkRlZmVycmVkLndoZW4gPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWQoKTtcblxuICAgIHZhciBsaXN0ID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgIHZhciBwZW5kaW5nID0gbGlzdC5sZW5ndGg7XG5cbiAgICB2YXIgcmVzb2x2ZSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBwZW5kaW5nLS07XG5cbiAgICAgICAgaWYgKHBlbmRpbmcgPD0gMCkge1xuICAgICAgICAgICAgZGVmZXJyZWQucmVzb2x2ZSgpO1xuICAgICAgICB9XG4gICAgfTtcblxuICAgIGxpc3QuZm9yRWFjaChmdW5jdGlvbihwcm9taXNlKSB7XG4gICAgICAgIHByb21pc2UudGhlbihyZXNvbHZlLCBkZWZlcnJlZC5yZWplY3QpO1xuICAgIH0pO1xuICAgIGxpc3QgPSBudWxsO1xuXG4gICAgZGVmZXJyZWQucHJvbWlzZS5hYm9ydCA9IGRlZmVycmVkLnJlamVjdDtcblxuICAgIHJldHVybiBkZWZlcnJlZC5wcm9taXNlKCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IERlZmVycmVkO1xuIiwidmFyIG1lcmdlID0gcmVxdWlyZSgnLi4vZGF0YS9tZXJnZScpO1xuXG52YXIgTElTVEVORVJTX05BTUUgPSBcIl9saXN0ZW5lcnNcIjtcbnZhciBNVVRFX09QVElPTiA9IFwiX211dGVkXCI7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQmtC+0L3RgdGC0YDRg9C60YLQvtGAXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICogQGNsYXNzIEV2ZW50c1xuICogQGNsYXNzZGVjcyDQlNC40YHQv9C10YLRh9C10YAg0YHQvtCx0YvRgtC40LkuXG4gKiBAbm9jb25zdHJ1Y3RvclxuICovXG52YXIgRXZlbnRzID0gZnVuY3Rpb24oKSB7XG4gICAgLyoqXG4gICAgICog0JrQvtC90YLQtdC50L3QtdGAINC00LvRjyDRgdC/0LjRgdC60L7QsiDRgdC70YPRiNCw0YLQtdC70LXQuSDRgdC+0LHRi9GC0LjQuS5cbiAgICAgKiBAYWxpYXMgQXVkaW8uRXZlbnRzI19saXN0ZW5lcnNcbiAgICAgKiBAdHlwZSB7T2JqZWN0LjxTdHJpbmcsIEFycmF5LjxGdW5jdGlvbj4+fVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpc1tMSVNURU5FUlNfTkFNRV0gPSB7fTtcblxuICAgIC8qKiDQpNC70LDQsyDQstC60LvRjtGH0LXQvdC40Y8v0LLRi9C60LvRjtGH0LXQvdC40Y8g0YHQvtCx0YvRgtC40LlcbiAgICAgKiBAYWxpYXMgRXZlbnRzI19tdXRlc1xuICAgICAqIEB0eXBlIHtCb29sZWFufVxuICAgICAqIEBwcml2YXRlXG4gICAgICovXG4gICAgdGhpc1tNVVRFX09QVElPTl0gPSBmYWxzZTtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQktGB0Y/Rh9C10YHQutC40Lkg0YHQsNGF0LDRgFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCg0LDRgdGI0LjRgNC40YLRjCDQv9GA0L7QuNC30LLQvtC70YzQvdGL0Lkg0LrQu9Cw0YHRgSDRgdCy0L7QudGB0YLQstCw0LzQuCDQtNC40YHQv9C10YLRh9C10YDQsCDRgdC+0LHRi9GC0LjQuS5cbiAqIEBwYXJhbSB7RnVuY3Rpb259IGNsYXNzQ29uc3RydWN0b3Ig0JrQvtC90YHRgtGA0YPQutGC0L7RgCDQutC70LDRgdGB0LAuXG4gKiBAcmV0dXJucyB7RnVuY3Rpb259INGC0L7RgiDQttC1INC60L7QvdGB0YLRgNGD0LrRgtC+0YAg0LrQu9Cw0YHRgdCwLCDRgNCw0YHRiNC40YDQtdC90L3Ri9C5INGB0LLQvtC50YHRgtCy0LDQvNC4INC00LjRgdC/0LXRgtGH0LXRgNCwINGB0L7QsdGL0YLQuNC5LlxuICogQHN0YXRpY1xuICovXG5FdmVudHMubWl4aW4gPSBmdW5jdGlvbihjbGFzc0NvbnN0cnVjdG9yKSB7XG4gICAgbWVyZ2UoY2xhc3NDb25zdHJ1Y3Rvci5wcm90b3R5cGUsIEV2ZW50cy5wcm90b3R5cGUsIHRydWUpO1xuICAgIHJldHVybiBjbGFzc0NvbnN0cnVjdG9yO1xufTtcblxuLyoqXG4gKiDQoNCw0YHRiNC40YDQuNGC0Ywg0L/RgNC+0LjQt9Cy0L7Qu9GM0L3Ri9C5INC+0LHRitC10LrRgiDRgdCy0L7QudGB0YLQstCw0LzQuCDQtNC40YHQv9C10YLRh9C10YDQsCDRgdC+0LHRi9GC0LjQuS5cbiAqIEBwYXJhbSB7T2JqZWN0fSBvYmplY3Qg0J7QsdGK0LXQutGCLlxuICogQHJldHVybnMge09iamVjdH0g0YLQvtGCINC20LUg0L7QsdGK0LXQutGCLCDRgNCw0YHRiNC40YDQtdC90L3Ri9C5INGB0LLQvtC50YHRgtCy0LDQvNC4INC00LjRgdC/0LXRgtGH0LXRgNCwINGB0L7QsdGL0YLQuNC5LlxuICovXG5FdmVudHMuZXZlbnRpemUgPSBmdW5jdGlvbihvYmplY3QpIHtcbiAgICBtZXJnZShvYmplY3QsIEV2ZW50cy5wcm90b3R5cGUsIHRydWUpO1xuICAgIEV2ZW50cy5jYWxsKG9iamVjdCk7XG4gICAgcmV0dXJuIG9iamVjdDtcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQn9C+0LTQv9C40YHQutCwINC4INC+0YLQv9C40YHQutCwINC+0YIg0YHQvtCx0YvRgtC40LlcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQn9C+0LTQv9C40YHQsNGC0YzRgdGPINC90LAg0YHQvtCx0YvRgtC40LUgKNGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCkuXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQg0JjQvNGPINGB0L7QsdGL0YLQuNGPLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sg0J7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40Y8uXG4gKiBAcmV0dXJucyB7RXZlbnRzfSDRgdGB0YvQu9C60YMg0L3QsCDQutC+0L3RgtC10LrRgdGCLlxuICovXG5FdmVudHMucHJvdG90eXBlLm9uID0gZnVuY3Rpb24oZXZlbnQsIGNhbGxiYWNrKSB7XG4gICAgaWYgKCF0aGlzW0xJU1RFTkVSU19OQU1FXVtldmVudF0pIHtcbiAgICAgICAgdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdID0gW107XG4gICAgfVxuXG4gICAgdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdLnB1c2goY2FsbGJhY2spO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiDQntGC0L/QuNGB0LDRgtGM0YHRjyDQvtGCINGB0L7QsdGL0YLQuNGPICjRhtC10L/QvtGH0L3Ri9C5INC80LXRgtC+0LQpLlxuICogQHBhcmFtIHtTdHJpbmd9IGV2ZW50INCY0LzRjyDRgdC+0LHRi9GC0LjRjy5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrINCe0LHRgNCw0LHQvtGC0YfQuNC6INGB0L7QsdGL0YLQuNGPLlxuICogQHJldHVybnMge0V2ZW50c30g0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRgi5cbiAqL1xuRXZlbnRzLnByb3RvdHlwZS5vZmYgPSBmdW5jdGlvbihldmVudCwgY2FsbGJhY2spIHtcbiAgICBpZiAoIXRoaXNbTElTVEVORVJTX05BTUVdW2V2ZW50XSkge1xuICAgICAgICByZXR1cm4gdGhpcztcbiAgICB9XG5cbiAgICBpZiAoIWNhbGxiYWNrKSB7XG4gICAgICAgIGRlbGV0ZSB0aGlzW0xJU1RFTkVSU19OQU1FXVtldmVudF07XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHZhciBjYWxsYmFja3MgPSB0aGlzW0xJU1RFTkVSU19OQU1FXVtldmVudF07XG4gICAgZm9yICh2YXIgayA9IDAsIGwgPSBjYWxsYmFja3MubGVuZ3RoOyBrIDwgbDsgaysrKSB7XG4gICAgICAgIGlmIChjYWxsYmFja3Nba10gPT09IGNhbGxiYWNrIHx8IGNhbGxiYWNrc1trXS5jYWxsYmFjayA9PT0gY2FsbGJhY2spIHtcbiAgICAgICAgICAgIGNhbGxiYWNrcy5zcGxpY2UoaywgMSk7XG4gICAgICAgICAgICBpZiAoIWNhbGxiYWNrcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBkZWxldGUgdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgYnJlYWs7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICog0J/QvtC00L/QuNGB0LDRgtGM0YHRjyDQvdCwINGB0L7QsdGL0YLQuNC1INC4INC+0YLQv9C40YHQsNGC0YzRgdGPINGB0YDQsNC30YMg0L/QvtGB0LvQtSDQtdCz0L4g0L/QtdGA0LLQvtCz0L4g0LLQvtC30L3QuNC60L3QvtCy0LXQvdC40Y8gKNGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCkuXG4gKiBAcGFyYW0ge1N0cmluZ30gZXZlbnQg0JjQvNGPINGB0L7QsdGL0YLQuNGPLlxuICogQHBhcmFtIHtmdW5jdGlvbn0gY2FsbGJhY2sg0J7QsdGA0LDQsdC+0YLRh9C40Log0YHQvtCx0YvRgtC40Y8uXG4gKiBAcmV0dXJucyB7RXZlbnRzfSDRgdGB0YvQu9C60YMg0L3QsCDQutC+0L3RgtC10LrRgdGCLlxuICovXG5FdmVudHMucHJvdG90eXBlLm9uY2UgPSBmdW5jdGlvbihldmVudCwgY2FsbGJhY2spIHtcbiAgICB2YXIgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgd3JhcHBlciA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBzZWxmLm9mZihldmVudCwgd3JhcHBlcik7XG4gICAgICAgIGNhbGxiYWNrLmFwcGx5KHRoaXMsIGFyZ3VtZW50cyk7XG4gICAgfTtcblxuICAgIHdyYXBwZXIuY2FsbGJhY2sgPSBjYWxsYmFjaztcbiAgICBzZWxmLm9uKGV2ZW50LCB3cmFwcGVyKTtcblxuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiDQntGC0L/QuNGB0LDRgtGM0YHRjyDQvtGCINCy0YHQtdGFINGB0LvRg9GI0LDRgtC10LvQtdC5INGB0L7QsdGL0YLQuNC5ICjRhtC10L/QvtGH0L3Ri9C5INC80LXRgtC+0LQpLlxuICogQHJldHVybnMge0V2ZW50c30g0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRgi5cbiAqL1xuRXZlbnRzLnByb3RvdHlwZS5jbGVhckxpc3RlbmVycyA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGtleSBpbiB0aGlzW0xJU1RFTkVSU19OQU1FXSkge1xuICAgICAgICBpZiAodGhpc1tMSVNURU5FUlNfTkFNRV0uaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgZGVsZXRlIHRoaXNbTElTVEVORVJTX05BTUVdW2tleV07XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQotGA0LjQs9Cz0LXRgCDRgdC+0LHRi9GC0LjQuVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCX0LDQv9GD0YHRgtC40YLRjCDRgdC+0LHRi9GC0LjQtSAo0YbQtdC/0L7Rh9C90YvQuSDQvNC10YLQvtC0KS5cbiAqIEBwYXJhbSB7U3RyaW5nfSBldmVudCDQmNC80Y8g0YHQvtCx0YvRgtC40Y8uXG4gKiBAcGFyYW0gey4uLmFyZ3N9IGFyZ3Mg0J/QsNGA0LDQvNC10YLRgNGLINC00LvRjyDQv9C10YDQtdC00LDRh9C4INCy0LzQtdGB0YLQtSDRgSDRgdC+0LHRi9GC0LjQtdC8LlxuICogQHJldHVybnMge0V2ZW50c30g0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRgi5cbiAqIEBwcml2YXRlXG4gKi9cbkV2ZW50cy5wcm90b3R5cGUudHJpZ2dlciA9IGZ1bmN0aW9uKGV2ZW50LCBhcmdzKSB7XG4gICAgaWYgKHRoaXNbTVVURV9PUFRJT05dKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIGFyZ3MgPSBbXS5zbGljZS5jYWxsKGFyZ3VtZW50cywgMSk7XG5cbiAgICBpZiAoZXZlbnQgIT09IFwiKlwiKSB7XG4gICAgICAgIEV2ZW50cy5wcm90b3R5cGUudHJpZ2dlci5hcHBseSh0aGlzLCBbXCIqXCIsIGV2ZW50XS5jb25jYXQoYXJncykpO1xuICAgIH1cblxuICAgIGlmICghdGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdKSB7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cblxuICAgIHZhciBjYWxsYmFja3MgPSBbXS5jb25jYXQodGhpc1tMSVNURU5FUlNfTkFNRV1bZXZlbnRdKTtcbiAgICBmb3IgKHZhciBrID0gMCwgbCA9IGNhbGxiYWNrcy5sZW5ndGg7IGsgPCBsOyBrKyspIHtcbiAgICAgICAgY2FsbGJhY2tzW2tdLmFwcGx5KG51bGwsIGFyZ3MpO1xuICAgIH1cblxuICAgIHJldHVybiB0aGlzO1xufTtcblxuLyoqXG4gKiDQlNC10LvQtdCz0LjRgNC+0LLQsNGC0Ywg0LLRgdC1INGB0L7QsdGL0YLQuNGPINC00YDRg9Cz0L7QvNGDINC00LjRgdC/0LXRgtGH0LXRgNGDINGB0L7QsdGL0YLQuNC5ICjRhtC10L/QvtGH0L3Ri9C5INC80LXRgtC+0LQpLlxuICogQHBhcmFtIHtFdmVudHN9IGFjY2VwdG9yINCf0L7Qu9GD0YfQsNGC0LXQu9GMINGB0L7QsdGL0YLQuNC5LlxuICogQHJldHVybnMge0V2ZW50c30g0YHRgdGL0LvQutGDINC90LAg0LrQvtC90YLQtdC60YHRgi5cbiAqIEBwcml2YXRlXG4gKi9cbkV2ZW50cy5wcm90b3R5cGUucGlwZUV2ZW50cyA9IGZ1bmN0aW9uKGFjY2VwdG9yKSB7XG4gICAgdGhpcy5vbihcIipcIiwgRXZlbnRzLnByb3RvdHlwZS50cmlnZ2VyLmJpbmQoYWNjZXB0b3IpKTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQktC60LvRjtGH0LXQvdC40LUv0LLRi9C60LvRjtGH0LXQvdC40LUg0YLRgNC40LPQs9C10YDQsCDRgdC+0LHRi9GC0LjQuVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqINCe0YHRgtCw0L3QvtCy0LjRgtGMINC30LDQv9GD0YHQuiDRgdC+0LHRi9GC0LjQuSAo0YbQtdC/0L7Rh9C90YvQuSDQvNC10YLQvtC0KS5cbiAqIEByZXR1cm5zIHtFdmVudHN9INGB0YHRi9C70LrRgyDQvdCwINC60L7QvdGC0LXQutGB0YIuXG4gKi9cbkV2ZW50cy5wcm90b3R5cGUubXV0ZUV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXNbTVVURV9PUFRJT05dID0gdHJ1ZTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qKlxuICog0JLQvtC30L7QsdC90L7QstC40YLRjCDQt9Cw0L/Rg9GB0Log0YHQvtCx0YvRgtC40LkgKNGG0LXQv9C+0YfQvdGL0Lkg0LzQtdGC0L7QtCkuXG4gKiBAcmV0dXJucyB7RXZlbnRzfSDRgdGB0YvQu9C60YMg0L3QsCDQutC+0L3RgtC10LrRgdGCLlxuICovXG5FdmVudHMucHJvdG90eXBlLnVubXV0ZUV2ZW50cyA9IGZ1bmN0aW9uKCkge1xuICAgIGRlbGV0ZSB0aGlzW01VVEVfT1BUSU9OXTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cbm1vZHVsZS5leHBvcnRzID0gRXZlbnRzO1xuIiwidmFyIHZvdyA9IHJlcXVpcmUoJ3ZvdycpO1xudmFyIGRldGVjdCA9IHJlcXVpcmUoJy4uL2Jyb3dzZXIvZGV0ZWN0Jyk7XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vIFByb21pc2VcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAc2VlIHtAbGluayBodHRwczovL2RldmVsb3Blci5tb3ppbGxhLm9yZy9ydS9kb2NzL1dlYi9KYXZhU2NyaXB0L1JlZmVyZW5jZS9HbG9iYWxfT2JqZWN0cy9Qcm9taXNlfEVTIDIwMTUgUHJvbWlzZX1cbiAqIEBjbGFzc1xuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBQcm9taXNlO1xuaWYgKHR5cGVvZiB3aW5kb3cuUHJvbWlzZSAhPT0gXCJmdW5jdGlvblwiXG4gICAgfHwgZGV0ZWN0LmJyb3dzZXIubmFtZSA9PT0gXCJtc2llXCIgfHwgZGV0ZWN0LmJyb3dzZXIubmFtZSA9PT0gXCJlZGdlXCIgLy8g0LzQtdC70LrQuNC1INC80Y/Qs9C60LjQtSDQutCw0Log0LLRgdC10LPQtNCwINC90LjRh9C10LPQviDQvdC1INGD0LzQtdGO0YIg0LTQtdC70LDRgtGMINC/0YDQsNCy0LjQu9GM0L3QvlxuKSB7XG4gICAgUHJvbWlzZSA9IHZvdy5Qcm9taXNlO1xufSBlbHNlIHtcbiAgICBQcm9taXNlID0gd2luZG93LlByb21pc2U7XG59XG5cbm1vZHVsZS5leHBvcnRzID0gUHJvbWlzZTtcblxuLyoqXG4gKiDQndCw0LfQvdCw0YfQuNGC0Ywg0L7QsdGA0LDQsdC+0YLRh9C40LrQuCDRgNCw0LfRgNC10YjQtdC90LjRjyDQuCDQvtGC0LrQu9C+0L3QtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPLlxuICogQG1ldGhvZCBQcm9taXNlI3RoZW5cbiAqIEBwYXJhbSB7ZnVuY3Rpb259IGNhbGxiYWNrINCe0LHRgNCw0LHQvtGC0YfQuNC6INGD0YHQv9C10YXQsC5cbiAqIEBwYXJhbSB7bnVsbHxmdW5jdGlvbn0gW2VycmJhY2tdINCe0LHRgNCw0LHQvtGC0YfQuNC6INC+0YjQuNCx0LrQuC5cbiAqIEByZXR1cm5zIHtQcm9taXNlfSDQvdC+0LLQvtC1INC+0LHQtdGJ0LDQvdC40LUg0LjQtyDRgNC10LfRg9C70YzRgtCw0YLQvtCyINC+0LHRgNCw0LHQvtGC0YfQuNC60LAuXG4gKi9cblxuLyoqXG4gKiDQndCw0LfQvdCw0YfQuNGC0Ywg0L7QsdGA0LDQsdC+0YLRh9C40Log0L7RgtC60LvQvtC90LXQvdC40Y8g0L7QsdC10YnQsNC90LjRjy5cbiAqIEBtZXRob2QgUHJvbWlzZSNjYXRjaFxuICogQHBhcmFtIHtmdW5jdGlvbn0gZXJyYmFjayDQntCx0YDQsNCx0L7RgtGH0LjQuiDQvtGI0LjQsdC60LguXG4gKiBAcmV0dXJucyB7UHJvbWlzZX0g0L3QvtCy0L7QtSDQvtCx0LXRidCw0L3QuNC1INC40Lcg0YDQtdC30YPQu9GM0YLQsNGC0L7QsiDQvtCx0YDQsNCx0L7RgtGH0LjQutCwLlxuICovXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vIEFib3J0YWJsZVByb21pc2VcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiBAY2xhc3MgQWJvcnRhYmxlUHJvbWlzZVxuICogQGNsYXNzZGVjcyDQntCx0LXRidCw0L3QuNC1INGBINCy0L7Qt9C80L7QttC90L7RgdGC0YzRjiDQvtGC0LzQtdC90Ysg0YHQstGP0LfQsNC90L3QvtCz0L4g0YEg0L3QuNC8INC00LXQudGB0YLQstC40Y8uXG4gKiBAZXh0ZW5kcyBQcm9taXNlXG4gKi9cblxuLyoqXG4gKiDQntGC0LzQtdC90LAg0LTQtdC50YHRgtCy0LjRjywg0YHQstGP0LfQsNC90L3QvtCz0L4g0YEg0L7QsdC10YnQsNC90LjQtdC8LiDQkNCx0YHRgtGA0LDQutGC0L3Ri9C5INC80LXRgtC+0LQuXG4gKiBAbWV0aG9kIEFib3J0YWJsZVByb21pc2UjYWJvcnRcbiAqIEBwYXJhbSB7U3RyaW5nfEVycm9yfSByZWFzb24g0J/RgNC40YfQuNC90LAg0L7RgtC80LXQvdGLINC00LXQudGB0YLQstC40Y8uXG4gKiBAYWJzdHJhY3RcbiAqL1xuXG5cblxuXG4iLCJ2YXIgbm9vcCA9IHJlcXVpcmUoJy4uL25vb3AnKTtcbnZhciBQcm9taXNlID0gcmVxdWlyZSgnLi9wcm9taXNlJyk7XG5cbi8qKlxuICog0KHQvtC00LDQvdC40LUg0L7RgtC60LvQvtC90ZHQvdC90L7Qs9C+INC+0LHQtdGJ0LDQvdC40Y8sINC60L7RgtC+0YDQvtC1INC90LUg0L/Qu9GO0ZHRgtGB0Y8g0LIg0LrQvtC90YHQvtC70Ywg0L7RiNC40LHQutC+0LlcbiAqIEBwYXJhbSB7RXJyb3J9IGRhdGEgLSDQv9GA0LjRh9C40L3QsCDQvtGC0LrQu9C+0L3QtdC90LjRjyDQvtCx0LXRidCw0L3QuNGPXG4gKiBAcmV0dXJucyB7UHJvbWlzZX1cbiAqIEBwcml2YXRlXG4gKi9cbnZhciByZWplY3QgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgdmFyIHByb21pc2UgPSBQcm9taXNlLnJlamVjdChkYXRhKTtcbiAgICBwcm9taXNlW1wiY2F0Y2hcIl0obm9vcCk7XG4gICAgcmV0dXJuIHByb21pc2U7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IHJlamVjdDtcbiIsInZhciB1YSA9IG5hdmlnYXRvci51c2VyQWdlbnQudG9Mb3dlckNhc2UoKTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCf0L7Qu9GD0YfQtdC90LjQtSDQtNCw0L3QvdGL0YUg0L4g0LHRgNCw0YPQt9C10YDQtVxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyBVc2VyYWdlbnQgUmVnRXhwXG52YXIgcnVjID0gLyh1Y2Jyb3dzZXIpXFwvKFtcXHcuXSspLztcbnZhciByd2Via2l0ID0gLyh3ZWJraXQpWyBcXC9dKFtcXHcuXSspLztcbnZhciByeWFicm8gPSAvKHlhYnJvd3NlcilbIFxcL10oW1xcdy5dKykvO1xudmFyIHJvcGVyYSA9IC8ob3ByfG9wZXJhKSg/Oi4qdmVyc2lvbik/WyBcXC9dKFtcXHcuXSspLztcbnZhciBybXNpZSA9IC8obXNpZSkgKFtcXHcuXSspLztcbnZhciByZWRnZSA9IC8oZWRnZSlcXC8oW1xcdy5dKykvO1xudmFyIHJtbXNpZSA9IC8oaWVtb2JpbGUpXFwvKFtcXGRcXC5dKykvO1xudmFyIHJtb3ppbGxhID0gLyhtb3ppbGxhKSg/Oi4qPyBydjooW1xcdy5dKykpPy87XG52YXIgcnNhZmFyaSA9IC9eKCg/IWNocm9tZSkuKSp2ZXJzaW9uXFwvKFtcXGRcXHdcXC5dKykuKihzYWZhcmkpLztcblxudmFyIG1hdGNoID0gcnVjLmV4ZWModWEpXG4gICAgfHwgcnNhZmFyaS5leGVjKHVhKVxuICAgIHx8IHJ5YWJyby5leGVjKHVhKVxuICAgIHx8IHJlZGdlLmV4ZWModWEpXG4gICAgfHwgcm1tc2llLmV4ZWModWEpXG4gICAgfHwgcm9wZXJhLmV4ZWModWEpXG4gICAgfHwgcndlYmtpdC5leGVjKHVhKVxuICAgIHx8IHJtc2llLmV4ZWModWEpXG4gICAgfHwgdWEuaW5kZXhPZihcImNvbXBhdGlibGVcIikgPCAwICYmIHJtb3ppbGxhLmV4ZWModWEpXG4gICAgfHwgW107XG5cbnZhciBicm93c2VyID0ge25hbWU6IG1hdGNoWzFdIHx8IFwiXCIsIHZlcnNpb246IG1hdGNoWzJdIHx8IFwiMFwifTtcblxuaWYgKG1hdGNoWzNdID09PSBcInNhZmFyaVwiKSB7XG4gICAgYnJvd3Nlci5uYW1lID0gbWF0Y2hbM107XG59XG5cbmlmIChicm93c2VyLm5hbWUgPT09ICdtc2llJykge1xuICAgIGlmIChkb2N1bWVudC5kb2N1bWVudE1vZGUpIHsgLy8gSUU4IG9yIGxhdGVyXG4gICAgICAgIGJyb3dzZXIuZG9jdW1lbnRNb2RlID0gZG9jdW1lbnQuZG9jdW1lbnRNb2RlO1xuICAgIH0gZWxzZSB7IC8vIElFIDUtN1xuICAgICAgICBicm93c2VyLmRvY3VtZW50TW9kZSA9IDU7IC8vIEFzc3VtZSBxdWlya3MgbW9kZSB1bmxlc3MgcHJvdmVuIG90aGVyd2lzZVxuICAgICAgICBpZiAoZG9jdW1lbnQuY29tcGF0TW9kZSkge1xuICAgICAgICAgICAgaWYgKGRvY3VtZW50LmNvbXBhdE1vZGUgPT09IFwiQ1NTMUNvbXBhdFwiKSB7XG4gICAgICAgICAgICAgICAgYnJvd3Nlci5kb2N1bWVudE1vZGUgPSA3OyAvLyBzdGFuZGFyZHMgbW9kZVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxufVxuXG5pZiAoYnJvd3Nlci5uYW1lID09PSBcIm9wclwiKSB7XG4gICAgYnJvd3Nlci5uYW1lID0gXCJvcGVyYVwiO1xufVxuXG4vL0lORk86IElFICjQutCw0Log0LLRgdC10LPQtNCwKSDQvdC1INC60L7RgNGA0LXQutGC0L3QviDQstGL0YHRgtCw0LLQu9GP0LXRgiB1c2VyLWFnZW50XG5pZiAoYnJvd3Nlci5uYW1lID09PSBcIm1vemlsbGFcIiAmJiBicm93c2VyLnZlcnNpb24uc3BsaXQoXCIuXCIpWzBdID09PSBcIjExXCIpIHtcbiAgICBicm93c2VyLm5hbWUgPSBcIm1zaWVcIjtcbn1cblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCf0L7Qu9GD0YfQtdC90LjQtSDQtNCw0L3QvdGL0YUg0L4g0L/Qu9Cw0YLRhNC+0YDQvNC1XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vIFVzZXJhZ2VudCBSZWdFeHBcbnZhciBycGxhdGZvcm0gPSAvKHdpbmRvd3MgcGhvbmV8aXBhZHxpcGhvbmV8aXBvZHxhbmRyb2lkfGJsYWNrYmVycnl8cGxheWJvb2t8d2luZG93cyBjZXx3ZWJvcykvO1xudmFyIHJ0YWJsZXQgPSAvKGlwYWR8cGxheWJvb2spLztcbnZhciByYW5kcm9pZCA9IC8oYW5kcm9pZCkvO1xudmFyIHJtb2JpbGUgPSAvKG1vYmlsZSkvO1xuXG5wbGF0Zm9ybSA9IHJwbGF0Zm9ybS5leGVjKHVhKSB8fCBbXTtcbnZhciB0YWJsZXQgPSBydGFibGV0LmV4ZWModWEpIHx8ICFybW9iaWxlLmV4ZWModWEpICYmIHJhbmRyb2lkLmV4ZWModWEpIHx8IFtdO1xuXG5pZiAocGxhdGZvcm1bMV0pIHtcbiAgICBwbGF0Zm9ybVsxXSA9IHBsYXRmb3JtWzFdLnJlcGxhY2UoL1xccy9nLCBcIl9cIik7IC8vIENoYW5nZSB3aGl0ZXNwYWNlIHRvIHVuZGVyc2NvcmUuIEVuYWJsZXMgZG90IG5vdGF0aW9uLlxufVxuXG52YXIgcGxhdGZvcm0gPSB7XG4gICAgdHlwZTogcGxhdGZvcm1bMV0gfHwgXCJcIixcbiAgICB0YWJsZXQ6ICEhdGFibGV0WzFdLFxuICAgIG1vYmlsZTogcGxhdGZvcm1bMV0gJiYgIXRhYmxldFsxXSB8fCBmYWxzZVxufTtcbmlmICghcGxhdGZvcm0udHlwZSkge1xuICAgIHBsYXRmb3JtLnR5cGUgPSAncGMnO1xufVxuXG5wbGF0Zm9ybS5vcyA9IHBsYXRmb3JtLnR5cGU7XG5pZiAocGxhdGZvcm0udHlwZSA9PT0gJ2lwYWQnIHx8IHBsYXRmb3JtLnR5cGUgPT09ICdpcGhvbmUnIHx8IHBsYXRmb3JtLnR5cGUgPT09ICdpcG9kJykge1xuICAgIHBsYXRmb3JtLm9zID0gJ2lvcyc7XG59IGVsc2UgaWYgKHBsYXRmb3JtLnR5cGUgPT09ICdhbmRyb2lkJykge1xuICAgIHBsYXRmb3JtLm9zID0gJ2FuZHJvaWQnO1xufSBlbHNlIGlmIChwbGF0Zm9ybS50eXBlID09PSBcIndpbmRvd3MgcGhvbmVcIiB8fCBuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKFwiV2luXCIpICE9PSAtMSkge1xuICAgIHBsYXRmb3JtLm9zID0gXCJ3aW5kb3dzXCI7XG4gICAgcGxhdGZvcm0udmVyc2lvbiA9IG5hdmlnYXRvci51c2VyQWdlbnQubWF0Y2goL3dpblteIF0qIChbXjtdKikvaSk7XG4gICAgcGxhdGZvcm0udmVyc2lvbiA9IHBsYXRmb3JtLnZlcnNpb24gJiYgcGxhdGZvcm0udmVyc2lvblsxXTtcbn0gZWxzZSBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZihcIk1hY1wiKSAhPT0gLTEpIHtcbiAgICBwbGF0Zm9ybS5vcyA9IFwibWFjb3NcIjtcbn0gZWxzZSBpZiAobmF2aWdhdG9yLmFwcFZlcnNpb24uaW5kZXhPZihcIlgxMVwiKSAhPT0gLTEpIHtcbiAgICBwbGF0Zm9ybS5vcyA9IFwidW5peFwiO1xufSBlbHNlIGlmIChuYXZpZ2F0b3IuYXBwVmVyc2lvbi5pbmRleE9mKFwiTGludXhcIikgIT09IC0xKSB7XG4gICAgcGxhdGZvcm0ub3MgPSBcImxpbnV4XCI7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQn9C+0LvRg9GH0LXQvdC40LUg0LTQsNC90L3Ri9GFINC+INCy0L7Qt9C80L7QttC90L7RgdGC0Lgg0LzQtdC90Y/RgtGMINCz0YDQvtC80LrQvtGB0YLRjFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxudmFyIG5vVm9sdW1lID0gdHJ1ZTtcbnRyeSB7XG4gICAgdmFyIGF1ZGlvID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYXVkaW8nKTtcbiAgICBhdWRpby52b2x1bWUgPSAwLjYzO1xuICAgIG5vVm9sdW1lID0gTWF0aC5hYnMoYXVkaW8udm9sdW1lIC0gMC42MykgPiAwLjAxO1xufSBjYXRjaChlKSB7XG4gICAgbm9Wb2x1bWUgPSB0cnVlO1xufVxuXG4vKipcbiAqINCY0L3RhNC+0YDQvNCw0YbQuNGPINC+0LEg0L7QutGA0YPQttC10L3QuNC4XG4gKiBAbmFtZXNwYWNlXG4gKiBAcHJpdmF0ZVxuICovXG52YXIgZGV0ZWN0ID0ge1xuICAgIC8qKlxuICAgICAqINCY0L3RhNC+0YDQvNCw0YbQuNGPINC+INCx0YDQsNGD0LfQtdGA0LVcbiAgICAgKiBAdHlwZSB7b2JqZWN0fVxuICAgICAqIEBwcm9wZXJ0eSB7c3RyaW5nfSBuYW1lIC0g0L3QsNC30LLQsNC90LjQtSDQsdGA0LDRg9C30LXRgNCwXG4gICAgICogQHByb3BlcnR5IHtzdHJpbmd9IHZlcnNpb24gLSDQstC10YDRgdC40Y9cbiAgICAgKiBAcHJvcGVydHkge251bWJlcn0gW2RvY3VtZW50TW9kZV0gLSDQstC10YDRgdC40Y8g0LTQvtC60YPQvNC10L3RgtCwXG4gICAgICovXG4gICAgYnJvd3NlcjogYnJvd3NlcixcblxuICAgIC8qKlxuICAgICAqINCY0L3RhNC+0YDQvNCw0YbQuNGPINC+INC/0LvQsNGC0YTQvtGA0LzQtVxuICAgICAqIEB0eXBlIHtvYmplY3R9XG4gICAgICogQHByb3BlcnR5IHtzdHJpbmd9IG9zIC0g0YLQuNC/INC+0L/QtdGA0LDRhtC40L7QvdC90L7QuSDRgdC40YHRgtC10LzRi1xuICAgICAqIEBwcm9wZXJ0eSB7c3RyaW5nfSB0eXBlIC0g0YLQuNC/INC/0LvQsNGC0YTQvtGA0LzRi1xuICAgICAqIEBwcm9wZXJ0eSB7Ym9vbGVhbn0gdGFibGV0IC0g0L/Qu9Cw0L3RiNC10YJcbiAgICAgKiBAcHJvcGVydHkge2Jvb2xlYW59IG1vYmlsZSAtINC80L7QsdC40LvRjNC90YvQuVxuICAgICAqL1xuICAgIHBsYXRmb3JtOiBwbGF0Zm9ybSxcblxuICAgIC8qKlxuICAgICAqINCd0LDRgdGC0YDQvtC50LrQsCDQs9GA0L7QvNC60L7RgdGC0LhcbiAgICAgKiBAdHlwZSB7Ym9vbGVhbn1cbiAgICAgKi9cbiAgICBvbmx5RGV2aWNlVm9sdW1lOiBub1ZvbHVtZVxufTtcblxubW9kdWxlLmV4cG9ydHMgPSBkZXRlY3Q7XG4iLCIvKipcbiAqIEBsaWNlbnNlIFNXRk9iamVjdCB2Mi4yIDxodHRwOi8vY29kZS5nb29nbGUuY29tL3Avc3dmb2JqZWN0Lz5cbiAqIGlzIHJlbGVhc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZSA8aHR0cDovL3d3dy5vcGVuc291cmNlLm9yZy9saWNlbnNlcy9taXQtbGljZW5zZS5waHA+XG4gKiBAcHJpdmF0ZVxuKi9cbnZhciBzd2ZvYmplY3QgPSBmdW5jdGlvbigpIHtcblx0dmFyIFVOREVGID0gXCJ1bmRlZmluZWRcIixcblx0XHRPQkpFQ1QgPSBcIm9iamVjdFwiLFxuXHRcdFNIT0NLV0FWRV9GTEFTSCA9IFwiU2hvY2t3YXZlIEZsYXNoXCIsXG5cdFx0U0hPQ0tXQVZFX0ZMQVNIX0FYID0gXCJTaG9ja3dhdmVGbGFzaC5TaG9ja3dhdmVGbGFzaFwiLFxuXHRcdEZMQVNIX01JTUVfVFlQRSA9IFwiYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2hcIixcblx0XHRFWFBSRVNTX0lOU1RBTExfSUQgPSBcIlNXRk9iamVjdEV4cHJJbnN0XCIsXG5cdFx0T05fUkVBRFlfU1RBVEVfQ0hBTkdFID0gXCJvbnJlYWR5c3RhdGVjaGFuZ2VcIixcblx0XHR3aW4gPSB3aW5kb3csXG5cdFx0ZG9jID0gZG9jdW1lbnQsXG5cdFx0bmF2ID0gbmF2aWdhdG9yLFxuXHRcdHBsdWdpbiA9IGZhbHNlLFxuXHRcdGRvbUxvYWRGbkFyciA9IFttYWluXSxcblx0XHRyZWdPYmpBcnIgPSBbXSxcblx0XHRvYmpJZEFyciA9IFtdLFxuXHRcdGxpc3RlbmVyc0FyciA9IFtdLFxuXHRcdHN0b3JlZEFsdENvbnRlbnQsXG5cdFx0c3RvcmVkQWx0Q29udGVudElkLFxuXHRcdHN0b3JlZENhbGxiYWNrRm4sXG5cdFx0c3RvcmVkQ2FsbGJhY2tPYmosXG5cdFx0aXNEb21Mb2FkZWQgPSBmYWxzZSxcblx0XHRpc0V4cHJlc3NJbnN0YWxsQWN0aXZlID0gZmFsc2UsXG5cdFx0ZHluYW1pY1N0eWxlc2hlZXQsXG5cdFx0ZHluYW1pY1N0eWxlc2hlZXRNZWRpYSxcblx0XHRhdXRvSGlkZVNob3cgPSB0cnVlLFxuXHQvKiBDZW50cmFsaXplZCBmdW5jdGlvbiBmb3IgYnJvd3NlciBmZWF0dXJlIGRldGVjdGlvblxuXHRcdC0gVXNlciBhZ2VudCBzdHJpbmcgZGV0ZWN0aW9uIGlzIG9ubHkgdXNlZCB3aGVuIG5vIGdvb2QgYWx0ZXJuYXRpdmUgaXMgcG9zc2libGVcblx0XHQtIElzIGV4ZWN1dGVkIGRpcmVjdGx5IGZvciBvcHRpbWFsIHBlcmZvcm1hbmNlXG5cdCovXG5cdHVhID0gZnVuY3Rpb24oKSB7XG5cdFx0dmFyIHczY2RvbSA9IHR5cGVvZiBkb2MuZ2V0RWxlbWVudEJ5SWQgIT0gVU5ERUYgJiYgdHlwZW9mIGRvYy5nZXRFbGVtZW50c0J5VGFnTmFtZSAhPSBVTkRFRiAmJiB0eXBlb2YgZG9jLmNyZWF0ZUVsZW1lbnQgIT0gVU5ERUYsXG5cdFx0XHR1ID0gbmF2LnVzZXJBZ2VudC50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0cCA9IG5hdi5wbGF0Zm9ybS50b0xvd2VyQ2FzZSgpLFxuXHRcdFx0d2luZG93cyA9IHAgPyAvd2luLy50ZXN0KHApIDogL3dpbi8udGVzdCh1KSxcblx0XHRcdG1hYyA9IHAgPyAvbWFjLy50ZXN0KHApIDogL21hYy8udGVzdCh1KSxcblx0XHRcdHdlYmtpdCA9IC93ZWJraXQvLnRlc3QodSkgPyBwYXJzZUZsb2F0KHUucmVwbGFjZSgvXi4qd2Via2l0XFwvKFxcZCsoXFwuXFxkKyk/KS4qJC8sIFwiJDFcIikpIDogZmFsc2UsIC8vIHJldHVybnMgZWl0aGVyIHRoZSB3ZWJraXQgdmVyc2lvbiBvciBmYWxzZSBpZiBub3Qgd2Via2l0XG5cdFx0XHRpZSA9ICErXCJcXHYxXCIsIC8vIGZlYXR1cmUgZGV0ZWN0aW9uIGJhc2VkIG9uIEFuZHJlYSBHaWFtbWFyY2hpJ3Mgc29sdXRpb246IGh0dHA6Ly93ZWJyZWZsZWN0aW9uLmJsb2dzcG90LmNvbS8yMDA5LzAxLzMyLWJ5dGVzLXRvLWtub3ctaWYteW91ci1icm93c2VyLWlzLWllLmh0bWxcblx0XHRcdHBsYXllclZlcnNpb24gPSBbMCwwLDBdLFxuXHRcdFx0ZCA9IG51bGw7XG5cdFx0aWYgKHR5cGVvZiBuYXYucGx1Z2lucyAhPSBVTkRFRiAmJiB0eXBlb2YgbmF2LnBsdWdpbnNbU0hPQ0tXQVZFX0ZMQVNIXSA9PSBPQkpFQ1QpIHtcblx0XHRcdGQgPSBuYXYucGx1Z2luc1tTSE9DS1dBVkVfRkxBU0hdLmRlc2NyaXB0aW9uO1xuXHRcdFx0aWYgKGQgJiYgISh0eXBlb2YgbmF2Lm1pbWVUeXBlcyAhPSBVTkRFRiAmJiBuYXYubWltZVR5cGVzW0ZMQVNIX01JTUVfVFlQRV0gJiYgIW5hdi5taW1lVHlwZXNbRkxBU0hfTUlNRV9UWVBFXS5lbmFibGVkUGx1Z2luKSkgeyAvLyBuYXZpZ2F0b3IubWltZVR5cGVzW1wiYXBwbGljYXRpb24veC1zaG9ja3dhdmUtZmxhc2hcIl0uZW5hYmxlZFBsdWdpbiBpbmRpY2F0ZXMgd2hldGhlciBwbHVnLWlucyBhcmUgZW5hYmxlZCBvciBkaXNhYmxlZCBpbiBTYWZhcmkgMytcblx0XHRcdFx0cGx1Z2luID0gdHJ1ZTtcblx0XHRcdFx0aWUgPSBmYWxzZTsgLy8gY2FzY2FkZWQgZmVhdHVyZSBkZXRlY3Rpb24gZm9yIEludGVybmV0IEV4cGxvcmVyXG5cdFx0XHRcdGQgPSBkLnJlcGxhY2UoL14uKlxccysoXFxTK1xccytcXFMrJCkvLCBcIiQxXCIpO1xuXHRcdFx0XHRwbGF5ZXJWZXJzaW9uWzBdID0gcGFyc2VJbnQoZC5yZXBsYWNlKC9eKC4qKVxcLi4qJC8sIFwiJDFcIiksIDEwKTtcblx0XHRcdFx0cGxheWVyVmVyc2lvblsxXSA9IHBhcnNlSW50KGQucmVwbGFjZSgvXi4qXFwuKC4qKVxccy4qJC8sIFwiJDFcIiksIDEwKTtcblx0XHRcdFx0cGxheWVyVmVyc2lvblsyXSA9IC9bYS16QS1aXS8udGVzdChkKSA/IHBhcnNlSW50KGQucmVwbGFjZSgvXi4qW2EtekEtWl0rKC4qKSQvLCBcIiQxXCIpLCAxMCkgOiAwO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRlbHNlIGlmICh0eXBlb2Ygd2luLkFjdGl2ZVhPYmplY3QgIT0gVU5ERUYpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdHZhciBhID0gbmV3IEFjdGl2ZVhPYmplY3QoU0hPQ0tXQVZFX0ZMQVNIX0FYKTtcblx0XHRcdFx0aWYgKGEpIHsgLy8gYSB3aWxsIHJldHVybiBudWxsIHdoZW4gQWN0aXZlWCBpcyBkaXNhYmxlZFxuXHRcdFx0XHRcdGQgPSBhLkdldFZhcmlhYmxlKFwiJHZlcnNpb25cIik7XG5cdFx0XHRcdFx0aWYgKGQpIHtcblx0XHRcdFx0XHRcdGllID0gdHJ1ZTsgLy8gY2FzY2FkZWQgZmVhdHVyZSBkZXRlY3Rpb24gZm9yIEludGVybmV0IEV4cGxvcmVyXG5cdFx0XHRcdFx0XHRkID0gZC5zcGxpdChcIiBcIilbMV0uc3BsaXQoXCIsXCIpO1xuXHRcdFx0XHRcdFx0cGxheWVyVmVyc2lvbiA9IFtwYXJzZUludChkWzBdLCAxMCksIHBhcnNlSW50KGRbMV0sIDEwKSwgcGFyc2VJbnQoZFsyXSwgMTApXTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGNhdGNoKGUpIHt9XG5cdFx0fVxuXHRcdHJldHVybiB7IHczOnczY2RvbSwgcHY6cGxheWVyVmVyc2lvbiwgd2s6d2Via2l0LCBpZTppZSwgd2luOndpbmRvd3MsIG1hYzptYWMgfTtcblx0fSgpO1xuXHQvKiBDcm9zcy1icm93c2VyIG9uRG9tTG9hZFxuXHRcdC0gV2lsbCBmaXJlIGFuIGV2ZW50IGFzIHNvb24gYXMgdGhlIERPTSBvZiBhIHdlYiBwYWdlIGlzIGxvYWRlZFxuXHRcdC0gSW50ZXJuZXQgRXhwbG9yZXIgd29ya2Fyb3VuZCBiYXNlZCBvbiBEaWVnbyBQZXJpbmkncyBzb2x1dGlvbjogaHR0cDovL2phdmFzY3JpcHQubndib3guY29tL0lFQ29udGVudExvYWRlZC9cblx0XHQtIFJlZ3VsYXIgb25sb2FkIHNlcnZlcyBhcyBmYWxsYmFja1xuXHQqL1xuXHQoZnVuY3Rpb24oKSB7XG5cdFx0aWYgKCF1YS53MykgeyByZXR1cm47IH1cblx0XHRpZiAoKHR5cGVvZiBkb2MucmVhZHlTdGF0ZSAhPSBVTkRFRiAmJiBkb2MucmVhZHlTdGF0ZSA9PSBcImNvbXBsZXRlXCIpIHx8ICh0eXBlb2YgZG9jLnJlYWR5U3RhdGUgPT0gVU5ERUYgJiYgKGRvYy5nZXRFbGVtZW50c0J5VGFnTmFtZShcImJvZHlcIilbMF0gfHwgZG9jLmJvZHkpKSkgeyAvLyBmdW5jdGlvbiBpcyBmaXJlZCBhZnRlciBvbmxvYWQsIGUuZy4gd2hlbiBzY3JpcHQgaXMgaW5zZXJ0ZWQgZHluYW1pY2FsbHlcblx0XHRcdGNhbGxEb21Mb2FkRnVuY3Rpb25zKCk7XG5cdFx0fVxuXHRcdGlmICghaXNEb21Mb2FkZWQpIHtcblx0XHRcdGlmICh0eXBlb2YgZG9jLmFkZEV2ZW50TGlzdGVuZXIgIT0gVU5ERUYpIHtcblx0XHRcdFx0ZG9jLmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsIGNhbGxEb21Mb2FkRnVuY3Rpb25zLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAodWEuaWUgJiYgdWEud2luKSB7XG5cdFx0XHRcdGRvYy5hdHRhY2hFdmVudChPTl9SRUFEWV9TVEFURV9DSEFOR0UsIGZ1bmN0aW9uKCkge1xuXHRcdFx0XHRcdGlmIChkb2MucmVhZHlTdGF0ZSA9PSBcImNvbXBsZXRlXCIpIHtcblx0XHRcdFx0XHRcdGRvYy5kZXRhY2hFdmVudChPTl9SRUFEWV9TVEFURV9DSEFOR0UsIGFyZ3VtZW50cy5jYWxsZWUpO1xuXHRcdFx0XHRcdFx0Y2FsbERvbUxvYWRGdW5jdGlvbnMoKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRpZiAod2luID09IHRvcCkgeyAvLyBpZiBub3QgaW5zaWRlIGFuIGlmcmFtZVxuXHRcdFx0XHRcdChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdFx0aWYgKGlzRG9tTG9hZGVkKSB7IHJldHVybjsgfVxuXHRcdFx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRcdFx0ZG9jLmRvY3VtZW50RWxlbWVudC5kb1Njcm9sbChcImxlZnRcIik7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRjYXRjaChlKSB7XG5cdFx0XHRcdFx0XHRcdHNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwgMCk7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhbGxEb21Mb2FkRnVuY3Rpb25zKCk7XG5cdFx0XHRcdFx0fSkoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdFx0aWYgKHVhLndrKSB7XG5cdFx0XHRcdChmdW5jdGlvbigpe1xuXHRcdFx0XHRcdGlmIChpc0RvbUxvYWRlZCkgeyByZXR1cm47IH1cblx0XHRcdFx0XHRpZiAoIS9sb2FkZWR8Y29tcGxldGUvLnRlc3QoZG9jLnJlYWR5U3RhdGUpKSB7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsIDApO1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYWxsRG9tTG9hZEZ1bmN0aW9ucygpO1xuXHRcdFx0XHR9KSgpO1xuXHRcdFx0fVxuXHRcdFx0YWRkTG9hZEV2ZW50KGNhbGxEb21Mb2FkRnVuY3Rpb25zKTtcblx0XHR9XG5cdH0pKCk7XG5cdGZ1bmN0aW9uIGNhbGxEb21Mb2FkRnVuY3Rpb25zKCkge1xuXHRcdGlmIChpc0RvbUxvYWRlZCkgeyByZXR1cm47IH1cblx0XHR0cnkgeyAvLyB0ZXN0IGlmIHdlIGNhbiByZWFsbHkgYWRkL3JlbW92ZSBlbGVtZW50cyB0by9mcm9tIHRoZSBET007IHdlIGRvbid0IHdhbnQgdG8gZmlyZSBpdCB0b28gZWFybHlcblx0XHRcdHZhciB0ID0gZG9jLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXS5hcHBlbmRDaGlsZChjcmVhdGVFbGVtZW50KFwic3BhblwiKSk7XG5cdFx0XHR0LnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQodCk7XG5cdFx0fVxuXHRcdGNhdGNoIChlKSB7IHJldHVybjsgfVxuXHRcdGlzRG9tTG9hZGVkID0gdHJ1ZTtcblx0XHR2YXIgZGwgPSBkb21Mb2FkRm5BcnIubGVuZ3RoO1xuXHRcdGZvciAodmFyIGkgPSAwOyBpIDwgZGw7IGkrKykge1xuXHRcdFx0ZG9tTG9hZEZuQXJyW2ldKCk7XG5cdFx0fVxuXHR9XG5cdGZ1bmN0aW9uIGFkZERvbUxvYWRFdmVudChmbikge1xuXHRcdGlmIChpc0RvbUxvYWRlZCkge1xuXHRcdFx0Zm4oKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRkb21Mb2FkRm5BcnJbZG9tTG9hZEZuQXJyLmxlbmd0aF0gPSBmbjsgLy8gQXJyYXkucHVzaCgpIGlzIG9ubHkgYXZhaWxhYmxlIGluIElFNS41K1xuXHRcdH1cblx0fVxuXHQvKiBDcm9zcy1icm93c2VyIG9ubG9hZFxuXHRcdC0gQmFzZWQgb24gSmFtZXMgRWR3YXJkcycgc29sdXRpb246IGh0dHA6Ly9icm90aGVyY2FrZS5jb20vc2l0ZS9yZXNvdXJjZXMvc2NyaXB0cy9vbmxvYWQvXG5cdFx0LSBXaWxsIGZpcmUgYW4gZXZlbnQgYXMgc29vbiBhcyBhIHdlYiBwYWdlIGluY2x1ZGluZyBhbGwgb2YgaXRzIGFzc2V0cyBhcmUgbG9hZGVkXG5cdCAqL1xuXHRmdW5jdGlvbiBhZGRMb2FkRXZlbnQoZm4pIHtcblx0XHRpZiAodHlwZW9mIHdpbi5hZGRFdmVudExpc3RlbmVyICE9IFVOREVGKSB7XG5cdFx0XHR3aW4uYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgZm4sIGZhbHNlKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZW9mIGRvYy5hZGRFdmVudExpc3RlbmVyICE9IFVOREVGKSB7XG5cdFx0XHRkb2MuYWRkRXZlbnRMaXN0ZW5lcihcImxvYWRcIiwgZm4sIGZhbHNlKTtcblx0XHR9XG5cdFx0ZWxzZSBpZiAodHlwZW9mIHdpbi5hdHRhY2hFdmVudCAhPSBVTkRFRikge1xuXHRcdFx0YWRkTGlzdGVuZXIod2luLCBcIm9ubG9hZFwiLCBmbik7XG5cdFx0fVxuXHRcdGVsc2UgaWYgKHR5cGVvZiB3aW4ub25sb2FkID09IFwiZnVuY3Rpb25cIikge1xuXHRcdFx0dmFyIGZuT2xkID0gd2luLm9ubG9hZDtcblx0XHRcdHdpbi5vbmxvYWQgPSBmdW5jdGlvbigpIHtcblx0XHRcdFx0Zm5PbGQoKTtcblx0XHRcdFx0Zm4oKTtcblx0XHRcdH07XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0d2luLm9ubG9hZCA9IGZuO1xuXHRcdH1cblx0fVxuXHQvKiBNYWluIGZ1bmN0aW9uXG5cdFx0LSBXaWxsIHByZWZlcmFibHkgZXhlY3V0ZSBvbkRvbUxvYWQsIG90aGVyd2lzZSBvbmxvYWQgKGFzIGEgZmFsbGJhY2spXG5cdCovXG5cdGZ1bmN0aW9uIG1haW4oKSB7XG5cdFx0aWYgKHBsdWdpbikge1xuXHRcdFx0dGVzdFBsYXllclZlcnNpb24oKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRtYXRjaFZlcnNpb25zKCk7XG5cdFx0fVxuXHR9XG5cdC8qIERldGVjdCB0aGUgRmxhc2ggUGxheWVyIHZlcnNpb24gZm9yIG5vbi1JbnRlcm5ldCBFeHBsb3JlciBicm93c2Vyc1xuXHRcdC0gRGV0ZWN0aW5nIHRoZSBwbHVnLWluIHZlcnNpb24gdmlhIHRoZSBvYmplY3QgZWxlbWVudCBpcyBtb3JlIHByZWNpc2UgdGhhbiB1c2luZyB0aGUgcGx1Z2lucyBjb2xsZWN0aW9uIGl0ZW0ncyBkZXNjcmlwdGlvbjpcblx0XHQgIGEuIEJvdGggcmVsZWFzZSBhbmQgYnVpbGQgbnVtYmVycyBjYW4gYmUgZGV0ZWN0ZWRcblx0XHQgIGIuIEF2b2lkIHdyb25nIGRlc2NyaXB0aW9ucyBieSBjb3JydXB0IGluc3RhbGxlcnMgcHJvdmlkZWQgYnkgQWRvYmVcblx0XHQgIGMuIEF2b2lkIHdyb25nIGRlc2NyaXB0aW9ucyBieSBtdWx0aXBsZSBGbGFzaCBQbGF5ZXIgZW50cmllcyBpbiB0aGUgcGx1Z2luIEFycmF5LCBjYXVzZWQgYnkgaW5jb3JyZWN0IGJyb3dzZXIgaW1wb3J0c1xuXHRcdC0gRGlzYWR2YW50YWdlIG9mIHRoaXMgbWV0aG9kIGlzIHRoYXQgaXQgZGVwZW5kcyBvbiB0aGUgYXZhaWxhYmlsaXR5IG9mIHRoZSBET00sIHdoaWxlIHRoZSBwbHVnaW5zIGNvbGxlY3Rpb24gaXMgaW1tZWRpYXRlbHkgYXZhaWxhYmxlXG5cdCovXG5cdGZ1bmN0aW9uIHRlc3RQbGF5ZXJWZXJzaW9uKCkge1xuXHRcdHZhciBiID0gZG9jLmdldEVsZW1lbnRzQnlUYWdOYW1lKFwiYm9keVwiKVswXTtcblx0XHR2YXIgbyA9IGNyZWF0ZUVsZW1lbnQoT0JKRUNUKTtcblx0XHRvLnNldEF0dHJpYnV0ZShcInR5cGVcIiwgRkxBU0hfTUlNRV9UWVBFKTtcblx0XHR2YXIgdCA9IGIuYXBwZW5kQ2hpbGQobyk7XG5cdFx0aWYgKHQpIHtcblx0XHRcdHZhciBjb3VudGVyID0gMDtcblx0XHRcdChmdW5jdGlvbigpe1xuXHRcdFx0XHRpZiAodHlwZW9mIHQuR2V0VmFyaWFibGUgIT0gVU5ERUYpIHtcblx0XHRcdFx0XHR2YXIgZCA9IHQuR2V0VmFyaWFibGUoXCIkdmVyc2lvblwiKTtcblx0XHRcdFx0XHRpZiAoZCkge1xuXHRcdFx0XHRcdFx0ZCA9IGQuc3BsaXQoXCIgXCIpWzFdLnNwbGl0KFwiLFwiKTtcblx0XHRcdFx0XHRcdHVhLnB2ID0gW3BhcnNlSW50KGRbMF0sIDEwKSwgcGFyc2VJbnQoZFsxXSwgMTApLCBwYXJzZUludChkWzJdLCAxMCldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIGlmIChjb3VudGVyIDwgMTApIHtcblx0XHRcdFx0XHRjb3VudGVyKys7XG5cdFx0XHRcdFx0c2V0VGltZW91dChhcmd1bWVudHMuY2FsbGVlLCAxMCk7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGIucmVtb3ZlQ2hpbGQobyk7XG5cdFx0XHRcdHQgPSBudWxsO1xuXHRcdFx0XHRtYXRjaFZlcnNpb25zKCk7XG5cdFx0XHR9KSgpO1xuXHRcdH1cblx0XHRlbHNlIHtcblx0XHRcdG1hdGNoVmVyc2lvbnMoKTtcblx0XHR9XG5cdH1cblx0LyogUGVyZm9ybSBGbGFzaCBQbGF5ZXIgYW5kIFNXRiB2ZXJzaW9uIG1hdGNoaW5nOyBzdGF0aWMgcHVibGlzaGluZyBvbmx5XG5cdCovXG5cdGZ1bmN0aW9uIG1hdGNoVmVyc2lvbnMoKSB7XG5cdFx0dmFyIHJsID0gcmVnT2JqQXJyLmxlbmd0aDtcblx0XHRpZiAocmwgPiAwKSB7XG5cdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHJsOyBpKyspIHsgLy8gZm9yIGVhY2ggcmVnaXN0ZXJlZCBvYmplY3QgZWxlbWVudFxuXHRcdFx0XHR2YXIgaWQgPSByZWdPYmpBcnJbaV0uaWQ7XG5cdFx0XHRcdHZhciBjYiA9IHJlZ09iakFycltpXS5jYWxsYmFja0ZuO1xuXHRcdFx0XHR2YXIgY2JPYmogPSB7c3VjY2VzczpmYWxzZSwgaWQ6aWR9O1xuXHRcdFx0XHRpZiAodWEucHZbMF0gPiAwKSB7XG5cdFx0XHRcdFx0dmFyIG9iaiA9IGdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHRcdFx0XHRpZiAob2JqKSB7XG5cdFx0XHRcdFx0XHRpZiAoaGFzUGxheWVyVmVyc2lvbihyZWdPYmpBcnJbaV0uc3dmVmVyc2lvbikgJiYgISh1YS53ayAmJiB1YS53ayA8IDMxMikpIHsgLy8gRmxhc2ggUGxheWVyIHZlcnNpb24gPj0gcHVibGlzaGVkIFNXRiB2ZXJzaW9uOiBIb3VzdG9uLCB3ZSBoYXZlIGEgbWF0Y2ghXG5cdFx0XHRcdFx0XHRcdHNldFZpc2liaWxpdHkoaWQsIHRydWUpO1xuXHRcdFx0XHRcdFx0XHRpZiAoY2IpIHtcblx0XHRcdFx0XHRcdFx0XHRjYk9iai5zdWNjZXNzID0gdHJ1ZTtcblx0XHRcdFx0XHRcdFx0XHRjYk9iai5yZWYgPSBnZXRPYmplY3RCeUlkKGlkKTtcblx0XHRcdFx0XHRcdFx0XHRjYihjYk9iaik7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKHJlZ09iakFycltpXS5leHByZXNzSW5zdGFsbCAmJiBjYW5FeHByZXNzSW5zdGFsbCgpKSB7IC8vIHNob3cgdGhlIEFkb2JlIEV4cHJlc3MgSW5zdGFsbCBkaWFsb2cgaWYgc2V0IGJ5IHRoZSB3ZWIgcGFnZSBhdXRob3IgYW5kIGlmIHN1cHBvcnRlZFxuXHRcdFx0XHRcdFx0XHR2YXIgYXR0ID0ge307XG5cdFx0XHRcdFx0XHRcdGF0dC5kYXRhID0gcmVnT2JqQXJyW2ldLmV4cHJlc3NJbnN0YWxsO1xuXHRcdFx0XHRcdFx0XHRhdHQud2lkdGggPSBvYmouZ2V0QXR0cmlidXRlKFwid2lkdGhcIikgfHwgXCIwXCI7XG5cdFx0XHRcdFx0XHRcdGF0dC5oZWlnaHQgPSBvYmouZ2V0QXR0cmlidXRlKFwiaGVpZ2h0XCIpIHx8IFwiMFwiO1xuXHRcdFx0XHRcdFx0XHRpZiAob2JqLmdldEF0dHJpYnV0ZShcImNsYXNzXCIpKSB7IGF0dC5zdHlsZWNsYXNzID0gb2JqLmdldEF0dHJpYnV0ZShcImNsYXNzXCIpOyB9XG5cdFx0XHRcdFx0XHRcdGlmIChvYmouZ2V0QXR0cmlidXRlKFwiYWxpZ25cIikpIHsgYXR0LmFsaWduID0gb2JqLmdldEF0dHJpYnV0ZShcImFsaWduXCIpOyB9XG5cdFx0XHRcdFx0XHRcdC8vIHBhcnNlIEhUTUwgb2JqZWN0IHBhcmFtIGVsZW1lbnQncyBuYW1lLXZhbHVlIHBhaXJzXG5cdFx0XHRcdFx0XHRcdHZhciBwYXIgPSB7fTtcblx0XHRcdFx0XHRcdFx0dmFyIHAgPSBvYmouZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJwYXJhbVwiKTtcblx0XHRcdFx0XHRcdFx0dmFyIHBsID0gcC5sZW5ndGg7XG5cdFx0XHRcdFx0XHRcdGZvciAodmFyIGogPSAwOyBqIDwgcGw7IGorKykge1xuXHRcdFx0XHRcdFx0XHRcdGlmIChwW2pdLmdldEF0dHJpYnV0ZShcIm5hbWVcIikudG9Mb3dlckNhc2UoKSAhPSBcIm1vdmllXCIpIHtcblx0XHRcdFx0XHRcdFx0XHRcdHBhcltwW2pdLmdldEF0dHJpYnV0ZShcIm5hbWVcIildID0gcFtqXS5nZXRBdHRyaWJ1dGUoXCJ2YWx1ZVwiKTtcblx0XHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdFx0c2hvd0V4cHJlc3NJbnN0YWxsKGF0dCwgcGFyLCBpZCwgY2IpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0ZWxzZSB7IC8vIEZsYXNoIFBsYXllciBhbmQgU1dGIHZlcnNpb24gbWlzbWF0Y2ggb3IgYW4gb2xkZXIgV2Via2l0IGVuZ2luZSB0aGF0IGlnbm9yZXMgdGhlIEhUTUwgb2JqZWN0IGVsZW1lbnQncyBuZXN0ZWQgcGFyYW0gZWxlbWVudHM6IGRpc3BsYXkgYWx0ZXJuYXRpdmUgY29udGVudCBpbnN0ZWFkIG9mIFNXRlxuXHRcdFx0XHRcdFx0XHRkaXNwbGF5QWx0Q29udGVudChvYmopO1xuXHRcdFx0XHRcdFx0XHRpZiAoY2IpIHsgY2IoY2JPYmopOyB9XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsc2Uge1x0Ly8gaWYgbm8gRmxhc2ggUGxheWVyIGlzIGluc3RhbGxlZCBvciB0aGUgZnAgdmVyc2lvbiBjYW5ub3QgYmUgZGV0ZWN0ZWQgd2UgbGV0IHRoZSBIVE1MIG9iamVjdCBlbGVtZW50IGRvIGl0cyBqb2IgKGVpdGhlciBzaG93IGEgU1dGIG9yIGFsdGVybmF0aXZlIGNvbnRlbnQpXG5cdFx0XHRcdFx0c2V0VmlzaWJpbGl0eShpZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0aWYgKGNiKSB7XG5cdFx0XHRcdFx0XHR2YXIgbyA9IGdldE9iamVjdEJ5SWQoaWQpOyAvLyB0ZXN0IHdoZXRoZXIgdGhlcmUgaXMgYW4gSFRNTCBvYmplY3QgZWxlbWVudCBvciBub3Rcblx0XHRcdFx0XHRcdGlmIChvICYmIHR5cGVvZiBvLlNldFZhcmlhYmxlICE9IFVOREVGKSB7XG5cdFx0XHRcdFx0XHRcdGNiT2JqLnN1Y2Nlc3MgPSB0cnVlO1xuXHRcdFx0XHRcdFx0XHRjYk9iai5yZWYgPSBvO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0Y2IoY2JPYmopO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmdW5jdGlvbiBnZXRPYmplY3RCeUlkKG9iamVjdElkU3RyKSB7XG5cdFx0dmFyIHIgPSBudWxsO1xuXHRcdHZhciBvID0gZ2V0RWxlbWVudEJ5SWQob2JqZWN0SWRTdHIpO1xuXHRcdGlmIChvICYmIG8ubm9kZU5hbWUgPT0gXCJPQkpFQ1RcIikge1xuXHRcdFx0aWYgKHR5cGVvZiBvLlNldFZhcmlhYmxlICE9IFVOREVGKSB7XG5cdFx0XHRcdHIgPSBvO1xuXHRcdFx0fVxuXHRcdFx0ZWxzZSB7XG5cdFx0XHRcdHZhciBuID0gby5nZXRFbGVtZW50c0J5VGFnTmFtZShPQkpFQ1QpWzBdO1xuXHRcdFx0XHRpZiAobikge1xuXHRcdFx0XHRcdHIgPSBuO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cdC8qIFJlcXVpcmVtZW50cyBmb3IgQWRvYmUgRXhwcmVzcyBJbnN0YWxsXG5cdFx0LSBvbmx5IG9uZSBpbnN0YW5jZSBjYW4gYmUgYWN0aXZlIGF0IGEgdGltZVxuXHRcdC0gZnAgNi4wLjY1IG9yIGhpZ2hlclxuXHRcdC0gV2luL01hYyBPUyBvbmx5XG5cdFx0LSBubyBXZWJraXQgZW5naW5lcyBvbGRlciB0aGFuIHZlcnNpb24gMzEyXG5cdCovXG5cdGZ1bmN0aW9uIGNhbkV4cHJlc3NJbnN0YWxsKCkge1xuXHRcdHJldHVybiAhaXNFeHByZXNzSW5zdGFsbEFjdGl2ZSAmJiBoYXNQbGF5ZXJWZXJzaW9uKFwiNi4wLjY1XCIpICYmICh1YS53aW4gfHwgdWEubWFjKSAmJiAhKHVhLndrICYmIHVhLndrIDwgMzEyKTtcblx0fVxuXHQvKiBTaG93IHRoZSBBZG9iZSBFeHByZXNzIEluc3RhbGwgZGlhbG9nXG5cdFx0LSBSZWZlcmVuY2U6IGh0dHA6Ly93d3cuYWRvYmUuY29tL2NmdXNpb24va25vd2xlZGdlYmFzZS9pbmRleC5jZm0/aWQ9NmEyNTNiNzVcblx0Ki9cblx0ZnVuY3Rpb24gc2hvd0V4cHJlc3NJbnN0YWxsKGF0dCwgcGFyLCByZXBsYWNlRWxlbUlkU3RyLCBjYWxsYmFja0ZuKSB7XG5cdFx0aXNFeHByZXNzSW5zdGFsbEFjdGl2ZSA9IHRydWU7XG5cdFx0c3RvcmVkQ2FsbGJhY2tGbiA9IGNhbGxiYWNrRm4gfHwgbnVsbDtcblx0XHRzdG9yZWRDYWxsYmFja09iaiA9IHtzdWNjZXNzOmZhbHNlLCBpZDpyZXBsYWNlRWxlbUlkU3RyfTtcblx0XHR2YXIgb2JqID0gZ2V0RWxlbWVudEJ5SWQocmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0aWYgKG9iaikge1xuXHRcdFx0aWYgKG9iai5ub2RlTmFtZSA9PSBcIk9CSkVDVFwiKSB7IC8vIHN0YXRpYyBwdWJsaXNoaW5nXG5cdFx0XHRcdHN0b3JlZEFsdENvbnRlbnQgPSBhYnN0cmFjdEFsdENvbnRlbnQob2JqKTtcblx0XHRcdFx0c3RvcmVkQWx0Q29udGVudElkID0gbnVsbDtcblx0XHRcdH1cblx0XHRcdGVsc2UgeyAvLyBkeW5hbWljIHB1Ymxpc2hpbmdcblx0XHRcdFx0c3RvcmVkQWx0Q29udGVudCA9IG9iajtcblx0XHRcdFx0c3RvcmVkQWx0Q29udGVudElkID0gcmVwbGFjZUVsZW1JZFN0cjtcblx0XHRcdH1cblx0XHRcdGF0dC5pZCA9IEVYUFJFU1NfSU5TVEFMTF9JRDtcblx0XHRcdGlmICh0eXBlb2YgYXR0LndpZHRoID09IFVOREVGIHx8ICghLyUkLy50ZXN0KGF0dC53aWR0aCkgJiYgcGFyc2VJbnQoYXR0LndpZHRoLCAxMCkgPCAzMTApKSB7IGF0dC53aWR0aCA9IFwiMzEwXCI7IH1cblx0XHRcdGlmICh0eXBlb2YgYXR0LmhlaWdodCA9PSBVTkRFRiB8fCAoIS8lJC8udGVzdChhdHQuaGVpZ2h0KSAmJiBwYXJzZUludChhdHQuaGVpZ2h0LCAxMCkgPCAxMzcpKSB7IGF0dC5oZWlnaHQgPSBcIjEzN1wiOyB9XG5cdFx0XHRkb2MudGl0bGUgPSBkb2MudGl0bGUuc2xpY2UoMCwgNDcpICsgXCIgLSBGbGFzaCBQbGF5ZXIgSW5zdGFsbGF0aW9uXCI7XG5cdFx0XHR2YXIgcHQgPSB1YS5pZSAmJiB1YS53aW4gPyBcIkFjdGl2ZVhcIiA6IFwiUGx1Z0luXCIsXG5cdFx0XHRcdGZ2ID0gXCJNTXJlZGlyZWN0VVJMPVwiICsgd2luLmxvY2F0aW9uLnRvU3RyaW5nKCkucmVwbGFjZSgvJi9nLFwiJTI2XCIpICsgXCImTU1wbGF5ZXJUeXBlPVwiICsgcHQgKyBcIiZNTWRvY3RpdGxlPVwiICsgZG9jLnRpdGxlO1xuXHRcdFx0aWYgKHR5cGVvZiBwYXIuZmxhc2h2YXJzICE9IFVOREVGKSB7XG5cdFx0XHRcdHBhci5mbGFzaHZhcnMgKz0gXCImXCIgKyBmdjtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRwYXIuZmxhc2h2YXJzID0gZnY7XG5cdFx0XHR9XG5cdFx0XHQvLyBJRSBvbmx5OiB3aGVuIGEgU1dGIGlzIGxvYWRpbmcgKEFORDogbm90IGF2YWlsYWJsZSBpbiBjYWNoZSkgd2FpdCBmb3IgdGhlIHJlYWR5U3RhdGUgb2YgdGhlIG9iamVjdCBlbGVtZW50IHRvIGJlY29tZSA0IGJlZm9yZSByZW1vdmluZyBpdCxcblx0XHRcdC8vIGJlY2F1c2UgeW91IGNhbm5vdCBwcm9wZXJseSBjYW5jZWwgYSBsb2FkaW5nIFNXRiBmaWxlIHdpdGhvdXQgYnJlYWtpbmcgYnJvd3NlciBsb2FkIHJlZmVyZW5jZXMsIGFsc28gb2JqLm9ucmVhZHlzdGF0ZWNoYW5nZSBkb2Vzbid0IHdvcmtcblx0XHRcdGlmICh1YS5pZSAmJiB1YS53aW4gJiYgb2JqLnJlYWR5U3RhdGUgIT0gNCkge1xuXHRcdFx0XHR2YXIgbmV3T2JqID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRcdFx0cmVwbGFjZUVsZW1JZFN0ciArPSBcIlNXRk9iamVjdE5ld1wiO1xuXHRcdFx0XHRuZXdPYmouc2V0QXR0cmlidXRlKFwiaWRcIiwgcmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0XHRcdG9iai5wYXJlbnROb2RlLmluc2VydEJlZm9yZShuZXdPYmosIG9iaik7IC8vIGluc2VydCBwbGFjZWhvbGRlciBkaXYgdGhhdCB3aWxsIGJlIHJlcGxhY2VkIGJ5IHRoZSBvYmplY3QgZWxlbWVudCB0aGF0IGxvYWRzIGV4cHJlc3NpbnN0YWxsLnN3ZlxuXHRcdFx0XHRvYmouc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0XHQoZnVuY3Rpb24oKXtcblx0XHRcdFx0XHRpZiAob2JqLnJlYWR5U3RhdGUgPT0gNCkge1xuXHRcdFx0XHRcdFx0b2JqLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQob2JqKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7XG5cdFx0XHRcdFx0XHRzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsIDEwKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0pKCk7XG5cdFx0XHR9XG5cdFx0XHRjcmVhdGVTV0YoYXR0LCBwYXIsIHJlcGxhY2VFbGVtSWRTdHIpO1xuXHRcdH1cblx0fVxuXHQvKiBGdW5jdGlvbnMgdG8gYWJzdHJhY3QgYW5kIGRpc3BsYXkgYWx0ZXJuYXRpdmUgY29udGVudFxuXHQqL1xuXHRmdW5jdGlvbiBkaXNwbGF5QWx0Q29udGVudChvYmopIHtcblx0XHRpZiAodWEuaWUgJiYgdWEud2luICYmIG9iai5yZWFkeVN0YXRlICE9IDQpIHtcblx0XHRcdC8vIElFIG9ubHk6IHdoZW4gYSBTV0YgaXMgbG9hZGluZyAoQU5EOiBub3QgYXZhaWxhYmxlIGluIGNhY2hlKSB3YWl0IGZvciB0aGUgcmVhZHlTdGF0ZSBvZiB0aGUgb2JqZWN0IGVsZW1lbnQgdG8gYmVjb21lIDQgYmVmb3JlIHJlbW92aW5nIGl0LFxuXHRcdFx0Ly8gYmVjYXVzZSB5b3UgY2Fubm90IHByb3Blcmx5IGNhbmNlbCBhIGxvYWRpbmcgU1dGIGZpbGUgd2l0aG91dCBicmVha2luZyBicm93c2VyIGxvYWQgcmVmZXJlbmNlcywgYWxzbyBvYmoub25yZWFkeXN0YXRlY2hhbmdlIGRvZXNuJ3Qgd29ya1xuXHRcdFx0dmFyIGVsID0gY3JlYXRlRWxlbWVudChcImRpdlwiKTtcblx0XHRcdG9iai5wYXJlbnROb2RlLmluc2VydEJlZm9yZShlbCwgb2JqKTsgLy8gaW5zZXJ0IHBsYWNlaG9sZGVyIGRpdiB0aGF0IHdpbGwgYmUgcmVwbGFjZWQgYnkgdGhlIGFsdGVybmF0aXZlIGNvbnRlbnRcblx0XHRcdGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKGFic3RyYWN0QWx0Q29udGVudChvYmopLCBlbCk7XG5cdFx0XHRvYmouc3R5bGUuZGlzcGxheSA9IFwibm9uZVwiO1xuXHRcdFx0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdGlmIChvYmoucmVhZHlTdGF0ZSA9PSA0KSB7XG5cdFx0XHRcdFx0b2JqLnBhcmVudE5vZGUucmVtb3ZlQ2hpbGQob2JqKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRzZXRUaW1lb3V0KGFyZ3VtZW50cy5jYWxsZWUsIDEwKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkoKTtcblx0XHR9XG5cdFx0ZWxzZSB7XG5cdFx0XHRvYmoucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoYWJzdHJhY3RBbHRDb250ZW50KG9iaiksIG9iaik7XG5cdFx0fVxuXHR9XG5cdGZ1bmN0aW9uIGFic3RyYWN0QWx0Q29udGVudChvYmopIHtcblx0XHR2YXIgYWMgPSBjcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xuXHRcdGlmICh1YS53aW4gJiYgdWEuaWUpIHtcblx0XHRcdGFjLmlubmVySFRNTCA9IG9iai5pbm5lckhUTUw7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0dmFyIG5lc3RlZE9iaiA9IG9iai5nZXRFbGVtZW50c0J5VGFnTmFtZShPQkpFQ1QpWzBdO1xuXHRcdFx0aWYgKG5lc3RlZE9iaikge1xuXHRcdFx0XHR2YXIgYyA9IG5lc3RlZE9iai5jaGlsZE5vZGVzO1xuXHRcdFx0XHRpZiAoYykge1xuXHRcdFx0XHRcdHZhciBjbCA9IGMubGVuZ3RoO1xuXHRcdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgY2w7IGkrKykge1xuXHRcdFx0XHRcdFx0aWYgKCEoY1tpXS5ub2RlVHlwZSA9PSAxICYmIGNbaV0ubm9kZU5hbWUgPT0gXCJQQVJBTVwiKSAmJiAhKGNbaV0ubm9kZVR5cGUgPT0gOCkpIHtcblx0XHRcdFx0XHRcdFx0YWMuYXBwZW5kQ2hpbGQoY1tpXS5jbG9uZU5vZGUodHJ1ZSkpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gYWM7XG5cdH1cblx0LyogQ3Jvc3MtYnJvd3NlciBkeW5hbWljIFNXRiBjcmVhdGlvblxuXHQqL1xuXHRmdW5jdGlvbiBjcmVhdGVTV0YoYXR0T2JqLCBwYXJPYmosIGlkKSB7XG5cdFx0dmFyIHIsIGVsID0gZ2V0RWxlbWVudEJ5SWQoaWQpO1xuXHRcdGlmICh1YS53ayAmJiB1YS53ayA8IDMxMikgeyByZXR1cm4gcjsgfVxuXHRcdGlmIChlbCkge1xuXHRcdFx0aWYgKHR5cGVvZiBhdHRPYmouaWQgPT0gVU5ERUYpIHsgLy8gaWYgbm8gJ2lkJyBpcyBkZWZpbmVkIGZvciB0aGUgb2JqZWN0IGVsZW1lbnQsIGl0IHdpbGwgaW5oZXJpdCB0aGUgJ2lkJyBmcm9tIHRoZSBhbHRlcm5hdGl2ZSBjb250ZW50XG5cdFx0XHRcdGF0dE9iai5pZCA9IGlkO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHVhLmllICYmIHVhLndpbikgeyAvLyBJbnRlcm5ldCBFeHBsb3JlciArIHRoZSBIVE1MIG9iamVjdCBlbGVtZW50ICsgVzNDIERPTSBtZXRob2RzIGRvIG5vdCBjb21iaW5lOiBmYWxsIGJhY2sgdG8gb3V0ZXJIVE1MXG5cdFx0XHRcdHZhciBhdHQgPSBcIlwiO1xuXHRcdFx0XHRmb3IgKHZhciBpIGluIGF0dE9iaikge1xuXHRcdFx0XHRcdGlmIChhdHRPYmpbaV0gIT0gT2JqZWN0LnByb3RvdHlwZVtpXSkgeyAvLyBmaWx0ZXIgb3V0IHByb3RvdHlwZSBhZGRpdGlvbnMgZnJvbSBvdGhlciBwb3RlbnRpYWwgbGlicmFyaWVzXG5cdFx0XHRcdFx0XHRpZiAoaS50b0xvd2VyQ2FzZSgpID09IFwiZGF0YVwiKSB7XG5cdFx0XHRcdFx0XHRcdHBhck9iai5tb3ZpZSA9IGF0dE9ialtpXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKGkudG9Mb3dlckNhc2UoKSA9PSBcInN0eWxlY2xhc3NcIikgeyAvLyAnY2xhc3MnIGlzIGFuIEVDTUE0IHJlc2VydmVkIGtleXdvcmRcblx0XHRcdFx0XHRcdFx0YXR0ICs9ICcgY2xhc3M9XCInICsgYXR0T2JqW2ldICsgJ1wiJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKGkudG9Mb3dlckNhc2UoKSAhPSBcImNsYXNzaWRcIikge1xuXHRcdFx0XHRcdFx0XHRhdHQgKz0gJyAnICsgaSArICc9XCInICsgYXR0T2JqW2ldICsgJ1wiJztcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0dmFyIHBhciA9IFwiXCI7XG5cdFx0XHRcdGZvciAodmFyIGogaW4gcGFyT2JqKSB7XG5cdFx0XHRcdFx0aWYgKHBhck9ialtqXSAhPSBPYmplY3QucHJvdG90eXBlW2pdKSB7IC8vIGZpbHRlciBvdXQgcHJvdG90eXBlIGFkZGl0aW9ucyBmcm9tIG90aGVyIHBvdGVudGlhbCBsaWJyYXJpZXNcblx0XHRcdFx0XHRcdHBhciArPSAnPHBhcmFtIG5hbWU9XCInICsgaiArICdcIiB2YWx1ZT1cIicgKyBwYXJPYmpbal0gKyAnXCIgLz4nO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRlbC5vdXRlckhUTUwgPSAnPG9iamVjdCBjbGFzc2lkPVwiY2xzaWQ6RDI3Q0RCNkUtQUU2RC0xMWNmLTk2QjgtNDQ0NTUzNTQwMDAwXCInICsgYXR0ICsgJz4nICsgcGFyICsgJzwvb2JqZWN0Pic7XG5cdFx0XHRcdG9iaklkQXJyW29iaklkQXJyLmxlbmd0aF0gPSBhdHRPYmouaWQ7IC8vIHN0b3JlZCB0byBmaXggb2JqZWN0ICdsZWFrcycgb24gdW5sb2FkIChkeW5hbWljIHB1Ymxpc2hpbmcgb25seSlcblx0XHRcdFx0ciA9IGdldEVsZW1lbnRCeUlkKGF0dE9iai5pZCk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHsgLy8gd2VsbC1iZWhhdmluZyBicm93c2Vyc1xuXHRcdFx0XHR2YXIgbyA9IGNyZWF0ZUVsZW1lbnQoT0JKRUNUKTtcblx0XHRcdFx0by5zZXRBdHRyaWJ1dGUoXCJ0eXBlXCIsIEZMQVNIX01JTUVfVFlQRSk7XG5cdFx0XHRcdGZvciAodmFyIG0gaW4gYXR0T2JqKSB7XG5cdFx0XHRcdFx0aWYgKGF0dE9ialttXSAhPSBPYmplY3QucHJvdG90eXBlW21dKSB7IC8vIGZpbHRlciBvdXQgcHJvdG90eXBlIGFkZGl0aW9ucyBmcm9tIG90aGVyIHBvdGVudGlhbCBsaWJyYXJpZXNcblx0XHRcdFx0XHRcdGlmIChtLnRvTG93ZXJDYXNlKCkgPT0gXCJzdHlsZWNsYXNzXCIpIHsgLy8gJ2NsYXNzJyBpcyBhbiBFQ01BNCByZXNlcnZlZCBrZXl3b3JkXG5cdFx0XHRcdFx0XHRcdG8uc2V0QXR0cmlidXRlKFwiY2xhc3NcIiwgYXR0T2JqW21dKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGVsc2UgaWYgKG0udG9Mb3dlckNhc2UoKSAhPSBcImNsYXNzaWRcIikgeyAvLyBmaWx0ZXIgb3V0IElFIHNwZWNpZmljIGF0dHJpYnV0ZVxuXHRcdFx0XHRcdFx0XHRvLnNldEF0dHJpYnV0ZShtLCBhdHRPYmpbbV0pO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0XHRmb3IgKHZhciBuIGluIHBhck9iaikge1xuXHRcdFx0XHRcdGlmIChwYXJPYmpbbl0gIT0gT2JqZWN0LnByb3RvdHlwZVtuXSAmJiBuLnRvTG93ZXJDYXNlKCkgIT0gXCJtb3ZpZVwiKSB7IC8vIGZpbHRlciBvdXQgcHJvdG90eXBlIGFkZGl0aW9ucyBmcm9tIG90aGVyIHBvdGVudGlhbCBsaWJyYXJpZXMgYW5kIElFIHNwZWNpZmljIHBhcmFtIGVsZW1lbnRcblx0XHRcdFx0XHRcdGNyZWF0ZU9ialBhcmFtKG8sIG4sIHBhck9ialtuXSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGVsLnBhcmVudE5vZGUucmVwbGFjZUNoaWxkKG8sIGVsKTtcblx0XHRcdFx0ciA9IG87XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHJldHVybiByO1xuXHR9XG5cdGZ1bmN0aW9uIGNyZWF0ZU9ialBhcmFtKGVsLCBwTmFtZSwgcFZhbHVlKSB7XG5cdFx0dmFyIHAgPSBjcmVhdGVFbGVtZW50KFwicGFyYW1cIik7XG5cdFx0cC5zZXRBdHRyaWJ1dGUoXCJuYW1lXCIsIHBOYW1lKTtcblx0XHRwLnNldEF0dHJpYnV0ZShcInZhbHVlXCIsIHBWYWx1ZSk7XG5cdFx0ZWwuYXBwZW5kQ2hpbGQocCk7XG5cdH1cblx0LyogQ3Jvc3MtYnJvd3NlciBTV0YgcmVtb3ZhbFxuXHRcdC0gRXNwZWNpYWxseSBuZWVkZWQgdG8gc2FmZWx5IGFuZCBjb21wbGV0ZWx5IHJlbW92ZSBhIFNXRiBpbiBJbnRlcm5ldCBFeHBsb3JlclxuXHQqL1xuXHRmdW5jdGlvbiByZW1vdmVTV0YoaWQpIHtcblx0XHR2YXIgb2JqID0gZ2V0RWxlbWVudEJ5SWQoaWQpO1xuXHRcdGlmIChvYmogJiYgb2JqLm5vZGVOYW1lID09IFwiT0JKRUNUXCIpIHtcblx0XHRcdGlmICh1YS5pZSAmJiB1YS53aW4pIHtcblx0XHRcdFx0b2JqLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcblx0XHRcdFx0KGZ1bmN0aW9uKCl7XG5cdFx0XHRcdFx0aWYgKG9iai5yZWFkeVN0YXRlID09IDQpIHtcblx0XHRcdFx0XHRcdHJlbW92ZU9iamVjdEluSUUoaWQpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIHtcblx0XHRcdFx0XHRcdHNldFRpbWVvdXQoYXJndW1lbnRzLmNhbGxlZSwgMTApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkoKTtcblx0XHRcdH1cblx0XHRcdGVsc2Uge1xuXHRcdFx0XHRvYmoucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChvYmopO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmdW5jdGlvbiByZW1vdmVPYmplY3RJbklFKGlkKSB7XG5cdFx0dmFyIG9iaiA9IGdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHRpZiAob2JqKSB7XG5cdFx0XHRmb3IgKHZhciBpIGluIG9iaikge1xuXHRcdFx0XHRpZiAodHlwZW9mIG9ialtpXSA9PSBcImZ1bmN0aW9uXCIpIHtcblx0XHRcdFx0XHRvYmpbaV0gPSBudWxsO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRvYmoucGFyZW50Tm9kZS5yZW1vdmVDaGlsZChvYmopO1xuXHRcdH1cblx0fVxuXHQvKiBGdW5jdGlvbnMgdG8gb3B0aW1pemUgSmF2YVNjcmlwdCBjb21wcmVzc2lvblxuXHQqL1xuXHRmdW5jdGlvbiBnZXRFbGVtZW50QnlJZChpZCkge1xuXHRcdHZhciBlbCA9IG51bGw7XG5cdFx0dHJ5IHtcblx0XHRcdGVsID0gZG9jLmdldEVsZW1lbnRCeUlkKGlkKTtcblx0XHR9XG5cdFx0Y2F0Y2ggKGUpIHt9XG5cdFx0cmV0dXJuIGVsO1xuXHR9XG5cdGZ1bmN0aW9uIGNyZWF0ZUVsZW1lbnQoZWwpIHtcblx0XHRyZXR1cm4gZG9jLmNyZWF0ZUVsZW1lbnQoZWwpO1xuXHR9XG5cdC8qIFVwZGF0ZWQgYXR0YWNoRXZlbnQgZnVuY3Rpb24gZm9yIEludGVybmV0IEV4cGxvcmVyXG5cdFx0LSBTdG9yZXMgYXR0YWNoRXZlbnQgaW5mb3JtYXRpb24gaW4gYW4gQXJyYXksIHNvIG9uIHVubG9hZCB0aGUgZGV0YWNoRXZlbnQgZnVuY3Rpb25zIGNhbiBiZSBjYWxsZWQgdG8gYXZvaWQgbWVtb3J5IGxlYWtzXG5cdCovXG5cdGZ1bmN0aW9uIGFkZExpc3RlbmVyKHRhcmdldCwgZXZlbnRUeXBlLCBmbikge1xuXHRcdHRhcmdldC5hdHRhY2hFdmVudChldmVudFR5cGUsIGZuKTtcblx0XHRsaXN0ZW5lcnNBcnJbbGlzdGVuZXJzQXJyLmxlbmd0aF0gPSBbdGFyZ2V0LCBldmVudFR5cGUsIGZuXTtcblx0fVxuXHQvKiBGbGFzaCBQbGF5ZXIgYW5kIFNXRiBjb250ZW50IHZlcnNpb24gbWF0Y2hpbmdcblx0Ki9cblx0ZnVuY3Rpb24gaGFzUGxheWVyVmVyc2lvbihydikge1xuXHRcdHZhciBwdiA9IHVhLnB2LCB2ID0gcnYuc3BsaXQoXCIuXCIpO1xuXHRcdHZbMF0gPSBwYXJzZUludCh2WzBdLCAxMCk7XG5cdFx0dlsxXSA9IHBhcnNlSW50KHZbMV0sIDEwKSB8fCAwOyAvLyBzdXBwb3J0cyBzaG9ydCBub3RhdGlvbiwgZS5nLiBcIjlcIiBpbnN0ZWFkIG9mIFwiOS4wLjBcIlxuXHRcdHZbMl0gPSBwYXJzZUludCh2WzJdLCAxMCkgfHwgMDtcblx0XHRyZXR1cm4gKHB2WzBdID4gdlswXSB8fCAocHZbMF0gPT0gdlswXSAmJiBwdlsxXSA+IHZbMV0pIHx8IChwdlswXSA9PSB2WzBdICYmIHB2WzFdID09IHZbMV0gJiYgcHZbMl0gPj0gdlsyXSkpID8gdHJ1ZSA6IGZhbHNlO1xuXHR9XG5cdC8qIENyb3NzLWJyb3dzZXIgZHluYW1pYyBDU1MgY3JlYXRpb25cblx0XHQtIEJhc2VkIG9uIEJvYmJ5IHZhbiBkZXIgU2x1aXMnIHNvbHV0aW9uOiBodHRwOi8vd3d3LmJvYmJ5dmFuZGVyc2x1aXMuY29tL2FydGljbGVzL2R5bmFtaWNDU1MucGhwXG5cdCovXG5cdGZ1bmN0aW9uIGNyZWF0ZUNTUyhzZWwsIGRlY2wsIG1lZGlhLCBuZXdTdHlsZSkge1xuXHRcdGlmICh1YS5pZSAmJiB1YS5tYWMpIHsgcmV0dXJuOyB9XG5cdFx0dmFyIGggPSBkb2MuZ2V0RWxlbWVudHNCeVRhZ05hbWUoXCJoZWFkXCIpWzBdO1xuXHRcdGlmICghaCkgeyByZXR1cm47IH0gLy8gdG8gYWxzbyBzdXBwb3J0IGJhZGx5IGF1dGhvcmVkIEhUTUwgcGFnZXMgdGhhdCBsYWNrIGEgaGVhZCBlbGVtZW50XG5cdFx0dmFyIG0gPSAobWVkaWEgJiYgdHlwZW9mIG1lZGlhID09IFwic3RyaW5nXCIpID8gbWVkaWEgOiBcInNjcmVlblwiO1xuXHRcdGlmIChuZXdTdHlsZSkge1xuXHRcdFx0ZHluYW1pY1N0eWxlc2hlZXQgPSBudWxsO1xuXHRcdFx0ZHluYW1pY1N0eWxlc2hlZXRNZWRpYSA9IG51bGw7XG5cdFx0fVxuXHRcdGlmICghZHluYW1pY1N0eWxlc2hlZXQgfHwgZHluYW1pY1N0eWxlc2hlZXRNZWRpYSAhPSBtKSB7XG5cdFx0XHQvLyBjcmVhdGUgZHluYW1pYyBzdHlsZXNoZWV0ICsgZ2V0IGEgZ2xvYmFsIHJlZmVyZW5jZSB0byBpdFxuXHRcdFx0dmFyIHMgPSBjcmVhdGVFbGVtZW50KFwic3R5bGVcIik7XG5cdFx0XHRzLnNldEF0dHJpYnV0ZShcInR5cGVcIiwgXCJ0ZXh0L2Nzc1wiKTtcblx0XHRcdHMuc2V0QXR0cmlidXRlKFwibWVkaWFcIiwgbSk7XG5cdFx0XHRkeW5hbWljU3R5bGVzaGVldCA9IGguYXBwZW5kQ2hpbGQocyk7XG5cdFx0XHRpZiAodWEuaWUgJiYgdWEud2luICYmIHR5cGVvZiBkb2Muc3R5bGVTaGVldHMgIT0gVU5ERUYgJiYgZG9jLnN0eWxlU2hlZXRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0ZHluYW1pY1N0eWxlc2hlZXQgPSBkb2Muc3R5bGVTaGVldHNbZG9jLnN0eWxlU2hlZXRzLmxlbmd0aCAtIDFdO1xuXHRcdFx0fVxuXHRcdFx0ZHluYW1pY1N0eWxlc2hlZXRNZWRpYSA9IG07XG5cdFx0fVxuXHRcdC8vIGFkZCBzdHlsZSBydWxlXG5cdFx0aWYgKHVhLmllICYmIHVhLndpbikge1xuXHRcdFx0aWYgKGR5bmFtaWNTdHlsZXNoZWV0ICYmIHR5cGVvZiBkeW5hbWljU3R5bGVzaGVldC5hZGRSdWxlID09IE9CSkVDVCkge1xuXHRcdFx0XHRkeW5hbWljU3R5bGVzaGVldC5hZGRSdWxlKHNlbCwgZGVjbCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0aWYgKGR5bmFtaWNTdHlsZXNoZWV0ICYmIHR5cGVvZiBkb2MuY3JlYXRlVGV4dE5vZGUgIT0gVU5ERUYpIHtcblx0XHRcdFx0ZHluYW1pY1N0eWxlc2hlZXQuYXBwZW5kQ2hpbGQoZG9jLmNyZWF0ZVRleHROb2RlKHNlbCArIFwiIHtcIiArIGRlY2wgKyBcIn1cIikpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXHRmdW5jdGlvbiBzZXRWaXNpYmlsaXR5KGlkLCBpc1Zpc2libGUpIHtcblx0XHRpZiAoIWF1dG9IaWRlU2hvdykgeyByZXR1cm47IH1cblx0XHR2YXIgdiA9IGlzVmlzaWJsZSA/IFwidmlzaWJsZVwiIDogXCJoaWRkZW5cIjtcblx0XHRpZiAoaXNEb21Mb2FkZWQgJiYgZ2V0RWxlbWVudEJ5SWQoaWQpKSB7XG5cdFx0XHRnZXRFbGVtZW50QnlJZChpZCkuc3R5bGUudmlzaWJpbGl0eSA9IHY7XG5cdFx0fVxuXHRcdGVsc2Uge1xuXHRcdFx0Y3JlYXRlQ1NTKFwiI1wiICsgaWQsIFwidmlzaWJpbGl0eTpcIiArIHYpO1xuXHRcdH1cblx0fVxuXHQvKiBGaWx0ZXIgdG8gYXZvaWQgWFNTIGF0dGFja3Ncblx0Ki9cblx0ZnVuY3Rpb24gdXJsRW5jb2RlSWZOZWNlc3Nhcnkocykge1xuXHRcdHZhciByZWdleCA9IC9bXFxcXFxcXCI8PlxcLjtdLztcblx0XHR2YXIgaGFzQmFkQ2hhcnMgPSByZWdleC5leGVjKHMpICE9IG51bGw7XG5cdFx0cmV0dXJuIGhhc0JhZENoYXJzICYmIHR5cGVvZiBlbmNvZGVVUklDb21wb25lbnQgIT0gVU5ERUYgPyBlbmNvZGVVUklDb21wb25lbnQocykgOiBzO1xuXHR9XG5cdC8qIFJlbGVhc2UgbWVtb3J5IHRvIGF2b2lkIG1lbW9yeSBsZWFrcyBjYXVzZWQgYnkgY2xvc3VyZXMsIGZpeCBoYW5naW5nIGF1ZGlvL3ZpZGVvIHRocmVhZHMgYW5kIGZvcmNlIG9wZW4gc29ja2V0cy9OZXRDb25uZWN0aW9ucyB0byBkaXNjb25uZWN0IChJbnRlcm5ldCBFeHBsb3JlciBvbmx5KVxuXHQqL1xuXHQoZnVuY3Rpb24oKSB7XG5cdFx0aWYgKHVhLmllICYmIHVhLndpbikge1xuXHRcdFx0d2luZG93LmF0dGFjaEV2ZW50KFwib251bmxvYWRcIiwgZnVuY3Rpb24oKSB7XG5cdFx0XHRcdC8vIHJlbW92ZSBsaXN0ZW5lcnMgdG8gYXZvaWQgbWVtb3J5IGxlYWtzXG5cdFx0XHRcdHZhciBsbCA9IGxpc3RlbmVyc0Fyci5sZW5ndGg7XG5cdFx0XHRcdGZvciAodmFyIGkgPSAwOyBpIDwgbGw7IGkrKykge1xuXHRcdFx0XHRcdGxpc3RlbmVyc0FycltpXVswXS5kZXRhY2hFdmVudChsaXN0ZW5lcnNBcnJbaV1bMV0sIGxpc3RlbmVyc0FycltpXVsyXSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gY2xlYW51cCBkeW5hbWljYWxseSBlbWJlZGRlZCBvYmplY3RzIHRvIGZpeCBhdWRpby92aWRlbyB0aHJlYWRzIGFuZCBmb3JjZSBvcGVuIHNvY2tldHMgYW5kIE5ldENvbm5lY3Rpb25zIHRvIGRpc2Nvbm5lY3Rcblx0XHRcdFx0dmFyIGlsID0gb2JqSWRBcnIubGVuZ3RoO1xuXHRcdFx0XHRmb3IgKHZhciBqID0gMDsgaiA8IGlsOyBqKyspIHtcblx0XHRcdFx0XHRyZW1vdmVTV0Yob2JqSWRBcnJbal0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIGNsZWFudXAgbGlicmFyeSdzIG1haW4gY2xvc3VyZXMgdG8gYXZvaWQgbWVtb3J5IGxlYWtzXG5cdFx0XHRcdGZvciAodmFyIGsgaW4gdWEpIHtcblx0XHRcdFx0XHR1YVtrXSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0dWEgPSBudWxsO1xuXHRcdFx0XHRmb3IgKHZhciBsIGluIHN3Zm9iamVjdCkge1xuXHRcdFx0XHRcdHN3Zm9iamVjdFtsXSA9IG51bGw7XG5cdFx0XHRcdH1cblx0XHRcdFx0c3dmb2JqZWN0ID0gbnVsbDtcblx0XHRcdH0pO1xuXHRcdH1cblx0fSkoKTtcblx0cmV0dXJuIHtcblx0XHQvKiBQdWJsaWMgQVBJXG5cdFx0XHQtIFJlZmVyZW5jZTogaHR0cDovL2NvZGUuZ29vZ2xlLmNvbS9wL3N3Zm9iamVjdC93aWtpL2RvY3VtZW50YXRpb25cblx0XHQqL1xuXHRcdHJlZ2lzdGVyT2JqZWN0OiBmdW5jdGlvbihvYmplY3RJZFN0ciwgc3dmVmVyc2lvblN0ciwgeGlTd2ZVcmxTdHIsIGNhbGxiYWNrRm4pIHtcblx0XHRcdGlmICh1YS53MyAmJiBvYmplY3RJZFN0ciAmJiBzd2ZWZXJzaW9uU3RyKSB7XG5cdFx0XHRcdHZhciByZWdPYmogPSB7fTtcblx0XHRcdFx0cmVnT2JqLmlkID0gb2JqZWN0SWRTdHI7XG5cdFx0XHRcdHJlZ09iai5zd2ZWZXJzaW9uID0gc3dmVmVyc2lvblN0cjtcblx0XHRcdFx0cmVnT2JqLmV4cHJlc3NJbnN0YWxsID0geGlTd2ZVcmxTdHI7XG5cdFx0XHRcdHJlZ09iai5jYWxsYmFja0ZuID0gY2FsbGJhY2tGbjtcblx0XHRcdFx0cmVnT2JqQXJyW3JlZ09iakFyci5sZW5ndGhdID0gcmVnT2JqO1xuXHRcdFx0XHRzZXRWaXNpYmlsaXR5KG9iamVjdElkU3RyLCBmYWxzZSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChjYWxsYmFja0ZuKSB7XG5cdFx0XHRcdGNhbGxiYWNrRm4oe3N1Y2Nlc3M6ZmFsc2UsIGlkOm9iamVjdElkU3RyfSk7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRnZXRPYmplY3RCeUlkOiBmdW5jdGlvbihvYmplY3RJZFN0cikge1xuXHRcdFx0aWYgKHVhLnczKSB7XG5cdFx0XHRcdHJldHVybiBnZXRPYmplY3RCeUlkKG9iamVjdElkU3RyKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGVtYmVkU1dGOiBmdW5jdGlvbihzd2ZVcmxTdHIsIHJlcGxhY2VFbGVtSWRTdHIsIHdpZHRoU3RyLCBoZWlnaHRTdHIsIHN3ZlZlcnNpb25TdHIsIHhpU3dmVXJsU3RyLCBmbGFzaHZhcnNPYmosIHBhck9iaiwgYXR0T2JqLCBjYWxsYmFja0ZuKSB7XG5cdFx0XHR2YXIgY2FsbGJhY2tPYmogPSB7c3VjY2VzczpmYWxzZSwgaWQ6cmVwbGFjZUVsZW1JZFN0cn07XG5cdFx0XHRpZiAodWEudzMgJiYgISh1YS53ayAmJiB1YS53ayA8IDMxMikgJiYgc3dmVXJsU3RyICYmIHJlcGxhY2VFbGVtSWRTdHIgJiYgd2lkdGhTdHIgJiYgaGVpZ2h0U3RyICYmIHN3ZlZlcnNpb25TdHIpIHtcblx0XHRcdFx0c2V0VmlzaWJpbGl0eShyZXBsYWNlRWxlbUlkU3RyLCBmYWxzZSk7XG5cdFx0XHRcdGFkZERvbUxvYWRFdmVudChmdW5jdGlvbigpIHtcblx0XHRcdFx0XHR3aWR0aFN0ciArPSBcIlwiOyAvLyBhdXRvLWNvbnZlcnQgdG8gc3RyaW5nXG5cdFx0XHRcdFx0aGVpZ2h0U3RyICs9IFwiXCI7XG5cdFx0XHRcdFx0dmFyIGF0dCA9IHt9O1xuXHRcdFx0XHRcdGlmIChhdHRPYmogJiYgdHlwZW9mIGF0dE9iaiA9PT0gT0JKRUNUKSB7XG5cdFx0XHRcdFx0XHRmb3IgKHZhciBpIGluIGF0dE9iaikgeyAvLyBjb3B5IG9iamVjdCB0byBhdm9pZCB0aGUgdXNlIG9mIHJlZmVyZW5jZXMsIGJlY2F1c2Ugd2ViIGF1dGhvcnMgb2Z0ZW4gcmV1c2UgYXR0T2JqIGZvciBtdWx0aXBsZSBTV0ZzXG5cdFx0XHRcdFx0XHRcdGF0dFtpXSA9IGF0dE9ialtpXTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YXR0LmRhdGEgPSBzd2ZVcmxTdHI7XG5cdFx0XHRcdFx0YXR0LndpZHRoID0gd2lkdGhTdHI7XG5cdFx0XHRcdFx0YXR0LmhlaWdodCA9IGhlaWdodFN0cjtcblx0XHRcdFx0XHR2YXIgcGFyID0ge307XG5cdFx0XHRcdFx0aWYgKHBhck9iaiAmJiB0eXBlb2YgcGFyT2JqID09PSBPQkpFQ1QpIHtcblx0XHRcdFx0XHRcdGZvciAodmFyIGogaW4gcGFyT2JqKSB7IC8vIGNvcHkgb2JqZWN0IHRvIGF2b2lkIHRoZSB1c2Ugb2YgcmVmZXJlbmNlcywgYmVjYXVzZSB3ZWIgYXV0aG9ycyBvZnRlbiByZXVzZSBwYXJPYmogZm9yIG11bHRpcGxlIFNXRnNcblx0XHRcdFx0XHRcdFx0cGFyW2pdID0gcGFyT2JqW2pdO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoZmxhc2h2YXJzT2JqICYmIHR5cGVvZiBmbGFzaHZhcnNPYmogPT09IE9CSkVDVCkge1xuXHRcdFx0XHRcdFx0Zm9yICh2YXIgayBpbiBmbGFzaHZhcnNPYmopIHsgLy8gY29weSBvYmplY3QgdG8gYXZvaWQgdGhlIHVzZSBvZiByZWZlcmVuY2VzLCBiZWNhdXNlIHdlYiBhdXRob3JzIG9mdGVuIHJldXNlIGZsYXNodmFyc09iaiBmb3IgbXVsdGlwbGUgU1dGc1xuXHRcdFx0XHRcdFx0XHRpZiAodHlwZW9mIHBhci5mbGFzaHZhcnMgIT0gVU5ERUYpIHtcblx0XHRcdFx0XHRcdFx0XHRwYXIuZmxhc2h2YXJzICs9IFwiJlwiICsgayArIFwiPVwiICsgZmxhc2h2YXJzT2JqW2tdO1xuXHRcdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRcdGVsc2Uge1xuXHRcdFx0XHRcdFx0XHRcdHBhci5mbGFzaHZhcnMgPSBrICsgXCI9XCIgKyBmbGFzaHZhcnNPYmpba107XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGhhc1BsYXllclZlcnNpb24oc3dmVmVyc2lvblN0cikpIHsgLy8gY3JlYXRlIFNXRlxuXHRcdFx0XHRcdFx0dmFyIG9iaiA9IGNyZWF0ZVNXRihhdHQsIHBhciwgcmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0XHRcdFx0XHRpZiAoYXR0LmlkID09IHJlcGxhY2VFbGVtSWRTdHIpIHtcblx0XHRcdFx0XHRcdFx0c2V0VmlzaWJpbGl0eShyZXBsYWNlRWxlbUlkU3RyLCB0cnVlKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdGNhbGxiYWNrT2JqLnN1Y2Nlc3MgPSB0cnVlO1xuXHRcdFx0XHRcdFx0Y2FsbGJhY2tPYmoucmVmID0gb2JqO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRlbHNlIGlmICh4aVN3ZlVybFN0ciAmJiBjYW5FeHByZXNzSW5zdGFsbCgpKSB7IC8vIHNob3cgQWRvYmUgRXhwcmVzcyBJbnN0YWxsXG5cdFx0XHRcdFx0XHRhdHQuZGF0YSA9IHhpU3dmVXJsU3RyO1xuXHRcdFx0XHRcdFx0c2hvd0V4cHJlc3NJbnN0YWxsKGF0dCwgcGFyLCByZXBsYWNlRWxlbUlkU3RyLCBjYWxsYmFja0ZuKTtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0ZWxzZSB7IC8vIHNob3cgYWx0ZXJuYXRpdmUgY29udGVudFxuXHRcdFx0XHRcdFx0c2V0VmlzaWJpbGl0eShyZXBsYWNlRWxlbUlkU3RyLCB0cnVlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKGNhbGxiYWNrRm4pIHsgY2FsbGJhY2tGbihjYWxsYmFja09iaik7IH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIGlmIChjYWxsYmFja0ZuKSB7IGNhbGxiYWNrRm4oY2FsbGJhY2tPYmopO1x0fVxuXHRcdH0sXG5cdFx0c3dpdGNoT2ZmQXV0b0hpZGVTaG93OiBmdW5jdGlvbigpIHtcblx0XHRcdGF1dG9IaWRlU2hvdyA9IGZhbHNlO1xuXHRcdH0sXG5cdFx0dWE6IHVhLFxuXHRcdGdldEZsYXNoUGxheWVyVmVyc2lvbjogZnVuY3Rpb24oKSB7XG5cdFx0XHRyZXR1cm4geyBtYWpvcjp1YS5wdlswXSwgbWlub3I6dWEucHZbMV0sIHJlbGVhc2U6dWEucHZbMl0gfTtcblx0XHR9LFxuXHRcdGhhc0ZsYXNoUGxheWVyVmVyc2lvbjogaGFzUGxheWVyVmVyc2lvbixcblx0XHRjcmVhdGVTV0Y6IGZ1bmN0aW9uKGF0dE9iaiwgcGFyT2JqLCByZXBsYWNlRWxlbUlkU3RyKSB7XG5cdFx0XHRpZiAodWEudzMpIHtcblx0XHRcdFx0cmV0dXJuIGNyZWF0ZVNXRihhdHRPYmosIHBhck9iaiwgcmVwbGFjZUVsZW1JZFN0cik7XG5cdFx0XHR9XG5cdFx0XHRlbHNlIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHR9LFxuXHRcdHNob3dFeHByZXNzSW5zdGFsbDogZnVuY3Rpb24oYXR0LCBwYXIsIHJlcGxhY2VFbGVtSWRTdHIsIGNhbGxiYWNrRm4pIHtcblx0XHRcdGlmICh1YS53MyAmJiBjYW5FeHByZXNzSW5zdGFsbCgpKSB7XG5cdFx0XHRcdHNob3dFeHByZXNzSW5zdGFsbChhdHQsIHBhciwgcmVwbGFjZUVsZW1JZFN0ciwgY2FsbGJhY2tGbik7XG5cdFx0XHR9XG5cdFx0fSxcblx0XHRyZW1vdmVTV0Y6IGZ1bmN0aW9uKG9iakVsZW1JZFN0cikge1xuXHRcdFx0aWYgKHVhLnczKSB7XG5cdFx0XHRcdHJlbW92ZVNXRihvYmpFbGVtSWRTdHIpO1xuXHRcdFx0fVxuXHRcdH0sXG5cdFx0Y3JlYXRlQ1NTOiBmdW5jdGlvbihzZWxTdHIsIGRlY2xTdHIsIG1lZGlhU3RyLCBuZXdTdHlsZUJvb2xlYW4pIHtcblx0XHRcdGlmICh1YS53Mykge1xuXHRcdFx0XHRjcmVhdGVDU1Moc2VsU3RyLCBkZWNsU3RyLCBtZWRpYVN0ciwgbmV3U3R5bGVCb29sZWFuKTtcblx0XHRcdH1cblx0XHR9LFxuXHRcdGFkZERvbUxvYWRFdmVudDogYWRkRG9tTG9hZEV2ZW50LFxuXHRcdGFkZExvYWRFdmVudDogYWRkTG9hZEV2ZW50LFxuXHRcdGdldFF1ZXJ5UGFyYW1WYWx1ZTogZnVuY3Rpb24ocGFyYW0pIHtcblx0XHRcdHZhciBxID0gZG9jLmxvY2F0aW9uLnNlYXJjaCB8fCBkb2MubG9jYXRpb24uaGFzaDtcblx0XHRcdGlmIChxKSB7XG5cdFx0XHRcdGlmICgvXFw/Ly50ZXN0KHEpKSB7IHEgPSBxLnNwbGl0KFwiP1wiKVsxXTsgfSAvLyBzdHJpcCBxdWVzdGlvbiBtYXJrXG5cdFx0XHRcdGlmIChwYXJhbSA9PSBudWxsKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVybEVuY29kZUlmTmVjZXNzYXJ5KHEpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHZhciBwYWlycyA9IHEuc3BsaXQoXCImXCIpO1xuXHRcdFx0XHRmb3IgKHZhciBpID0gMDsgaSA8IHBhaXJzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRcdFx0aWYgKHBhaXJzW2ldLnN1YnN0cmluZygwLCBwYWlyc1tpXS5pbmRleE9mKFwiPVwiKSkgPT0gcGFyYW0pIHtcblx0XHRcdFx0XHRcdHJldHVybiB1cmxFbmNvZGVJZk5lY2Vzc2FyeShwYWlyc1tpXS5zdWJzdHJpbmcoKHBhaXJzW2ldLmluZGV4T2YoXCI9XCIpICsgMSkpKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBcIlwiO1xuXHRcdH0sXG5cdFx0Ly8gRm9yIGludGVybmFsIHVzYWdlIG9ubHlcblx0XHRleHByZXNzSW5zdGFsbENhbGxiYWNrOiBmdW5jdGlvbigpIHtcblx0XHRcdGlmIChpc0V4cHJlc3NJbnN0YWxsQWN0aXZlKSB7XG5cdFx0XHRcdHZhciBvYmogPSBnZXRFbGVtZW50QnlJZChFWFBSRVNTX0lOU1RBTExfSUQpO1xuXHRcdFx0XHRpZiAob2JqICYmIHN0b3JlZEFsdENvbnRlbnQpIHtcblx0XHRcdFx0XHRvYmoucGFyZW50Tm9kZS5yZXBsYWNlQ2hpbGQoc3RvcmVkQWx0Q29udGVudCwgb2JqKTtcblx0XHRcdFx0XHRpZiAoc3RvcmVkQWx0Q29udGVudElkKSB7XG5cdFx0XHRcdFx0XHRzZXRWaXNpYmlsaXR5KHN0b3JlZEFsdENvbnRlbnRJZCwgdHJ1ZSk7XG5cdFx0XHRcdFx0XHRpZiAodWEuaWUgJiYgdWEud2luKSB7IHN0b3JlZEFsdENvbnRlbnQuc3R5bGUuZGlzcGxheSA9IFwiYmxvY2tcIjsgfVxuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoc3RvcmVkQ2FsbGJhY2tGbikgeyBzdG9yZWRDYWxsYmFja0ZuKHN0b3JlZENhbGxiYWNrT2JqKTsgfVxuXHRcdFx0XHR9XG5cdFx0XHRcdGlzRXhwcmVzc0luc3RhbGxBY3RpdmUgPSBmYWxzZTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG59KCk7XG5tb2R1bGUuZXhwb3J0cyA9IHN3Zm9iamVjdDtcbiIsIi8qKlxuICog0KHQvtC30LTQsNGR0YIg0Y3QutC30LXQvNC/0LvRj9GAINC60LvQsNGB0YHQsCwg0L3QviDQvdC1INC30LDQv9GD0YHQutCw0LXRgiDQtdCz0L4g0LrQvtC90YHRgtGA0YPQutGC0L7RgFxuICogQHBhcmFtIHtmdW5jdGlvbn0gT3JpZ2luYWxDbGFzcyAtINC60LvQsNGB0YFcbiAqIEByZXR1cm5zIHtPcmlnaW5hbENsYXNzfVxuICogQHByaXZhdGVcbiAqL1xudmFyIGNsZWFySW5zdGFuY2UgPSBmdW5jdGlvbihPcmlnaW5hbENsYXNzKSB7XG4gICAgdmFyIENsZWFyQ2xhc3MgPSBmdW5jdGlvbigpIHt9O1xuICAgIENsZWFyQ2xhc3MucHJvdG90eXBlID0gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGU7XG4gICAgcmV0dXJuIG5ldyBDbGVhckNsYXNzKCk7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IGNsZWFySW5zdGFuY2U7XG4iLCJ2YXIgY2xlYXJJbnN0YW5jZSA9IHJlcXVpcmUoJy4vY2xlYXItaW5zdGFuY2UnKTtcblxuLyoqXG4gKiBDbGFzc2ljIEVycm9yIGFjdHMgbGlrZSBhIGZhYnJpYzogRXJyb3IuY2FsbCh0aGlzLCBtZXNzYWdlKSBqdXN0IGNyZWF0ZSBuZXcgb2JqZWN0LlxuICogRXJyb3JDbGFzcyBhY3RzIG1vcmUgbGlrZSBhIGNsYXNzOiBFcnJvckNsYXNzLmNhbGwodGhpcywgbWVzc2FnZSkgbW9kaWZ5ICd0aGlzJyBvYmplY3QuXG4gKiBAcGFyYW0ge1N0cmluZ30gW21lc3NhZ2VdIC0gZXJyb3IgbWVzc2FnZVxuICogQHBhcmFtIHtOdW1iZXJ9IFtpZF0gLSBlcnJvciBpZFxuICogQGV4dGVuZHMgRXJyb3JcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIEVycm9yQ2xhc3MgPSBmdW5jdGlvbihtZXNzYWdlLCBpZCkge1xuICAgIHZhciBlcnIgPSBuZXcgRXJyb3IobWVzc2FnZSwgaWQpO1xuICAgIGVyci5uYW1lID0gdGhpcy5uYW1lO1xuXG4gICAgdGhpcy5tZXNzYWdlID0gZXJyLm1lc3NhZ2U7XG4gICAgdGhpcy5zdGFjayA9IGVyci5zdGFjaztcbn07XG5cbi8qKlxuICogU3VnYXIuIEp1c3QgY3JlYXRlIGluaGVyaXRhbmNlIGZyb20gRXJyb3JDbGFzcyBhbmQgZGVmaW5lIG5hbWUgcHJvcGVydHlcbiAqIEBwYXJhbSB7U3RyaW5nfSBuYW1lIC0gbmFtZSBvZiBlcnJvciB0eXBlXG4gKiBAcmV0dXJucyB7RXJyb3JDbGFzc31cbiAqL1xuRXJyb3JDbGFzcy5jcmVhdGUgPSBmdW5jdGlvbihuYW1lKSB7XG4gICAgdmFyIGVyckNsYXNzID0gY2xlYXJJbnN0YW5jZShFcnJvckNsYXNzKTtcbiAgICBlcnJDbGFzcy5uYW1lID0gbmFtZTtcbiAgICByZXR1cm4gZXJyQ2xhc3M7XG59O1xuXG5FcnJvckNsYXNzLnByb3RvdHlwZSA9IGNsZWFySW5zdGFuY2UoRXJyb3IpO1xuRXJyb3JDbGFzcy5wcm90b3R5cGUubmFtZSA9IFwiRXJyb3JDbGFzc1wiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IEVycm9yQ2xhc3M7XG4iLCJ2YXIgRXZlbnRzID0gcmVxdWlyZSgnLi4vYXN5bmMvZXZlbnRzJyk7XG5cbi8vVEhJTks6INC40LfRg9GH0LjRgtGMINC60LDQuiDRgNCw0LHQvtGC0LDQtdGCIEVTIDIwMTUgUHJveHkg0Lgg0L/QvtC/0YDQvtCx0L7QstCw0YLRjCDQuNGB0L/QvtC70YzQt9C+0LLQsNGC0YxcblxuLyoqXG4gKiBAY2xhc3NkZXNjINCf0YDQvtC60YHQuC3QutC70LDRgdGBLiDQktGL0LTQsNGR0YIg0L3QsNGA0YPQttGDINC70LjRiNGMINC/0YPQsdC70LjRh9C90YvQtSDQvNC10YLQvtC00Ysg0L7QsdGK0LXQutGC0LAg0Lgg0YHRgtCw0YLQuNGH0LXRgdC60LjQtSDRgdCy0L7QudGB0YLQstCwLlxuICog0J3QtSDQutC+0L/QuNGA0YPQtdGCINC80LXRgtC+0LTRiyDQuNC3IE9iamVjdC5wcm90b3R5cGUuINCS0YHQtSDQvNC10YLQvtC00Ysg0LjQvNC10Y7RgiDQv9GA0LjQstGP0LfQutGDINC60L7QvdGC0LXQutGB0YLQsCDQuiDQv9GA0L7QutGB0LjRgNGD0LXQvNC+0LzRgyDQvtCx0YrQtdC60YLRgy5cbiAqXG4gKiBAcGFyYW0ge09iamVjdH0gW29iamVjdF0gLSDQvtCx0YrQtdC60YIsINC60L7RgtC+0YDRi9C5INGC0YDQtdCx0YPQtdGC0YHRjyDQv9GA0L7QutGB0LjRgNC+0LLQsNGC0YxcbiAqIEBjb25zdHJ1Y3RvclxuICogQHByaXZhdGVcbiAqL1xudmFyIFByb3h5ID0gZnVuY3Rpb24ob2JqZWN0KSB7XG4gICAgaWYgKG9iamVjdCkge1xuICAgICAgICBmb3IgKHZhciBrZXkgaW4gb2JqZWN0KSB7XG4gICAgICAgICAgICBpZiAoa2V5WzBdID09PSBcIl9cIlxuICAgICAgICAgICAgICAgIHx8IHR5cGVvZiBvYmplY3Rba2V5XSAhPT0gXCJmdW5jdGlvblwiXG4gICAgICAgICAgICAgICAgfHwgb2JqZWN0W2tleV0gPT09IE9iamVjdC5wcm90b3R5cGVba2V5XVxuICAgICAgICAgICAgICAgIHx8IG9iamVjdC5oYXNPd25Qcm9wZXJ0eShrZXkpXG4gICAgICAgICAgICAgICAgfHwgRXZlbnRzLnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgY29udGludWU7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXNba2V5XSA9IG9iamVjdFtrZXldLmJpbmQob2JqZWN0KTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChvYmplY3QucGlwZUV2ZW50cykge1xuICAgICAgICAgICAgRXZlbnRzLmNhbGwodGhpcyk7XG5cbiAgICAgICAgICAgIHRoaXMub24gPSBFdmVudHMucHJvdG90eXBlLm9uO1xuICAgICAgICAgICAgdGhpcy5vbmNlID0gRXZlbnRzLnByb3RvdHlwZS5vbmNlO1xuICAgICAgICAgICAgdGhpcy5vZmYgPSBFdmVudHMucHJvdG90eXBlLm9mZjtcbiAgICAgICAgICAgIHRoaXMuY2xlYXJMaXN0ZW5lcnMgPSBFdmVudHMucHJvdG90eXBlLmNsZWFyTGlzdGVuZXJzO1xuXG4gICAgICAgICAgICBvYmplY3QucGlwZUV2ZW50cyh0aGlzKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8qKlxuICog0K3QutGB0L/QvtGA0YLQuNGA0YPQtdGCINGB0YLQsNGC0LjRh9C10YHQutC40LUg0YHQstC+0LnRgdGC0LLQsCDQuNC3INC+0LTQvdC+0LPQviDQvtCx0YrQtdC60YLQsCDQsiDQtNGA0YPQs9C+0LksINC40YHQutC70Y7Rh9Cw0Y8g0YPQutCw0LfQsNC90L3Ri9C1LCDQv9GA0LjQstCw0YLQvdGL0LUg0Lgg0L/RgNC+0YLQvtGC0LjQv1xuICogQHBhcmFtIHtPYmplY3R9IGZyb20gLSDQvtGC0LrRg9C00LAg0LrQvtC/0LjRgNC+0LLQsNGC0YxcbiAqIEBwYXJhbSB7T2JqZWN0fSB0byAtINC60YPQtNCwINC60L7Qv9C40YDQvtCy0LDRgtGMXG4gKiBAcGFyYW0ge0FycmF5LjxTdHJpbmc+fSBbZXhjbHVkZV0gLSDRgdCy0L7QudGB0YLQstCwINC60L7RgtC+0YDRi9C1INGC0YDQtdCx0YPQtdGC0YHRjyDQuNGB0LrQu9GO0YfQuNGC0YxcbiAqL1xuUHJveHkuZXhwb3J0U3RhdGljID0gZnVuY3Rpb24oZnJvbSwgdG8sIGV4Y2x1ZGUpIHtcbiAgICBleGNsdWRlID0gZXhjbHVkZSB8fCBbXTtcblxuICAgIE9iamVjdC5rZXlzKGZyb20pLmZvckVhY2goZnVuY3Rpb24oa2V5KSB7XG4gICAgICAgIGlmICghZnJvbS5oYXNPd25Qcm9wZXJ0eShrZXkpXG4gICAgICAgICAgICB8fCBrZXlbMF0gPT09IFwiX1wiXG4gICAgICAgICAgICB8fCBrZXkgPT09IFwicHJvdG90eXBlXCJcbiAgICAgICAgICAgIHx8IGV4Y2x1ZGUuaW5kZXhPZihrZXkpICE9PSAtMSkge1xuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgdG9ba2V5XSA9IGZyb21ba2V5XTtcbiAgICB9KTtcbn07XG5cbi8qKlxuICog0KHQvtC30LTQsNC90LjQtSDQv9GA0L7QutGB0Lgt0L/Qu9Cw0YHRgdCwINC/0YDQuNCy0Y/Qt9Cw0L3QvdC+0LPQviDQuiDRg9C60LDQt9Cw0L3QvdC+0LzRgyDQutC70LDRgdGB0YMuINCc0L7QttC90L4g0L3QsNC30L3QsNGH0LjRgtGMINGA0L7QtNC40YLQtdC70YzRgdC60LjQuSDQutC70LDRgdGBLlxuICog0KMg0YDQvtC00LjRgtC10LvRjNGB0LrQvtCz0L4g0LrQu9Cw0YHRgdCwINC/0L7Rj9Cy0LvRj9C10YLRgdGPINC/0YDQuNCy0LDRgtC90YvQuSDQvNC10YLQvtC0IF9wcm94eSwg0LrQvtGC0L7RgNGL0Lkg0LLRi9C00LDRkdGCINC/0YDQvtC60YHQuC3QvtCx0YrQtdC60YIg0LTQu9GPXG4gKiDQtNCw0L3QvdC+0LPQviDRjdC60LfQtdC80LvRj9GA0LAuINCi0LDQutC20LUg0L/QvtGP0LLQu9GP0LXRgtGB0Y8g0YHQstC+0LnRgdGC0LLQviBfX3Byb3h5LCDRgdC+0LTQtdGA0LbQsNGJ0LXQtSDRgdGB0YvQu9C60YMg0L3QsCDRgdC+0LfQtNCw0L3QvdGL0Lkg0L/RgNC+0LrRgdC4LdC+0LHRitC10LrRglxuICpcbiAqIEBwYXJhbSB7ZnVuY3Rpb259IE9yaWdpbmFsQ2xhc3MgLSDQvtGA0LjQs9C40L3QsNC70YzQvdGL0Lkg0LrQu9Cw0YHRgVxuICogQHBhcmFtIHtmdW5jdGlvbn0gW1BhcmVudFByb3h5Q2xhc3M9UHJveHldIC0g0YDQvtC00LjRgtC10LvRjNGB0LrQuNC5INC60LvQsNGB0YFcbiAqIEByZXR1cm5zIHtmdW5jdGlvbn0gLS0g0LrQvtC90YHRgtGA0YPRgtC+0YAg0L/RgNC+0LrRgdC40YDQvtCy0LDQvdC90L7Qs9C+INC60LvQsNGB0YHQsFxuICovXG5Qcm94eS5jcmVhdGVDbGFzcyA9IGZ1bmN0aW9uKE9yaWdpbmFsQ2xhc3MsIFBhcmVudFByb3h5Q2xhc3MsIGV4Y2x1ZGVTdGF0aWMpIHtcblxuICAgIHZhciBQcm94eUNsYXNzID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBPcmlnaW5hbENsYXNzQ29uc3RydWN0b3IgPSBmdW5jdGlvbigpIHt9O1xuICAgICAgICBPcmlnaW5hbENsYXNzQ29uc3RydWN0b3IucHJvdG90eXBlID0gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGU7XG5cbiAgICAgICAgdmFyIG9yaWdpbmFsID0gbmV3IE9yaWdpbmFsQ2xhc3NDb25zdHJ1Y3RvcigpO1xuICAgICAgICBPcmlnaW5hbENsYXNzLmFwcGx5KG9yaWdpbmFsLCBhcmd1bWVudHMpO1xuXG4gICAgICAgIHJldHVybiBvcmlnaW5hbC5fcHJveHkoKTtcbiAgICB9O1xuXG4gICAgdmFyIFBhcmVudFByb3h5Q2xhc3NDb25zdHJ1Y3RvciA9IGZ1bmN0aW9uKCkge307XG4gICAgUGFyZW50UHJveHlDbGFzc0NvbnN0cnVjdG9yLnByb3RvdHlwZSA9IChQYXJlbnRQcm94eUNsYXNzIHx8IFByb3h5KS5wcm90b3R5cGU7XG4gICAgUHJveHlDbGFzcy5wcm90b3R5cGUgPSBuZXcgUGFyZW50UHJveHlDbGFzc0NvbnN0cnVjdG9yKCk7XG5cbiAgICB2YXIgdmFsO1xuICAgIGZvciAodmFyIGsgaW4gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGUpIHtcbiAgICAgICAgdmFsID0gT3JpZ2luYWxDbGFzcy5wcm90b3R5cGVba107XG4gICAgICAgIGlmIChPYmplY3QucHJvdG90eXBlW2tdID09IHZhbCB8fCB0eXBlb2YgdmFsID09PSBcImZ1bmN0aW9uXCIgfHwga1swXSA9PT0gXCJfXCIpIHtcbiAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICB9XG4gICAgICAgIFByb3h5Q2xhc3MucHJvdG90eXBlW2tdID0gdmFsO1xuICAgIH1cblxuICAgIHZhciBjcmVhdGVQcm94eSA9IGZ1bmN0aW9uKG9yaWdpbmFsKSB7XG4gICAgICAgIHZhciBwcm90byA9IFByb3h5LnByb3RvdHlwZTtcbiAgICAgICAgUHJveHkucHJvdG90eXBlID0gUHJveHlDbGFzcy5wcm90b3R5cGU7XG4gICAgICAgIHZhciBwcm94eSA9IG5ldyBQcm94eShvcmlnaW5hbCk7XG4gICAgICAgIFByb3h5LnByb3RvdHlwZSA9IHByb3RvO1xuICAgICAgICByZXR1cm4gcHJveHk7XG4gICAgfTtcblxuICAgIE9yaWdpbmFsQ2xhc3MucHJvdG90eXBlLl9wcm94eSA9IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZiAoIXRoaXMuX19wcm94eSkge1xuICAgICAgICAgICAgdGhpcy5fX3Byb3h5ID0gY3JlYXRlUHJveHkodGhpcyk7XG4gICAgICAgIH1cblxuICAgICAgICByZXR1cm4gdGhpcy5fX3Byb3h5O1xuICAgIH07XG5cbiAgICBpZiAoIWV4Y2x1ZGVTdGF0aWMpIHtcbiAgICAgICAgUHJveHkuZXhwb3J0U3RhdGljKE9yaWdpbmFsQ2xhc3MsIFByb3h5Q2xhc3MpO1xuICAgIH1cblxuICAgIHJldHVybiBQcm94eUNsYXNzO1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBQcm94eTtcbiIsIi8qKlxuICog0KHQutC+0L/QuNGA0L7QstCw0YLRjCDRgdCy0L7QudGB0YLQstCwINCy0YHQtdGFINC/0LXRgNC10YfQuNGB0LvQtdC90L3Ri9GFINC+0LHRitC10LrRgtC+0LIg0LIg0L7QtNC40L0uXG4gKiBAcGFyYW0ge09iamVjdH0gaW5pdGlhbCAtINC10YHQu9C4INC/0L7RgdC70LXQtNC90LjQuSDQsNGA0LPRg9C80LXQvdGCIHRydWUsINGC0L4g0L3QvtCy0YvQuSDQvtCx0YrQtdC60YIg0L3QtSDRgdC+0LfQtNCw0ZHRgtGB0Y8sINCwINC40YHQv9C+0LvRjNC30YPQtdGC0YHRjyDQtNCw0L3QvdGL0LlcbiAqIEBwYXJhbSB7Li4uT2JqZWN0fEJvb2xlYW59IGFyZ3MgLSDRgdC/0LjRgdC+0Log0L7QsdGK0LXQutGC0L7QsiDQuNC3INC60L7RgtC+0YDRi9GFINC60L7Qv9C40YDQvtCy0LDRgtGMINGB0LLQvtC50YHRgtCy0LAuINCf0L7RgdC70LXQtNC90LjQuSDQsNGA0LPRg9C80LXQvdGCINC80L7QttC10YIg0LHRi9GC0Ywg0LvQuNCx0L5cbiAqINC+0LHRitC10LrRgtC+0LwsINC70LjQsdC+IHRydWUuXG4gKiBAcmV0dXJucyB7T2JqZWN0fVxuICogQHByaXZhdGVcbiAqL1xudmFyIG1lcmdlID0gZnVuY3Rpb24oaW5pdGlhbCkge1xuICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMsIDEpO1xuICAgIHZhciBvYmplY3Q7XG4gICAgdmFyIGtleTtcblxuICAgIGlmIChhcmdzW2FyZ3MubGVuZ3RoIC0gMV0gPT09IHRydWUpIHtcbiAgICAgICAgb2JqZWN0ID0gaW5pdGlhbDtcbiAgICAgICAgYXJncy5wb3AoKTtcbiAgICB9IGVsc2Uge1xuICAgICAgICBvYmplY3QgPSB7fTtcbiAgICAgICAgZm9yIChrZXkgaW4gaW5pdGlhbCkge1xuICAgICAgICAgICAgaWYgKGluaXRpYWwuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgICAgICAgIG9iamVjdFtrZXldID0gaW5pdGlhbFtrZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgZm9yICh2YXIgayA9IDAsIGwgPSBhcmdzLmxlbmd0aDsgayA8IGw7IGsrKykge1xuICAgICAgICBmb3IgKGtleSBpbiBhcmdzW2tdKSB7XG4gICAgICAgICAgICBpZiAoYXJnc1trXS5oYXNPd25Qcm9wZXJ0eShrZXkpKSB7XG4gICAgICAgICAgICAgICAgb2JqZWN0W2tleV0gPSBhcmdzW2tdW2tleV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICByZXR1cm4gb2JqZWN0O1xufTtcblxubW9kdWxlLmV4cG9ydHMgPSBtZXJnZTtcbiIsInJlcXVpcmUoJy4uLy4uLy4uL2V4cG9ydCcpO1xuXG52YXIgTG9hZGVyRXJyb3IgPSByZXF1aXJlKCcuL2xvYWRlci1lcnJvcicpO1xuXG55YS5tdXNpYy5BdWRpby5Mb2FkZXJFcnJvciA9IExvYWRlckVycm9yO1xuIiwidmFyIEVycm9yQ2xhc3MgPSByZXF1aXJlKCcuLi8uLi9jbGFzcy9lcnJvci1jbGFzcycpO1xuXG4vKipcbiAqIEBjbGFzcyBMb2FkZXJFcnJvclxuICogQGFsaWFzIHlhLm11c2ljLkF1ZGlvfkxvYWRlckVycm9yXG4gKiBAY2xhc3NkZWNzINCa0LvQsNGB0YEg0L7RiNC40LHQvtC6INC30LDQs9GA0YPQt9GH0LjQutCwLlxuICog0KDQsNGB0YjQuNGA0Y/QtdGCIEVycm9yLlxuICogQHBhcmFtIHtTdHJpbmd9IG1lc3NhZ2Ug0KLQtdC60YHRgiDQvtGI0LjQsdC60LguXG4gKlxuICogQGNvbnN0cnVjdG9yXG4gKi9cbnZhciBMb2FkZXJFcnJvciA9IGZ1bmN0aW9uKG1lc3NhZ2UpIHtcbiAgICBFcnJvckNsYXNzLmNhbGwodGhpcywgbWVzc2FnZSk7XG59O1xuTG9hZGVyRXJyb3IucHJvdG90eXBlID0gRXJyb3JDbGFzcy5jcmVhdGUoXCJMb2FkZXJFcnJvclwiKTtcblxuLyoqXG4gKiDQotCw0LnQvNCw0YPRgiDQt9Cw0LPRgNGD0LfQutC4LlxuICogQHR5cGUge1N0cmluZ31cbiAqIEBjb25zdFxuICovXG5Mb2FkZXJFcnJvci5USU1FT1VUID0gXCJyZXF1ZXN0IHRpbWVvdXRcIjtcbi8qKlxuICog0J7RiNC40LHQutCwINC30LDQv9GA0L7RgdCwINC90LAg0LfQsNCz0YDRg9C30LrRgy5cbiAqIEB0eXBlIHtTdHJpbmd9XG4gKiBAY29uc3RcbiAqL1xuTG9hZGVyRXJyb3IuRkFJTEVEID0gXCJyZXF1ZXN0IGZhaWxlZFwiO1xuXG5tb2R1bGUuZXhwb3J0cyA9IExvYWRlckVycm9yO1xuIiwiLyoqXG4gKiDQl9Cw0LPQu9GD0YjQutCwINCyINCy0LjQtNC1INC/0YPRgdGC0L7QuSDRhNGD0L3QutGG0LjQuCDQvdCwINCy0YHQtSDRgdC70YPRh9Cw0Lgg0LbQuNC30L3QuFxuICogQHByaXZhdGVcbiAqL1xudmFyIG5vb3AgPSBmdW5jdGlvbigpIHt9O1xuXG5tb2R1bGUuZXhwb3J0cyA9IG5vb3A7XG4iLCJyZXF1aXJlKFwiLi4vZXhwb3J0XCIpO1xuXG52YXIgTG9nZ2VyID0gcmVxdWlyZSgnLi9sb2dnZXInKTtcblxueWEubXVzaWMuQXVkaW8uTG9nZ2VyID0gTG9nZ2VyO1xuIiwidmFyIExFVkVMUyA9IFtcImRlYnVnXCIsIFwibG9nXCIsIFwiaW5mb1wiLCBcIndhcm5cIiwgXCJlcnJvclwiLCBcInRyYWNlXCJdO1xudmFyIG5vb3AgPSByZXF1aXJlKCcuLi9saWIvbm9vcCcpO1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0JrQvtC90YHRgtGA0YPQutGC0L7RgFxuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vKipcbiAqIEBjbGFzcyBMb2dnZXJcbiAqIEBhbGlhcyB5YS5tdXNpYy5BdWRpby5Mb2dnZXJcbiAqIEBjbGFzc2RlY3Mg0J3QsNGB0YLRgNCw0LjQstCw0LXQvNGL0Lkg0LvQvtCz0LPQtdGAINC00LvRjyDQsNGD0LTQuNC+0L/Qu9C10LXRgNCwLlxuICogQHBhcmFtIHtTdHJpbmd9IGNoYW5uZWwg0JjQvNGPINC60LDQvdCw0LvQsCwg0LfQsCDQutC+0YLQvtGA0YvQuSDQsdGD0LTQtdGCINC+0YLQstC10YfQsNGC0Ywg0Y3QutC30LXQvNC70Y/RgCDQu9C+0LPQs9C10YDQsC5cbiAqIEBjb25zdHJ1Y3RvclxuICovXG52YXIgTG9nZ2VyID0gZnVuY3Rpb24oY2hhbm5lbCkge1xuICAgIHRoaXMuY2hhbm5lbCA9IGNoYW5uZWw7XG59O1xuXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG4vLyAg0J3QsNGB0YLRgNC+0LnQutC4XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQv9C40YHQvtC6INC40LPQvdC+0YDQuNGA0YPQtdC80YvRhSDQutCw0L3QsNC70L7Qsi5cbiAqIEB0eXBlIHtBcnJheS48U3RyaW5nPn1cbiAqL1xuTG9nZ2VyLmlnbm9yZXMgPSBbXTtcblxuLyoqXG4gKiDQodC/0LjRgdC+0Log0L7RgtC+0LHRgNCw0LbQsNC10LzRi9GFINCyINC60L7QvdGB0L7Qu9C4INGD0YDQvtCy0L3QtdC5INC70L7Qs9CwLlxuICogQHR5cGUge0FycmF5LjxTdHJpbmc+fVxuICovXG5Mb2dnZXIubG9nTGV2ZWxzID0gW107XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8vICDQodC40L3RgtCw0LrRgdC40YfQtdGB0LrQuNC5INGB0LDRhdCw0YBcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLyoqXG4gKiDQl9Cw0L/QuNGB0Ywg0LIg0LvQvtCzINGBINGD0YDQvtCy0L3QtdC8ICoqZGVidWcqKi5cbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0INCa0L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwLlxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10g0JTQvtC/0L7Qu9C90LjRgtC10LvRjNC90YvQtSDQsNGA0LPRg9C80LXQvdGC0YsuXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUuZGVidWcgPSBub29wO1xuXG4vKipcbiAqINCX0LDQv9C40YHRjCDQsiDQu9C+0LMg0YEg0YPRgNC+0LLQvdC10LwgKipsb2cqKi5cbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0INCa0L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwLlxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10g0JTQvtC/0L7Qu9C90LjRgtC10LvRjNC90YvQtSDQsNGA0LPRg9C80LXQvdGC0YsuXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUubG9nID0gbm9vcDtcblxuLyoqXG4gKiDQl9Cw0L/QuNGB0Ywg0LIg0LvQvtCzINGBINGD0YDQvtCy0L3QtdC8ICoqaW5mbyoqLlxuICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQg0JrQvtC90YLQtdC60YHRgiDQstGL0LfQvtCy0LAuXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSDQlNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INCw0YDQs9GD0LzQtdC90YLRiy5cbiAqL1xuTG9nZ2VyLnByb3RvdHlwZS5pbmZvID0gbm9vcDtcblxuLyoqXG4gKiDQl9Cw0L/QuNGB0Ywg0LIg0LvQvtCzINGBINGD0YDQvtCy0L3QtdC8ICoqd2FybioqLlxuICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQg0JrQvtC90YLQtdC60YHRgiDQstGL0LfQvtCy0LAuXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSDQlNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INCw0YDQs9GD0LzQtdC90YLRiy5cbiAqL1xuTG9nZ2VyLnByb3RvdHlwZS53YXJuID0gbm9vcDtcblxuLyoqXG4gKiDQl9Cw0L/QuNGB0Ywg0LIg0LvQvtCzINGBINGD0YDQvtCy0L3QtdC8ICoqZXJyb3IqKi5cbiAqIEBwYXJhbSB7T2JqZWN0fSBjb250ZXh0INCa0L7QvdGC0LXQutGB0YIg0LLRi9C30L7QstCwLlxuICogQHBhcmFtIHsuLi4qfSBbYXJnc10g0JTQvtC/0L7Qu9C90LjRgtC10LvRjNC90YvQtSDQsNGA0LPRg9C80LXQvdGC0YsuXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUuZXJyb3IgPSBub29wO1xuXG4vKipcbiAqINCX0LDQv9C40YHRjCDQsiDQu9C+0LMg0YEg0YPRgNC+0LLQvdC10LwgKip0cmFjZSoqLlxuICogQHBhcmFtIHtPYmplY3R9IGNvbnRleHQg0JrQvtC90YLQtdC60YHRgiDQstGL0LfQvtCy0LAuXG4gKiBAcGFyYW0gey4uLip9IFthcmdzXSDQlNC+0L/QvtC70L3QuNGC0LXQu9GM0L3Ri9C1INCw0YDQs9GD0LzQtdC90YLRiy5cbiAqL1xuTG9nZ2VyLnByb3RvdHlwZS50cmFjZSA9IG5vb3A7XG5cbi8qKlxuICog0JzQtdGC0L7QtCDQtNC70Y8g0L7QsdGA0LDQsdC+0YLQutC4INGB0YHRi9C70L7Quiwg0L/QtdGA0LXQtNCw0LLQsNC10LzRi9GFINCyINC70L7Qsy5cbiAqIEBwYXJhbSB1cmxcbiAqIEBwcml2YXRlXG4gKi9cbkxvZ2dlci5wcm90b3R5cGUuX3Nob3dVcmwgPSBmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gTG9nZ2VyLnNob3dVcmwodXJsKTtcbn07XG5cbi8qKlxuICog0JzQtdGC0L7QtCDQtNC70Y8g0L7QsdGA0LDQsdC+0YLQutC4INGB0YHRi9C70L7Quiwg0L/QtdGA0LXQtNCw0LLQsNC10LzRi9GFINCyINC70L7Qsy4g0JzQvtC20L3QviDQv9C10YDQtdC+0L/RgNC10LTQtdC70Y/RgtGMLiDQn9C+INGD0LzQvtC70YfQsNC90LjRjiDQvdC1INCy0YvQv9C+0LvQvdGP0LXRgiDQvdC40LrQsNC60LjRhSDQtNC10LnRgdGC0LLQuNC5LlxuICogQG5hbWUgeWEubXVzaWMuQXVkaW8uTG9nZ2VyI3Nob3dVcmxcbiAqIEBwYXJhbSB7U3RyaW5nfSB1cmwg0KHRgdGL0LvQutCwLlxuICogQHJldHVybnMge1N0cmluZ30g0YHRgdGL0LvQutGDLlxuICovXG5Mb2dnZXIuc2hvd1VybCA9IGZ1bmN0aW9uKHVybCkge1xuICAgIHJldHVybiB1cmw7XG59O1xuXG5MRVZFTFMuZm9yRWFjaChmdW5jdGlvbihsZXZlbCkge1xuICAgIExvZ2dlci5wcm90b3R5cGVbbGV2ZWxdID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHZhciBhcmdzID0gW10uc2xpY2UuY2FsbChhcmd1bWVudHMpO1xuICAgICAgICBhcmdzLnVuc2hpZnQodGhpcy5jaGFubmVsKTtcbiAgICAgICAgYXJncy51bnNoaWZ0KGxldmVsKTtcbiAgICAgICAgTG9nZ2VyLmxvZy5hcHBseShMb2dnZXIsIGFyZ3MpO1xuICAgIH07XG59KTtcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuLy8gINCX0LDQv9C40YHRjCDQtNCw0L3QvdGL0YUg0LIg0LvQvtCzXG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKlxuICog0KHQtNC10LvQsNGC0Ywg0LfQsNC/0LjRgdGMINCyINC70L7Qsy5cbiAqIEBwYXJhbSB7U3RyaW5nfSBsZXZlbCDQo9GA0L7QstC10L3RjCDQu9C+0LPQsC5cbiAqIEBwYXJhbSB7U3RyaW5nfSBjaGFubmVsINCa0LDQvdCw0LsuXG4gKiBAcGFyYW0ge09iamVjdH0gY29udGV4dCDQmtC+0L3RgtC10LrRgdGCINCy0YvQt9C+0LLQsC5cbiAqIEBwYXJhbSB7Li4uKn0gW2FyZ3NdINCU0L7Qv9C+0LvQvdC40YLQtdC70YzQvdGL0LUg0LDRgNCz0YPQvNC10L3RgtGLLlxuICovXG5Mb2dnZXIubG9nID0gZnVuY3Rpb24obGV2ZWwsIGNoYW5uZWwsIGNvbnRleHQpIHtcbiAgICB2YXIgZGF0YSA9IFtdLnNsaWNlLmNhbGwoYXJndW1lbnRzLCAzKS5tYXAoZnVuY3Rpb24oZHVtcEl0ZW0pIHtcbiAgICAgICAgcmV0dXJuIGR1bXBJdGVtICYmIGR1bXBJdGVtLl9sb2dnZXIgJiYgZHVtcEl0ZW0uX2xvZ2dlcigpIHx8IGR1bXBJdGVtO1xuICAgIH0pO1xuXG4gICAgdmFyIGxvZ0VudHJ5ID0ge1xuICAgICAgICB0aW1lc3RhbXA6ICtuZXcgRGF0ZSgpLFxuICAgICAgICBsZXZlbDogbGV2ZWwsXG4gICAgICAgIGNoYW5uZWw6IGNoYW5uZWwsXG4gICAgICAgIGNvbnRleHQ6IGNvbnRleHQsXG4gICAgICAgIG1lc3NhZ2U6IGRhdGFcbiAgICB9O1xuXG4gICAgaWYgKExvZ2dlci5pZ25vcmVzW2NoYW5uZWxdIHx8IExvZ2dlci5sb2dMZXZlbHMuaW5kZXhPZihsZXZlbCkgPT09IC0xKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBMb2dnZXIuX2R1bXBFbnRyeShsb2dFbnRyeSk7XG59O1xuXG4vKipcbiAqINCX0LDQv9C40YHRjCDQsiDQu9C+0LPQtS5cbiAqIEB0eXBlZGVmIHtPYmplY3R9IEF1ZGlvLkxvZ2dlci5Mb2dFbnRyeVxuICogQHByb3BlcnR5IHtOdW1iZXJ9IHRpbWVzdGFtcCDQktGA0LXQvNGPINCyIHRpbWVzdGFtcCDRhNC+0YDQvNCw0YLQtS5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBsZXZlbCDQo9GA0L7QstC10L3RjCDQu9C+0LPQsC5cbiAqIEBwcm9wZXJ0eSB7U3RyaW5nfSBjaGFubmVsINCa0LDQvdCw0LsuXG4gKiBAcHJvcGVydHkge09iamVjdH0gY29udGV4dCDQmtC+0L3RgtC10LrRgdGCINCy0YvQt9C+0LLQsC5cbiAqIEBwcm9wZXJ0eSB7QXJyYXl9IG1lc3NhZ2Ug0JTQvtC/0L7Qu9C90LjRgtC10LvRjNC90YvQtSDQsNGA0LPRg9C80LXQvdGC0YsuXG4gKlxuICogQHByaXZhdGVcbiAqL1xuXG4vKipcbiAqINCX0LDQv9C40YHQsNGC0Ywg0YHQvtC+0LHRidC10L3QuNC1INC70L7Qs9CwINCyINC60L7QvdGB0L7Qu9GMLlxuICogQHBhcmFtIHt5YS5tdXNpYy5BdWRpby5Mb2dnZXJ+TG9nRW50cnl9IGxvZ0VudHJ5INCh0L7QvtCx0YnQtdC90LjQtSDQu9C+0LPQsC5cbiAqIEBwcml2YXRlXG4gKi9cbkxvZ2dlci5fZHVtcEVudHJ5ID0gZnVuY3Rpb24obG9nRW50cnkpIHtcbiAgICB0cnkge1xuICAgICAgICB2YXIgbGV2ZWwgPSBsb2dFbnRyeS5sZXZlbDtcblxuICAgICAgICB2YXIgbmFtZSA9IGxvZ0VudHJ5LmNvbnRleHQgJiYgKGxvZ0VudHJ5LmNvbnRleHQudGFza05hbWUgfHwgbG9nRW50cnkuY29udGV4dC5uYW1lKTtcbiAgICAgICAgdmFyIGNvbnRleHQgPSBsb2dFbnRyeS5jb250ZXh0ICYmIChsb2dFbnRyeS5jb250ZXh0Ll9sb2dnZXIgPyBsb2dFbnRyeS5jb250ZXh0Ll9sb2dnZXIoKSA6IFwiXCIpO1xuXG4gICAgICAgIGlmICh0eXBlb2YgY29uc29sZVtsZXZlbF0gIT09IFwiZnVuY3Rpb25cIikge1xuICAgICAgICAgICAgY29uc29sZS5sb2cuYXBwbHkoY29uc29sZSwgW1xuICAgICAgICAgICAgICAgIGxldmVsLnRvVXBwZXJDYXNlKCksXG4gICAgICAgICAgICAgICAgTG9nZ2VyLl9mb3JtYXRUaW1lc3RhbXAobG9nRW50cnkudGltZXN0YW1wKSxcbiAgICAgICAgICAgICAgICBcIltcIiArIGxvZ0VudHJ5LmNoYW5uZWwgKyAobmFtZSA/IFwiOlwiICsgbmFtZSA6IFwiXCIpICsgXCJdXCIsXG4gICAgICAgICAgICAgICAgY29udGV4dFxuICAgICAgICAgICAgXS5jb25jYXQobG9nRW50cnkubWVzc2FnZSkpO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc29sZVtsZXZlbF0uYXBwbHkoY29uc29sZSwgW1xuICAgICAgICAgICAgICAgIExvZ2dlci5fZm9ybWF0VGltZXN0YW1wKGxvZ0VudHJ5LnRpbWVzdGFtcCksXG4gICAgICAgICAgICAgICAgXCJbXCIgKyBsb2dFbnRyeS5jaGFubmVsICsgKG5hbWUgPyBcIjpcIiArIG5hbWUgOiBcIlwiKSArIFwiXVwiLFxuICAgICAgICAgICAgICAgIGNvbnRleHRcbiAgICAgICAgICAgIF0uY29uY2F0KGxvZ0VudHJ5Lm1lc3NhZ2UpKTtcbiAgICAgICAgfVxuICAgIH0gY2F0Y2goZSkge1xuICAgIH1cbn07XG5cbi8qKlxuICog0JLRgdC/0L7QvNC+0LPQsNGC0LXQu9GM0L3QsNGPINGE0YPQvdC60YbQuNGPINGE0L7RgNC80LDRgtC40YDQvtCy0LDQvdC40Y8g0LTQsNGC0Ysg0LTQu9GPINCy0YvQstC+0LTQsCDQsiDQutC+0L3QvtGB0L7Qu9GMLlxuICogQHBhcmFtIHRpbWVzdGFtcFxuICogQHJldHVybnMge3N0cmluZ31cbiAqIEBwcml2YXRlXG4gKi9cbkxvZ2dlci5fZm9ybWF0VGltZXN0YW1wID0gZnVuY3Rpb24odGltZXN0YW1wKSB7XG4gICAgdmFyIGRhdGUgPSBuZXcgRGF0ZSh0aW1lc3RhbXApO1xuICAgIHZhciBtcyA9IGRhdGUuZ2V0TWlsbGlzZWNvbmRzKCk7XG4gICAgbXMgPSBtcyA+IDEwMCA/IG1zIDogbXMgPiAxMCA/IFwiMFwiICsgbXMgOiBcIjAwXCIgKyBtcztcbiAgICByZXR1cm4gZGF0ZS50b0xvY2FsZVRpbWVTdHJpbmcoKSArIFwiLlwiICsgbXM7XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IExvZ2dlcjtcbiJdfQ==
