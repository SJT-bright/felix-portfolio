import test from 'node:test';
import assert from 'node:assert/strict';
import * as carouselModule from '../carousel.js';

const { signedCircularDistance, wrapIndex } = carouselModule;

test('wrapIndex wraps one step forward and backward', () => {
  assert.equal(wrapIndex(5, 5), 0);
  assert.equal(wrapIndex(-1, 5), 4);
});

test('wrapIndex handles large positive and negative values', () => {
  assert.equal(wrapIndex(123, 5), 3);
  assert.equal(wrapIndex(-123, 5), 2);
});

test('wrapIndex truncates finite fractional indices before wrapping', () => {
  assert.equal(wrapIndex(4.9, 4), 0);
  assert.equal(wrapIndex(-1.9, 5), 4);
});

test('wrapIndex returns zero for invalid indices and counts', () => {
  for (const value of [NaN, Infinity, -Infinity, '1', null]) {
    assert.equal(wrapIndex(value, 5), 0);
  }
  for (const count of [0, -1, NaN, Infinity, 2.5, '5', null]) {
    assert.equal(wrapIndex(1, count), 0);
  }
});

test('signedCircularDistance returns adjacent distances', () => {
  assert.equal(signedCircularDistance(3, 2, 5), 1);
  assert.equal(signedCircularDistance(2, 3, 5), -1);
});

test('signedCircularDistance chooses the shortest route across the wrap', () => {
  assert.equal(signedCircularDistance(0, 4, 5), 1);
  assert.equal(signedCircularDistance(4, 0, 5), -1);
});

test('signedCircularDistance preserves both signed shortest paths on an odd ring', () => {
  assert.equal(signedCircularDistance(2, 0, 5), 2);
  assert.equal(signedCircularDistance(3, 0, 5), -2);
});

test('signedCircularDistance resolves an even-ring opposite tie negatively', () => {
  assert.equal(signedCircularDistance(5, 0, 10), -5);
  assert.equal(signedCircularDistance(0, 5, 10), -5);
});

test('signedCircularDistance normalizes finite fractional inputs and rejects invalid ones', () => {
  assert.equal(signedCircularDistance(4.9, 1.9, 5), -2);
  assert.equal(signedCircularDistance(0.9, 4.9, 5), 1);
  assert.equal(signedCircularDistance(Infinity, 0, 5), 0);
  assert.equal(signedCircularDistance(1, NaN, 5), 0);
  assert.equal(signedCircularDistance(1, 0, 0), 0);
  assert.equal(signedCircularDistance(1, 0, 2.5), 0);
});

test('signedCircularDistance collapses every finite index to zero on a one-card ring', () => {
  assert.equal(signedCircularDistance(0, 0, 1), 0);
  assert.equal(signedCircularDistance(123.9, -9.2, 1), 0);
});

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.listenerOptions = new Map();
  }

  addEventListener(type, listener, options) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set());
    }
    this.listeners.get(type).add(listener);
    this.listenerOptions.set(`${type}:${this.listeners.get(type).size}`, options);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, properties = {}) {
    const event = {
      type,
      target: this,
      currentTarget: this,
      cancelable: true,
      defaultPrevented: false,
      preventDefault() {
        if (this.cancelable) {
          this.defaultPrevented = true;
        }
      },
      ...(type.startsWith('pointer') ? { button: 0 } : {}),
      ...properties,
    };

    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      if (typeof listener === 'function') {
        listener.call(this, event);
      } else {
        listener.handleEvent(event);
      }
    }
    return event;
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((count, listeners) => count + listeners.size, 0);
  }
}

class FakeStyle {
  constructor() {
    this.values = new Map();
  }

  setProperty(name, value) {
    this.values.set(name, String(value));
  }

  getPropertyValue(name) {
    return this.values.get(name) ?? '';
  }
}

class FakeElement extends FakeEventTarget {
  constructor({ tagName = 'DIV', classes = [] } = {}) {
    super();
    this.tagName = tagName;
    this.classList = { contains: (name) => classes.includes(name) };
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.style = new FakeStyle();
    this.disabled = false;
    this.hidden = false;
    this._textContent = '';
    this.textMutations = [];
    this.complete = false;
    this.naturalWidth = 0;
    this.capturedPointers = new Set();
  }

  get textContent() {
    return this._textContent;
  }

  set textContent(value) {
    this._textContent = String(value);
    this.textMutations.push({
      value: this._textContent,
      live: this.getAttribute('aria-live'),
    });
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
    }
  }

  contains(node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  setPointerCapture(pointerId) {
    this.capturedPointers.add(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.capturedPointers.delete(pointerId);
  }
}

class FakeMediaQuery extends FakeEventTarget {
  constructor(matches = false, modern = true) {
    super();
    this.matches = matches;
    this.modern = modern;
    this.legacyListeners = new Set();
    if (!modern) {
      this.addEventListener = undefined;
      this.removeEventListener = undefined;
    }
  }

  addListener(listener) {
    this.legacyListeners.add(listener);
  }

  removeListener(listener) {
    this.legacyListeners.delete(listener);
  }

  change(matches) {
    this.matches = matches;
    const event = { matches };
    for (const listener of [...(this.listeners.get('change') ?? [])]) listener(event);
    for (const listener of [...this.legacyListeners]) listener(event);
  }
}

class FakeClock {
  constructor() {
    this.nextId = 1;
    this.intervals = new Map();
    this.timeouts = new Map();
  }

  setInterval(callback, delay) {
    const id = this.nextId++;
    this.intervals.set(id, { callback, delay });
    return id;
  }

  clearInterval(id) {
    this.intervals.delete(id);
  }

  setTimeout(callback, delay) {
    const id = this.nextId++;
    this.timeouts.set(id, { callback, delay });
    return id;
  }

  clearTimeout(id) {
    this.timeouts.delete(id);
  }

  fireInterval() {
    for (const { callback } of [...this.intervals.values()]) callback();
  }

  fireTimeouts() {
    const pending = [...this.timeouts.values()];
    this.timeouts.clear();
    for (const { callback } of pending) callback();
  }
}

function createFixture({ count = 10, initialIndex = 0, intervalMs = 4000, hidden = false, reduced = false, modernMedia = true, matchMedia = true, readyBefore = false, indicatorLive = 'polite' } = {}) {
  const root = new FakeElement();
  if (readyBefore) root.setAttribute('data-carousel-ready', 'true');
  const items = Array.from({ length: count }, () => new FakeElement({ tagName: 'FIGURE' }));
  const previousButton = new FakeElement({ tagName: 'BUTTON' });
  const nextButton = new FakeElement({ tagName: 'BUTTON' });
  const indicator = new FakeElement({ tagName: 'OUTPUT' });
  if (indicatorLive !== null) indicator.setAttribute('aria-live', indicatorLive);
  const doc = new FakeEventTarget();
  const clock = new FakeClock();
  const mediaQuery = new FakeMediaQuery(reduced, modernMedia);
  const win = {
    setInterval: clock.setInterval.bind(clock),
    clearInterval: clock.clearInterval.bind(clock),
    setTimeout: clock.setTimeout.bind(clock),
    clearTimeout: clock.clearTimeout.bind(clock),
    ...(matchMedia ? { matchMedia: () => mediaQuery } : {}),
  };
  doc.visibilityState = hidden ? 'hidden' : 'visible';
  const controller = carouselModule.createCarouselController({
    root,
    items,
    previousButton,
    nextButton,
    indicator,
    win,
    doc,
    intervalMs,
    initialIndex,
  });

  return { root, items, previousButton, nextButton, indicator, doc, clock, mediaQuery, controller };
}

test('controller normalizes initial index, renders one current card, five variables, and wraps 9 to 0', () => {
  const fixture = createFixture({ initialIndex: 9.8 });
  const { controller, root, items, indicator } = fixture;
  const expectedProperties = [
    '--card-x',
    '--card-scale',
    '--card-rotate',
    '--card-opacity',
    '--card-layer',
  ];

  assert.equal(controller.activeIndex, 9);
  assert.equal(root.getAttribute('data-carousel-ready'), 'true');
  assert.equal(indicator.textContent, '10 / 10');
  assert.equal(items.filter((item) => item.getAttribute('aria-current') === 'true').length, 1);
  for (const item of items) {
    assert.deepEqual([...item.style.values.keys()], expectedProperties);
  }
  assert.equal(items[9].style.getPropertyValue('--card-x'), '0%');
  assert.equal(items[9].style.getPropertyValue('--card-scale'), '1');
  assert.equal(items[9].style.getPropertyValue('--card-rotate'), '0deg');
  assert.equal(items[9].style.getPropertyValue('--card-opacity'), '1');
  assert.equal(items[9].style.getPropertyValue('--card-layer'), 'var(--z-gallery-active)');
  assert.equal(items[0].style.getPropertyValue('--card-x'), '58%');
  assert.equal(items[4].style.getPropertyValue('--card-x'), '-290%');
  assert.equal(items[4].style.getPropertyValue('--card-scale'), '0.72');
  assert.equal(items[4].style.getPropertyValue('--card-rotate'), '-15deg');
  assert.equal(items[4].style.getPropertyValue('--card-opacity'), '0.18');
  assert.equal(items[4].style.getPropertyValue('--card-layer'), 'var(--z-gallery-card)');

  controller.moveBy(1);
  assert.equal(controller.activeIndex, 0);
  assert.equal(indicator.textContent, '01 / 10');
  assert.equal(items.filter((item) => item.getAttribute('aria-current') === 'true').length, 1);
});

test('controller normalizes negative, oversized, fractional, and non-finite goTo values', () => {
  const { controller } = createFixture({ initialIndex: -1.9 });
  assert.equal(controller.activeIndex, 9);
  controller.goTo(21.8);
  assert.equal(controller.activeIndex, 1);
  controller.goTo(Infinity);
  assert.equal(controller.activeIndex, 0);
  controller.goTo(NaN);
  assert.equal(controller.activeIndex, 0);
});

test('zero and one item states stay stable and never schedule auto advance', () => {
  const empty = createFixture({ count: 0, readyBefore: true });
  assert.equal(empty.root.hasAttribute('data-carousel-ready'), false);
  assert.equal(empty.previousButton.disabled, true);
  assert.equal(empty.nextButton.disabled, true);
  assert.equal(empty.indicator.textContent, '00 / 00');
  assert.equal(empty.clock.intervals.size, 0);
  assert.doesNotThrow(() => empty.controller.moveBy(1));

  const singleton = createFixture({ count: 1, initialIndex: 99 });
  assert.equal(singleton.root.getAttribute('data-carousel-ready'), 'true');
  assert.equal(singleton.items[0].getAttribute('aria-current'), 'true');
  assert.equal(singleton.previousButton.disabled, true);
  assert.equal(singleton.nextButton.disabled, true);
  assert.equal(singleton.indicator.textContent, '01 / 01');
  assert.equal(singleton.clock.intervals.size, 0);
});

test('auto advance owns exactly one 4000ms interval and manual movement resets its deadline', () => {
  const { controller, clock } = createFixture();
  assert.equal(clock.intervals.size, 1);
  assert.equal([...clock.intervals.values()][0].delay, 4000);
  const firstId = [...clock.intervals.keys()][0];
  clock.fireInterval();
  assert.equal(controller.activeIndex, 1);
  assert.equal(clock.intervals.size, 1);
  controller.moveBy(1);
  assert.equal(controller.activeIndex, 2);
  assert.equal(clock.intervals.size, 1);
  assert.notEqual([...clock.intervals.keys()][0], firstId);

  const invalid = createFixture({ intervalMs: Infinity });
  assert.equal(invalid.clock.intervals.size, 0);
});

test('missing matchMedia and every non-positive or non-finite interval disable only auto advance', () => {
  // Older/non-browser hosts may omit matchMedia altogether; navigation must still work.
  const noMedia = createFixture({ count: 3, matchMedia: false });
  assert.equal(noMedia.clock.intervals.size, 1);
  noMedia.controller.moveBy(1);
  assert.equal(noMedia.controller.activeIndex, 1);
  noMedia.controller.destroy();

  for (const intervalMs of [0, -1, NaN]) {
    const fixture = createFixture({ count: 3, intervalMs });
    assert.equal(fixture.clock.intervals.size, 0, `${String(intervalMs)} must not schedule an interval`);
    fixture.nextButton.dispatch('click');
    assert.equal(fixture.controller.activeIndex, 1, `${String(intervalMs)} must not disable manual navigation`);
    assert.equal(fixture.indicator.getAttribute('aria-live'), 'polite');
    fixture.controller.destroy();
  }
});

test('live indicator is off only while auto advance is running and auto mutations stay silent', () => {
  const { controller, root, indicator, clock } = createFixture();
  assert.equal(clock.intervals.size, 1);
  assert.equal(indicator.getAttribute('aria-live'), 'off');
  assert.deepEqual(indicator.textMutations[0], { value: '01 / 10', live: 'polite' });

  clock.fireInterval();
  assert.equal(controller.activeIndex, 1);
  assert.deepEqual(indicator.textMutations.at(-1), { value: '02 / 10', live: 'off' });

  root.dispatch('pointerenter');
  assert.equal(clock.intervals.size, 0);
  assert.equal(indicator.getAttribute('aria-live'), 'polite');
  root.dispatch('pointerleave');
  assert.equal(clock.intervals.size, 1);
  assert.equal(indicator.getAttribute('aria-live'), 'off');
});

test('ineligible and destroyed controllers expose a polite indicator and destroy restores its original value', () => {
  const empty = createFixture({ count: 0 });
  const singleton = createFixture({ count: 1 });
  const invalid = createFixture({ intervalMs: Infinity });
  const hidden = createFixture({ hidden: true });
  const reduced = createFixture({ reduced: true });

  for (const fixture of [empty, singleton, invalid, hidden, reduced]) {
    assert.equal(fixture.clock.intervals.size, 0);
    assert.equal(fixture.indicator.getAttribute('aria-live'), 'polite');
  }

  const defaultLive = createFixture();
  assert.equal(defaultLive.indicator.getAttribute('aria-live'), 'off');
  defaultLive.controller.destroy();
  assert.equal(defaultLive.indicator.getAttribute('aria-live'), 'polite');

  const customLive = createFixture({ indicatorLive: 'assertive' });
  assert.equal(customLive.indicator.getAttribute('aria-live'), 'off');
  customLive.controller.destroy();
  assert.equal(customLive.indicator.getAttribute('aria-live'), 'assertive');
});

test('independent pause reasons restore silent auto only after the final reason clears', () => {
  const { root, doc, mediaQuery, indicator, clock } = createFixture();
  assert.equal(indicator.getAttribute('aria-live'), 'off');

  root.dispatch('pointerenter');
  root.dispatch('focusin');
  assert.equal(clock.intervals.size, 0);
  assert.equal(indicator.getAttribute('aria-live'), 'polite');
  root.dispatch('pointerleave');
  assert.equal(clock.intervals.size, 0);
  assert.equal(indicator.getAttribute('aria-live'), 'polite');
  root.dispatch('focusout', { relatedTarget: null });
  assert.equal(clock.intervals.size, 1);
  assert.equal(indicator.getAttribute('aria-live'), 'off');

  root.dispatch('pointerdown', { isPrimary: true, pointerId: 31, clientX: 100 });
  assert.equal(indicator.getAttribute('aria-live'), 'polite');
  doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange');
  root.dispatch('pointercancel', { pointerId: 31 });
  assert.equal(clock.intervals.size, 0);
  assert.equal(indicator.getAttribute('aria-live'), 'polite');
  doc.visibilityState = 'visible';
  doc.dispatch('visibilitychange');
  assert.equal(clock.intervals.size, 1);
  assert.equal(indicator.getAttribute('aria-live'), 'off');

  mediaQuery.change(true);
  assert.equal(clock.intervals.size, 0);
  assert.equal(indicator.getAttribute('aria-live'), 'polite');
  mediaQuery.change(false);
  assert.equal(clock.intervals.size, 1);
  assert.equal(indicator.getAttribute('aria-live'), 'off');
});

test('manual swipe mutates indicator while polite before eligible auto resumes silently', () => {
  const { controller, root, indicator, clock } = createFixture();
  indicator.textMutations.length = 0;
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 41, clientX: 100 });
  root.dispatch('pointerup', { pointerId: 41, clientX: 50 });

  assert.equal(controller.activeIndex, 1);
  assert.deepEqual(indicator.textMutations, [{ value: '02 / 10', live: 'polite' }]);
  assert.equal(clock.intervals.size, 1);
  assert.equal(indicator.getAttribute('aria-live'), 'off');
});

test('hover and focus pause reasons clear timers independently without duplicate resumes', () => {
  const { root, clock } = createFixture();
  const internal = new FakeElement({ tagName: 'BUTTON' });
  root.append(internal);
  root.dispatch('pointerenter');
  assert.equal(clock.intervals.size, 0);
  root.dispatch('focusin');
  root.dispatch('pointerleave');
  assert.equal(clock.intervals.size, 0);
  root.dispatch('focusout', { relatedTarget: internal });
  assert.equal(clock.intervals.size, 0, 'internal focus movement stays paused');
  root.dispatch('focusout', { relatedTarget: null });
  assert.equal(clock.intervals.size, 1);
  root.dispatch('focusout', { relatedTarget: null });
  root.dispatch('pointerleave');
  assert.equal(clock.intervals.size, 1);
});

test('pointer and hidden pause reasons clear and restart one timer', () => {
  const { root, doc, clock } = createFixture();
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 7, clientX: 100 });
  assert.equal(clock.intervals.size, 0);
  doc.visibilityState = 'hidden';
  doc.dispatch('visibilitychange');
  root.dispatch('pointercancel', { pointerId: 7 });
  assert.equal(clock.intervals.size, 0);
  doc.visibilityState = 'visible';
  doc.dispatch('visibilitychange');
  assert.equal(clock.intervals.size, 1);

  const initiallyHidden = createFixture({ hidden: true });
  assert.equal(initiallyHidden.clock.intervals.size, 0);
  initiallyHidden.doc.visibilityState = 'visible';
  initiallyHidden.doc.dispatch('visibilitychange');
  assert.equal(initiallyHidden.clock.intervals.size, 1);
});

test('runtime reduced-motion changes stop and restart auto and clean up modern and legacy listeners', () => {
  const modern = createFixture();
  assert.equal(modern.mediaQuery.listeners.get('change').size, 1);
  modern.mediaQuery.change(true);
  assert.equal(modern.clock.intervals.size, 0);
  modern.mediaQuery.change(false);
  assert.equal(modern.clock.intervals.size, 1);
  modern.controller.destroy();
  assert.equal(modern.mediaQuery.listeners.get('change').size, 0);

  const legacy = createFixture({ modernMedia: false });
  assert.equal(legacy.mediaQuery.legacyListeners.size, 1);
  legacy.mediaQuery.change(true);
  assert.equal(legacy.clock.intervals.size, 0);
  legacy.controller.destroy();
  assert.equal(legacy.mediaQuery.legacyListeners.size, 0);

  const initiallyReduced = createFixture({ reduced: true });
  assert.equal(initiallyReduced.clock.intervals.size, 0);
});

test('buttons and unmodified arrows move one card while modified arrows pass through', () => {
  const { controller, root, previousButton, nextButton } = createFixture();
  nextButton.dispatch('click');
  assert.equal(controller.activeIndex, 1);
  previousButton.dispatch('click');
  assert.equal(controller.activeIndex, 0);
  previousButton.dispatch('click');
  assert.equal(controller.activeIndex, 9);

  const right = root.dispatch('keydown', { key: 'ArrowRight' });
  assert.equal(controller.activeIndex, 0);
  assert.equal(right.defaultPrevented, true);
  const left = root.dispatch('keydown', { key: 'ArrowLeft', target: new FakeElement() });
  assert.equal(controller.activeIndex, 9);
  assert.equal(left.defaultPrevented, true);
  for (const modifier of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
    const event = root.dispatch('keydown', { key: 'ArrowRight', [modifier]: true });
    assert.equal(event.defaultPrevented, false);
    assert.equal(controller.activeIndex, 9);
  }
});

test('primary pointer swipes move at most one card and short, canceled, wrong-id, and lost-capture gestures do not', () => {
  const { controller, root, clock } = createFixture();
  root.dispatch('pointerdown', { isPrimary: false, pointerId: 1, clientX: 100 });
  assert.equal(clock.intervals.size, 1);

  root.dispatch('pointerdown', { isPrimary: true, pointerId: 2, clientX: 100 });
  assert.equal(root.capturedPointers.has(2), true);
  root.dispatch('pointerup', { pointerId: 2, clientX: 50 });
  assert.equal(controller.activeIndex, 1);
  assert.equal(root.capturedPointers.has(2), false);
  assert.equal(clock.intervals.size, 1);

  root.dispatch('pointerdown', { isPrimary: true, pointerId: 3, clientX: 100 });
  root.dispatch('pointerup', { pointerId: 3, clientX: 136 });
  assert.equal(controller.activeIndex, 0, 'right drag moves previous');
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 4, clientX: 100 });
  root.dispatch('pointerup', { pointerId: 4, clientX: 65 });
  assert.equal(controller.activeIndex, 0, 'short drag does not move');
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 5, clientX: 100 });
  root.dispatch('pointercancel', { pointerId: 5 });
  assert.equal(controller.activeIndex, 0);
  assert.equal(clock.intervals.size, 1);
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 6, clientX: 100 });
  root.dispatch('lostpointercapture', { pointerId: 6 });
  assert.equal(controller.activeIndex, 0);
  assert.equal(clock.intervals.size, 1);
});

for (const terminalType of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  test(`wrong-id ${terminalType} preserves the active pointer until its matching release`, () => {
    const { controller, root, indicator, clock } = createFixture();
    root.dispatch('pointerdown', { isPrimary: true, pointerId: 11, clientX: 100 });
    assert.equal(root.capturedPointers.has(11), true);
    assert.equal(clock.intervals.size, 0);
    assert.equal(indicator.getAttribute('aria-live'), 'polite');

    root.dispatch(terminalType, { pointerId: 22, clientX: 0 });
    assert.equal(controller.activeIndex, 0);
    assert.equal(root.capturedPointers.has(11), true);
    assert.equal(clock.intervals.size, 0);
    assert.equal(indicator.getAttribute('aria-live'), 'polite');

    root.dispatch('pointerup', { pointerId: 11, clientX: 50 });
    assert.equal(controller.activeIndex, 1);
    assert.equal(root.capturedPointers.has(11), false);
    assert.equal(clock.intervals.size, 1);
    const resumedInterval = [...clock.intervals.keys()][0];

    root.dispatch('lostpointercapture', { pointerId: 11 });
    assert.equal(controller.activeIndex, 1);
    assert.equal(clock.intervals.size, 1);
    assert.equal([...clock.intervals.keys()][0], resumedInterval);
  });
}

test('a second primary pointerdown cannot overwrite an active pointer gesture', () => {
  const { controller, root, indicator, clock } = createFixture();
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 11, clientX: 100 });
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 22, clientX: 500 });

  assert.equal(root.capturedPointers.has(11), true);
  assert.equal(root.capturedPointers.has(22), false);
  assert.equal(clock.intervals.size, 0);
  assert.equal(indicator.getAttribute('aria-live'), 'polite');

  root.dispatch('pointerup', { pointerId: 22, clientX: 0 });
  assert.equal(controller.activeIndex, 0);
  assert.equal(root.capturedPointers.has(11), true);
  assert.equal(clock.intervals.size, 0);

  root.dispatch('pointerup', { pointerId: 11, clientX: 50 });
  assert.equal(controller.activeIndex, 1);
  assert.equal(root.capturedPointers.has(11), false);
  assert.equal(clock.intervals.size, 1);
});

for (const [button, label] of [[1, 'middle'], [2, 'right']]) {
  test(`${label}-button pointerdown cannot capture, pause, reset auto, or move a card`, () => {
    const { controller, root, indicator, clock } = createFixture();
    const initialInterval = [...clock.intervals.keys()][0];

    const down = root.dispatch('pointerdown', {
      isPrimary: true,
      pointerId: 30 + button,
      pointerType: 'mouse',
      button,
      clientX: 100,
    });
    assert.equal(down.button, button);
    assert.equal(root.capturedPointers.has(30 + button), false);
    assert.equal(clock.intervals.size, 1);
    assert.equal([...clock.intervals.keys()][0], initialInterval);
    assert.equal(indicator.getAttribute('aria-live'), 'off');

    root.dispatch('pointerup', {
      pointerId: 30 + button,
      pointerType: 'mouse',
      button,
      clientX: 20,
    });
    assert.equal(controller.activeIndex, 0);
    assert.equal(clock.intervals.size, 1);
    assert.equal([...clock.intervals.keys()][0], initialInterval);
    assert.equal(indicator.getAttribute('aria-live'), 'off');
  });
}

for (const [index, pointerType] of ['mouse', 'touch', 'pen'].entries()) {
  test(`primary ${pointerType} button-zero gesture still captures and moves one card`, () => {
    const { controller, root, clock } = createFixture();
    const pointerId = 40 + index;
    const down = root.dispatch('pointerdown', {
      isPrimary: true,
      pointerId,
      pointerType,
      clientX: 100,
      ...(pointerType === 'mouse' ? {} : { button: 0 }),
    });
    assert.equal(down.button, 0, 'fake pointer events default button to zero');
    assert.equal(root.capturedPointers.has(pointerId), true);
    assert.equal(clock.intervals.size, 0);

    root.dispatch('pointerup', { pointerId, pointerType, clientX: 50 });
    assert.equal(controller.activeIndex, 1);
    assert.equal(root.capturedPointers.has(pointerId), false);
    assert.equal(clock.intervals.size, 1);
  });
}

test('button pointer targets bypass root capture while button clicks and stage swipes remain independent', () => {
  const { controller, root, items, previousButton, nextButton, clock } = createFixture();
  const previousIcon = new FakeElement({ tagName: 'SPAN' });
  previousButton.append(previousIcon);

  const initialInterval = [...clock.intervals.keys()][0];
  root.dispatch('pointerdown', {
    isPrimary: true,
    pointerId: 81,
    clientX: 100,
    target: nextButton,
  });
  assert.equal(root.capturedPointers.has(81), false);
  assert.equal(clock.intervals.size, 1);
  assert.equal([...clock.intervals.keys()][0], initialInterval);
  root.dispatch('pointerup', { pointerId: 81, clientX: 20, target: nextButton });
  nextButton.dispatch('click');
  assert.equal(controller.activeIndex, 1);

  const intervalBeforePrevious = [...clock.intervals.keys()][0];
  root.dispatch('pointerdown', {
    isPrimary: true,
    pointerId: 82,
    clientX: 100,
    target: previousIcon,
  });
  assert.equal(root.capturedPointers.has(82), false);
  assert.equal(clock.intervals.size, 1);
  assert.equal([...clock.intervals.keys()][0], intervalBeforePrevious);
  root.dispatch('pointerup', { pointerId: 82, clientX: 180, target: previousIcon });
  previousButton.dispatch('click');
  assert.equal(controller.activeIndex, 0);

  root.dispatch('pointerdown', {
    isPrimary: true,
    pointerId: 83,
    clientX: 100,
    target: items[0],
  });
  assert.equal(root.capturedPointers.has(83), true);
  assert.equal(clock.intervals.size, 0);
  root.dispatch('pointerup', { pointerId: 83, clientX: 50, target: items[0] });
  assert.equal(controller.activeIndex, 1);
  assert.equal(clock.intervals.size, 1);

  root.dispatch('pointerdown', {
    isPrimary: true,
    pointerId: 84,
    clientX: 100,
    target: root,
  });
  assert.equal(root.capturedPointers.has(84), true);
  root.dispatch('pointerup', { pointerId: 84, clientX: 140, target: root });
  assert.equal(controller.activeIndex, 0);
  assert.equal(clock.intervals.size, 1);
});

test('late lostpointercapture after pointerup or destroy cannot repeat movement or auto scheduling', () => {
  const { controller, root, clock } = createFixture();
  root.dispatch('pointerdown', { isPrimary: true, pointerId: 71, clientX: 100 });
  root.dispatch('pointerup', { pointerId: 71, clientX: 50 });
  const indexAfterPointerUp = controller.activeIndex;
  const intervalAfterPointerUp = [...clock.intervals.keys()][0];

  root.dispatch('lostpointercapture', { pointerId: 71 });
  assert.equal(controller.activeIndex, indexAfterPointerUp);
  assert.equal(clock.intervals.size, 1);
  assert.equal([...clock.intervals.keys()][0], intervalAfterPointerUp);

  controller.destroy();
  root.dispatch('lostpointercapture', { pointerId: 71 });
  assert.equal(controller.activeIndex, indexAfterPointerUp);
  assert.equal(clock.intervals.size, 0);
});

test('wheel accepts only unmodified cancelable horizontal-dominant input and locks each burst', () => {
  const { controller, root, clock } = createFixture();
  const wheelOptions = [...root.listenerOptions.entries()].find(([key]) => key.startsWith('wheel:'))?.[1];
  assert.deepEqual(wheelOptions, { passive: false });

  const rejected = [
    { deltaX: 0, deltaY: 0 },
    { deltaX: 50, deltaY: 50 },
    { deltaX: 20, deltaY: 21 },
    { deltaX: 40, deltaY: 0, cancelable: false },
    { deltaX: 40, deltaY: 0, ctrlKey: true },
    { deltaX: 40, deltaY: 0, shiftKey: true },
  ];
  for (const properties of rejected) {
    const event = root.dispatch('wheel', properties);
    assert.equal(event.defaultPrevented, false);
    assert.equal(controller.activeIndex, 0);
  }

  const accepted = root.dispatch('wheel', { deltaX: 40, deltaY: 2 });
  assert.equal(accepted.defaultPrevented, true);
  assert.equal(controller.activeIndex, 1);
  assert.equal(clock.timeouts.size, 1);
  const locked = root.dispatch('wheel', { deltaX: 80, deltaY: 0 });
  assert.equal(locked.defaultPrevented, true);
  assert.equal(controller.activeIndex, 1);
  assert.equal(clock.timeouts.size, 1);
  clock.fireTimeouts();
  root.dispatch('wheel', { deltaX: -40, deltaY: 0 });
  assert.equal(controller.activeIndex, 0);
});

test('future direct-child images preserve pending fallback and handle load, error, and cached states', () => {
  const itemPending = new FakeElement({ tagName: 'FIGURE' });
  const pendingImage = new FakeElement({ tagName: 'IMG' });
  const pendingPlaceholder = new FakeElement({ classes: ['gallery-card__placeholder'] });
  itemPending.append(pendingImage, pendingPlaceholder);

  const itemSuccess = new FakeElement({ tagName: 'FIGURE' });
  const successImage = new FakeElement({ tagName: 'IMG' });
  const successPlaceholder = new FakeElement({ classes: ['gallery-card__placeholder'] });
  successImage.complete = true;
  successImage.naturalWidth = 640;
  successImage.setAttribute('draggable', 'true');
  itemSuccess.append(successImage, successPlaceholder);

  const itemFailure = new FakeElement({ tagName: 'FIGURE' });
  const failureImage = new FakeElement({ tagName: 'IMG' });
  const failurePlaceholder = new FakeElement({ classes: ['gallery-card__placeholder'] });
  failureImage.complete = true;
  failureImage.naturalWidth = 0;
  itemFailure.append(failureImage, failurePlaceholder);

  const fixture = createFixture({ count: 0 });
  const controller = carouselModule.createCarouselController({
    root: fixture.root,
    items: [itemPending, itemSuccess, itemFailure],
    previousButton: fixture.previousButton,
    nextButton: fixture.nextButton,
    indicator: fixture.indicator,
    win: {
      setInterval: fixture.clock.setInterval.bind(fixture.clock),
      clearInterval: fixture.clock.clearInterval.bind(fixture.clock),
      setTimeout: fixture.clock.setTimeout.bind(fixture.clock),
      clearTimeout: fixture.clock.clearTimeout.bind(fixture.clock),
      matchMedia: () => fixture.mediaQuery,
    },
    doc: fixture.doc,
  });

  assert.equal(pendingImage.hidden, true);
  assert.equal(pendingPlaceholder.hidden, false);
  assert.equal(successImage.hidden, false);
  assert.equal(successPlaceholder.hidden, true);
  assert.equal(failureImage.hidden, true);
  assert.equal(failurePlaceholder.hidden, false);
  assert.equal(pendingImage.getAttribute('draggable'), null);
  assert.equal(successImage.getAttribute('draggable'), 'true');
  assert.equal(failureImage.getAttribute('draggable'), null);
  for (const image of [pendingImage, successImage, failureImage]) {
    assert.equal(image.dispatch('dragstart').defaultPrevented, true);
  }

  const activeBefore = controller.activeIndex;
  pendingImage.dispatch('load');
  assert.equal(pendingImage.hidden, false);
  assert.equal(pendingPlaceholder.hidden, true);
  pendingImage.dispatch('error');
  assert.equal(pendingImage.hidden, true);
  assert.equal(pendingPlaceholder.hidden, false);
  assert.equal(controller.activeIndex, activeBefore);
  controller.destroy();
  assert.equal(pendingImage.listenerCount(), 0);
  assert.equal(successImage.listenerCount(), 0);
  assert.equal(failureImage.listenerCount(), 0);
  assert.equal(pendingImage.getAttribute('draggable'), null);
  assert.equal(successImage.getAttribute('draggable'), 'true');
  assert.equal(failureImage.getAttribute('draggable'), null);
  for (const image of [pendingImage, successImage, failureImage]) {
    assert.equal(image.dispatch('dragstart').defaultPrevented, false);
  }
});

test('destroy is idempotent, restores fallback mode, clears resources, and ignores later events', () => {
  const { controller, root, previousButton, nextButton, doc, mediaQuery, clock } = createFixture();
  root.dispatch('wheel', { deltaX: 40, deltaY: 0 });
  const indexAtDestroy = controller.activeIndex;
  assert.equal(clock.timeouts.size, 1);
  controller.destroy();
  controller.destroy();
  assert.equal(root.hasAttribute('data-carousel-ready'), false);
  assert.equal(clock.intervals.size, 0);
  assert.equal(clock.timeouts.size, 0);
  assert.equal(root.listenerCount(), 0);
  assert.equal(previousButton.listenerCount(), 0);
  assert.equal(nextButton.listenerCount(), 0);
  assert.equal(doc.listenerCount(), 0);
  assert.equal(mediaQuery.listenerCount(), 0);
  nextButton.dispatch('click');
  root.dispatch('keydown', { key: 'ArrowRight' });
  doc.dispatch('visibilitychange');
  mediaQuery.change(true);
  clock.fireInterval();
  clock.fireTimeouts();
  assert.equal(controller.activeIndex, indexAtDestroy);
});
