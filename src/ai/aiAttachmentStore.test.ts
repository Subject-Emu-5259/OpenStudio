import { describe, expect, it } from "vitest";
import {
  AiAttachmentStore,
  createMemoryAttachmentBackend,
} from "./aiAttachmentStore";
import type { StoredAttachment } from "./aiAttachmentStore";

function createRecord(id: string): StoredAttachment {
  return {
    id,
    name: id + ".wav",
    kind: "audio",
    size: 3,
    blob: new Blob([new Uint8Array([0, 1, 2])]),
  };
}

describe("createMemoryAttachmentBackend", function () {
  it("supports put, getAll, remove, and clear", async function () {
    const backend = createMemoryAttachmentBackend();
    await backend.put(createRecord("a"));
    await backend.put(createRecord("b"));
    expect((await backend.getAll()).map(function (record) {
      return record.id;
    })).toEqual(["a", "b"]);
    await backend.remove("a");
    expect((await backend.getAll()).map(function (record) {
      return record.id;
    })).toEqual(["b"]);
    await backend.clear();
    expect(await backend.getAll()).toEqual([]);
  });
});

describe("AiAttachmentStore", function () {
  it("falls back to memory when the primary backend throws", async function () {
    const throwing = {
      getAll: async function (): Promise<StoredAttachment[]> {
        throw new Error("IDB blocked");
      },
      put: async function (): Promise<void> {
        throw new Error("IDB blocked");
      },
      remove: async function (): Promise<void> {
        throw new Error("IDB blocked");
      },
      clear: async function (): Promise<void> {
        throw new Error("IDB blocked");
      },
    };
    const store = new AiAttachmentStore(throwing);
    expect(await store.getAll()).toEqual([]);
    expect(store.isFallback()).toBe(true);
    await store.put(createRecord("x"));
    expect((await store.getAll()).map(function (record) {
      return record.id;
    })).toEqual(["x"]);
  });

  it("uses the primary backend while it stays healthy", async function () {
    const backend = createMemoryAttachmentBackend();
    const store = new AiAttachmentStore(backend);
    await store.put(createRecord("y"));
    expect(store.isFallback()).toBe(false);
    expect((await store.getAll()).map(function (record) {
      return record.id;
    })).toEqual(["y"]);
  });
});
