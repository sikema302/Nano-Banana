import crypto from 'node:crypto';

export type NotificationKind = 'normal' | 'update' | 'maintenance' | 'urgent';
export type NotificationStatus = 'draft' | 'published' | 'archived';

export interface SiteNotification {
  id: string;
  title: string;
  content: string;
  kind: NotificationKind;
  status: NotificationStatus;
  popupOnFirstView: boolean;
  publishedAt?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface NotificationReceipt {
  readIds: string[];
  popupShownIds: string[];
}

type SettingsStore = {
  get: (key: string, fallback: string) => Promise<string>;
  set: (key: string, value: string) => Promise<void>;
};

const NOTIFICATIONS_KEY = 'site_notifications_v1';
const RECEIPT_PREFIX = 'site_notification_receipts_v1:';
const STATUSES = new Set<NotificationStatus>(['draft', 'published', 'archived']);

function parseArray<T>(value: string): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function normalizeReceipt(value: string): NotificationReceipt {
  try {
    const parsed = JSON.parse(value) as Partial<NotificationReceipt>;
    return {
      readIds: Array.isArray(parsed.readIds) ? parsed.readIds.filter((id): id is string => typeof id === 'string') : [],
      popupShownIds: Array.isArray(parsed.popupShownIds) ? parsed.popupShownIds.filter((id): id is string => typeof id === 'string') : [],
    };
  } catch {
    return { readIds: [], popupShownIds: [] };
  }
}

function normalizeInput(input: Record<string, unknown>) {
  const content = String(input.content || '').trim();
  if (!content) throw new Error('请输入通知内容');
  if (content.length > 5000) throw new Error('通知内容不能超过5000个字');
  return {
    title: content.slice(0, 120),
    content,
    kind: 'normal' as NotificationKind,
    popupOnFirstView: true,
    expiresAt: undefined,
  };
}

export function createNotificationService(store: SettingsStore) {
  let mutationQueue: Promise<unknown> = Promise.resolve();
  const mutate = <T>(task: () => Promise<T>) => {
    const next = mutationQueue.then(task, task);
    mutationQueue = next.catch(() => undefined);
    return next;
  };
  const receiptKey = (userId: string) => `${RECEIPT_PREFIX}${encodeURIComponent(userId)}`;
  const readAll = async () => parseArray<SiteNotification>(await store.get(NOTIFICATIONS_KEY, '[]'));
  const writeAll = (items: SiteNotification[]) => store.set(NOTIFICATIONS_KEY, JSON.stringify(items));
  const readReceipt = async (userId: string) => normalizeReceipt(await store.get(receiptKey(userId), '{}'));
  const writeReceipt = (userId: string, receipt: NotificationReceipt) => store.set(receiptKey(userId), JSON.stringify(receipt));

  const isActive = (item: SiteNotification, now = Date.now()) => {
    if (item.status !== 'published' || !item.publishedAt) return false;
    if (new Date(item.publishedAt).getTime() > now) return false;
    return !item.expiresAt || new Date(item.expiresAt).getTime() > now;
  };

  return {
    async listForUser(userId: string) {
      const [all, receipt] = await Promise.all([readAll(), readReceipt(userId)]);
      const readIds = new Set(receipt.readIds);
      const shownIds = new Set(receipt.popupShownIds);
      const notifications = all
        .filter((item) => isActive(item))
        .sort((a, b) => String(b.publishedAt).localeCompare(String(a.publishedAt)))
        .map((item) => ({ ...item, read: readIds.has(item.id), popupShown: shownIds.has(item.id) }));
      return {
        notifications,
        unreadCount: notifications.filter((item) => !item.read).length,
        popup: notifications.find((item) => item.popupOnFirstView && !item.popupShown && !item.read) || null,
      };
    },

    async listAdmin() {
      const notifications = (await readAll()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { notifications };
    },

    create(input: Record<string, unknown>, createdBy: string) {
      return mutate(async () => {
        const normalized = normalizeInput(input);
        const now = new Date().toISOString();
        const notification: SiteNotification = {
          id: crypto.randomUUID(),
          ...normalized,
          status: 'draft',
          createdAt: now,
          updatedAt: now,
          createdBy,
        };
        const all = await readAll();
        all.push(notification);
        await writeAll(all);
        return notification;
      });
    },

    update(id: string, input: Record<string, unknown>) {
      return mutate(async () => {
        const all = await readAll();
        const index = all.findIndex((item) => item.id === id);
        if (index < 0) return null;
        const normalized = normalizeInput({ ...all[index], ...input });
        all[index] = { ...all[index], ...normalized, updatedAt: new Date().toISOString() };
        await writeAll(all);
        return all[index];
      });
    },

    setStatus(id: string, status: NotificationStatus) {
      if (!STATUSES.has(status)) throw new Error('通知状态不正确');
      return mutate(async () => {
        const all = await readAll();
        const item = all.find((candidate) => candidate.id === id);
        if (!item) return null;
        const now = new Date().toISOString();
        item.status = status;
        item.updatedAt = now;
        if (status === 'published') item.publishedAt = now;
        await writeAll(all);
        return item;
      });
    },

    remove(id: string) {
      return mutate(async () => {
        const all = await readAll();
        const next = all.filter((item) => item.id !== id);
        if (next.length === all.length) return false;
        await writeAll(next);
        return true;
      });
    },

    mark(userId: string, id: string, field: keyof NotificationReceipt) {
      return mutate(async () => {
        const receipt = await readReceipt(userId);
        if (!receipt[field].includes(id)) receipt[field].push(id);
        await writeReceipt(userId, receipt);
      });
    },

    markPopupShownAndAllRead(userId: string, id: string) {
      return mutate(async () => {
        const [all, receipt] = await Promise.all([readAll(), readReceipt(userId)]);
        if (!receipt.popupShownIds.includes(id)) receipt.popupShownIds.push(id);
        receipt.readIds = Array.from(new Set([
          ...receipt.readIds,
          ...all.filter((item) => isActive(item)).map((item) => item.id),
        ]));
        await writeReceipt(userId, receipt);
      });
    },

    markAllRead(userId: string) {
      return mutate(async () => {
        const [all, receipt] = await Promise.all([readAll(), readReceipt(userId)]);
        receipt.readIds = Array.from(new Set([
          ...receipt.readIds,
          ...all.filter((item) => isActive(item)).map((item) => item.id),
        ]));
        await writeReceipt(userId, receipt);
      });
    },
  };
}
