/* xpenses-offline-asset:v9 */
(() => {
  "use strict";

  const PROFILE_KEY = "xpenses_user_profile";
  const QUERY_DB = "xpenses-cache";
  const QUERY_STORE = "react_query";
  const QUERY_KEY = "persisted_state";
  const QUEUE_DB = "xpenses-offline";
  const QUEUE_DB_VERSION = 2;
  const QUEUE_STORE = "pending_expenses";
  const MAX_QUERY_AGE_MS = 24 * 60 * 60 * 1000;
  const MAX_QUEUE_SIZE = 20;
  const MAX_QUEUE_BYTES = 100 * 1024 * 1024;
  const MAX_SOURCE_PHOTO_BYTES = 25 * 1024 * 1024;
  const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
  const RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
  const app = document.getElementById("offline-app");
  const state = {
    locale: "en",
    messages: null,
    ownerId: null,
    ownerGeneration: 0,
    verifiedOwnerId: null,
    busy: false,
    queueUnavailable: false,
    photoPicker: null,
    objectUrls: [],
    pendingWrites: new Set(),
  };

  function cookieLocale() {
    const match = document.cookie.match(/(?:^|;\s*)lang=([^;]*)/);
    if (match) {
      try {
        const value = decodeURIComponent(match[1]);
        if (value === "en" || value === "ro") return value;
      } catch {
        // Fall through to the browser language.
      }
    }
    return navigator.language && navigator.language.toLowerCase().startsWith("ro")
      ? "ro"
      : "en";
  }

  async function loadMessages() {
    state.locale = cookieLocale();
    document.documentElement.lang = state.locale;
    const response = await fetch("/offline/messages.v9.json", {
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Offline workspace messages are unavailable");
    const messages = await response.json();
    if (messages.shellVersion !== 9 || !messages[state.locale]) {
      throw new Error("Offline workspace messages are out of date");
    }
    state.messages = messages[state.locale];
  }

  function text(key) {
    return state.messages?.[key] ?? key;
  }

  function storedOwnerId() {
    try {
      const raw = localStorage.getItem(PROFILE_KEY);
      const profile = raw ? JSON.parse(raw) : null;
      return Number.isSafeInteger(profile?.id) && profile.id > 0 ? profile.id : null;
    } catch {
      return null;
    }
  }

  function ownerIsCurrent(ownerId, generation) {
    return (
      Number.isSafeInteger(ownerId) &&
      ownerId > 0 &&
      state.ownerId === ownerId &&
      state.ownerGeneration === generation &&
      storedOwnerId() === ownerId
    );
  }

  function querySnapshotMatchesOwner(record, ownerId) {
    return (
      record &&
      record.userId === ownerId &&
      Number.isFinite(record.timestamp) &&
      record.timestamp >= 0 &&
      record.timestamp <= Date.now() + 5_000
    );
  }

  function querySnapshotIsFresh(record) {
    return (
      querySnapshotMatchesOwner(record, record?.userId) &&
      Date.now() - record.timestamp <= MAX_QUERY_AGE_MS
    );
  }

  function setText(selector, value) {
    const node = app.querySelector(selector);
    if (node) node.textContent = value;
  }

  function revokePreviews() {
    state.objectUrls.forEach((url) => URL.revokeObjectURL(url));
    state.objectUrls = [];
  }

  function abortPendingWrites() {
    for (const transaction of state.pendingWrites) {
      try {
        transaction.abort();
      } catch {
        // The transaction may already have committed or aborted.
      }
    }
  }

  function clearPrivateData(cancelWrites = false) {
    if (cancelWrites) {
      abortPendingWrites();
      if (state.photoPicker) state.photoPicker.invalidated = true;
    }
    revokePreviews();
    app.querySelector("#cached-expenses")?.replaceChildren();
    app.querySelector("#offline-drafts")?.replaceChildren();
    app.querySelector("#private-workspace")?.setAttribute("hidden", "");
    const form = app.querySelector("#draft-form");
    if (form) {
      form.reset();
      for (const field of form.elements) field.disabled = true;
    }
    const error = app.querySelector("#form-error");
    if (error) {
      error.hidden = true;
      error.textContent = "";
    }
    setText("#photo-name", text("noPhoto"));
  }

  function setReconnect(visible, href = "/dashboard?offline=return", label = text("checkAndSync")) {
    const link = app.querySelector("#reconnect-link");
    if (!link) return;
    link.hidden = !visible;
    link.href = href;
    link.textContent = label;
  }

  function setCheckAccount(visible) {
    const button = app.querySelector("#check-account");
    if (!button) return;
    button.hidden = !visible;
    button.textContent = text("checkAccount");
  }

  function showNotice(message, status = message) {
    setText("#notice", message);
    setText("#connection-status", status);
  }

  function showNeutral(message) {
    clearPrivateData();
    state.queueUnavailable = false;
    setReconnect(false);
    setCheckAccount(false);
    showNotice(message, message);
  }

  function openDatabase(name, version, storeName, keyPath = null) {
    return new Promise((resolve, reject) => {
      if (!("indexedDB" in window)) {
        reject(new Error("IndexedDB is unavailable"));
        return;
      }
      const request = indexedDB.open(name, version);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          const options = keyPath ? { keyPath } : undefined;
          request.result.createObjectStore(storeName, options);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open device storage"));
      request.onblocked = () => reject(new Error("Device storage is busy"));
    });
  }

  function deleteDatabase(name) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error ?? new Error("Could not repair device storage"));
      request.onblocked = () => reject(new Error("Device storage is busy"));
    });
  }

  function countQueueRows(db) {
    return new Promise((resolve, reject) => {
      let count = 0;
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const request = tx.objectStore(QUEUE_STORE).count();
      request.onsuccess = () => { count = request.result; };
      request.onerror = () => {
        try { tx.abort(); } catch { /* already complete */ }
      };
      tx.oncomplete = () => resolve(count);
      tx.onerror = tx.onabort = () => reject(tx.error ?? request.error ?? new Error("Could not inspect device storage"));
    });
  }

  async function openQueueDatabase() {
    let db = await openDatabase(QUEUE_DB, QUEUE_DB_VERSION, QUEUE_STORE, "id");
    const store = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE);
    if (store.keyPath === "id") return db;

    let rowCount;
    try {
      rowCount = await countQueueRows(db);
    } finally {
      db.close();
    }
    if (rowCount !== 0) {
      // Never delete or rewrite records from an unknown/incompatible store.
      throw new Error("The existing offline queue schema cannot be repaired safely");
    }

    await deleteDatabase(QUEUE_DB);
    db = await openDatabase(QUEUE_DB, QUEUE_DB_VERSION, QUEUE_STORE, "id");
    const repairedStore = db.transaction(QUEUE_STORE, "readonly").objectStore(QUEUE_STORE);
    if (repairedStore.keyPath !== "id") {
      db.close();
      throw new Error("The offline queue schema is incompatible");
    }
    return db;
  }

  async function readQueryRecord() {
    const db = await openDatabase(QUERY_DB, 1, QUERY_STORE);
    return new Promise((resolve, reject) => {
      const tx = db.transaction(QUERY_STORE, "readonly");
      const request = tx.objectStore(QUERY_STORE).get(QUERY_KEY);
      let value = null;
      request.onsuccess = () => { value = request.result ?? null; };
      request.onerror = () => {
        try { tx.abort(); } catch { /* already complete */ }
      };
      tx.oncomplete = () => {
        db.close();
        resolve(value);
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? request.error ?? new Error("Could not read cached expenses"));
      };
    });
  }

  function validStoredReceipt(receipt) {
    return (
      receipt &&
      typeof receipt.name === "string" &&
      typeof receipt.type === "string" &&
      receipt.blob instanceof Blob &&
      Number.isFinite(receipt.blob.size) &&
      receipt.blob.size >= 0
    );
  }

  function validQueueItem(item) {
    return (
      item &&
      typeof item.id === "string" &&
      item.payload &&
      typeof item.payload === "object" &&
      Array.isArray(item.receipts) &&
      item.receipts.every(validStoredReceipt)
    );
  }

  function readQueue(ownerId) {
    return openQueueDatabase().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(QUEUE_STORE, "readonly");
      const request = tx.objectStore(QUEUE_STORE).getAll();
      let items = [];
      request.onsuccess = () => {
        const records = request.result ?? [];
        if (!records.every(validQueueItem)) {
          try { tx.abort(); } catch { /* already aborted */ }
          return;
        }
        items = records
          .filter((item) => item && item.userId === ownerId)
          .sort((left, right) => (left.createdAt ?? 0) - (right.createdAt ?? 0));
      };
      request.onerror = () => {
        try { tx.abort(); } catch { /* already aborted */ }
      };
      tx.oncomplete = () => {
        db.close();
        resolve({ items, unavailable: false });
      };
      tx.onerror = tx.onabort = () => {
        db.close();
        reject(tx.error ?? request.error ?? new Error("Could not read offline drafts"));
      };
    }));
  }

  function collectExpenses(payload) {
    const found = [];
    const add = (value) => {
      if (!value || typeof value !== "object") return;
      if (Array.isArray(value)) {
        value.forEach(add);
        return;
      }
      if (Array.isArray(value.recent_expenses)) value.recent_expenses.forEach(add);
      if (Array.isArray(value.data)) value.data.forEach(add);
      if (
        (typeof value.id === "number" || typeof value.id === "string") &&
        (typeof value.amount_original === "number" || typeof value.amount_eur === "number")
      ) {
        found.push(value);
      }
    };

    for (const query of payload?.state?.queries ?? []) {
      const root = Array.isArray(query.queryKey) ? query.queryKey[0] : null;
      if (root === "expenses" || root === "dashboard") add(query.state?.data);
    }
    const seen = new Set();
    return found.filter((expense) => {
      const key = String(expense.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function formatDate(value) {
    if (!value) return "";
    const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
    if (Number.isNaN(date.getTime())) return String(value);
    try {
      return new Intl.DateTimeFormat(state.locale, {
        year: "numeric",
        month: "short",
        day: "numeric",
      }).format(date);
    } catch {
      return String(value);
    }
  }

  function formatAmount(amount, currency) {
    const value = Number(amount);
    if (!Number.isFinite(value)) return "";
    try {
      return new Intl.NumberFormat(state.locale, {
        style: "currency",
        currency: typeof currency === "string" ? currency : "EUR",
      }).format(value);
    } catch {
      return `${value.toFixed(2)} ${currency || "EUR"}`;
    }
  }

  function createRecordCard(title, detail, amount) {
    const item = document.createElement("li");
    item.className = "record-card";
    const copy = document.createElement("div");
    copy.className = "record-copy";
    const heading = document.createElement("div");
    heading.className = "record-title";
    heading.textContent = title;
    const detailNode = document.createElement("div");
    detailNode.className = "record-detail";
    detailNode.textContent = detail;
    copy.append(heading, detailNode);
    item.append(copy);
    if (amount) {
      const amountNode = document.createElement("div");
      amountNode.className = "record-amount";
      amountNode.textContent = amount;
      item.append(amountNode);
    }
    return item;
  }

  function renderExpenses(expenses) {
    const list = app.querySelector("#cached-expenses");
    const empty = app.querySelector("#expenses-empty");
    list.replaceChildren();
    empty.hidden = expenses.length > 0;
    for (const expense of expenses.slice(0, 20)) {
      const title = expense.merchant || expense.description || text("cachedExpenses");
      const detail = [formatDate(expense.date), expense.category_name]
        .filter(Boolean)
        .join(" · ");
      const amount = formatAmount(
        expense.amount_original ?? expense.amount_eur,
        expense.currency_original ?? "EUR",
      );
      list.append(createRecordCard(title, detail, amount));
    }
  }

  function renderDrafts(items) {
    const list = app.querySelector("#offline-drafts");
    const empty = app.querySelector("#drafts-empty");
    list.replaceChildren();
    empty.hidden = items.length > 0;
    for (const item of items) {
      const payload = item.payload ?? {};
      const title = payload.merchant || payload.description || text("newExpense");
      const receipt = item.receipts?.find((file) => file?.blob instanceof Blob);
      const date = formatDate(payload.date);
      const receiptLabel = item.receipts?.length
        ? `${item.receipts.length} ${item.receipts.length === 1 ? text("receipt") : text("receipts")}`
        : "";
      const detail = [date, text("draftStatus"), receiptLabel]
        .filter(Boolean)
        .join(" · ");
      const card = createRecordCard(
        title,
        detail,
        formatAmount(payload.amount, payload.currency),
      );
      if (receipt?.blob?.size) {
        const image = document.createElement("img");
        image.className = "record-photo";
        image.alt = text("receiptPhoto");
        const url = URL.createObjectURL(receipt.blob);
        state.objectUrls.push(url);
        image.src = url;
        card.prepend(image);
      }
      list.append(card);
    }
  }

  function setFormEnabled(enabled) {
    const form = app.querySelector("#draft-form");
    if (!form) return;
    for (const field of form.elements) field.disabled = !enabled;
  }

  function renderLocal(ownerId, queryRecord, queueState, onlineVerified) {
    if (storedOwnerId() !== ownerId || state.ownerId !== ownerId) return;
    if (!querySnapshotMatchesOwner(queryRecord, ownerId)) {
      showNeutral(text("ownerUnavailable"));
      return;
    }

    state.queueUnavailable = Boolean(queueState.unavailable);
    const privateWorkspace = app.querySelector("#private-workspace");
    privateWorkspace.hidden = false;
    setFormEnabled(!state.queueUnavailable);
    app.querySelector("#amount").required = true;
    app.querySelector("#date").required = true;
    if (!app.querySelector("#date").value) {
      app.querySelector("#date").value = new Date().toISOString().slice(0, 10);
    }

    const isFresh = querySnapshotIsFresh(queryRecord);
    const expenses = isFresh ? collectExpenses(queryRecord) : [];
    renderExpenses(expenses);
    renderDrafts(queueState.items);

    const status = onlineVerified ? text("accountReady") : text("offlineStatus");
    const notice = state.queueUnavailable
      ? text("queueUnavailable")
      : !isFresh
        ? text("cachedExpired")
        : text("storageNote");
    showNotice(notice, status);
    setReconnect(onlineVerified, "/dashboard?offline=return", text("checkAndSync"));
    setCheckAccount(!onlineVerified);
  }

  async function loadLocal(ownerId, onlineVerified, generation = state.ownerGeneration) {
    const [queryRecord, queueState] = await Promise.all([
      readQueryRecord().catch(() => null),
      readQueue(ownerId).catch(() => ({ items: [], unavailable: true })),
    ]);
    if (!ownerIsCurrent(ownerId, generation)) return;
    renderLocal(ownerId, queryRecord, queueState, onlineVerified);
  }

  async function verifyCurrentOwner(ownerId) {
    const generation = state.ownerGeneration;
    if (!ownerIsCurrent(ownerId, generation)) return;
    state.busy = true;
    state.verifiedOwnerId = null;
    clearPrivateData(true);
    setReconnect(false);
    setCheckAccount(false);
    showNotice(text("checking"), text("checking"));
    try {
      const response = await fetch("/api/auth/me", {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!ownerIsCurrent(ownerId, generation)) return;
      if (response.status === 401) {
        showNotice(text("sessionRejected"), text("sessionRejected"));
        setCheckAccount(false);
        setReconnect(true, "/dashboard?offline=return", text("openXpenses"));
        return;
      }
      if (!response.ok) {
        showNotice(text("verifyFailed"), text("verifyFailed"));
        setReconnect(true, "/dashboard?offline=return", text("openXpenses"));
        return;
      }
      const user = await response.json();
      if (!ownerIsCurrent(ownerId, generation)) return;
      if (!Number.isSafeInteger(user?.id) || user.id !== ownerId) {
        showNotice(text("accountMismatch"), text("accountMismatch"));
        setCheckAccount(false);
        setReconnect(true, "/dashboard?offline=return", text("openXpenses"));
        return;
      }
      state.verifiedOwnerId = ownerId;
      await loadLocal(ownerId, true, generation);
    } catch (error) {
      if (!ownerIsCurrent(ownerId, generation)) return;
      if (!navigator.onLine || error instanceof TypeError) {
        state.verifiedOwnerId = null;
        await loadLocal(ownerId, false, generation);
      } else {
        showNotice(text("verifyFailed"), text("verifyFailed"));
        setCheckAccount(false);
        setReconnect(true, "/dashboard?offline=return", text("openXpenses"));
      }
    } finally {
      if (state.ownerGeneration === generation) state.busy = false;
    }
  }

  function setLabel(inputSelector, key) {
    const input = app.querySelector(inputSelector);
    const label = app.querySelector(`label[for="${input.id}"]`);
    if (!label) return;
    label.replaceChildren(document.createTextNode(text(key)));
    if (["merchant", "description", "receiptPhoto"].includes(key)) {
      const optional = document.createElement("span");
      optional.className = "optional";
      optional.textContent = ` ${text("optional")}`;
      label.append(optional);
    }
  }

  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function validPayload(payload) {
    return (
      payload &&
      typeof payload === "object" &&
      Number.isFinite(payload.amount) &&
      payload.amount > 0 &&
      typeof payload.currency === "string" &&
      /^[A-Z]{3}$/.test(payload.currency) &&
      validDate(payload.date)
    );
  }

  function validNewReceipt(receipt) {
    return (
      validStoredReceipt(receipt) &&
      receipt.name.length > 0 &&
      receipt.blob.size > 0 &&
      receipt.blob.size <= MAX_RECEIPT_BYTES &&
      RECEIPT_TYPES.has(receipt.type.toLowerCase()) &&
      (!receipt.blob.type || receipt.blob.type.toLowerCase() === receipt.type.toLowerCase())
    );
  }

  function validateQueueItem(item) {
    if (!validPayload(item.payload)) throw new Error(text("saveFailed"));
    if (!Array.isArray(item.receipts) || !item.receipts.every(validNewReceipt)) {
      throw new Error(text("invalidPhoto"));
    }
  }

  async function addDraft(item, ownerIdAtStart, generationAtStart, querySnapshot) {
    validateQueueItem(item);
    if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
      throw new Error("Offline workspace owner changed");
    }
    if (!querySnapshotMatchesOwner(querySnapshot, ownerIdAtStart)) {
      throw new Error(text("ownerUnavailable"));
    }

    const db = await openQueueDatabase();
    if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
      db.close();
      throw new Error("Offline workspace owner changed");
    }
    if (!querySnapshotMatchesOwner(querySnapshot, ownerIdAtStart)) {
      db.close();
      throw new Error(text("ownerUnavailable"));
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      let failure = null;
      let tx;
      const close = () => {
        state.pendingWrites.delete(tx);
        db.close();
      };
      const fail = (error) => {
        if (settled) return;
        settled = true;
        failure = error instanceof Error ? error : new Error(String(error));
        try { tx.abort(); } catch { /* already aborted */ }
        close();
        reject(failure);
      };

      try {
        tx = db.transaction(QUEUE_STORE, "readwrite");
        state.pendingWrites.add(tx);
        const store = tx.objectStore(QUEUE_STORE);
        if (store.keyPath !== "id") {
          fail(new Error("The offline queue schema is incompatible"));
          return;
        }
        const request = store.getAll();
        request.onsuccess = () => {
          if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
            fail(new Error("Offline workspace owner changed"));
            return;
          }
          if (!querySnapshotMatchesOwner(querySnapshot, ownerIdAtStart)) {
            fail(new Error(text("ownerUnavailable")));
            return;
          }
          const items = request.result ?? [];
          if (!items.every(validQueueItem)) {
            fail(new Error("The offline queue contains invalid records"));
            return;
          }
          const bytes = items.reduce(
            (total, queued) => total + queued.receipts.reduce((sum, receipt) => sum + receipt.blob.size, 0),
            0,
          );
          const newBytes = item.receipts.reduce((total, receipt) => total + receipt.blob.size, 0);
          if (items.length >= MAX_QUEUE_SIZE || bytes + newBytes > MAX_QUEUE_BYTES) {
            fail(new Error(text("queueFull")));
            return;
          }
          // Recheck the immutable start owner immediately before the IDB put.
          if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
            fail(new Error("Offline workspace owner changed"));
            return;
          }
          if (!querySnapshotMatchesOwner(querySnapshot, ownerIdAtStart)) {
            fail(new Error(text("ownerUnavailable")));
            return;
          }
          const put = store.put(item);
          put.onerror = () => fail(put.error ?? new Error("Could not save offline draft"));
        };
        request.onerror = () => fail(request.error ?? new Error("Could not inspect offline drafts"));
        tx.oncomplete = () => {
          if (settled) return;
          settled = true;
          close();
          resolve();
        };
        tx.onerror = () => fail(tx.error ?? new Error("Could not save offline draft"));
        tx.onabort = () => {
          if (settled) return;
          settled = true;
          const error = failure ?? tx.error ?? new Error("Offline draft was not saved");
          close();
          reject(error);
        };
      } catch (error) {
        failure = error instanceof Error ? error : new Error(String(error));
        try { tx?.abort(); } catch { /* already aborted */ }
        close();
        reject(failure);
      }
    });
  }

  function compressPhoto(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => resolve(null);
        image.onload = () => {
          const maxDimension = 1600;
          let width = image.naturalWidth || image.width;
          let height = image.naturalHeight || image.height;
          if (!width || !height) {
            resolve(null);
            return;
          }
          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          if (!context) {
            resolve(null);
            return;
          }
          context.drawImage(image, 0, 0, width, height);
          canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.8);
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function preparePhoto(file) {
    if (!file || file.size <= 0 || file.size > MAX_SOURCE_PHOTO_BYTES) {
      throw new Error(text("photoTooLarge"));
    }
    if (!file.type.startsWith("image/")) throw new Error(text("invalidPhoto"));
    const compressed = await compressPhoto(file);
    let blob = compressed;
    let name = file.name || "receipt.jpg";
    if (!blob) {
      const allowedOriginal = RECEIPT_TYPES.has(file.type.toLowerCase());
      if (!allowedOriginal) throw new Error(text("invalidPhoto"));
      blob = file;
    } else {
      name = name.replace(/\.[^.]+$/, "") + ".jpg";
    }
    if (!(blob instanceof Blob) || blob.size <= 0) throw new Error(text("invalidPhoto"));
    if (blob.size > MAX_RECEIPT_BYTES) throw new Error(text("photoTooLarge"));
    return {
      name,
      type: blob.type || "image/jpeg",
      blob,
    };
  }

  function isOwnerChangeError(error) {
    return error?.message === "Offline workspace owner changed";
  }

  async function onSave(event) {
    event.preventDefault();
    // Freeze the owner namespace synchronously, before any asynchronous work.
    const ownerIdAtStart = state.ownerId;
    const generationAtStart = state.ownerGeneration;
    const profileOwnerAtStart = storedOwnerId();
    if (
      state.busy ||
      state.queueUnavailable ||
      !Number.isSafeInteger(ownerIdAtStart) ||
      ownerIdAtStart <= 0 ||
      profileOwnerAtStart !== ownerIdAtStart
    ) return;

    const form = event.currentTarget;
    const button = app.querySelector("#save-draft");
    const errorNode = app.querySelector("#form-error");
    errorNode.hidden = true;
    const amount = Number(form.elements.amount.value);
    const currencyCode = form.elements.currency.value;
    const date = form.elements.date.value;
    if (!Number.isFinite(amount) || amount <= 0) {
      errorNode.textContent = text("invalidAmount");
      errorNode.hidden = false;
      return;
    }
    if (!validDate(date)) {
      errorNode.textContent = text("invalidDate");
      errorNode.hidden = false;
      return;
    }
    if (typeof currencyCode !== "string" || !/^[A-Z]{3}$/.test(currencyCode)) {
      errorNode.textContent = text("invalidCurrency");
      errorNode.hidden = false;
      return;
    }

    const selectedPhoto = form.elements["receipt-photo"].files?.[0] ?? null;
    const now = Date.now();
    const item = {
      id: crypto.randomUUID(),
      userId: ownerIdAtStart,
      payload: {
        amount,
        currency: currencyCode,
        date,
        merchant: form.elements.merchant.value.trim() || null,
        description: form.elements.description.value.trim() || null,
        category_id: null,
        tax_amount: 0,
        tax_rate: null,
      },
      receipts: [],
      stage: "creation_pending",
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      nextAttemptAt: 0,
    };

    state.busy = true;
    button.disabled = true;
    button.textContent = text("saving");
    try {
      if (selectedPhoto) item.receipts = [await preparePhoto(selectedPhoto)];
      if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
        throw new Error("Offline workspace owner changed");
      }
      const initialQuerySnapshot = await readQueryRecord().catch(() => null);
      if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
        throw new Error("Offline workspace owner changed");
      }
      if (!querySnapshotMatchesOwner(initialQuerySnapshot, ownerIdAtStart)) {
        throw new Error(text("ownerUnavailable"));
      }
      if (navigator.storage?.persist) {
        await navigator.storage.persist().catch(() => false);
      }
      if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
        throw new Error("Offline workspace owner changed");
      }
      const querySnapshot = await readQueryRecord().catch(() => null);
      if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
        throw new Error("Offline workspace owner changed");
      }
      if (!querySnapshotMatchesOwner(querySnapshot, ownerIdAtStart)) {
        throw new Error(text("ownerUnavailable"));
      }
      await addDraft(item, ownerIdAtStart, generationAtStart, querySnapshot);
      if (!ownerIsCurrent(ownerIdAtStart, generationAtStart)) {
        throw new Error("Offline workspace owner changed");
      }
      form.reset();
      app.querySelector("#date").value = new Date().toISOString().slice(0, 10);
      setText("#photo-name", text("noPhoto"));
      await loadLocal(ownerIdAtStart, state.verifiedOwnerId === ownerIdAtStart, generationAtStart);
      if (ownerIsCurrent(ownerIdAtStart, generationAtStart)) setText("#notice", text("savedNotice"));
    } catch (error) {
      if (isOwnerChangeError(error) || !ownerIsCurrent(ownerIdAtStart, generationAtStart)) return;
      if (error?.message === text("ownerUnavailable")) {
        showNeutral(text("ownerUnavailable"));
        return;
      }
      if (error?.message === text("queueFull")) {
        errorNode.textContent = text("queueFull");
      } else if (error?.message === text("photoTooLarge")) {
        errorNode.textContent = text("photoTooLarge");
      } else if (error?.message === text("invalidPhoto")) {
        errorNode.textContent = text("invalidPhoto");
      } else if (error?.message === text("invalidDate")) {
        errorNode.textContent = text("invalidDate");
      } else if (error?.message === text("invalidCurrency")) {
        errorNode.textContent = text("invalidCurrency");
      } else {
        errorNode.textContent = text("saveFailed");
      }
      errorNode.hidden = false;
      setText("#notice", errorNode.textContent);
    } finally {
      if (state.ownerGeneration === generationAtStart) {
        state.busy = false;
        if (ownerIsCurrent(ownerIdAtStart, generationAtStart) && !state.queueUnavailable) {
          button.disabled = false;
          button.textContent = text("saveOnDevice");
        }
      }
    }
  }

  function bindEvents() {
    app.querySelector("#draft-form")?.addEventListener("submit", onSave);
    app.querySelector("#check-account")?.addEventListener("click", () => {
      if (state.ownerId && !state.busy) void verifyCurrentOwner(state.ownerId);
    });
    app.querySelector("#receipt-photo")?.addEventListener("click", () => {
      state.photoPicker = ownerIsCurrent(state.ownerId, state.ownerGeneration)
        ? { ownerId: state.ownerId, generation: state.ownerGeneration, invalidated: false }
        : { invalidated: true };
    });
    app.querySelector("#receipt-photo")?.addEventListener("change", (event) => {
      const picker = state.photoPicker;
      state.photoPicker = null;
      if (
        !ownerIsCurrent(state.ownerId, state.ownerGeneration) ||
        picker?.invalidated ||
        (picker && (picker.ownerId !== state.ownerId || picker.generation !== state.ownerGeneration))
      ) {
        event.target.value = "";
        setText("#photo-name", text("noPhoto"));
        return;
      }
      const file = event.target.files?.[0];
      setText("#photo-name", file ? file.name : text("noPhoto"));
    });
    window.addEventListener("online", () => {
      if (state.ownerId && !state.busy) void verifyCurrentOwner(state.ownerId);
    });
    window.addEventListener("offline", () => {
      if (!state.ownerId) return;
      state.verifiedOwnerId = null;
      void loadLocal(state.ownerId, false).then(() => {
        if (!state.ownerId) return;
        showNotice(text("storageNote"), text("offlineStatus"));
        setReconnect(false);
      });
    });
    window.addEventListener("storage", (event) => {
      if (event.key !== PROFILE_KEY && event.key !== null) return;
      const nextOwner = storedOwnerId();
      if (nextOwner === state.ownerId) return;
      state.ownerGeneration++;
      state.busy = false;
      state.ownerId = nextOwner;
      state.verifiedOwnerId = null;
      state.queueUnavailable = false;
      clearPrivateData(true);
      setReconnect(false);
      setCheckAccount(false);
      if (!nextOwner) {
        showNeutral(text("noOwner"));
      } else if (navigator.onLine) {
        void verifyCurrentOwner(nextOwner);
      } else {
        void loadLocal(nextOwner, false, state.ownerGeneration);
      }
    });
  }

  async function boot() {
    document.title = `${text("title")} · Xpenses`;
    setText(".mode-label", text("offlineLabel"));
    setText("#page-eyebrow", text("eyebrow"));
    setText("#page-title", text("title"));
    setText("#cached-eyebrow", text("cachedEyebrow"));
    setText("#expense-heading", text("cachedExpenses"));
    setText("#draft-eyebrow", text("draftEyebrow"));
    setText("#draft-heading", text("drafts"));
    setText("#capture-eyebrow", text("captureEyebrow"));
    setText("#capture-heading", text("addExpense"));
    setText("#storage-note", text("storageNote"));
    setText("#expenses-empty", text("noCachedExpenses"));
    setText("#drafts-empty", text("noDrafts"));
    setText("#limits-note", text("limits"));
    setText(".privacy-note", text("privacy"));
    setText("#save-draft", text("saveOnDevice"));
    setText("#photo-name", text("noPhoto"));
    setLabel("#amount", "amount");
    setLabel("#date", "date");
    setLabel("#merchant", "merchant");
    setLabel("#description", "description");
    setLabel("#receipt-photo", "receiptPhoto");
    app.querySelector("#currency").setAttribute("aria-label", text("currency"));
    setReconnect(false);
    setCheckAccount(false);
    const ownerId = storedOwnerId();
    state.ownerId = ownerId;
    if (!ownerId) {
      showNeutral(text("noOwner"));
      return;
    }
    if (navigator.onLine) {
      await verifyCurrentOwner(ownerId);
    } else {
      await loadLocal(ownerId, false);
    }
  }

  loadMessages()
    .then(() => {
      bindEvents();
      void boot();
    })
    .catch(() => {
      showNeutral("Offline workspace could not be prepared. Reconnect to Xpenses and try again.");
    });
})();
