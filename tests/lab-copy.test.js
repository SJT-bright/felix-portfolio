import test from "node:test";
import assert from "node:assert/strict";

const loadCopyContact = async () => {
  let module;
  try {
    module = await import("../src/lib/copy-contact.js");
  } catch (error) {
    assert.fail(`copy-contact.js must be importable: ${error.message}`);
  }
  assert.equal(typeof module.copyContact, "function", "copyContact must be exported as a function");
  return module.copyContact;
};

const createFallbackEnvironment = ({ commandResult = true, commandError = null } = {}) => {
  const events = [];
  const savedRange = { id: "saved-range" };
  const selection = {
    rangeCount: 1,
    getRangeAt: () => ({ cloneRange: () => savedRange }),
    removeAllRanges: () => events.push("selection-cleared"),
    addRange: (range) => events.push(["selection-restored", range]),
  };
  const activeElement = {
    focus: (options) => events.push(["focus-restored", options]),
  };
  const temporaryNode = {
    value: "",
    style: {},
    setAttribute: (name, value) => events.push(["attribute", name, value]),
    focus: () => events.push("temporary-focused"),
    select: () => events.push("temporary-selected"),
    remove: () => events.push("temporary-removed"),
  };
  const document = {
    activeElement,
    body: {
      appendChild: (node) => events.push(["temporary-appended", node]),
    },
    createElement: (tagName) => {
      events.push(["created", tagName]);
      return temporaryNode;
    },
    execCommand: (command) => {
      events.push(["command", command]);
      if (commandError) throw commandError;
      return commandResult;
    },
  };

  return {
    environment: { document, getSelection: () => selection },
    events,
    savedRange,
    temporaryNode,
  };
};

test("copyContact prefers the native Clipboard API", async () => {
  const copyContact = await loadCopyContact();
  const writes = [];
  const environment = {
    navigator: {
      clipboard: {
        writeText: async (value) => writes.push(value),
      },
    },
    document: {
      createElement: () => assert.fail("fallback must not run after native copy succeeds"),
    },
  };

  assert.equal(await copyContact("SJTbright-future", environment), true);
  assert.deepEqual(writes, ["SJTbright-future"]);
});

test("copyContact falls back to a temporary selection and restores prior UI state", async () => {
  const copyContact = await loadCopyContact();
  const probe = createFallbackEnvironment();
  probe.environment.navigator = {
    clipboard: {
      writeText: async () => {
        throw new Error("permission denied");
      },
    },
  };

  assert.equal(await copyContact("SJTbright-future", probe.environment), true);
  assert.equal(probe.temporaryNode.value, "SJTbright-future");
  assert.ok(probe.events.some((event) => Array.isArray(event) && event[0] === "command" && event[1] === "copy"));
  assert.ok(probe.events.includes("temporary-removed"));
  assert.ok(probe.events.some((event) => Array.isArray(event) && event[0] === "selection-restored" && event[1] === probe.savedRange));
  assert.ok(probe.events.some((event) => Array.isArray(event) && event[0] === "focus-restored" && event[1]?.preventScroll === true));
});

test("copyContact reports fallback refusal and still cleans up", async () => {
  const copyContact = await loadCopyContact();
  const probe = createFallbackEnvironment({ commandResult: false });

  assert.equal(await copyContact("SJTbright-future", probe.environment), false);
  assert.ok(probe.events.includes("temporary-removed"));
  assert.ok(probe.events.some((event) => Array.isArray(event) && event[0] === "focus-restored"));
});

test("copyContact converts fallback exceptions into a false result", async () => {
  const copyContact = await loadCopyContact();
  const probe = createFallbackEnvironment({ commandError: new Error("copy unavailable") });

  assert.equal(await copyContact("SJTbright-future", probe.environment), false);
  assert.ok(probe.events.includes("temporary-removed"));
  assert.ok(probe.events.some((event) => Array.isArray(event) && event[0] === "selection-restored"));
});
